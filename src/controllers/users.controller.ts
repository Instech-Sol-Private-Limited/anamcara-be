import { Request, Response } from "express";
import { supabase } from "../app";
import bcrypt from "bcryptjs";
import { userSchema } from "../config/validations";
import { sendVerificationEmail, sendResetPasswordEmail } from "../config/mailer";
import { v4 as uuidv4 } from "uuid";
import { generateAccessToken, generateRefreshToken, verifyResetToken } from "../config/generateTokens";
import jwt from "jsonwebtoken";

const RESET_PASSWORD_SECRET = "anamcara_reset_password_secret";

export const registerController = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    // 1. Validate input using Joi
    const { error: validationError, value: validatedData } =
      userSchema.validate(req.body, {
        abortEarly: false,
      });

    if (validationError) {
      return res.status(400).json({
        error: "Validation failed.",
        details: validationError.details.map((d: any) => d.message),
      });
    }

    const { firstname, lastname, email, password, role } = validatedData;

    // 2. Check if email already exists
    const { data: existingUser } = await supabase
      .from("anamcara_users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User with this email already exists." });
    }

    // 3. Generate verification token
    const verificationToken = uuidv4();

    // 4. Try sending the verification email
    try {
      await sendVerificationEmail(email);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      return res.status(500).json({
        error: "Failed to send verification email.",
      });
    }

    // 5. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 6. Insert user into database
    const { data, error: insertError } = await supabase
      .from("anamcara_users")
      .insert([
        {
          firstname,
          lastname,
          email,
          password: hashedPassword,
          role: role || "user",
          active: false,
        },
      ])
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({
        error: "Failed to register user.",
        details: insertError.message,
      });
    }

    // 7. Omit password from response
    const { password: _, ...user } = data;

    return res.status(201).json({
      message: "User registered successfully. Verification email sent.",
      user,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

export const verifyEmailController = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { email } = req.query; // Or req.body.email depending on how it's sent

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required for verification." });
    }

    // Check if user exists
    const { data: user, error: fetchError } = await supabase
      .from("anamcara_users")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.active) {
      return res.status(400).json({ message: "User is already verified." });
    }

    // Update user to active
    const { error: updateError } = await supabase
      .from("anamcara_users")
      .update({ active: true })
      .eq("email", email);

    if (updateError) {
      return res.status(500).json({ error: "Failed to verify email.", details: updateError.message });
    }

    return res.status(200).json({ message: "Email verified successfully." });
  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

export const loginController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // Check if user exists
    const { data: user, error } = await supabase
      .from("anamcara_users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User with this email does not exist." });
    }

    if (!user.active) {
      return res.status(401).json({ error: "Please verify your email before logging in." });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password." });
    }

    // Create tokens
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const { password: _, ...userInfo } = user;

    return res.status(200).json({
      message: "Login successful.",
      user: userInfo,
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

export const forgotPasswordController = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    // 1. Check if user exists
    const { data: user, error: userError } = await supabase
      .from("anamcara_users")
      .select("id, email, firstname")
      .eq("email", email)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User with this email does not exist." });
    }

    // 2. Generate password reset token (valid for 15 mins)
    const token = jwt.sign(
      { email: user.email, id: user.id },
      RESET_PASSWORD_SECRET,
      { expiresIn: "15m" }
    );

    const resetLink = `https://yourfrontend.com/reset-password?token=${token}`;

    // 3. Send email
    await sendResetPasswordEmail(user.email, token);

    return res.status(200).json({ message: "Password reset email sent successfully." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

export const resetPasswordController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { token } = req.query;
    const { password } = req.body;

    // 1. Check token
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token is required." });
    }

    const decoded = verifyResetToken(token);
    if (!decoded || typeof decoded !== "object" || !("email" in decoded)) {
      return res.status(400).json({ error: "Invalid or expired token." });
    }

    const email = decoded.email;

    // 2. Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Update password in DB
    const { error: updateError } = await supabase
      .from("anamcara_users")
      .update({ password: hashedPassword })
      .eq("email", email);

    if (updateError) {
      return res.status(500).json({ error: "Failed to update password.", details: updateError.message });
    }

    return res.status(200).json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

export const becomeSellerController = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const {
      niche,
      description,
      city,
      country,
      slogan,
      languages
    } = req.body;

    // Validate required fields
    const requiredFields = { niche, description, city, country, slogan, languages };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      // @ts-ignore
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        status: 400
      });
    }

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('sellers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) throw checkError;

    let operationResponse;

    if (existingProfile) {
      // Update existing profile
      const { data, error } = await supabase
        .from('sellers')
        .update({
          niche,
          description,
          city,
          country,
          slogan,
          languages: JSON.stringify(languages),
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      operationResponse = {
        status: 200,
        message: 'Seller profile updated successfully',
        data
      };
    } else {
      // Create new profile
      const { data, error } = await supabase
        .from('sellers')
        .insert({
          user_id: userId,
          niche,
          description,
          city,
          country,
          slogan,
          languages: JSON.stringify(languages)
        })
        .select()
        .single();

      if (error) throw error;

      operationResponse = {
        status: 201,
        message: 'Seller profile created successfully',
        data
      };
    }

    res.status(operationResponse.status).json({
      success: true,
      message: operationResponse.message,
      data: operationResponse.data,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Error processing seller profile:', error.message);

    let status = 500;
    let message = 'Failed to process seller profile';

    if (error.code === '23505') { // Postgres unique violation
      status = 409;
      message = 'Seller profile already exists for this user';
    } else if (error.response?.status === 400) {
      status = 400;
      message = error.response.data?.message || 'Validation failed';
    }

    res.status(status).json({
      success: false,
      message,
      error: error.message,
      status,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }
};

export const getSellerDataController = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('sellers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(200).json({
        success: true,
        message: 'No seller profile found',
        hasProfile: false
      });
    }

    res.status(200).json({
      success: true,
      hasProfile: true,
      data: {
        ...data,
      }
    });

  } catch (error: any) {
    console.error('Error fetching seller data:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seller data',
      error: error.message
    });
  }
};

export const addSellerservice = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      seller_id,
      service_title,
      service_category,
      description,
      keywords,
      thumbnails,
      features,
      plans
    } = req.body;

    if (!seller_id || !service_title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Seller ID, service title, and description are required'
      });
    }

    const { data: serviceData, error: serviceError } = await supabase
      .from('services')
      .insert([{
        seller_id,
        service_title,
        service_category,
        description,
        keywords: keywords || [],
        thumbnails: thumbnails || [],
      }])
      .select();

    if (serviceError) {
      throw serviceError;
    }

    const serviceId = serviceData[0].id;

    if (plans && plans.length > 0) {
      const formattedPlans = plans.map((plan: any) => ({
        service_id: serviceId,
        plan_name: plan.name,
        plan_price: plan.price,
        // revisions: plan.revisions || 1,
        is_active: plan.active !== false,
        plan_features: plan.features || []
      }));

      const { error: plansError } = await supabase
        .from('services_plan')
        .insert(formattedPlans);

      if (plansError) {
        throw plansError;
      }
    }

    const { data: completeService, error: fetchError } = await supabase
      .from('services')
      .select(`
        *,
        services_plan (*)
      `)
      .eq('id', serviceId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    return res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: completeService
    });

  } catch (error: any) {
    console.error('Error creating service:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create service',
      error: error.message
    });
  }
};

export const getAllServices = async (req: Request, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { data: services, error, count } = await supabase
      .from('services')
      .select(`
        *,
        seller:seller_id (
          id,
          niche,
          city,
          country,
          slogan,
          user:user_id (
            avatar_url,
            first_name,
            last_name,
            email
          )
        ),
        services_plan (*)
      `, { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedServices = services.map(service => ({
      ...service,
      seller: {
        ...service.seller,
        avatar_url: service.seller.user?.avatar_url,
        first_name: service.seller.user?.first_name,
        last_name: service.seller.user?.last_name,
        email: service.seller.user?.email
      }
    }));

    res.status(200).json({
      success: true,
      data: formattedServices,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil((count || 0) / limit),
        totalItems: count,
        itemsPerPage: limit
      }
    });

  } catch (error: any) {
    console.error('Error fetching services:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: error.message
    });
  }
};

export const getSellerServices = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // First get the seller's profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('avatar_url, first_name, last_name, email')
      .eq('id', userId)  // Using id which equals user_id
      .single();

    if (profileError) throw profileError;

    // Get services where seller_id matches the user's seller profile
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select(`
        *,
        services_plan (*)
      `)
      .eq('seller_id', userId);  // Assuming seller_id in services table is the user_id

    if (servicesError) throw servicesError;

    // Combine the data
    const responseData = services.map(service => ({
      ...service,
      seller_profile: profile
    }));

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error: any) {
    console.error('Error fetching seller services:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seller services',
      error: error.message
    });
  }
};

export const getServiceById = async (req: Request, res: Response): Promise<any> => {
  try {
    const serviceId = req.params.id;

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .maybeSingle();

    if (serviceError) throw serviceError;
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // 2. Get all needed data in parallel
    const [
      { data: plans, error: plansError },
      { data: seller, error: sellerError },
      { data: profile, error: profileError },
      { data: relatedServices, error: relatedError }
    ] = await Promise.all([
      supabase
        .from('services_plan')
        .select('*')
        .eq('service_id', serviceId),
      supabase
        .from('sellers')
        .select('*')
        .eq('user_id', service.seller_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('avatar_url, first_name, last_name, email')
        .eq('id', service.seller_id)
        .maybeSingle(),
      supabase
        .from('services')
        .select(`
          id,
          service_title,
          thumbnails,
          service_category,
          services_plan (plan_price)
        `)
        .eq('seller_id', service.seller_id)
        .neq('id', serviceId)
        .limit(4)
    ]);

    // Handle errors
    if (plansError) throw plansError;
    if (sellerError) throw sellerError;
    if (profileError) throw profileError;
    if (relatedError) throw relatedError;

    // 3. Build the seller profile data
    const sellerProfile = seller ? {
      ...seller,
      avatar_url: profile?.avatar_url || null,
      first_name: profile?.first_name || null,
      last_name: profile?.last_name || null,
      email: profile?.email || null,
      city: seller.city || null,
      country: seller.country || null,
      rating: seller.rating || null,
      completed_jobs: seller.completed_jobs || null,
      response_time: seller.response_time || null
    } : null;

    // 4. Process related services
    const formattedRelatedServices = (relatedServices || []).map(svc => ({
      id: svc.id,
      service_title: svc.service_title,
      service_category: svc.service_category,
      thumbnails: svc.thumbnails?.[0] ? [svc.thumbnails[0]] : [],
      seller_profile: sellerProfile ? {
        avatar_url: sellerProfile.avatar_url,
        first_name: sellerProfile.first_name,
        last_name: sellerProfile.last_name,
        user_id: service.seller_id
      } : null,
      price: svc.services_plan?.reduce((min, p) => Math.min(min, p.plan_price), svc.services_plan?.[0]?.plan_price || 0) || 0
    }));

    // 5. Build final response
    const responseData = {
      ...service,
      services_plan: plans || [],
      seller_profile: sellerProfile,
      related_services: formattedRelatedServices
    };

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error: any) {
    console.error('Error fetching service:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service',
      error: error.message
    });
  }
};
import { Request, Response } from "express";
import { supabase } from "../app";
import bcrypt from "bcryptjs";
import { userSchema } from "../config/validations";
import { sendVerificationEmail, sendResetPasswordEmail, sendAdminEmail } from "../config/mailer";
import { v4 as uuidv4 } from "uuid";
import { generateAccessToken, generateRefreshToken, verifyResetToken } from "../config/generateTokens";
import jwt from "jsonwebtoken";
import { generateAIDescription } from "../services/openai.service";
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { promises } from "nodemailer/lib/xoauth2";
import { sendNotification } from '../sockets/emitNotification';


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
    // const userId = req.user?.id;
    const userId = req.params?.id;

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
      plans,
      booking_prices
    } = req.body;

    // Validate required fields
    if (!seller_id || !service_title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Seller ID, service title, and description are required'
      });
    }

    // Validate booking prices (must be array of exactly 3 numbers)
    if (!Array.isArray(booking_prices) || booking_prices.length !== 3 ||
      !booking_prices.every(price => typeof price === 'number')) {
      return res.status(400).json({
        success: false,
        message: 'Booking prices must be an array of exactly 3 numbers'
      });
    }

    // Insert main service data
    const { data: serviceData, error: serviceError } = await supabase
      .from('services')
      .insert([{
        seller_id,
        service_title,
        service_category,
        description,
        keywords: keywords || [],
        thumbnails: thumbnails || [],
        is_active: true,
        bookingcall_array: booking_prices
      }])
      .select();

    if (serviceError) {
      throw serviceError;
    }

    const serviceId = serviceData[0].id;

    // Insert service plans if they exist
    if (plans && plans.length > 0) {
      const formattedPlans = plans.map((plan: any) => ({
        service_id: serviceId,
        plan_name: plan.name,
        plan_price: plan.price,
        is_active: plan.active !== false,
      }));

      const { error: plansError } = await supabase
        .from('services_plan')
        .insert(formattedPlans);

      if (plansError) {
        throw plansError;
      }
    }

    // Fetch complete service data with plans
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


export const updateSellerServiceController = async (req: Request, res: Response): Promise<any> => {
  try {
    const serviceId = req.params.id;
    const {
      service_title,
      service_category,
      description,
      keywords,
      thumbnails,
      plans,
      booking_prices,
      is_active
    } = req.body;

    if (!serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Service ID is required'
      });
    }

    // Validate booking prices if provided
    if (booking_prices) {
      if (!Array.isArray(booking_prices) || booking_prices.length !== 3 ||
        !booking_prices.every(price => typeof price === 'number')) {
        return res.status(400).json({
          success: false,
          message: 'Booking prices must be an array of exactly 3 numbers'
        });
      }
    }

    // Check if service exists
    const { data: existingService, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .maybeSingle();

    if (serviceError) throw serviceError;
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Update main service data
    const { data: updatedService, error: updateError } = await supabase
      .from('services')
      .update({
        service_title: service_title || existingService.service_title,
        service_category: service_category || existingService.service_category,
        description: description || existingService.description,
        keywords: keywords || existingService.keywords,
        thumbnails: thumbnails || existingService.thumbnails,
        bookingcall_array: booking_prices || existingService.bookingcall_array,
        is_active: is_active !== undefined ? is_active : existingService.is_active
      })
      .eq('id', serviceId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update plans if provided
    if (plans && Array.isArray(plans)) {
      // Delete existing plans
      await supabase
        .from('services_plan')
        .delete()
        .eq('service_id', serviceId);

      // Insert new plans
      const formattedPlans = plans.map((plan: any) => ({
        service_id: serviceId,
        plan_name: plan.name,
        plan_price: plan.price,
        is_active: plan.active !== false,
      }));

      const { error: plansError } = await supabase
        .from('services_plan')
        .insert(formattedPlans);

      if (plansError) throw plansError;
    }

    // Fetch updated service with plans
    const { data: finalService, error: fetchError } = await supabase
      .from('services')
      .select(`
        *,
        services_plan (*)
      `)
      .eq('id', serviceId)
      .single();

    if (fetchError) throw fetchError;

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      data: finalService
    });

  } catch (error: any) {
    console.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service',
      error: error.message
    });
  }
};

// export const getAllServices = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 10;
//     const offset = (page - 1) * limit;

//     const { data: services, error: servicesError, count } = await supabase
//       .from('services')
//       .select('*', { count: 'exact' })
//       .eq('is_active', true)
//       .range(offset, offset + limit - 1)
//       .order('created_at', { ascending: false });

//     if (servicesError) throw servicesError;

//     const sellerIds = services.map(service => service.seller_id);

//     const { data: sellers, error: sellersError } = await supabase
//       .from('profiles')
//       .select('*')
//       .in('id', sellerIds);

//     if (sellersError) throw sellersError;

//     const sellerMap = new Map(sellers.map(seller => [seller.id, seller]));

//     const { data: servicePlans, error: plansError } = await supabase
//       .from('services_plan')
//       .select('*')
//       .in('service_id', services.map(s => s.id));

//     if (plansError) throw plansError;

//     const plansMap = new Map();
//     servicePlans.forEach(plan => {
//       if (!plansMap.has(plan.service_id)) {
//         plansMap.set(plan.service_id, []);
//       }
//       plansMap.get(plan.service_id).push(plan);
//     });

//     const formattedServices = services.map(service => ({
//       ...service,
//       seller: sellerMap.get(service.seller_id) || null,
//       services_plan: plansMap.get(service.id) || []
//     }));

//     res.status(200).json({
//       success: true,
//       data: formattedServices,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil((count || 0) / limit),
//         totalItems: count,
//         itemsPerPage: limit
//       }
//     });

//   } catch (error: any) {
//     console.error('Error fetching services:', error.message);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch services',
//       error: error.message
//     });
//   }
// };

export const getAllServices = async (req: Request, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const userId = req.user?.id;

    // First, get all services without pagination to apply personalized sorting
    const { data: allServices, error: allServicesError } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true);

    if (allServicesError) throw allServicesError;

    let finalServices = allServices;
    let userHasPreferences = false;
    let topKeywords: string[] = [];

    // Apply personalized sorting if user is authenticated
    if (userId && allServices && allServices.length > 0) {
      // Get user preferences
      const { data: userPreferences } = await supabase
        .from('user_preferences')
        .select('service_keywords')
        .eq('user_id', userId)
        .single();

      // Check if user has service preferences
      userHasPreferences = userPreferences?.service_keywords !== null &&
        userPreferences?.service_keywords !== undefined &&
        typeof userPreferences?.service_keywords === 'object' &&
        Object.keys(userPreferences.service_keywords).length > 0;

      const userKeywords = userPreferences?.service_keywords || {};

      if (userHasPreferences) {
        // Get top 5 most used keywords from user preferences
        topKeywords = Object.entries(userKeywords)
          .sort(([, scoreA], [, scoreB]) => (scoreB as number) - (scoreA as number))
          .slice(0, 5)
          .map(([keyword]) => keyword.toLowerCase().trim());

        // Calculate scores for each service based on user preferences
        const servicesWithScores = allServices.map(service => {
          const serviceKeywords = service.keywords || [];
          let preferenceScore = 0;
          let topKeywordMatch = false;

          // Calculate preference score based on user's keyword history
          serviceKeywords.forEach((keyword: string) => {
            const cleanKeyword = keyword.toLowerCase().trim();
            const keywordScore = userKeywords[cleanKeyword] || 0;
            preferenceScore += keywordScore;

            // Check if this service matches any of the top 5 keywords
            if (topKeywords.includes(cleanKeyword)) {
              topKeywordMatch = true;
              // Bonus points for matching top keywords
              preferenceScore += keywordScore * 2;
            }
          });

          // Calculate newness score (more recent = higher score)
          const newnessScore = new Date(service.created_at).getTime();

          return {
            ...service,
            preferenceScore,
            newnessScore,
            topKeywordMatch // Flag for top keyword matches
          };
        });

        // ALGORITHM: Prioritize services with top keywords first, then 50-30-20 distribution
        const totalServices = allServices.length;

        // 1. FIRST: Get services that match top 5 keywords (highest priority)
        const topKeywordServices = servicesWithScores
          .filter(service => service.topKeywordMatch)
          .sort((a, b) => b.preferenceScore - a.preferenceScore);

        // 2. Then apply 50-30-20 distribution to remaining services
        const remainingServices = servicesWithScores
          .filter(service => !service.topKeywordMatch);

        const remainingCount = totalServices - topKeywordServices.length;
        const preferredCount = Math.floor(remainingCount * 0.5);
        const newCount = Math.floor(remainingCount * 0.3);
        const mixedCount = Math.floor(remainingCount * 0.2);

        // 2a. Get 50% based on user preferences from remaining
        const preferredServices = remainingServices
          .filter(service => service.preferenceScore > 0)
          .sort((a, b) => b.preferenceScore - a.preferenceScore);

        const selectedPreferred = preferredServices.slice(0, preferredCount);

        // 2b. Get 30% based on newness from remaining
        const newServices = remainingServices
          .filter(service => !selectedPreferred.includes(service))
          .sort((a, b) => b.newnessScore - a.newnessScore);

        const selectedNew = newServices.slice(0, newCount);

        // 2c. Get 20% based on mixed factors from remaining
        const mixedServices = remainingServices
          .filter(service => !selectedPreferred.includes(service) && !selectedNew.includes(service));

        const selectedMixed = mixedServices.slice(0, mixedCount);

        // Combine all selected services: TOP KEYWORD SERVICES FIRST, then others
        finalServices = [
          ...topKeywordServices, // Highest priority: services matching top keywords
          ...selectedPreferred,  // Then preferred services
          ...selectedNew,        // Then new services
          ...selectedMixed       // Then mixed services
        ];

        // If we don't have enough services, fill with any remaining
        if (finalServices.length < totalServices) {
          const allRemaining = servicesWithScores.filter(
            service => !finalServices.includes(service)
          );
          finalServices = [...finalServices, ...allRemaining.slice(0, totalServices - finalServices.length)];
        }
      }
    }

    // Now apply pagination to the final sorted services
    const paginatedServices = finalServices.slice(offset, offset + limit);

    // Get additional data for the paginated services
    const sellerIds = paginatedServices.map(service => service.seller_id);
    const serviceIds = paginatedServices.map(service => service.id);

    const { data: sellers, error: sellersError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', sellerIds);

    if (sellersError) throw sellersError;

    const sellerMap = new Map(sellers.map(seller => [seller.id, seller]));

    const { data: servicePlans, error: plansError } = await supabase
      .from('services_plan')
      .select('*')
      .in('service_id', serviceIds);

    if (plansError) throw plansError;

    const plansMap = new Map();
    servicePlans.forEach(plan => {
      if (!plansMap.has(plan.service_id)) {
        plansMap.set(plan.service_id, []);
      }
      plansMap.get(plan.service_id).push(plan);
    });

    // Format the final response
    const formattedServices = paginatedServices.map(service => ({
      id: service.id,
      seller_id: service.seller_id,
      service_title: service.service_title,
      service_category: service.service_category,
      description: service.description,
      keywords: service.keywords,
      thumbnails: service.thumbnails,
      created_at: service.created_at,
      updated_at: service.updated_at,
      is_active: service.is_active,
      bookingcall_array: service.bookingcall_array,
      seller: sellerMap.get(service.seller_id) || null,
      services_plan: plansMap.get(service.id) || [],
      // Include scoring info for debugging (optional)
      _score: service.preferenceScore,
      _top_keyword_match: service.topKeywordMatch
    }));

    res.status(200).json({
      success: true,
      data: formattedServices,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(finalServices.length / limit),
        totalItems: finalServices.length,
        itemsPerPage: limit
      },
      metadata: {
        personalized: !!userId && userHasPreferences,
        user_has_preferences: userHasPreferences,
        top_keywords: topKeywords,
        algorithm_applied: userHasPreferences ? "top-keywords-first with 50-30-20 sorting" : "default sorting",
        sorting_breakdown: userHasPreferences ? {
          top_keyword_services: finalServices.filter(s => s.topKeywordMatch).length,
          preferred_services: finalServices.filter(s => s.preferenceScore > 0 && !s.topKeywordMatch).length,
          new_services: finalServices.filter(s => s.preferenceScore === 0 && !s.topKeywordMatch).length,
          mixed_services: finalServices.length - finalServices.filter(s => s.preferenceScore >= 0 && !s.topKeywordMatch).length
        } : null
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

export const generateSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { niche, slogan, languages, country, city } = req.body;

    if (!niche || !slogan || !languages) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: niche, slogan, and languages are required'
      });
      return;
    }

    if (!Array.isArray(languages) || languages.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Languages must be a non-empty array'
      });
      return;
    }

    for (const lang of languages) {
      if (!lang.proficiency) {
        res.status(400).json({
          success: false,
          message: 'Each language must have a proficiency level'
        });
        return;
      }
    }

    const aiDescription = await generateAIDescription({
      niche,
      slogan,
      languages,
      country: country || undefined,
      city: city || undefined
    });

    res.status(200).json({
      success: true,
      data: {
        description: aiDescription
      }
    });

  } catch (error) {
    console.error('Error in generateAIResponse controller:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error while generating AI description'
    });
  }
};


// --------------- INTERFACES -----------------
interface BackupCode {
  code: string;
  used: boolean;
  used_at?: string | null;
}

interface Profile {
  two_factor_enabled: boolean;
  two_factor_setup_at: string | null;
  backup_codes: BackupCode[] | null;
  two_factor_temp_secret?: string;
  two_factor_secret?: string;
}

interface DeviceInfo {
  rememberDevice?: boolean;
  deviceName?: string;
  deviceType?: string;
  userAgent?: string;
}

// --------------- 2FA STATUS -----------------
export const get2FAStatusController = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id!;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('two_factor_enabled, two_factor_setup_at, backup_codes')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching 2FA status',
        error: error.message
      });
    }

    const profileData = profile as Profile;
    const unusedBackupCodes = profileData.backup_codes
      ? profileData.backup_codes.filter((code: BackupCode) => code.used === false).length
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        enabled: profileData.two_factor_enabled || false,
        setupAt: profileData.two_factor_setup_at,
        backupCodesCount: unusedBackupCodes
      }
    });
  } catch (error: any) {
    console.error('2FA status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// --------------- 2FA SETUP -----------------
export const setup2FAController = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id!;
    const userEmail = req.user?.email!;
    const appName = process.env.APP_NAME || 'ANAMCARA';

    const secret = speakeasy.generateSecret({
      name: `${appName}:${userEmail}`,
      issuer: appName,
      length: 32
    });

    const { error } = await supabase
      .from('profiles')
      .update({
        two_factor_temp_secret: secret.base32,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error storing 2FA secret',
        error: error.message
      });
    }

    const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url!);

    return res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeDataURL,
        manualEntryKey: secret.base32,
        backupCodes: []
      }
    });
  } catch (error: any) {
    console.error('2FA setup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating 2FA setup',
      error: error.message
    });
  }
};

// --------------- VERIFY 2FA SETUP -----------------
export const verify2FASetupController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { token } = req.body;
    const userId = req.user?.id!;

    if (!token || token.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 6-digit code'
      });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('two_factor_temp_secret')
      .eq('id', userId)
      .single();

    if (error || !profile.two_factor_temp_secret) {
      return res.status(400).json({
        success: false,
        message: 'No setup in progress. Please start 2FA setup again.'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: profile.two_factor_temp_secret,
      encoding: 'base32',
      token: token,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    const backupCodes = generateBackupCodes();

    return res.status(200).json({
      success: true,
      message: 'Code verified successfully',
      data: {
        backupCodes: backupCodes
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying 2FA code',
      error: error.message
    });
  }
};

// --------------- ENABLE 2FA -----------------
export const enable2FAController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { backupCodes } = req.body;
    const userId = req.user?.id!;

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('two_factor_temp_secret')
      .eq('id', userId)
      .single();

    if (fetchError || !profile.two_factor_temp_secret) {
      return res.status(400).json({
        success: false,
        message: 'No verified setup found. Please complete setup first.'
      });
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        two_factor_enabled: true,
        two_factor_secret: profile.two_factor_temp_secret,
        two_factor_temp_secret: null,
        two_factor_setup_at: new Date().toISOString(),
        backup_codes: backupCodes.map((code: string) => ({ code, used: false })),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error enabling 2FA',
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error enabling 2FA',
      error: error.message
    });
  }
};

// --------------- DISABLE 2FA -----------------
export const disable2FAController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { password, twoFactorCode } = req.body;
    const userId = req.user?.id!;

    if (!password && !twoFactorCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either password or 2FA code for verification'
      });
    }

    if (twoFactorCode) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('two_factor_secret')
        .eq('id', userId)
        .single();

      const verified = speakeasy.totp.verify({
        secret: profile?.two_factor_secret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 1
      });

      if (!verified) {
        return res.status(400).json({
          success: false,
          message: 'Invalid 2FA code'
        });
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_temp_secret: null,
        backup_codes: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error disabling 2FA',
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error disabling 2FA',
      error: error.message
    });
  }
};

// --------------- VERIFY 2FA LOGIN -----------------
export const verify2FALoginController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, token, deviceInfo } = req.body;

    if (!token || token.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 6-digit code'
      });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('two_factor_secret, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (error || !profile.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication not enabled'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: profile.two_factor_secret,
      encoding: 'base32',
      token: token,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    if (deviceInfo?.rememberDevice) {
      const deviceId = crypto.randomUUID();
      await supabase
        .from('trusted_devices')
        .insert({
          user_id: userId,
          device_id: deviceId,
          device_name: deviceInfo.deviceName || 'Unknown Device',
          device_type: deviceInfo.deviceType || 'web',
          user_agent: deviceInfo.userAgent,
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    }

    return res.status(200).json({
      success: true,
      message: '2FA verification successful'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying 2FA',
      error: error.message
    });
  }
};

// --------------- VERIFY BACKUP CODE -----------------
export const verify2FABackupCodeController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, backupCode } = req.body;

    if (!backupCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a backup code'
      });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('backup_codes')
      .eq('id', userId)
      .single();

    if (error || !profile.backup_codes) {
      return res.status(400).json({
        success: false,
        message: 'No backup codes found'
      });
    }

    const codeIndex = profile.backup_codes.findIndex(
      (bc: BackupCode) => bc.code === backupCode && !bc.used
    );

    if (codeIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or already used backup code'
      });
    }

    const updatedCodes = [...profile.backup_codes];
    updatedCodes[codeIndex].used = true;

    await supabase
      .from('profiles')
      .update({
        backup_codes: updatedCodes,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    return res.status(200).json({
      success: true,
      message: 'Backup code verified successfully'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying backup code',
      error: error.message
    });
  }
};

// --------------- REGENERATE BACKUP CODES -----------------
export const regenerateBackupCodesController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { twoFactorCode } = req.body;
    const userId = req.user?.id!;

    if (!twoFactorCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your 2FA code to regenerate backup codes'
      });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('two_factor_secret, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (error || !profile.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication not enabled'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: profile.two_factor_secret,
      encoding: 'base32',
      token: twoFactorCode,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid 2FA code'
      });
    }

    const newBackupCodes = generateBackupCodes();

    await supabase
      .from('profiles')
      .update({
        backup_codes: newBackupCodes.map((code: string) => ({ code, used: false })),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    return res.status(200).json({
      success: true,
      message: 'Backup codes regenerated successfully',
      data: {
        backupCodes: newBackupCodes
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error regenerating backup codes',
      error: error.message
    });
  }
};

// --------------- GET TRUSTED DEVICES -----------------
export const getTrustedDevicesController = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id!;

    const { data: devices, error } = await supabase
      .from('trusted_devices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching trusted devices',
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      data: devices
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching trusted devices',
      error: error.message
    });
  }
};

// --------------- REMOVE TRUSTED DEVICE -----------------
export const removeTrustedDeviceController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { deviceId } = req.params;
    const userId = req.user?.id!;

    const { error } = await supabase
      .from('trusted_devices')
      .delete()
      .eq('device_id', deviceId)
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error removing trusted device',
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Trusted device removed successfully'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Error removing trusted device',
      error: error.message
    });
  }
};

// --------------- HELPER FUNCTIONS -----------------
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;

}

export const getUnapprovedUsersController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { data: users, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("approved_status", false)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch unapproved users",
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: users || [],
    });
  } catch (err) {
    console.error("Get unapproved users error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

export const approveUserController = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { data: user, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.approved_status) {
      return res.status(400).json({
        success: false,
        message: "User is already approved",
      });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ approved_status: true })
      .eq("id", userId);

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: "Failed to approve user",
        error: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "User approved successfully",
    });
  } catch (err) {
    console.error("Approve user error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const sendApprovalEmail = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, status, invitorName, userId } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!status || (status !== 'verify' && status !== 'reject')) {
      return res.status(400).json({
        success: false,
        message: "Status is required and must be either 'verify' or 'reject'",
      });
    }

    await sendAdminEmail(email, invitorName, '', status);

    if (userId) {
      const { data: user, error: userError } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

      if (user && !userError) {
        const message = status === 'verify'
          ? 'Congratulations! Your account has been approved by ANAMCARA team.'
          : '❌ Your account application has been rejected by ANAMCARA team.';

        await sendNotification({
          recipientEmail: user.email, // MUST be actual user's email
          recipientUserId: userId,
          actorUserId: null,
          threadId: null,
          message: message,
          type: status === 'verify' ? 'account_verified' : 'account_rejected',
          metadata: {
            status: status,
            verified_at: new Date().toISOString()
          }
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: status === 'verify' ? "Approval email sent successfully" : "Rejection email sent successfully",
    });
  } catch (err) {
    console.error("Send email error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send email",
    });
  }
};

export const createProfile = async (req: Request, res: Response): Promise<any> => {
  try {
    const { user } = req.body;

    if (!user || !user.id || !user.email) {
      return res.status(400).json({
        success: false,
        message: 'User data is required',
        error: 'Missing user ID or email'
      });
    }

    console.log('Processing profile for user:', user.id, user.email);

    // Extract user data for both Google OAuth and normal email users
    const userMetadata = user.user_metadata || {};
    const appMetadata = user.app_metadata || {};

    // Determine if this is a Google OAuth user or normal email user
    const isGoogleOAuth = appMetadata.provider === 'google';

    let firstName = '';
    let lastName = '';
    const referralCode = userMetadata.referral_code || null;

    if (isGoogleOAuth) {
      // Handle Google OAuth user - extract names from full_name
      if (userMetadata.full_name) {
        const nameParts = userMetadata.full_name.trim().split(/\s+/);
        if (nameParts.length === 1) {
          firstName = nameParts[0];
          lastName = '';
        } else {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        }
      } else if (userMetadata.name) {
        const nameParts = userMetadata.name.trim().split(/\s+/);
        if (nameParts.length === 1) {
          firstName = nameParts[0];
          lastName = '';
        } else {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        }
      } else {
        firstName = user.email?.split('@')[0] || 'User';
        lastName = '';
      }
      console.log('Google OAuth user - Name extracted:', { firstName, lastName });
    } else {
      // Handle normal email user - use first_name and last_name from metadata
      firstName = userMetadata.first_name || '';
      lastName = userMetadata.last_name || '';

      // If no names provided, use email username
      if (!firstName && !lastName) {
        firstName = user.email?.split('@')[0] || 'User';
      }
      console.log('Normal email user - Name extracted:', { firstName, lastName });
    }

    const profileData = {
      id: user.id,
      email: user.email,
      first_name: firstName,
      last_name: lastName,
      referral_code: referralCode,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Use upsert to handle both create and update scenarios
    // This will create if doesn't exist, or update if exists
    const { data: profile, error: upsertError } = await supabase
      .from('profiles')
      .upsert(profileData, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Profile upsert error:', upsertError);
      return res.status(500).json({
        success: false,
        message: 'Failed to process profile',
        error: upsertError.message
      });
    }

    // Check if this was an insert or update
    const wasCreated = !profile?.created_at || 
                      new Date(profile.created_at).getTime() > Date.now() - 10000; // Within last 10 seconds

    console.log('Profile processed successfully for user:', user.id);
    console.log('User type:', isGoogleOAuth ? 'Google OAuth' : 'Normal Email');
    console.log('Action:', wasCreated ? 'Created' : 'Updated');

    return res.status(200).json({
      success: true,
      message: wasCreated ? 'Profile created successfully' : 'Profile already exists',
      profile: profile,
      userType: isGoogleOAuth ? 'google' : 'email',
      action: wasCreated ? 'created' : 'exists'
    });

  } catch (error) {
    console.error('Unexpected error in createProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
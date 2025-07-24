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
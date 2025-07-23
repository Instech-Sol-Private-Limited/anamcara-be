import sgMail from "@sendgrid/mail";
import dotenv from 'dotenv'; dotenv.config();

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

export const sendVerificationEmail = async (to: string) => {
  const verificationUrl = `http://localhost:5173/auth/verify-email?user=${to}`;

  const msg = {
    to,
    from: "react631@gmail.com",
    subject: "Please Verify Your Email - Anamcara",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
        <h2 style="color: #2e6f95;">Welcome to Anamcara!</h2>
        <p>Thank you for joining us. To get started, please verify your email address by clicking the button below:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #2e6f95; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
            Verify My Email
          </a>
        </div>

        <p>If the button doesn't work, please copy and paste the following link into your browser:</p>
        <p style="word-break: break-all;"><a href="${verificationUrl}" style="color: #2e6f95;">
        Click to verify </a></p>

        <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;" />

        <p style="font-size: 14px; color: #555;">
          Didn't receive this email? Please check your spam or junk folder. If you still don't see it, feel free to request another verification link.
        </p>

        <p style="font-size: 14px; color: #999;">— The Anamcara Team</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log("✅ Verification email sent to:", to);
  } catch (error) {
    console.error("❌ Failed to send verification email:", error);
    throw error;
  }
};




export const sendResetPasswordEmail = async (to: string, token: string) => {
  const resetPasswordUrl = `http://localhost:5173/auth/reset-password?token=${token}`;

  const msg = {
    to,
    from: "react631@gmail.com",
    subject: "Reset Your Password - Anamcara",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
        <h2 style="color: #2e6f95;">Reset Your Password</h2>
        <p>We received a request to reset your password. Click the button below to reset it:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetPasswordUrl}" style="background-color: #2e6f95; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
            Reset My Password
          </a>
        </div>

        <p>If the button doesn't work, please copy and paste the following link into your browser:</p>
        <p style="word-break: break-all;"><a href="${resetPasswordUrl}" style="color: #2e6f95;">
        Click to reset your password </a></p>

        <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;" />

        <p style="font-size: 14px; color: #555;">
          Didn't receive this email? Please check your spam or junk folder. If you still don't see it, feel free to request another verification link.
        </p>

        <p style="font-size: 14px; color: #999;">— The Anamcara Team</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log("✅ Verification email sent to:", to);
  } catch (error) {
    console.error("❌ Failed to send verification email:", error);
    throw error;
  }
};
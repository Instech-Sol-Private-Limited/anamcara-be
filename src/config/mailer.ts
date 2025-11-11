// import sgMail from "@sendgrid/mail";
// import dotenv from 'dotenv'; dotenv.config();

// dotenv.config();

// sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

// export const sendVerificationEmail = async (to: string) => {
//   const verificationUrl = `http://localhost:5173/auth/verify-email?user=${to}`;

//   const msg = {
//     to,
//     from: "react631@gmail.com",
//     subject: "Please Verify Your Email - Anamcara",
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
//         <h2 style="color: #2e6f95;">Welcome to Anamcara!</h2>
//         <p>Thank you for joining us. To get started, please verify your email address by clicking the button below:</p>

//         <div style="text-align: center; margin: 30px 0;">
//           <a href="${verificationUrl}" style="background-color: #2e6f95; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
//             Verify My Email
//           </a>
//         </div>

//         <p>If the button doesn't work, please copy and paste the following link into your browser:</p>
//         <p style="word-break: break-all;"><a href="${verificationUrl}" style="color: #2e6f95;">
//         Click to verify </a></p>

//         <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;" />

//         <p style="font-size: 14px; color: #555;">
//           Didn't receive this email? Please check your spam or junk folder. If you still don't see it, feel free to request another verification link.
//         </p>

//         <p style="font-size: 14px; color: #999;">— The Anamcara Team</p>
//       </div>
//     `,
//   };

//   try {
//     await sgMail.send(msg);
//   } catch (error) {
//     console.error("❌ Failed to send verification email:", error);
//     throw error;
//   }
// };


// export const sendResetPasswordEmail = async (to: string, token: string) => {
//   const resetPasswordUrl = `http://localhost:5173/auth/reset-password?token=${token}`;

//   const msg = {
//     to,
//     from: "react631@gmail.com",
//     subject: "Reset Your Password - Anamcara",
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
//         <h2 style="color: #2e6f95;">Reset Your Password</h2>
//         <p>We received a request to reset your password. Click the button below to reset it:</p>

//         <div style="text-align: center; margin: 30px 0;">
//           <a href="${resetPasswordUrl}" style="background-color: #2e6f95; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
//             Reset My Password
//           </a>
//         </div>

//         <p>If the button doesn't work, please copy and paste the following link into your browser:</p>
//         <p style="word-break: break-all;"><a href="${resetPasswordUrl}" style="color: #2e6f95;">
//         Click to reset your password </a></p>

//         <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;" />

//         <p style="font-size: 14px; color: #555;">
//           Didn't receive this email? Please check your spam or junk folder. If you still don't see it, feel free to request another verification link.
//         </p>

//         <p style="font-size: 14px; color: #999;">— The Anamcara Team</p>
//       </div>
//     `,
//   };

//   try {
//     await sgMail.send(msg);
//   } catch (error) {
//     console.error("❌ Failed to send verification email:", error);
//     throw error;
//   }
// };

import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 587,              // ✅ 587 for STARTTLS
  secure: false,          // ✅ false for 587
  requireTLS: true,       // optional but good
  auth: {
    user: "no-reply@anamcara.ai",
    pass: "2n8wLBFwBrNz",  // ⚠️ must be app password, not your login password
  },
  tls: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  },
});


export const sendVerificationEmail = async (to: string) => {
  const verificationUrl = `${process.env.BASE_URL}/auth/verify-email?user=${to}`;

  const mailOptions = {
    from: `"Anamcara Team" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Please Verify Your Email - Anamcara",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
        <h2 style="color: #2e6f95;">Welcome to Anamcara!</h2>
        <p>Thank you for joining us. Please verify your email:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #2e6f95; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
            Verify My Email
          </a>
        </div>
        <p>If the button doesn't work, copy this link:</p>
        <p style="word-break: break-all;"><a href="${verificationUrl}" style="color: #2e6f95;">${verificationUrl}</a></p>
        <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;" />
        <p style="font-size: 14px; color: #555;">Didn’t get the email? Check your spam folder or request another.</p>
        <p style="font-size: 14px; color: #999;">— The Anamcara Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("✅ Verification email sent to:", to);
  } catch (error) {
    console.error("❌ Failed to send verification email:", error);
    throw error;
  }
};

export const sendResetPasswordEmail = async (to: string, token: string) => {
  const resetPasswordUrl = `${process.env.BASE_URL}/auth/reset-password?token=${token}`;

 const mailOptions = {
  from: `"ANAMCARA Team" <${process.env.GMAIL_USER}>`,
  to,
  subject: "Reset Your Password and Reconnect ⭐️",
  html: `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Your Password - ANAMCARA</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f14;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #0f0f14; padding: 60px 20px;">
      <tr>
        <td align="center">
          <!-- Main Container -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background: #18181b; border-radius: 4px; border: 1px solid rgba(139, 92, 246, 0.2); overflow: hidden;">
            
            <!-- Subtle Top Border -->
            <tr>
              <td style="padding: 0;">
                <div style="height: 1px; background: linear-gradient(90deg, transparent, #8b5cf6, transparent);"></div>
              </td>
            </tr>

            <!-- Header -->
            <tr>
              <td style="padding: 50px 60px 30px; text-align: center;">
                <img 
                  src="https://wppxoslslgwovvpyldjy.supabase.co/storage/v1/object/public/Logos/logo.png" 
                  alt="ANAMCARA" 
                  style="width: 100px; height: auto; margin: 0 auto 32px; display: block; border-radius: 12px;" 
                />
                <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
                  Reset Your Password and Reconnect ⭐️
                </h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding: 0 60px 60px;">
                <p style="margin: 0 0 16px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">
                  Hi <strong style="color: #8b5cf6;">${"there"}</strong>,
                </p>

                <p style="margin: 0 0 24px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">
                  It happens to the best of us. Ready to reconnect? 💎
                </p>

                <!-- CTA -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 30px 0 40px;">
                  <tr>
                    <td align="center">
                      <a href="${resetPasswordUrl}"
                        style="display: inline-block; background: #8b5cf6; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 2px; font-size: 14px; font-weight: 600; letter-spacing: 0.3px;">
                        🔒 Reset My Password
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin: 0 0 24px; color: #a1a1aa; font-size: 14px; line-height: 1.8;">
                  If you didn’t request a password reset, feel free to ignore this message — your account remains safe.
                </p>

                <p style="margin: 0 0 24px; color: #d4d4d8; font-size: 14px; line-height: 1.8;">
                  Need extra help? We’re always here.<br />
                  Reach out anytime: <a href="mailto:support@anamcara.ai" style="color: #8b5cf6; text-decoration: none;">support@anamcara.ai</a>
                </p>

                <div style="height: 1px; background: #27272a; margin: 40px 0;"></div>

                <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.6;">
                  With care,<br />
                  <strong style="color: #8b5cf6;">ANAMCARA Team ⭐️</strong>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background: #1f1f23; padding: 40px 60px; border-top: 1px solid #27272a;">
                <p style="margin: 0 0 4px; color: #d4d4d8; font-size: 14px; font-weight: 600; text-align: center;">See you on the other side,</p>
                <p style="margin: 0 0 32px; color: #8b5cf6; font-size: 14px; font-weight: 700; text-align: center;">ANAMCARA Team ⭐</p>
                <p style="margin: 0; color: #52525b; font-size: 11px; line-height: 1.6; text-align: center;">
                  © 2025 ANAMCARA. All rights reserved.<br />
                  This is an automated message. Please do not reply.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `,
};


  try {
    await transporter.sendMail(mailOptions);
    console.log("✅ Password reset email sent to:", to);
  } catch (error) {
    console.error("❌ Failed to send reset password email:", error);
    throw error;
  }
};

export const sendInvitationEmail = async (to: string, inviterName: string, relation: string) => {
  const invitationUrl = `${process.env.BASE_URL}/auth/register?email=${to}&invited=true&inviter=${encodeURIComponent(inviterName)}&relation=${encodeURIComponent(relation)}`;

  const mailOptions = {
  from: `"ANAMCARA" <${process.env.GMAIL_USER}>`,
  to,
  subject: "Your Loved One Chose You as a Family Contact for ANAMCARA — Confirm to Continue ⭐️",
  html: `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Confirm Your ANAMCARA Family Role</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f14;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #0f0f14; padding: 60px 20px;">
      <tr>
        <td align="center">
          <!-- Main Container -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background: #18181b; border-radius: 4px; border: 1px solid rgba(139, 92, 246, 0.2); overflow: hidden;">
            
            <!-- Gradient Border -->
            <tr>
              <td style="padding: 0;">
                <div style="height: 1px; background: linear-gradient(90deg, transparent, #8b5cf6, transparent);"></div>
              </td>
            </tr>

            <!-- Header -->
            <tr>
              <td style="padding: 50px 60px 30px; text-align: center;">
                               <img src="https://wppxoslslgwovvpyldjy.supabase.co/storage/v1/object/sign/Logos/logo.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hYWUwZTNlZi0xMzQ5LTRhYmEtYTNlNi1mOTljMWJiMTBhMGYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJMb2dvcy9sb2dvLnBuZyIsImlhdCI6MTc2Mjc2OTExOCwiZXhwIjoxNzk0MzA1MTE4fQ.roQKd31MKbXZmH1bQgmDkyR1sl8zQlBFX7eNV934uIw" 
                  alt="ANAMCARA" 
                  style="width: 100px; height: auto; margin: 0 auto 32px; display: block; border-radius: 12px;" 
                />
                <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
                  Confirm Your Role on ANAMCARA ⭐️
                </h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding: 0 60px 60px;">
                <p style="margin: 0 0 16px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">
                  Hi <strong style="color: #8b5cf6;">${inviterName || "there"}</strong>,
                </p>

                <p style="margin: 0 0 24px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">
                  <strong>${inviterName}</strong> has requested to join <strong>ANAMCARA</strong> — a space built for safe, meaningful, and guided digital experiences.
                </p>

                <p style="margin: 0 0 24px; color: #a1a1aa; font-size: 14px; line-height: 1.8;">
                  As part of our <strong>AnamFamily</strong> feature, we require a trusted adult, guardian, or family contact to approve and oversee accounts for anyone under 18.  
                  This ensures their journey remains secure, responsible, and supported.
                </p>

                <!-- CTA -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 30px 0 40px;">
                  <tr>
                    <td align="center">
                      <a href="${invitationUrl}"
                        style="display: inline-block; background: #8b5cf6; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 2px; font-size: 14px; font-weight: 600; letter-spacing: 0.3px;">
                        🔗 Confirm & Create My Account
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="background: #1f1f23; border: 1px solid #27272a; border-radius: 4px; padding: 24px; margin-bottom: 32px;">
                  <p style="margin: 0 0 12px; color: #8b5cf6; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">
                    Once registered, you’ll gain access to the AnamFamily Dashboard to:
                  </p>
                  <ul style="margin: 0; padding-left: 20px; color: #e4e4e7; font-size: 14px; line-height: 1.8;">
                    <li>💎 Review and approve account access</li>
                    <li>💎 Monitor activity and login history</li>
                    <li>💎 Receive alerts for purchases and important actions</li>
                    <li>💎 Revoke or adjust permissions anytime</li>
                  </ul>
                </div>

                <p style="margin: 0 0 24px; color: #a1a1aa; font-size: 14px; line-height: 1.8;">
                  If you did not expect this request, you can safely ignore this message.
                </p>

                <p style="margin: 0 0 32px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">
                  Your loved one’s safety and experience mean everything to us.<br />
                  Thank you for being part of their journey 🚀
                </p>

                <div style="height: 1px; background: #27272a; margin: 40px 0;"></div>

                <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.6;">
                  With care,<br />
                  <strong style="color: #8b5cf6;">ANAMCARA Team ⭐️</strong>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background: #1f1f23; padding: 40px 60px; border-top: 1px solid #27272a;">
                <p style="margin: 0 0 4px; color: #d4d4d8; font-size: 14px; font-weight: 600; text-align: center;">See you on the other side,</p>
                <p style="margin: 0 0 32px; color: #8b5cf6; font-size: 14px; font-weight: 700; text-align: center;">ANAMCARA Team ⭐</p>
                <p style="margin: 0; color: #52525b; font-size: 11px; line-height: 1.6; text-align: center;">
                  © 2025 ANAMCARA. All rights reserved.<br />
                  This is an automated message. Please do not reply.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `,
};


  try {
    await transporter.sendMail(mailOptions);
    console.log("✅ Invitation email sent to:", to);
  } catch (error) {
    console.error("❌ Failed to send invitation email:", error);
    throw error;
  }
};
export const sendAdminEmail = async (to: string, inviterName: string, relation: string, status: 'verify' | 'reject') => {
  const isApproved = status === 'verify';
  
const mailOptions = {
  from: `"Anamcara" <${process.env.GMAIL_USER}>`,
  to,
  subject: "Welcome to ANAMCARA — Your Journey Begins 🚀",
  html: `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to ANAMCARA</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f14;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #0f0f14; padding: 60px 20px;">
      <tr>
        <td align="center">
          <!-- Main Container -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background: #18181b; border-radius: 4px; border: 1px solid rgba(139, 92, 246, 0.2); overflow: hidden;">
            
            <!-- Subtle Top Border -->
            <tr>
              <td style="padding: 0;">
                <div style="height: 1px; background: linear-gradient(90deg, transparent, #8b5cf6, transparent);"></div>
              </td>
            </tr>
            <!-- Header -->
            <tr>
              <td style="padding: 50px 60px 30px; text-align: center;">
                <img src="https://wppxoslslgwovvpyldjy.supabase.co/storage/v1/object/sign/Logos/logo.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hYWUwZTNlZi0xMzQ5LTRhYmEtYTNlNi1mOTljMWJiMTBhMGYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJMb2dvcy9sb2dvLnBuZyIsImlhdCI6MTc2Mjc2OTExOCwiZXhwIjoxNzk0MzA1MTE4fQ.roQKd31MKbXZmH1bQgmDkyR1sl8zQlBFX7eNV934uIw" 
                  alt="ANAMCARA" 
                  style="width: 150px; height: 100px; margin: 0 auto 32px; display: block; border-radius: 12px;" />
                <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.3px;">
                  Welcome to ANAMCARA ⭐️
                </h1>
                <p style="margin: 0; color: #71717a; font-size: 13px; letter-spacing: 0.5px; font-weight: 500;">Your journey begins here</p>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding: 0 60px 60px;">
                <p style="margin: 0 0 16px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">Hi <strong style="color: #8b5cf6;">${inviterName || "there"}</strong>,</p>

                <p style="margin: 0 0 22px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">
                  You’re officially part of <strong>ANAMCARA</strong> ⭐️<br />
                  Here, every click, every conversation, every connection is designed to help you feel seen, supported, and inspired.  
                  Whether you seek guidance, companionship, or a new kind of digital experience, your soul friend is here — evolving alongside you.
                </p>

                <div style="background: #1f1f23; border: 1px solid #27272a; border-radius: 4px; padding: 24px; margin: 30px 0;">
                  <p style="margin: 0 0 12px; color: #8b5cf6; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">
                    Here's what's waiting for you:
                  </p>
                  <ul style="margin: 0; padding-left: 20px; color: #e4e4e7; font-size: 14px; line-height: 1.8;">
                    <li>💎 Personalized interactions tailored to your world</li>
                    <li>💎 Future pathways into metaverse experiences</li>
                    <li>💎 An evolving digital soul connection built just for you</li>
                  </ul>
                </div>

                <!-- CTA Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 40px;">
                  <tr>
                    <td align="center">
                      <a href="https://anamcara.ai"
                        style="display: inline-block; background: #8b5cf6; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 2px; font-size: 14px; font-weight: 600; letter-spacing: 0.3px;">
                        🌐 Go to ANAMCARA
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin: 0 0 30px; color: #a1a1aa; font-size: 14px; line-height: 1.8;">
                  Thank you for trusting us with your journey.<br />
                  We’re honored to walk beside you.
                </p>

                <div style="height: 1px; background: #27272a; margin: 40px 0;"></div>

                <p style="margin: 0 0 22px; color: #71717a; font-size: 13px; line-height: 1.6;">
                  Your soul friends,<br />
                  <strong style="color: #8b5cf6;">The Team ANAMCARA ⭐️</strong>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background: #1f1f23; padding: 40px 60px; border-top: 1px solid #27272a;">
                <p style="margin: 0 0 4px; color: #d4d4d8; font-size: 14px; font-weight: 600; text-align: center;">See you on the other side,</p>
                <p style="margin: 0 0 32px; color: #8b5cf6; font-size: 14px; font-weight: 700; text-align: center;">ANAMCARA⭐</p>
                <p style="margin: 0; color: #52525b; font-size: 11px; line-height: 1.6; text-align: center;">
                  © 2025 ANAMCARA. All rights reserved.<br />
                  This is an automated message. Please do not reply.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `,
};



  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ ${isApproved ? 'Approval' : 'Rejection'} email sent to:`, to);
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    throw error;
  }
};

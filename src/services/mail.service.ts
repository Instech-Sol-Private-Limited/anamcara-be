// mailer.js
import nodemailer from "nodemailer";

// 1) Create transporter
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 465,
  secure: true,
  auth: {
    user: 'no-reply@anamcara.ai',
    pass: 'Anamcara@123!',
  },
});

// 2) Send email function
export async function sendMail() {
  try {
    const info = await transporter.sendMail({
      from: `"ANAMCARA🍀" <${process.env.EMAIL_USER}>`,
      to:'no-reply@anamcara.ai',
      subject:'Test Mail',
      html:`Hello`,
    });

    console.log("✅ Email sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
}

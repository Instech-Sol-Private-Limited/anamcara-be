// mailer.js
import nodemailer from "nodemailer";

// 1) Create transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: 'amancaraai@gmail.com',
    pass: 'tojx xlti wbio qccf',
  },
});

// 2) Send email function
export async function sendMail() {
  try {
    const info = await transporter.sendMail({
      from: `"ANAMCARA Team 🍀" <${process.env.EMAIL_USER}>`,
      to:'rahatalibaig810@gmail.com',
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

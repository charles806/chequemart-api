import { createTransport } from "nodemailer";

// Gmail SMTP transporter using Google App Password
// Uses SMTP_USER and SMTP_PASS from .env
let transporter = null;

const getTransporter = () => {
  // Use Gmail-specific env vars
  if (!transporter && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Gmail SMTP: host is smtp.gmail.com, port 465 (SSL) or 587 (TLS)
    const port = parseInt(process.env.SMTP_PORT || "587");
    transporter = createTransport({
      host: "smtp.gmail.com",
      port: port,
      secure: port === 465, // true for 465 (SSL), false for 587 (TLS)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, // Google App Password (16 chars)
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
};

/**
 * sendEmail - Generic email sender using Gmail SMTP
 * Returns null if SMTP_USER/SMTP_PASS not configured
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  const mailTransporter = getTransporter();
  
  if (!mailTransporter) {
    console.warn("⚠️ Gmail SMTP not configured. Skipping email send.");
    console.log("Gmail check:", { 
      SMTP_USER: process.env.SMTP_USER ? "present" : "missing",
      SMTP_PASS: process.env.SMTP_PASS ? "present" : "missing"
    });
    return null;
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_USER || "Chequemart<noreply@chequemart.com>",
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    };
    console.log("📧 Sending email to:", to, "Subject:", subject);
    const info = await mailTransporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("⚠️ Failed to send email:", error.message);
    return null;
  }
};

export const sendVerificationEmail = async (to, name, token) => {
  const verifyURL = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  return sendEmail({
    to,
    subject: "Verify your Chequemart account",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #333;">Welcome to Chequemart, ${name}! 🎉</h2>
        <p>Thanks for signing up. Please verify your email address to activate your account.</p>
        <a href="${verifyURL}"
          style="display:inline-block; padding:12px 24px; background:#4f46e5; color:#fff;
                 text-decoration:none; border-radius:6px; margin: 16px 0;">
          Verify Email
        </a>
        <p style="color:#888; font-size:13px;">This link expires in 24 hours.</p>
        <p style="color:#888; font-size:13px;">If you didn't create an account, please ignore this email.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (to, name, tokenOrOtp, isOTP = false) => {
  if (isOTP && typeof tokenOrOtp === 'string') {
    return sendEmail({
      to,
      subject: "Your Chequemart Password Reset Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #333;">Password Reset Code</h2>
          <p>Hi ${name}, here is your password reset code:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; background: #f5f5f5; border-radius: 8px; text-align: center; margin: 20px 0;">
            ${tokenOrOtp}
          </div>
          <p style="color:#888; font-size:13px;">This code expires in 10 minutes.</p>
          <p style="color:#888; font-size:13px;">If you didn't request this, your password won't be changed.</p>
        </div>
      `,
    });
  }
  
  const resetURL = `${process.env.CLIENT_URL}/reset-password?token=${tokenOrOtp}`;

  return sendEmail({
    to,
    subject: "Reset your Chequemart password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hi ${name}, we received a request to reset your password.</p>
        <a href="${resetURL}"
          style="display:inline-block; padding:12px 24px; background:#dc2626; color:#fff;
                 text-decoration:none; border-radius:6px; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color:#888; font-size:13px;">This link expires in 1 hour.</p>
        <p style="color:#888; font-size:13px;">If you didn't request this, your password won't be changed.</p>
      </div>
    `,
  });
};

export default {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};

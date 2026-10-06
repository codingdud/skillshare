import nodemailer from 'nodemailer';
import { config } from '../../config.js';
const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  requireTLS: config.NODE_ENV === 'production' && !config.SMTP_SECURE,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  disableFileAccess: true,
  disableUrlAccess: true,
});
export const mailService = {
  async sendOtp(email: string, code: string, purpose: 'verify_email' | 'reset_password') {
    const action = purpose === 'verify_email' ? 'verify your email' : 'reset your password';
    await transporter.sendMail({
      from: config.MAIL_FROM,
      to: email,
      subject:
        purpose === 'verify_email'
          ? 'Verify your SkillShare email'
          : 'Reset your SkillShare password',
      text: `Your SkillShare code is ${code}.\n\nUse this code to ${action}. It expires in 10 minutes and can only be used once. Do not share it with anyone.\n\nIf you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#0f172a"><h1 style="font-size:24px;color:#4338ca">SkillShare</h1><h2 style="font-size:20px">Your verification code</h2><p>Use this code to ${action}.</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#eef2ff;padding:20px;border-radius:8px">${code}</p><p>Expires in 10 minutes. Use it once and never share it.</p><p style="color:#64748b;font-size:13px">If you did not request this, you can ignore this email.</p></div>`,
    });
  },
  async verifyConnection() {
    await transporter.verify();
  },
};

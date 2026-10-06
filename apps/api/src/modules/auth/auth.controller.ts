import type { RequestHandler, Response } from 'express';
import {
  loginSchema,
  registerSchema,
  emailRequestSchema,
  otpSchema,
  resetPasswordSchema,
} from '@skillshare/contracts';
import { config } from '../../config.js';
import { AppError } from '../../shared/errors.js';
import { authService } from './auth.service.js';
import { authRepository } from './auth.repository.js';
import { verificationService } from './verification.service.js';
export const cookieName =
  config.NODE_ENV === 'production' ? '__Secure-skillshare_refresh' : 'skillshare_refresh';
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
function respond(res: Response, result: Awaited<ReturnType<typeof authService.login>>) {
  res
    .cookie(cookieName, result.refreshToken, cookieOptions)
    .json({ user: result.user, accessToken: result.accessToken });
}
export const authController: Record<string, RequestHandler> = {
  register: async (req, res) => {
    res.status(201).json(await authService.register(registerSchema.parse(req.body)));
  },
  verifyEmail: async (req, res) => {
    const input = otpSchema.parse(req.body);
    respond(res, await authService.verifyEmail(input.email, input.code));
  },
  resendVerification: async (req, res) => {
    res.json(
      await verificationService.request(emailRequestSchema.parse(req.body).email, 'verify_email'),
    );
  },
  forgotPassword: async (req, res) => {
    res.json(
      await verificationService.request(emailRequestSchema.parse(req.body).email, 'reset_password'),
    );
  },
  verifyReset: async (req, res) => {
    const input = otpSchema.parse(req.body);
    const result = await verificationService.verify(input.email, input.code, 'reset_password');
    res.json({ resetTicket: result.resetTicket, expiresInSeconds: 300 });
  },
  resetPassword: async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const result = await verificationService.resetPassword(input.resetTicket, input.password);
    res.clearCookie(cookieName, cookieOptions).json(result);
  },
  login: async (req, res) => {
    respond(res, await authService.login(loginSchema.parse(req.body)));
  },
  refresh: async (req, res) => {
    try {
      respond(res, await authService.refresh(req.cookies[cookieName]));
    } catch (error) {
      res.clearCookie(cookieName, cookieOptions);
      throw error;
    }
  },
  session: async (req, res) => {
    const token = req.cookies[cookieName];
    if (!token) {
      res.json(null);
      return;
    }
    try {
      respond(res, await authService.refresh(token));
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        res.clearCookie(cookieName, cookieOptions).json(null);
        return;
      }
      throw error;
    }
  },
  logout: async (req, res) => {
    await authService.logout(req.cookies[cookieName]);
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  },
  me: async (req, res) => {
    res.json({ user: await authRepository.byId(req.userId!) });
  },
};

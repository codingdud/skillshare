import type { RequestHandler } from 'express';
import { authService } from './auth.service.js';
import { AppError } from '../../shared/errors.js';
import { recordAudit } from '../admin/audit.js';
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      principal?: {
        userId: string;
        sessionId: string;
        clientKind: 'browser' | 'cli';
        scopes: string[];
        harnessGrants: string[] | null;
        role: 'user' | 'admin';
      };
    }
  }
}
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (header) {
    if (!header.startsWith('Bearer '))
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid authorization.');
    req.principal = await authService.verifyPrincipal(header.slice(7));
    req.userId = req.principal.userId;
  }
  next();
};
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.userId) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  next();
};
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  if (req.principal?.clientKind !== 'browser' || req.principal.role !== 'admin') {
    try {
      await recordAudit(
        'admin.access_denied',
        req.userId ?? null,
        null,
        'Administrator endpoint access denied',
      );
    } catch {
      /* Deny even when audit storage is unavailable. */
    }
    throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  }
  next();
};

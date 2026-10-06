import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authController as c } from './auth.controller.js';
import { optionalAuth, requireAuth } from './auth.middleware.js';
const router = Router();
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many authentication requests. Please try again later.',
      },
    },
  }),
);
router.post('/register', c.register!);
router.post('/verify-email', c.verifyEmail!);
router.post('/resend-verification', c.resendVerification!);
router.post('/forgot-password', c.forgotPassword!);
router.post('/verify-password-reset', c.verifyReset!);
router.post('/reset-password', c.resetPassword!);
router.post('/login', c.login!);
router.post('/refresh', c.refresh!);
router.post('/session', c.session!);
router.post('/logout', c.logout!);
router.get('/me', optionalAuth, requireAuth, c.me!);
export { router as authRoutes };

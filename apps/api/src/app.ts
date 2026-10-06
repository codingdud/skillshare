import { harnessJSONLimit } from '@skillshare/contracts';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { allowedWebOrigins } from './config.js';
import { pool } from './db/client.js';
import { AppError, errorHandler } from './shared/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { optionalAuth } from './modules/auth/auth.middleware.js';
import { harnesses } from '@skillshare/contracts';
import { harnessRoutes } from './modules/harnesses/harness.routes.js';
import { cliProtocolRoutes, cliBrowserRoutes } from './modules/cli-auth/cli-auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { monitorRequests } from './modules/admin/admin.monitor.js';
export const app = express();
export const apiRequestLimit = rateLimit({
  windowMs: 60000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again shortly.' } },
});
app.disable('x-powered-by');
app.use('/api', monitorRequests);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedWebOrigins.has(origin)) return callback(null, true);
      return callback(new AppError(403, 'ORIGIN', 'This browser origin is not allowed.'));
    },
    credentials: true,
  }),
);
app.use('/api/harnesses', express.json({ limit: harnessJSONLimit }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/oauth', express.urlencoded({ extended: false, limit: '8kb' }));
app.use(cookieParser());
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', optionalAuth);
app.use('/api', (req, _res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    !allowedWebOrigins.has(req.headers.origin ?? '') &&
    !(/^\/api\/oauth\/(device\/code|token|revoke)$/.test(req.originalUrl) && !req.headers.cookie) &&
    !(
      req.principal?.clientKind === 'cli' &&
      !req.headers.cookie &&
      /^\/api\/harnesses(?:\/|$)/.test(req.originalUrl)
    )
  )
    throw new AppError(
      403,
      'ORIGIN',
      'This request must originate from the configured SkillShare application.',
    );
  next();
});
app.use('/api', apiRequestLimit);
app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});
app.use('/api/auth', authRoutes);
app.use('/api/oauth', cliProtocolRoutes);
app.use('/api/auth', cliBrowserRoutes);
app.use('/api/harnesses', harnessRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/runtime-profiles', (_req, res) =>
  res.json({ items: Object.entries(harnesses).map(([id, profile]) => ({ id, ...profile })) }),
);
app.use((_req, _res) => {
  throw new AppError(404, 'NOT_FOUND', 'Endpoint not found.');
});
app.use(errorHandler);

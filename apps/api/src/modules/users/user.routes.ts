import { Router } from 'express';
import { z } from 'zod';
import { idSchema, profileUpdateSchema } from '@skillshare/contracts';
import { requireAuth } from '../auth/auth.middleware.js';
import { AppError } from '../../shared/errors.js';
import { userService as service } from './user.service.js';

export const userRoutes = Router();
const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
const browserOnly: typeof requireAuth = (req, _res, next) => {
  if (req.principal?.clientKind !== 'browser')
    throw new AppError(403, 'BROWSER_REQUIRED', 'Manage your profile in the browser.');
  next();
};
userRoutes.get('/me', requireAuth, browserOnly, async (req, res) => {
  res.json(await service.own(req.userId!, pageSchema.parse(req.query.page)));
});
userRoutes.patch('/me', requireAuth, browserOnly, async (req, res) => {
  res.json(await service.update(req.userId!, profileUpdateSchema.parse(req.body)));
});
userRoutes.get('/:id', async (req, res) => {
  res.json(await service.get(idSchema.parse(req.params.id), pageSchema.parse(req.query.page)));
});

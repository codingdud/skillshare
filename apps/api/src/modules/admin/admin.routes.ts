import { Router } from 'express';
import { adminQuerySchema, roleChangeSchema, idSchema } from '@skillshare/contracts';
import { requireAuth, requireAdmin } from '../auth/auth.middleware.js';
import { adminService as service } from './admin.service.js';

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireAdmin);
adminRoutes.get('/overview', async (req, res) =>
  res.json(await service.overview(adminQuerySchema.parse(req.query))),
);
adminRoutes.get('/users', async (req, res) =>
  res.json(await service.users(adminQuerySchema.parse(req.query))),
);
adminRoutes.get('/harnesses', async (req, res) =>
  res.json(await service.harnesses(adminQuerySchema.parse(req.query))),
);
adminRoutes.get('/activity', async (req, res) =>
  res.json(await service.activity(adminQuerySchema.parse(req.query))),
);
adminRoutes.get('/health', async (_req, res) => res.json(await service.health()));
adminRoutes.patch('/users/:id/role', async (req, res) =>
  res.json(
    await service.changeRole(
      req.userId!,
      idSchema.parse(req.params.id),
      roleChangeSchema.parse(req.body),
    ),
  ),
);

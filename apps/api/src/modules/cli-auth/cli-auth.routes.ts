import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { deviceStartSchema, deviceDecisionSchema, idSchema } from '@skillshare/contracts';
import { requireAuth } from '../auth/auth.middleware.js';
import { AppError } from '../../shared/errors.js';
import { cliAuthService as service } from './cli-auth.service.js';
const tokenSchema = z.discriminatedUnion('grant_type', [
  z.strictObject({
    client_id: z.literal('skillshare-cli'),
    grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code'),
    device_code: z.string().min(40).max(200),
  }),
  z.strictObject({
    client_id: z.literal('skillshare-cli'),
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().min(40).max(200),
  }),
]);
export const cliProtocolRoutes = Router();
cliProtocolRoutes.use(
  rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }),
);
cliProtocolRoutes.post(
  '/device/code',
  rateLimit({ windowMs: 600000, limit: 15, legacyHeaders: false }),
  async (req, res) => {
    const input = deviceStartSchema.parse(req.body);
    res.json(await service.start([...new Set(input.scope.split(' '))], input.label));
  },
);
cliProtocolRoutes.post('/token', async (req, res) => {
  const input = tokenSchema.parse(req.body);
  res.json(
    input.grant_type === 'refresh_token'
      ? await service.refresh(input.refresh_token)
      : await service.exchange(input.device_code),
  );
});
cliProtocolRoutes.post('/revoke', async (req, res) => {
  await service.revoke(
    z.strictObject({ token: z.string().min(40).max(200) }).parse(req.body).token,
  );
  res.status(204).end();
});
export const cliBrowserRoutes = Router();
cliBrowserRoutes.use(requireAuth, (req, _res, next) => {
  if (req.principal?.clientKind !== 'browser')
    throw new AppError(
      403,
      'BROWSER_REQUIRED',
      'Use your browser session to manage CLI authorization.',
    );
  next();
});
cliBrowserRoutes.use(rateLimit({ windowMs: 60000, limit: 30, legacyHeaders: false }));
cliBrowserRoutes.get('/device-request', async (req, res) => {
  const code = deviceDecisionSchema.shape.code.parse(req.query.code);
  res.json(await service.details(code));
});
cliBrowserRoutes.post('/device-decision', async (req, res) => {
  const input = deviceDecisionSchema.parse(req.body);
  await service.decide(input.code, req.userId!, input.approve, input.harnessIds);
  res.status(204).end();
});
cliBrowserRoutes.get('/devices', async (req, res) =>
  res.json({ items: await service.devices(req.userId!) }),
);
cliBrowserRoutes.delete('/devices/:id', async (req, res) => {
  await service.revokeDevice(req.userId!, idSchema.parse(req.params.id));
  res.status(204).end();
});

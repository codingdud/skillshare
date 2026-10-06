import { Router } from 'express';
import {
  idSchema,
  createHarnessSchema,
  harnessChangesSchema,
  harnessReleaseSchema,
  memberSchema,
  harnessDiscoveryQuerySchema,
  historyQuerySchema,
  harnessProposalSchema,
  harnessProposalDecisionSchema,
  harnessProposalMergeSchema,
} from '@skillshare/contracts';
import { requireAuth } from '../auth/auth.middleware.js';
import { harnessService } from './harness.service.js';
import { harnessSync, changesetSchema } from './harness.sync.js';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { collaborationService } from './harness.collaboration.js';

const router = Router();
router.use((req, _res, next) => {
  if (req.principal?.clientKind === 'cli') {
    const grants = req.principal.harnessGrants;
    if (grants !== null) {
      const match = req.path.match(/^\/([0-9a-f-]{36})(?:\/|$)/i);
      if (!match || !grants.includes(match[1]!.toLowerCase()))
        throw new AppError(
          403,
          'HARNESS_GRANT_REQUIRED',
          'This CLI session is restricted to selected Harnesses. Reauthorize in the browser to change its access.',
        );
    }
    const needed = ['GET', 'HEAD'].includes(req.method)
      ? 'harness:read'
      : req.path.endsWith('/releases')
        ? 'harness:publish'
        : 'harness:write';
    if (!req.principal.scopes.includes(needed))
      throw new AppError(
        403,
        'INSUFFICIENT_SCOPE',
        'CLI session needs ' + needed + '. Sign in again with the required scope.',
      );
    if (
      /\/(members|policy)(\/|$)/.test(req.path) ||
      (/\/proposals\//.test(req.path) && !['GET', 'HEAD'].includes(req.method))
    )
      throw new AppError(
        403,
        'BROWSER_REQUIRED',
        'Review changes and manage access in the browser.',
      );
  }
  next();
});
router.get('/:id/manifest', async (req, res) => {
  const result = await harnessSync.manifest(
    idSchema.parse(req.params.id),
    req.userId,
    z
      .string()
      .max(100)
      .parse(req.query.ref ?? 'latest'),
  );
  res.json({
    ...result,
    canWrite:
      result.canWrite &&
      (req.principal?.clientKind !== 'cli' || req.principal.scopes.includes('harness:write')),
    canPublish:
      result.canPublish &&
      (req.principal?.clientKind !== 'cli' || req.principal.scopes.includes('harness:publish')),
  });
});
router.post('/:id/changesets', requireAuth, async (req, res) =>
  res.json(
    await harnessSync.push(
      idSchema.parse(req.params.id),
      req.userId!,
      changesetSchema.parse(req.body),
    ),
  ),
);
router.get('/:id/revisions', requireAuth, async (req, res) => {
  const query = historyQuerySchema.parse(req.query);
  res.json(
    await harnessSync.history(idSchema.parse(req.params.id), req.userId, query.before, query.limit),
  );
});
router.get('/:id/revisions/:revisionId', requireAuth, async (req, res) =>
  res.json(
    await harnessSync.revision(
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.revisionId),
      req.userId,
    ),
  ),
);
router.post('/:id/restore', requireAuth, async (req, res) => {
  const input = z
    .strictObject({ revisionId: idSchema, revision: z.number().int().positive() })
    .parse(req.body);
  const id = idSchema.parse(req.params.id);
  const snapshot = await harnessSync.revision(id, input.revisionId, req.userId);
  res.json(
    await harnessService.save(
      id,
      req.userId!,
      { revision: input.revision, files: snapshot.files },
      'restore',
      'Restore revision ' + snapshot.revision,
    ),
  );
});
router.get('/discover', async (req, res) =>
  res.json(await harnessService.discover(harnessDiscoveryQuerySchema.parse(req.query), req.userId)),
);
router.get('/saved', requireAuth, async (req, res) =>
  res.json(
    await harnessService.discover(
      harnessDiscoveryQuerySchema.parse({ ...req.query, type: 'harness' }),
      req.userId,
      true,
    ),
  ),
);
router.get('/activity', requireAuth, async (req, res) =>
  res.json({ items: await harnessService.activity(req.userId!) }),
);
router.get('/:id/save', requireAuth, async (req, res) =>
  res.json({ saved: await harnessService.saved(idSchema.parse(req.params.id), req.userId!) }),
);
router.put('/:id/save', requireAuth, async (req, res) => {
  await harnessService.bookmark(idSchema.parse(req.params.id), req.userId!, true);
  res.status(204).end();
});
router.delete('/:id/save', requireAuth, async (req, res) => {
  await harnessService.bookmark(idSchema.parse(req.params.id), req.userId!, false);
  res.status(204).end();
});
router.get('/', async (req, res) =>
  res.json({ items: await harnessService.list(req.userId, req.query.scope === 'workspace') }),
);
router.post('/', requireAuth, async (req, res) =>
  res
    .status(201)
    .json(await harnessService.create(createHarnessSchema.parse(req.body), req.userId!)),
);
router.get('/:id', async (req, res) =>
  res.json(await harnessService.get(idSchema.parse(req.params.id), req.userId)),
);
router.put('/:id/files', requireAuth, async (req, res) =>
  res.json(
    await harnessService.save(
      idSchema.parse(req.params.id),
      req.userId!,
      harnessChangesSchema.parse(req.body),
    ),
  ),
);
router.post('/:id/releases', requireAuth, async (req, res) =>
  res
    .status(201)
    .json(
      await harnessService.publish(
        idSchema.parse(req.params.id),
        req.userId!,
        harnessReleaseSchema.parse(req.body),
      ),
    ),
);
router.get('/:id/releases/:releaseId', async (req, res) =>
  res.json(
    await harnessService.release(
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.releaseId),
      req.userId,
    ),
  ),
);
router.get('/:id/releases/:releaseId/export', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const release = await harnessService.exportRelease(
    id,
    idSchema.parse(req.params.releaseId),
    req.userId,
  );
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="harness-' + id + '-' + release.version + '.zip"',
  );
  res.send(Buffer.from(release.archive));
});
router.get('/:id/members', requireAuth, async (req, res) =>
  res.json(await collaborationService.members(idSchema.parse(req.params.id), req.userId!)),
);
router.post('/:id/members', requireAuth, async (req, res) => {
  await collaborationService.setMember(
    idSchema.parse(req.params.id),
    req.userId!,
    memberSchema.parse(req.body),
  );
  res.status(204).end();
});
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  await collaborationService.removeMember(
    idSchema.parse(req.params.id),
    req.userId!,
    idSchema.parse(req.params.userId),
  );
  res.status(204).end();
});
router.put('/:id/policy', requireAuth, async (req, res) => {
  await collaborationService.policy(
    idSchema.parse(req.params.id),
    req.userId!,
    z.strictObject({ requireReview: z.boolean() }).parse(req.body).requireReview,
  );
  res.status(204).end();
});
router.get('/:id/proposals', requireAuth, async (req, res) =>
  res.json(await collaborationService.list(idSchema.parse(req.params.id), req.userId!)),
);
router.post('/:id/proposals', requireAuth, async (req, res) =>
  res
    .status(201)
    .json(
      await collaborationService.create(
        idSchema.parse(req.params.id),
        req.userId!,
        harnessProposalSchema.parse(req.body),
      ),
    ),
);
router.get('/:id/proposals/:proposalId', requireAuth, async (req, res) =>
  res.json(
    await collaborationService.get(
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.proposalId),
      req.userId!,
    ),
  ),
);
router.post('/:id/proposals/:proposalId/approve', requireAuth, async (req, res) => {
  await collaborationService.approve(
    idSchema.parse(req.params.id),
    idSchema.parse(req.params.proposalId),
    req.userId!,
    harnessProposalDecisionSchema.parse(req.body),
  );
  res.status(204).end();
});
router.post('/:id/proposals/:proposalId/merge', requireAuth, async (req, res) =>
  res.json(
    await collaborationService.merge(
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.proposalId),
      req.userId!,
      harnessProposalMergeSchema.parse(req.body),
    ),
  ),
);
router.post('/:id/proposals/:proposalId/close', requireAuth, async (req, res) => {
  await collaborationService.close(
    idSchema.parse(req.params.id),
    idSchema.parse(req.params.proposalId),
    req.userId!,
  );
  res.status(204).end();
});
router.get('/:id/releases', async (req, res) =>
  res.json({ items: await harnessService.releases(idSchema.parse(req.params.id), req.userId) }),
);
export { router as harnessRoutes };

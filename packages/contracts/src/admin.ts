import { z } from 'zod';

export const userRoleSchema = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;
export const adminQuerySchema = z.object({
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
    .default(30),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  q: z.string().trim().max(120).default(''),
  role: z.enum(['all', 'user', 'admin']).default('all'),
  visibility: z.enum(['all', 'public', 'private', 'team']).default('all'),
  group: z.enum(['all', 'accounts', 'harnesses', 'access']).default('all'),
});
export type AdminQuery = z.infer<typeof adminQuerySchema>;
export const roleChangeSchema = z.strictObject({
  role: userRoleSchema,
  revision: z.number().int().positive(),
});
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  revision: number;
  verified: boolean;
  createdAt: string;
  harnessCount: number;
  activeSessions: number;
};
export type AdminHarness = {
  id: string;
  name: string;
  description: string;
  visibility: 'public' | 'private' | 'team';
  ownerId: string;
  ownerName: string;
  createdAt: string;
  releaseCount: number;
  revision: number;
  fileCount: number;
  version: string | null;
  releaseId: string | null;
};
export type AdminActivity = {
  id: string;
  action: string;
  group: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  targetName: string | null;
  summary: string;
  createdAt: string;
};
export type AdminPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type AdminOverview = {
  totals: {
    users: number;
    admins: number;
    verified: number;
    harnesses: number;
    public: number;
    private: number;
    team: number;
    releases: number;
    sessions: number;
    cliSessions: number;
  };
  period: { days: number; users: number; releases: number; revisions: number };
  trend: { date: string; users: number; releases: number; revisions: number }[];
  recent: AdminActivity[];
};
export type AdminHealth = {
  checkedAt: string;
  database: { status: 'healthy' | 'unavailable'; latencyMs: number | null };
  api: {
    uptimeSeconds: number;
    memoryMb: number;
    requests: number;
    serverErrors: number;
    rejected: number;
    averageMs: number;
    p95Ms: number;
    startedAt: string;
  };
};

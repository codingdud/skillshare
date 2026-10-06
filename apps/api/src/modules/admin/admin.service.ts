import type { AdminHealth, AdminQuery } from '@skillshare/contracts';
import { pool, transaction } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { adminRepository as repository } from './admin.repository.js';
import { recordAudit } from './audit.js';
import { processMetrics } from './admin.monitor.js';

export const adminService = {
  async overview(query: AdminQuery) {
    const overview = await repository.overview(query.days);
    const activity = await repository.activity({ ...query, group: 'all', page: 1 });
    return { ...overview, recent: activity.items.slice(0, 8) };
  },
  users: repository.users,
  harnesses: repository.harnesses,
  activity: repository.activity,
  async health(): Promise<AdminHealth> {
    const start = performance.now();
    let database: AdminHealth['database'];
    try {
      await pool.query('SELECT 1');
      database = { status: 'healthy', latencyMs: Math.round(performance.now() - start) };
    } catch {
      database = { status: 'unavailable', latencyMs: null };
    }
    return { checkedAt: new Date().toISOString(), database, api: processMetrics() };
  },
  async changeRole(
    actorId: string,
    userId: string,
    input: { role: 'user' | 'admin'; revision: number },
  ) {
    return transaction(async (db) => {
      // Serialize role changes, including concurrent attempts to demote the last administrators.
      await db.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      const actor = (await db.query('SELECT role FROM users WHERE id=$1', [actorId])).rows[0];
      if (actor?.role !== 'admin')
        throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
      const user = (
        await db.query(
          'SELECT id,role,role_revision AS revision,email_verified_at AS verified FROM users WHERE id=$1',
          [userId],
        )
      ).rows[0];
      if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
      if (input.revision !== user.revision)
        throw new AppError(
          409,
          'ROLE_CONFLICT',
          'This role changed elsewhere. Refresh the user list before making another change.',
        );
      if (input.role === user.role) return { role: user.role, revision: user.revision };
      if (input.role === 'admin' && !user.verified)
        throw new AppError(
          409,
          'EMAIL_UNVERIFIED',
          'The account must verify its email before receiving administrator access.',
        );
      if (user.role === 'admin') {
        const count = (
          await db.query("SELECT count(*)::int AS count FROM users WHERE role='admin'")
        ).rows[0].count;
        if (count <= 1)
          throw new AppError(
            409,
            'LAST_ADMIN',
            'Keep at least one administrator account. Promote another verified user first.',
          );
        if (actorId === userId)
          throw new AppError(
            409,
            'SELF_DEMOTION',
            'Ask another administrator to change your role.',
          );
      }
      await db.query('UPDATE users SET role=$2,role_revision=role_revision+1 WHERE id=$1', [
        userId,
        input.role,
      ]);
      await recordAudit(
        'user.role_changed',
        actorId,
        userId,
        'Role changed from ' + user.role + ' to ' + input.role,
        db,
      );
      return { role: input.role, revision: user.revision + 1 };
    });
  },
};

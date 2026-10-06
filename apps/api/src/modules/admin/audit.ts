import { pool, type DB } from '../../db/client.js';
export type AuditAction =
  'auth.login' | 'auth.logout' | 'profile.updated' | 'user.role_changed' | 'admin.access_denied';
export async function recordAudit(
  action: AuditAction,
  actorId: string | null,
  targetId: string | null,
  summary: string,
  db: DB = pool,
) {
  await db.query(
    'INSERT INTO admin_audit_events(action,actor_id,target_id,summary) VALUES($1,$2,$3,$4)',
    [action, actorId, targetId, summary],
  );
}

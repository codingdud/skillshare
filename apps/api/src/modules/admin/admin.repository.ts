import { pool } from '../../db/client.js';
import type {
  AdminActivity,
  AdminHarness,
  AdminOverview,
  AdminPage,
  AdminQuery,
  AdminUser,
} from '@skillshare/contracts';

const activitySql = `
 SELECT 'user:'||u.id::text AS id,'user.created' AS action,'accounts' AS "group",u.id AS "actorId",u.name AS "actorName",u.id AS "targetId",u.name AS "targetName",'Account registered' AS summary,u.created_at AS "createdAt" FROM users u
 UNION ALL
 SELECT 'revision:'||r.id::text,CASE WHEN r.revision=1 THEN 'harness.created' ELSE 'harness.updated' END,'harnesses',r.author_id,u.name,h.id,h.name,'Revision '||r.revision::text||' via '||r.source,r.created_at FROM harness_revisions r JOIN harnesses h ON h.id=r.harness_id LEFT JOIN users u ON u.id=r.author_id
 UNION ALL
 SELECT 'release:'||r.id::text,'harness.published','harnesses',h.owner_id,u.name,h.id,h.name,'Published v'||r.version,r.created_at FROM harness_releases r JOIN harnesses h ON h.id=r.harness_id JOIN users u ON u.id=h.owner_id
 UNION ALL
 SELECT 'audit:'||a.id::text,a.action,CASE WHEN a.action IN ('profile.updated','user.role_changed') THEN 'accounts' ELSE 'access' END,a.actor_id,u.name,a.target_id,t.name,a.summary,a.created_at FROM admin_audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN users t ON t.id=a.target_id
`;
const activityWhere = `"createdAt">=now()-($1::int*interval '1 day') AND ($2='all' OR "group"=$2)`;
const pageSize = 20;
function pageInfo(total: number, requestedPage: number) {
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  return { total, page, pageSize, offset: (page - 1) * pageSize };
}
export const adminRepository = {
  async overview(days: number): Promise<Omit<AdminOverview, 'recent'>> {
    const totals = (
      await pool.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM users WHERE role='admin') AS admins,
      (SELECT count(*)::int FROM users WHERE email_verified_at IS NOT NULL) AS verified,
      (SELECT count(*)::int FROM harnesses) AS harnesses,
      (SELECT count(*)::int FROM harnesses WHERE visibility='public') AS public,
      (SELECT count(*)::int FROM harnesses WHERE visibility='private') AS private,
      (SELECT count(*)::int FROM harnesses WHERE visibility='team') AS team,
      (SELECT count(*)::int FROM harness_releases) AS releases,
      (SELECT count(*)::int FROM sessions WHERE NOT revoked AND expires_at>now()) AS sessions,
      (SELECT count(*)::int FROM sessions WHERE NOT revoked AND expires_at>now() AND client_kind='cli') AS "cliSessions"`)
    ).rows[0];
    const period = (
      await pool.query(
        `SELECT $1::int AS days,
      (SELECT count(*)::int FROM users WHERE created_at>=date_trunc('day',now())-(($1::int-1)*interval '1 day')) AS users,
      (SELECT count(*)::int FROM harness_releases WHERE created_at>=date_trunc('day',now())-(($1::int-1)*interval '1 day')) AS releases,
      (SELECT count(*)::int FROM harness_revisions WHERE created_at>=date_trunc('day',now())-(($1::int-1)*interval '1 day')) AS revisions`,
        [days],
      )
    ).rows[0];
    const trend = (
      await pool.query(
        `SELECT to_char(day,'YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM users WHERE created_at>=day AND created_at<day+interval '1 day') AS users,
      (SELECT count(*)::int FROM harness_releases WHERE created_at>=day AND created_at<day+interval '1 day') AS releases,
      (SELECT count(*)::int FROM harness_revisions WHERE created_at>=day AND created_at<day+interval '1 day') AS revisions
      FROM generate_series(date_trunc('day',now())-(($1::int-1)*interval '1 day'),date_trunc('day',now()),interval '1 day') AS day ORDER BY day`,
        [days],
      )
    ).rows;
    return { totals, period, trend };
  },
  async users(query: AdminQuery): Promise<AdminPage<AdminUser>> {
    const pattern = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
    const where = `($1='all' OR u.role=$1) AND (u.name ILIKE $2 OR u.email ILIKE $2)`;
    const total = (
      await pool.query(`SELECT count(*)::int AS total FROM users u WHERE ${where}`, [
        query.role,
        pattern,
      ])
    ).rows[0].total;
    const { page, offset } = pageInfo(total, query.page);
    const items = (
      await pool.query(
        `SELECT u.id,u.name,u.email,u.role,u.role_revision AS revision,u.email_verified_at IS NOT NULL AS verified,u.created_at AS "createdAt",
      (SELECT count(*)::int FROM harnesses h WHERE h.owner_id=u.id) AS "harnessCount",
      (SELECT count(*)::int FROM sessions s WHERE s.user_id=u.id AND NOT s.revoked AND s.expires_at>now()) AS "activeSessions"
      FROM users u WHERE ${where} ORDER BY u.created_at DESC,u.id LIMIT $3 OFFSET $4`,
        [query.role, pattern, pageSize, offset],
      )
    ).rows;
    return {
      items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    };
  },
  async harnesses(query: AdminQuery): Promise<AdminPage<AdminHarness>> {
    const pattern = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
    const where = `($1='all' OR h.visibility=$1) AND (h.name ILIKE $2 OR u.name ILIKE $2)`;
    const total = (
      await pool.query(
        `SELECT count(*)::int AS total FROM harnesses h JOIN users u ON u.id=h.owner_id WHERE ${where}`,
        [query.visibility, pattern],
      )
    ).rows[0].total;
    const { page, offset } = pageInfo(total, query.page);
    const items = (
      await pool.query(
        `SELECT h.id,h.name,h.description,h.visibility,h.revision,h.created_at AS "createdAt",h.owner_id AS "ownerId",u.name AS "ownerName",jsonb_array_length(h.draft_files) AS "fileCount",r.id AS "releaseId",r.version,
      (SELECT count(*)::int FROM harness_releases hr WHERE hr.harness_id=h.id) AS "releaseCount"
      FROM harnesses h JOIN users u ON u.id=h.owner_id LEFT JOIN LATERAL (SELECT id,version FROM harness_releases WHERE harness_id=h.id ORDER BY created_at DESC,id LIMIT 1) r ON true
      WHERE ${where} ORDER BY h.created_at DESC,h.id LIMIT $3 OFFSET $4`,
        [query.visibility, pattern, pageSize, offset],
      )
    ).rows;
    return {
      items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    };
  },
  async activity(query: AdminQuery): Promise<AdminPage<AdminActivity>> {
    const total = (
      await pool.query(
        `SELECT count(*)::int AS total FROM (${activitySql}) events WHERE ${activityWhere}`,
        [query.days, query.group],
      )
    ).rows[0].total;
    const { page, offset } = pageInfo(total, query.page);
    const items = (
      await pool.query(
        `SELECT * FROM (${activitySql}) events WHERE ${activityWhere} ORDER BY "createdAt" DESC,id DESC LIMIT $3 OFFSET $4`,
        [query.days, query.group, pageSize, offset],
      )
    ).rows;
    return {
      items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    };
  },
};

import type { HarnessCapabilities } from '@skillshare/contracts';
import { pool, type DB } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';

// All draft/membership/policy mutations lock the Harness first. A revoked role
// cannot race a write authorized against an older membership snapshot.
export async function capabilities(
  id: string,
  userId?: string,
  db: DB = pool,
  lock = false,
): Promise<HarnessCapabilities> {
  const h = (
    await db.query(
      'SELECT owner_id,visibility,require_review FROM harnesses WHERE id=$1' +
        (lock ? ' FOR UPDATE' : ''),
      [id],
    )
  ).rows[0];
  const member =
    userId && h
      ? (
          await db.query('SELECT role FROM harness_members WHERE harness_id=$1 AND user_id=$2', [
            id,
            userId,
          ])
        ).rows[0]
      : undefined;
  const role = userId && h?.owner_id === userId ? 'owner' : (member?.role ?? null);
  if (!h || (!role && h.visibility !== 'public'))
    throw new AppError(404, 'NOT_FOUND', 'Harness unavailable or access is restricted.');
  return {
    role,
    canReadDraft: ['owner', 'editor', 'publisher'].includes(role ?? ''),
    canEdit: ['owner', 'editor'].includes(role ?? ''),
    canPublish: ['owner', 'publisher'].includes(role ?? ''),
    canManage: role === 'owner',
    canPropose: !!userId,
    canReview: ['owner', 'publisher'].includes(role ?? ''),
    requireReview: h.require_review,
  };
}
export async function authorize(
  id: string,
  userId: string | undefined,
  action: 'canEdit' | 'canPublish' | 'canReadDraft' | 'canManage' | 'canPropose' | 'canReview',
  db: DB = pool,
  lock = false,
) {
  const access = await capabilities(id, userId, db, lock);
  if (!access[action])
    throw new AppError(
      404,
      'NOT_FOUND',
      'This Harness action is unavailable or access is restricted.',
    );
  return access;
}
export function directEdit(access: HarnessCapabilities) {
  if (access.requireReview)
    throw new AppError(
      409,
      'REVIEW_REQUIRED',
      'Draft changes require an approved change proposal. Open Changes to propose your edits.',
    );
}

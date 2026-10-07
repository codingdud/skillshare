import { randomUUID } from 'node:crypto';
import type {
  HarnessRating,
  HarnessRatingsPage,
  HarnessRatingSummary,
  harnessRatingInputSchema,
} from '@skillshare/contracts';
import type { z } from 'zod';
import { pool } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { capabilities } from './harness.policy.js';

const pageSize = 10;
const columns =
  'r.id,r.user_id AS "userId",u.name AS "userName",r.rating,r.body,r.created_at AS "createdAt",r.updated_at AS "updatedAt"';
function view(row: Record<string, unknown>): HarnessRating {
  return {
    ...(row as unknown as HarnessRating),
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}
async function summary(id: string): Promise<HarnessRatingSummary> {
  const rows = (
    await pool.query(
      'SELECT rating::int AS rating,count(*)::int AS count FROM harness_ratings WHERE harness_id=$1 GROUP BY rating',
      [id],
    )
  ).rows as { rating: number; count: number }[];
  const distribution: HarnessRatingSummary['distribution'] = [0, 0, 0, 0, 0];
  for (const row of rows) distribution[row.rating - 1] = row.count;
  const count = distribution.reduce((sum, value) => sum + value, 0);
  const total = distribution.reduce((sum, value, index) => sum + value * (index + 1), 0);
  return { average: count ? Math.round((total / count) * 100) / 100 : null, count, distribution };
}
async function mine(id: string, userId?: string) {
  if (!userId) return null;
  const row = (
    await pool.query(
      `SELECT ${columns} FROM harness_ratings r JOIN users u ON u.id=r.user_id WHERE r.harness_id=$1 AND r.user_id=$2`,
      [id, userId],
    )
  ).rows[0];
  return row ? view(row) : null;
}
async function ratable(id: string, userId: string) {
  const access = await capabilities(id, userId);
  if (access.role === 'owner')
    throw new AppError(403, 'OWN_HARNESS', 'You cannot rate a Harness you own.');
}
export const ratingService = {
  summary,
  async list(id: string, userId: string | undefined, page: number): Promise<HarnessRatingsPage> {
    const access = await capabilities(id, userId);
    const stats = await summary(id);
    const lastPage = Math.max(1, Math.ceil(stats.count / pageSize));
    const current = Math.min(page, lastPage);
    const items = (
      await pool.query(
        `SELECT ${columns} FROM harness_ratings r JOIN users u ON u.id=r.user_id WHERE r.harness_id=$1 ORDER BY r.updated_at DESC,r.id LIMIT $2 OFFSET $3`,
        [id, pageSize, (current - 1) * pageSize],
      )
    ).rows.map(view);
    return {
      summary: stats,
      items,
      mine: await mine(id, userId),
      canRate: !!userId && access.role !== 'owner',
      page: current,
      pageSize,
      total: stats.count,
    };
  },
  async rate(
    id: string,
    userId: string,
    input: z.infer<typeof harnessRatingInputSchema>,
  ): Promise<HarnessRating> {
    await ratable(id, userId);
    await pool.query(
      'INSERT INTO harness_ratings(id,harness_id,user_id,rating,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT (harness_id,user_id) DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,updated_at=now()',
      [randomUUID(), id, userId, input.rating, input.body],
    );
    return (await mine(id, userId))!;
  },
  async remove(id: string, userId: string) {
    await capabilities(id, userId);
    await pool.query('DELETE FROM harness_ratings WHERE harness_id=$1 AND user_id=$2', [
      id,
      userId,
    ]);
  },
};

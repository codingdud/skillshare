import { pool, type DB } from '../../db/client.js';
import type { ProfileUpdate, ProfileHarness, UserProfile } from '@skillshare/contracts';

type ProfileRow = Pick<
  UserProfile,
  'id' | 'name' | 'bio' | 'location' | 'company' | 'website' | 'github'
> & {
  createdAt: Date;
};
export const userRepository = {
  async profile(id: string): Promise<ProfileRow | undefined> {
    return (
      await pool.query(
        'SELECT id,name,bio,location,company,website,github,created_at AS "createdAt" FROM users WHERE id=$1',
        [id],
      )
    ).rows[0];
  },
  async account(id: string) {
    return (
      await pool.query(
        'SELECT email,email_verified_at IS NOT NULL AS verified,profile_revision AS revision,role FROM users WHERE id=$1',
        [id],
      )
    ).rows[0] as
      { email: string; verified: boolean; revision: number; role: 'user' | 'admin' } | undefined;
  },
  async stats(id: string): Promise<UserProfile['stats']> {
    return (
      await pool.query(
        `SELECT count(*)::int AS harnesses,
        COALESCE(sum((SELECT count(*) FROM harness_releases hr WHERE hr.harness_id=h.id)),0)::int AS releases,
        COALESCE(sum(jsonb_array_length(r.files)),0)::int AS files
       FROM harnesses h JOIN LATERAL (SELECT files FROM harness_releases WHERE harness_id=h.id ORDER BY created_at DESC,id LIMIT 1) r ON true
       WHERE h.owner_id=$1 AND h.visibility='public'`,
        [id],
      )
    ).rows[0];
  },
  async harnesses(id: string, limit: number, offset: number): Promise<ProfileHarness[]> {
    return (
      await pool.query(
        `SELECT h.id,h.name,h.description,r.id AS "releaseId",r.version,jsonb_array_length(r.files) AS "fileCount",r.created_at AS "updatedAt"
       FROM harnesses h JOIN LATERAL (SELECT id,version,files,created_at FROM harness_releases WHERE harness_id=h.id ORDER BY created_at DESC,id LIMIT 1) r ON true
       WHERE h.owner_id=$1 AND h.visibility='public' ORDER BY r.created_at DESC,h.id LIMIT $2 OFFSET $3`,
        [id, limit, offset],
      )
    ).rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  },
  async update(id: string, input: ProfileUpdate, db: DB = pool) {
    return (
      await db.query(
        'UPDATE users SET name=$2,bio=$3,location=$4,company=$5,website=$6,github=$7,profile_revision=profile_revision+1 WHERE id=$1 AND profile_revision=$8 RETURNING id',
        [
          id,
          input.name,
          input.bio,
          input.location,
          input.company,
          input.website,
          input.github,
          input.revision,
        ],
      )
    ).rowCount;
  },
};

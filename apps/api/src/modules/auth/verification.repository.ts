import type { DB } from '../../db/client.js';
export type Purpose = 'verify_email' | 'reset_password';
export const verificationRepository = {
  async lockUser(email: string, db: DB) {
    return (
      await db.query(
        'SELECT id,name,email,email_verified_at AS "verifiedAt" FROM users WHERE email=$1 FOR UPDATE',
        [email],
      )
    ).rows[0] as { id: string; name: string; email: string; verifiedAt: Date | null } | undefined;
  },
  async challenge(userId: string, purpose: Purpose, db: DB) {
    return (
      await db.query(
        'SELECT id,code_hash AS "codeHash",attempts,expires_at AS "expiresAt",consumed_at AS "consumedAt",created_at AS "createdAt" FROM email_challenges WHERE user_id=$1 AND purpose=$2 FOR UPDATE',
        [userId, purpose],
      )
    ).rows[0] as
      | {
          id: string;
          codeHash: string;
          attempts: number;
          expiresAt: Date;
          consumedAt: Date | null;
          createdAt: Date;
        }
      | undefined;
  },
  async issue(id: string, userId: string, purpose: Purpose, hash: string, db: DB) {
    await db.query(
      "INSERT INTO email_challenges(id,user_id,purpose,code_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes') ON CONFLICT(user_id,purpose) DO UPDATE SET id=excluded.id,code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,consumed_at=NULL,created_at=now()",
      [id, userId, purpose, hash],
    );
  },
  async consume(id: string, db: DB) {
    await db.query('UPDATE email_challenges SET consumed_at=now() WHERE id=$1', [id]);
  },
  async attempt(id: string, db: DB) {
    await db.query('UPDATE email_challenges SET attempts=attempts+1 WHERE id=$1', [id]);
  },
  async verifyEmail(userId: string, db: DB) {
    await db.query(
      'UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1',
      [userId],
    );
  },
  async invalidateGrants(userId: string, db: DB) {
    await db.query(
      'UPDATE password_reset_grants SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',
      [userId],
    );
  },
  async grant(hash: string, userId: string, db: DB) {
    await this.invalidateGrants(userId, db);
    await db.query(
      "INSERT INTO password_reset_grants(hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
      [hash, userId],
    );
  },
};

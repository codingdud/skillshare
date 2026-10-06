import type { DB } from '../../db/client.js';
import { pool } from '../../db/client.js';
import type { User } from '@skillshare/contracts';
export type StoredUser = User & { passwordHash: string; verifiedAt: Date | null };
export const authRepository = {
  async touch(id: string) {
    await pool.query('UPDATE sessions SET last_used_at=now() WHERE id=$1', [id]);
  },
  async byEmail(email: string, db: DB = pool): Promise<StoredUser | undefined> {
    return (
      await db.query(
        'SELECT id,name,email,role,password_hash AS "passwordHash",email_verified_at AS "verifiedAt" FROM users WHERE email=$1',
        [email],
      )
    ).rows[0];
  },
  async byId(id: string, db: DB = pool): Promise<User | undefined> {
    return (await db.query('SELECT id,name,email,role FROM users WHERE id=$1', [id])).rows[0];
  },
  async create(user: Pick<User, 'id' | 'name' | 'email'>, passwordHash: string, db: DB) {
    await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
      user.id,
      user.name,
      user.email,
      passwordHash,
    ]);
  },
  async session(id: string, db: DB = pool) {
    return (
      await db.query(
        'SELECT s.user_id AS "userId",s.client_kind AS "clientKind",s.scopes,s.harness_grants AS "harnessGrants",u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND NOT s.revoked AND s.expires_at>now() AND u.email_verified_at IS NOT NULL',
        [id],
      )
    ).rows[0] as
      | {
          userId: string;
          clientKind: 'browser' | 'cli';
          scopes: string[];
          role: User['role'];
          harnessGrants: string[] | null;
        }
      | undefined;
  },
  async newSession(id: string, userId: string, hash: string, db: DB) {
    await db.query(
      "INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [id, userId],
    );
    await this.addToken(hash, id, db);
  },
  async addToken(hash: string, sessionId: string, db: DB) {
    await db.query('INSERT INTO refresh_tokens(hash,session_id) VALUES($1,$2)', [hash, sessionId]);
  },
  async lockToken(hash: string, db: DB) {
    return (
      await db.query(
        'SELECT t.used,s.id,s.user_id AS "userId",s.client_kind AS "clientKind",s.revoked,s.expires_at AS "expiresAt" FROM refresh_tokens t JOIN sessions s ON s.id=t.session_id WHERE t.hash=$1 FOR UPDATE OF s,t',
        [hash],
      )
    ).rows[0] as
      | {
          used: boolean;
          id: string;
          userId: string;
          clientKind: 'browser' | 'cli';
          revoked: boolean;
          expiresAt: Date;
        }
      | undefined;
  },
  async consume(hash: string, db: DB) {
    await db.query('UPDATE refresh_tokens SET used=true WHERE hash=$1', [hash]);
  },
  async revoke(id: string, db: DB = pool) {
    await db.query('UPDATE sessions SET revoked=true WHERE id=$1', [id]);
  },
};

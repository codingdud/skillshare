import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pool, transaction } from '../../db/client.js';
import { config } from '../../config.js';
import { authRepository } from '../auth/auth.repository.js';
import { authService } from '../auth/auth.service.js';
import { AppError } from '../../shared/errors.js';
import { capabilities } from '../harnesses/harness.policy.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const invalid = () =>
  new AppError(400, 'invalid_grant', 'Authorization is unavailable, expired, or already used.');
export const cliAuthService = {
  async start(scopes: string[], label: string) {
    const device = randomBytes(48).toString('base64url');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    const raw = [...bytes].map((v) => alphabet[v % alphabet.length]).join('');
    const code = raw.slice(0, 4) + '-' + raw.slice(4);
    await pool.query('DELETE FROM device_authorizations WHERE expires_at<now()');
    await pool.query(
      "INSERT INTO device_authorizations(device_hash,code_hash,scopes,label,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
      [hash(device), hash(code), scopes, label],
    );
    const uri = new URL('/device', config.WEB_ORIGIN);
    return {
      device_code: device,
      user_code: code,
      verification_uri: uri.href,
      verification_uri_complete: uri.href + '?code=' + code,
      expires_in: 600,
      interval: 5,
    };
  },
  async details(code: string) {
    const row = (
      await pool.query(
        'SELECT scopes,label,expires_at AS "expiresAt",status FROM device_authorizations WHERE code_hash=$1 AND expires_at>now() AND status=\'pending\'',
        [hash(code)],
      )
    ).rows[0];
    if (!row) throw invalid();
    return row;
  },
  async decide(code: string, userId: string, approve: boolean, harnessIds?: string[]) {
    if (approve && harnessIds) for (const id of harnessIds) await capabilities(id, userId);
    const result = await pool.query(
      "UPDATE device_authorizations SET status=$1,user_id=$2,harness_grants=$4 WHERE code_hash=$3 AND expires_at>now() AND status='pending' RETURNING device_hash",
      [approve ? 'approved' : 'denied', userId, hash(code), harnessIds ?? null],
    );
    if (!result.rowCount) throw invalid();
  },
  async exchange(device: string) {
    const result = await transaction(async (db) => {
      const row = (
        await db.query('SELECT * FROM device_authorizations WHERE device_hash=$1 FOR UPDATE', [
          hash(device),
        ])
      ).rows[0];
      if (!row || new Date(row.expires_at).getTime() <= Date.now() || row.status === 'consumed')
        return { error: 'expired_token' };
      if (row.status === 'denied') return { error: 'access_denied' };
      if (new Date(row.next_poll_at).getTime() > Date.now()) {
        await db.query(
          "UPDATE device_authorizations SET poll_interval=poll_interval+5,next_poll_at=now()+(poll_interval+5)*interval '1 second' WHERE device_hash=$1",
          [hash(device)],
        );
        return { error: 'slow_down' };
      }
      if (row.status === 'pending') {
        await db.query(
          "UPDATE device_authorizations SET next_poll_at=now()+poll_interval*interval '1 second' WHERE device_hash=$1",
          [hash(device)],
        );
        return { error: 'authorization_pending' };
      }
      const verified = (
        await db.query(
          'SELECT id FROM users WHERE id=$1 AND email_verified_at IS NOT NULL FOR UPDATE',
          [row.user_id],
        )
      ).rows[0];
      if (!verified) return { error: 'access_denied' };
      const sid = randomUUID(),
        refresh = randomBytes(48).toString('base64url');
      await authRepository.newSession(sid, row.user_id, hash(refresh), db);
      await db.query(
        "UPDATE sessions SET client_kind='cli',scopes=$1,label=$2,harness_grants=$4 WHERE id=$3",
        [row.scopes, row.label, sid, row.harness_grants],
      );
      await db.query("UPDATE device_authorizations SET status='consumed' WHERE device_hash=$1", [
        hash(device),
      ]);
      return { sid, userId: row.user_id as string, refresh, scopes: row.scopes as string[] };
    });
    if ('error' in result)
      throw new AppError(400, result.error!, 'CLI authorization: ' + result.error);
    return {
      access_token: await authService.issueAccess(result.userId, result.sid),
      refresh_token: result.refresh,
      token_type: 'Bearer',
      expires_in: 600,
      scope: result.scopes.join(' '),
      user: await authRepository.byId(result.userId),
    };
  },
  async refresh(token: string) {
    const result = await authService.refresh(token, 'cli');
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      token_type: 'Bearer',
      expires_in: 600,
      user: result.user,
    };
  },
  async revoke(token: string) {
    await transaction(async (db) => {
      const row = await authRepository.lockToken(hash(token), db);
      if (row?.clientKind === 'cli') await authRepository.revoke(row.id, db);
    });
  },
  async devices(userId: string) {
    return (
      await pool.query(
        'SELECT id,label,last_used_at AS "lastUsedAt",expires_at AS "expiresAt",revoked,scopes,harness_grants AS "harnessGrants" FROM sessions WHERE user_id=$1 AND client_kind=\'cli\' ORDER BY last_used_at DESC LIMIT 100',
        [userId],
      )
    ).rows;
  },
  async revokeDevice(userId: string, id: string) {
    await pool.query(
      "UPDATE sessions SET revoked=true WHERE id=$1 AND user_id=$2 AND client_kind='cli'",
      [id, userId],
    );
  },
};

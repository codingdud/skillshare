import {
  randomInt,
  randomUUID,
  randomBytes,
  createHmac,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../../config.js';
import { pool, transaction } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { verificationRepository as repo, type Purpose } from './verification.repository.js';
import { mailService } from './mail.service.js';
const otpHash = (id: string, purpose: Purpose, code: string) =>
  createHmac('sha256', config.JWT_SECRET)
    .update(`skillshare-email-otp:${id}:${purpose}:${code}`)
    .digest('hex');
const ticketHash = (ticket: string) => createHash('sha256').update(ticket).digest('hex');
const invalid = () =>
  new AppError(
    422,
    'INVALID_OTP',
    'The code is invalid, expired, or has reached its attempt limit. Request a new code.',
  );
export const verificationService = {
  async request(email: string, purpose: Purpose) {
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const recipient = await transaction(async (db) => {
      const user = await repo.lockUser(email, db);
      if (!user || (purpose === 'verify_email' && user.verifiedAt)) return null;
      const previous = await repo.challenge(user.id, purpose, db);
      if (previous && Date.now() - new Date(previous.createdAt).getTime() < 60000) return null;
      const id = randomUUID();
      await repo.issue(id, user.id, purpose, otpHash(user.id, purpose, code), db);
      if (purpose === 'reset_password') await repo.invalidateGrants(user.id, db);
      return { id, email: user.email };
    });
    if (recipient) {
      try {
        await mailService.sendOtp(recipient.email, code, purpose);
      } catch {
        await pool.query('UPDATE email_challenges SET consumed_at=now() WHERE id=$1', [
          recipient.id,
        ]);
        if (purpose === 'reset_password')
          return {
            message:
              'If this address is eligible, a reset code has been sent. Check your inbox and spam folder.',
            retryAfterSeconds: 60,
          };
        throw new AppError(
          503,
          'EMAIL_UNAVAILABLE',
          'Email delivery is unavailable. Please retry in a minute or contact the administrator.',
        );
      }
    }
    return {
      message:
        'If this address is eligible, a verification code has been sent. Check your inbox and spam folder.',
      retryAfterSeconds: 60,
    };
  },
  async verify(email: string, code: string, purpose: Purpose) {
    const resetTicket = randomBytes(48).toString('base64url');
    const result = await transaction(async (db) => {
      const user = await repo.lockUser(email, db);
      if (!user) return null;
      const challenge = await repo.challenge(user.id, purpose, db);
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.attempts >= 5 ||
        new Date(challenge.expiresAt).getTime() <= Date.now()
      )
        return null;
      const expected = Buffer.from(otpHash(user.id, purpose, code), 'hex'),
        actual = Buffer.from(challenge.codeHash, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        await repo.attempt(challenge.id, db);
        return null;
      }
      await repo.consume(challenge.id, db);
      if (purpose === 'verify_email') await repo.verifyEmail(user.id, db);
      else await repo.grant(ticketHash(resetTicket), user.id, db);
      return { id: user.id, name: user.name, email: user.email };
    });
    if (!result) throw invalid();
    return { user: result, resetTicket };
  },
  async resetPassword(resetTicket: string, password: string) {
    const hash = ticketHash(resetTicket);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const success = await transaction(async (db) => {
      const target = (
        await db.query('SELECT user_id FROM password_reset_grants WHERE hash=$1', [hash])
      ).rows[0];
      if (!target) return false;
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [target.user_id]);
      const grant = (
        await db.query(
          'SELECT user_id,expires_at,consumed_at FROM password_reset_grants WHERE hash=$1 FOR UPDATE',
          [hash],
        )
      ).rows[0];
      if (!grant || grant.consumed_at || new Date(grant.expires_at).getTime() <= Date.now())
        return false;
      await db.query(
        'UPDATE users SET password_hash=$1,email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$2',
        [passwordHash, grant.user_id],
      );
      await repo.invalidateGrants(grant.user_id, db);
      await db.query('UPDATE email_challenges SET consumed_at=now() WHERE user_id=$1', [
        grant.user_id,
      ]);
      await db.query('UPDATE sessions SET revoked=true WHERE user_id=$1', [grant.user_id]);
      return true;
    });
    if (!success)
      throw new AppError(
        422,
        'INVALID_RESET',
        'Your password-reset authorization expired or was already used. Request a new code.',
      );
    return {
      message:
        'Password updated. All existing sessions have been signed out. Sign in with your new password.',
    };
  },
};

import { randomBytes, randomUUID, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { z } from 'zod';
import type { User, loginSchema, registerSchema } from '@skillshare/contracts';
import { config } from '../../config.js';
import { transaction } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { authRepository as repo } from './auth.repository.js';
import { verificationService } from './verification.service.js';
import { recordAudit } from '../admin/audit.js';
const key = new TextEncoder().encode(config.JWT_SECRET);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newRefresh = () => randomBytes(48).toString('base64url');
const invalid = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in.');
async function access(userId: string, sessionId: string) {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('skillshare')
    .setAudience('skillshare-api')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key);
}
async function start(user: Pick<User, 'id' | 'name' | 'email'>, expectedPasswordHash?: string) {
  const sessionId = randomUUID(),
    refreshToken = newRefresh();
  await transaction(async (db) => {
    const row = (
      await db.query('SELECT email_verified_at,password_hash FROM users WHERE id=$1 FOR UPDATE', [
        user.id,
      ])
    ).rows[0];
    if (!row?.email_verified_at)
      throw new AppError(403, 'EMAIL_UNVERIFIED', 'Verify your email before signing in.');
    if (expectedPasswordHash && row.password_hash !== expectedPasswordHash) throw invalid();
    await repo.newSession(sessionId, user.id, hash(refreshToken), db);
    await recordAudit('auth.login', user.id, user.id, 'Browser session started', db);
  });
  return {
    user: (await repo.byId(user.id))!,
    accessToken: await access(user.id, sessionId),
    refreshToken,
  };
}
export const authService = {
  issueAccess: access,
  async register(input: z.infer<typeof registerSchema>) {
    const user = { id: randomUUID(), name: input.name, email: input.email };
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await transaction((db) => repo.create(user, passwordHash, db));
    await verificationService.request(user.email, 'verify_email');
    return {
      requiresVerification: true,
      email: user.email,
      message: 'Check your email for a six-digit verification code.',
    };
  },
  async login(input: z.infer<typeof loginSchema>) {
    const user = await repo.byEmail(input.email);
    // Keep expensive hashing on the missing-account path too.
    if (!user) {
      await argon2.hash(input.password);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    if (!(await argon2.verify(user.passwordHash, input.password)))
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    if (!user.verifiedAt)
      throw new AppError(403, 'EMAIL_UNVERIFIED', 'Verify your email before signing in.');
    return start({ id: user.id, name: user.name, email: user.email }, user.passwordHash);
  },
  async verifyEmail(email: string, code: string) {
    const result = await verificationService.verify(email, code, 'verify_email');
    return start(result.user);
  },
  async refresh(token: string | undefined, clientKind: 'browser' | 'cli' = 'browser') {
    if (!token || token.length > 200) throw invalid();
    const refreshToken = newRefresh();
    const session = await transaction(async (db) => {
      const record = await repo.lockToken(hash(token), db);
      if (!record) return null;
      if (record.clientKind !== clientKind) return null;
      if (record.used || record.revoked || new Date(record.expiresAt).getTime() <= Date.now()) {
        await repo.revoke(record.id, db);
        return null;
      }
      await repo.consume(hash(token), db);
      await repo.addToken(hash(refreshToken), record.id, db);
      return record;
    });
    // Throw after commit so replay revocation is durable.
    if (!session) throw invalid();
    const user = await repo.byId(session.userId);
    if (!user) throw invalid();
    return { user, accessToken: await access(user.id, session.id), refreshToken };
  },
  async logout(token: string | undefined) {
    if (!token) return;
    await transaction(async (db) => {
      const row = await repo.lockToken(hash(token), db);
      if (row) {
        await repo.revoke(row.id, db);
        await recordAudit('auth.logout', row.userId, row.userId, 'Browser session signed out', db);
      }
    });
  },
  async verifyPrincipal(token: string) {
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        issuer: 'skillshare',
        audience: 'skillshare-api',
      });
      if (!payload.sub || typeof payload.sid !== 'string') throw invalid();
      const session = await repo.session(payload.sid);
      if (!session || session.userId !== payload.sub) throw invalid();
      if (session.clientKind === 'cli') await repo.touch(payload.sid);
      return {
        userId: payload.sub,
        sessionId: payload.sid,
        clientKind: session.clientKind,
        scopes: session.scopes,
        harnessGrants: session.harnessGrants,
        role: session.role,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        (error instanceof Error && error.name.startsWith('JWT')) ||
        (error instanceof Error && error.name.startsWith('JWS'))
      )
        throw invalid();
      throw error;
    }
  },
  async verify(token: string) {
    return (await this.verifyPrincipal(token)).userId;
  },
};

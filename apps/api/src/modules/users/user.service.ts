import type { OwnUserProfile, ProfileUpdate, UserProfile } from '@skillshare/contracts';
import { AppError } from '../../shared/errors.js';
import { userRepository as repository } from './user.repository.js';
import { transaction } from '../../db/client.js';
import { recordAudit } from '../admin/audit.js';

export const userService = {
  async get(id: string, requestedPage = 1): Promise<UserProfile> {
    const profile = await repository.profile(id);
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'This creator profile could not be found.');
    const stats = await repository.stats(id);
    const pageSize = 12;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(stats.harnesses / pageSize)));
    const items = await repository.harnesses(id, pageSize, (page - 1) * pageSize);
    return {
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      stats,
      harnesses: { items, page, pageSize, total: stats.harnesses },
    };
  },
  async own(id: string, page = 1): Promise<OwnUserProfile> {
    const profile = await this.get(id, page);
    const account = await repository.account(id);
    if (!account) throw new AppError(404, 'NOT_FOUND', 'This account could not be found.');
    return { ...profile, account };
  },
  async update(id: string, input: ProfileUpdate) {
    await transaction(async (db) => {
      const updated = await repository.update(id, input, db);
      if (!updated)
        throw new AppError(
          409,
          'PROFILE_CONFLICT',
          'Your profile changed in another session. Your edits are preserved; reload the latest profile before saving again.',
        );
      await recordAudit('profile.updated', id, id, 'Public profile details updated', db);
    });
    return this.own(id);
  },
};

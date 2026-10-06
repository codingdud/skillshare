import { z } from 'zod';

export const profileUpdateSchema = z.strictObject({
  revision: z.number().int().positive(),
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(120),
  bio: z.string().trim().max(600, 'Keep your bio within 600 characters.'),
  location: z.string().trim().max(100),
  company: z.string().trim().max(100),
  website: z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          ['https:', 'http:'].includes(url.protocol) &&
          !!url.hostname &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }, 'Enter a full http:// or https:// URL without credentials.'),
  github: z
    .string()
    .trim()
    .max(39)
    .refine(
      (value) => !value || /^[a-z\d](?:[a-z\d]|-(?=[a-z\d]))*$/i.test(value),
      'Enter a GitHub username, without @ or a URL.',
    ),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type ProfileHarness = {
  id: string;
  name: string;
  description: string;
  releaseId: string;
  version: string;
  fileCount: number;
  updatedAt: string;
};
export type UserProfile = {
  id: string;
  name: string;
  bio: string;
  location: string;
  company: string;
  website: string;
  github: string;
  createdAt: string;
  stats: { harnesses: number; releases: number; files: number };
  harnesses: { items: ProfileHarness[]; total: number; page: number; pageSize: number };
};
export type OwnUserProfile = UserProfile & {
  account: { email: string; verified: boolean; revision: number; role: 'user' | 'admin' };
};

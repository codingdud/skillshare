import { compareStableVersions, nextStablePatch, stableVersionSchema } from '@skillshare/contracts';
import type { Client } from './auth.js';

export const latestVersion = (items: { version?: unknown }[]) =>
  items
    .map((item) => item.version)
    .filter((v): v is string => typeof v === 'string' && stableVersionSchema.safeParse(v).success)
    .sort((a, b) => compareStableVersions(b, a))[0];

/** `spec` is X.Y.Z, patch, minor, major, or omitted (patch). */
export function bumpVersion(latest: string | undefined, spec?: string) {
  const kind = spec ?? 'patch';
  if (stableVersionSchema.safeParse(kind).success) {
    if (latest && compareStableVersions(kind, latest) <= 0)
      throw new Error('Version ' + kind + ' must be newer than the latest release ' + latest + '.');
    return kind;
  }
  if (!['patch', 'minor', 'major'].includes(kind))
    throw new Error('Use an X.Y.Z version, or patch, minor, or major.');
  if (!latest) return '1.0.0';
  if (kind === 'patch') return nextStablePatch(latest);
  const [major, minor] = latest.split('.').map(BigInt) as [bigint, bigint];
  return kind === 'minor' ? major + '.' + (minor + 1n) + '.0' : major + 1n + '.0.0';
}

export async function draftMatchesLatestRelease(client: Client, harnessId: string) {
  const base = '/api/harnesses/' + harnessId + '/manifest?ref=';
  const [draft, release] = await Promise.all([
    client.call(base + 'draft'),
    client.call(base + 'latest'),
  ]);
  return draft.treeHash === release.treeHash;
}

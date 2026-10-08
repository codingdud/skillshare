import { describe, it, expect } from 'vitest';
import { latestVersion, bumpVersion, draftMatchesLatestRelease } from '../src/lib/release.js';
import type { Client } from '../src/lib/auth.js';

describe('latestVersion', () => {
  it('finds the highest stable version regardless of order', () => {
    expect(latestVersion([{ version: '1.9.0' }, { version: '1.10.0' }, { version: '0.2.0' }])).toBe(
      '1.10.0',
    );
  });
  it('ignores malformed entries and returns undefined when there are none', () => {
    expect(latestVersion([{ version: 'beta' }, {}, { version: 3 }])).toBeUndefined();
    expect(latestVersion([])).toBeUndefined();
  });
});

describe('bumpVersion', () => {
  it('starts at 1.0.0 and defaults to a patch bump', () => {
    expect(bumpVersion(undefined)).toBe('1.0.0');
    expect(bumpVersion(undefined, 'minor')).toBe('1.0.0');
    expect(bumpVersion('1.0.0')).toBe('1.0.1');
    expect(bumpVersion('1.0.9', 'patch')).toBe('1.0.10');
  });
  it('bumps minor and major and resets lower parts', () => {
    expect(bumpVersion('1.4.7', 'minor')).toBe('1.5.0');
    expect(bumpVersion('1.4.7', 'major')).toBe('2.0.0');
  });
  it('accepts an explicit newer version only', () => {
    expect(bumpVersion('1.0.0', '2.3.4')).toBe('2.3.4');
    expect(bumpVersion(undefined, '0.1.0')).toBe('0.1.0');
    expect(() => bumpVersion('1.0.1', '1.0.1')).toThrow(/newer than the latest release 1\.0\.1/);
    expect(() => bumpVersion('1.0.1', '1.0.0')).toThrow(/newer/);
  });
  it('rejects unknown specs', () => {
    expect(() => bumpVersion('1.0.0', 'next')).toThrow(/X\.Y\.Z version, or patch, minor, or major/);
    expect(() => bumpVersion('1.0.0', '01.0.0')).toThrow();
  });
});

describe('draftMatchesLatestRelease', () => {
  const client = (draft: string, latest: string) =>
    ({
      call: async (path: string) => ({ treeHash: path.endsWith('draft') ? draft : latest }),
    }) as unknown as Client;
  it('compares the draft and latest release tree hashes', async () => {
    expect(await draftMatchesLatestRelease(client('a', 'a'), 'id')).toBe(true);
    expect(await draftMatchesLatestRelease(client('a', 'b'), 'id')).toBe(false);
  });
});

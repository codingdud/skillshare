import { describe, expect, it } from 'vitest';
import {
  canonicalTree,
  compareStableVersions,
  harnessFilesSchema,
  harnessFileSchema,
  harnessJSONLimit,
  harnessReleaseSchema,
  compareSync,
  nextStablePatch,
} from '@skillshare/contracts';
import { treeHash } from './files.js';

describe('portable synchronization contract', () => {
  it('rejects ancestor collisions, equivalent names, and nonportable paths before writing', () => {
    for (const files of [
      [
        { path: '.claude/agents', content: '' },
        { path: '.claude/agents/a.md', content: '' },
      ],
      [
        { path: '.claude/AGENTS', content: '' },
        { path: '.claude/agents/a.md', content: '' },
      ],
      [
        { path: '.claude/é.md', content: '' },
        { path: '.claude/e\u0301.md', content: '' },
      ],
    ])
      expect(harnessFilesSchema.safeParse(files).success).toBe(false);
    for (const path of [
      '../a',
      '/a',
      'C:/a',
      '.claude/CON.md',
      '.claude/a.',
      '.claude/a:stream',
      '.claude/a\u0001',
      '.claude/a\ud800',
      '.claude/' + 'x'.repeat(256),
    ])
      expect(harnessFileSchema.safeParse({ path, content: '' }).success).toBe(false);
  });
  it('enforces UTF-8 byte limits and permits valid JSON expansion within the transport limit', () => {
    expect(harnessFileSchema.safeParse({ path: 'a.md', content: 'é'.repeat(125001) }).success).toBe(
      false,
    );
    const files = Array.from({ length: 20 }, (_, i) => ({
      path: `.claude/agents/${i}.md`,
      content: '\u0001'.repeat(250000),
    }));
    expect(harnessFilesSchema.safeParse(files).success).toBe(true);
    const bytes = Buffer.byteLength(JSON.stringify({ revision: 1, files }));
    expect(bytes).toBeGreaterThan(6 * 1024 * 1024);
    expect(bytes).toBeLessThan(harnessJSONLimit);
  });
  it('defines stable release numbering and numeric ordering without precision loss', () => {
    for (const version of ['01.2.3', '1.02.3', '1.2.03', '1.2.3-beta', '1.2'])
      expect(
        harnessReleaseSchema.safeParse({ revision: 1, version, notes: 'Release notes' }).success,
      ).toBe(false);
    expect(compareStableVersions('1.10.0', '1.9.9')).toBe(1);
    expect(nextStablePatch('1.0.9007199254740993')).toBe('1.0.9007199254740994');
  });
  it('retains canonical v1 checksums and makes CRLF equivalence opt-in', () => {
    const f = (content: string) => ({ path: 'AGENTS.md', content });
    expect(canonicalTree([f('hello\n')])).toBe('[["AGENTS.md","hello\\n",false]]');
    expect(treeHash([])).toBe('4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
    expect(treeHash([f('hello\n')])).toBe(treeHash([{ ...f('hello\n'), executable: false }]));
    expect(
      compareSync([f('a\nb\n')], [f('a\r\nb\r\n')], [f('A\nb\n')], 'pull').conflicts,
    ).toHaveLength(1);
    expect(
      compareSync([f('a\nb\n')], [f('a\r\nb\r\n')], [f('A\nb\n')], 'pull', true).conflicts,
    ).toHaveLength(0);
  });
});

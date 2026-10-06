import { describe, it, expect } from 'vitest';
import { addHarnessTemplate, harnessDiscoveryQuerySchema } from '@skillshare/contracts';
import { discoverSnapshots, type DiscoverySnapshot } from './harness.discovery.js';

const source: DiscoverySnapshot = {
  id: 'repository-id',
  name: 'Delivery Harness',
  description: 'Native configurations for delivery teams.',
  ownerName: 'Creator',
  ownerId: 'creator-id',
  visibility: 'public',
  releaseId: 'release-id',
  version: '1.2.0',
  updatedAt: '2026-10-02T10:00:00Z',
  files: addHarnessTemplate(
    [
      {
        path: '.claude/skills/criteria/SKILL.md',
        content:
          '---\nname: Acceptance Criteria\ndescription: Write Azure DevOps stories.\n---\n\nProduce Given When Then scenarios.',
      },
    ],
    'claude-code',
    'mcp',
    'delivery',
  ).files,
};
describe('Harness-native discovery', () => {
  it('groups All by repository and derives native component names', () => {
    const result = discoverSnapshots([source], harnessDiscoveryQuerySchema.parse({}));
    expect(result.total).toBe(1);
    expect(result.items[0]?.components.map((c) => c.name)).toContain('Acceptance Criteria');
    expect(result.items[0]?.releaseId).toBe('release-id');
  });
  it('finds a skill through frontmatter and links its source snapshot', () => {
    const result = discoverSnapshots(
      [source],
      harnessDiscoveryQuerySchema.parse({ type: 'skill', q: 'Azure stories' }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      name: 'Acceptance Criteria',
      harnessId: 'repository-id',
      releaseId: 'release-id',
      path: '.claude/skills/criteria/SKILL.md',
    });
  });
  it('searches native instructions without creating standalone records', () => {
    expect(
      discoverSnapshots([source], harnessDiscoveryQuerySchema.parse({ q: 'Given When Then' }))
        .total,
    ).toBe(1);
  });
  it('filters runtime and type consistently', () => {
    expect(
      discoverSnapshots(
        [source],
        harnessDiscoveryQuerySchema.parse({ type: 'mcp', runtime: 'Portable MCP' }),
      ).total,
    ).toBe(1);
    expect(
      discoverSnapshots([source], harnessDiscoveryQuerySchema.parse({ runtime: 'Gemini CLI' }))
        .total,
    ).toBe(0);
  });
  it('uses stable pagination and clamps stale page numbers', () => {
    const many = Array.from({ length: 21 }, (_, index) => ({ ...source, id: String(index) }));
    const result = discoverSnapshots(many, harnessDiscoveryQuerySchema.parse({ page: 99 }));
    expect(result.page).toBe(2);
    expect(result.total).toBe(21);
    expect(result.items).toHaveLength(1);
  });
  it('strips old stage/variant filters and validates unsupported types', () => {
    expect(
      harnessDiscoveryQuerySchema.parse({ stage: 'Requirements', grouped: 'false' }),
    ).not.toHaveProperty('stage');
    expect(harnessDiscoveryQuerySchema.safeParse({ type: 'workflow' }).success).toBe(false);
  });
});

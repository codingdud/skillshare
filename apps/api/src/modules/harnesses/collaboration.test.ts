// Authorization and persistence are exercised through HTTP in integration.test.ts.
import { describe, it, expect } from 'vitest';
import {
  harnessMemberSchema,
  harnessProposalSchema,
  deviceDecisionSchema,
} from '@skillshare/contracts';
describe('collaboration input boundaries', () => {
  it('defaults invitations to viewer and rejects global administrator as a Harness role', () => {
    expect(harnessMemberSchema.parse({ email: 'TEAM@example.com' })).toEqual({
      email: 'team@example.com',
      role: 'viewer',
    });
    expect(
      harnessMemberSchema.safeParse({ email: 'team@example.com', role: 'admin' }).success,
    ).toBe(false);
  });
  it('requires a pinned base and safe native file paths', () => {
    expect(
      harnessProposalSchema.safeParse({ title: 'Propose a change', revision: 0, files: [] })
        .success,
    ).toBe(false);
    expect(
      harnessProposalSchema.safeParse({
        title: 'Propose a change',
        revision: 1,
        files: [{ path: '../secret', content: '' }],
      }).success,
    ).toBe(false);
    expect(
      harnessProposalSchema.safeParse({
        title: 'Propose a change',
        revision: 1,
        files: [],
        source: { kind: 'git', commit: 'HEAD' },
      }).success,
    ).toBe(false);
  });
  it('rejects empty and duplicate selected device grants', () => {
    const input = { code: 'ABCD-EFGH', approve: true };
    expect(deviceDecisionSchema.safeParse({ ...input, harnessIds: [] }).success).toBe(false);
    expect(
      deviceDecisionSchema.safeParse({
        ...input,
        harnessIds: [
          'e7b66ee7-36a1-4b25-b657-80ea8f46a166',
          'e7b66ee7-36a1-4b25-b657-80ea8f46a166',
        ],
      }).success,
    ).toBe(false);
  });
});

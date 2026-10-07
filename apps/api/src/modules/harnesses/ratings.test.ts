// Persistence and authorization of ratings are exercised through HTTP and the browser (e2e/ratings.spec.ts).
import { describe, it, expect } from 'vitest';
import {
  harnessDiscoveryQuerySchema,
  harnessRatingInputSchema,
  harnessRatingQuerySchema,
} from '@skillshare/contracts';
import { discoverSnapshots, type DiscoverySnapshot } from './harness.discovery.js';

const base: DiscoverySnapshot = {
  id: 'a',
  name: 'Alpha',
  description: 'Native configurations.',
  ownerName: 'Creator',
  ownerId: 'creator-id',
  visibility: 'public',
  releaseId: 'release-a',
  version: '1.0.0',
  updatedAt: '2026-10-02T10:00:00Z',
  files: [{ path: 'CLAUDE.md', content: '# Alpha\n\nReview code.' }],
};

describe('rating input boundaries', () => {
  it('accepts whole stars from 1 to 5 and trims the comment', () => {
    expect(harnessRatingInputSchema.parse({ rating: 5, body: '  Great  ' })).toEqual({
      rating: 5,
      body: 'Great',
    });
    expect(harnessRatingInputSchema.parse({ rating: 1 }).body).toBe('');
  });
  it('rejects out-of-range, fractional, oversized and unknown fields', () => {
    for (const bad of [
      { rating: 0 },
      { rating: 6 },
      { rating: 3.5 },
      { rating: '4' },
      { rating: 4, body: 'x'.repeat(2001) },
      { rating: 4, userId: 'someone-else' },
    ])
      expect(harnessRatingInputSchema.safeParse(bad).success).toBe(false);
  });
  it('defaults and bounds the review page', () => {
    expect(harnessRatingQuerySchema.parse({}).page).toBe(1);
    expect(harnessRatingQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('rating in discovery', () => {
  it('exposes the average and count, defaulting to unrated', () => {
    const result = discoverSnapshots(
      [base, { ...base, id: 'b', ratingAverage: 4.5, ratingCount: 2 }],
      harnessDiscoveryQuerySchema.parse({}),
    );
    const byId = Object.fromEntries(result.items.map((item) => [item.harnessId, item]));
    expect(byId.a).toMatchObject({ ratingAverage: null, ratingCount: 0 });
    expect(byId.b).toMatchObject({ ratingAverage: 4.5, ratingCount: 2 });
  });
  it('sorts by highest rating, then by number of reviews, with unrated last', () => {
    const result = discoverSnapshots(
      [
        { ...base, id: 'unrated', name: 'Unrated' },
        { ...base, id: 'few', name: 'Few', ratingAverage: 5, ratingCount: 1 },
        { ...base, id: 'many', name: 'Many', ratingAverage: 5, ratingCount: 9 },
        { ...base, id: 'low', name: 'Low', ratingAverage: 3, ratingCount: 20 },
      ],
      harnessDiscoveryQuerySchema.parse({ sort: 'rating' }),
    );
    expect(result.items.map((item) => item.harnessId)).toEqual(['many', 'few', 'low', 'unrated']);
  });
});

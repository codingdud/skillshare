import { describe, expect, it } from 'vitest';
import { returnPath } from './return-path';

describe('authentication return destinations', () => {
  it('preserves authorized browser device, admin, and profile destinations', () => {
    for (const path of [
      '/device?code=ABCD-EFGH',
      '/admin',
      '/admin?view=activity',
      '/profile',
      '/profile?page=2',
      '/profile/edit',
    ])
      expect(returnPath(path)).toBe(path);
  });
  it('rejects external URLs and control characters rather than redirecting to them', () => {
    for (const path of [
      null,
      'https://example.com',
      '//example.com',
      '/admin/../external',
      '/profile/../external',
      '/profile/edit/elsewhere',
      '/profile?name=abc\u0000',
      '/admin\\example.com',
      '/admin?view=users\r\nLocation: https://example.com',
      '/device?code=abc\u0000',
    ])
      expect(returnPath(path)).toBe('/harnesses');
  });
});

import { describe, expect, it } from 'vitest';
import { isNewerVersion, readLatestRelease, RELEASES_PAGE } from '../electron/updates';

describe('update check', () => {
  it('compares versions numerically, with pre-releases below their release', () => {
    expect(isNewerVersion('2.8.0', '2.7.0')).toBe(true);
    expect(isNewerVersion('2.10.0', '2.9.3')).toBe(true);
    expect(isNewerVersion('v3.0.0', '2.99.99')).toBe(true);
    expect(isNewerVersion('2.7.0', '2.7.0')).toBe(false);
    expect(isNewerVersion('2.6.9', '2.7.0')).toBe(false);
    expect(isNewerVersion('2.8.0-beta.1', '2.8.0')).toBe(false);
    expect(isNewerVersion('2.8.0', '2.8.0-beta.1')).toBe(true);
    expect(isNewerVersion('garbage', '2.7.0')).toBe(false);
  });

  it('reads the GitHub release JSON defensively', () => {
    const r = readLatestRelease({ tag_name: 'v2.9.0', html_url: 'https://github.com/Izzo2thePoint/GUPPI/releases/tag/v2.9.0', published_at: '2026-11-01T00:00:00Z' }, '2.8.0');
    expect(r).toMatchObject({ current: '2.8.0', latest: '2.9.0', newer: true, publishedAt: '2026-11-01T00:00:00Z' });
    expect(r.url).toContain('/releases/tag/v2.9.0');
    // A link outside the project is never opened: fall back to the releases page.
    expect(readLatestRelease({ tag_name: 'v2.9.0', html_url: 'https://evil.example/x' }, '2.8.0').url).toBe(RELEASES_PAGE);
    expect(readLatestRelease({ tag_name: 'v2.8.0' }, '2.8.0').newer).toBe(false);
    expect(readLatestRelease({ message: 'rate limited' }, '2.8.0').error).toMatch(/Could not read/);
    expect(readLatestRelease(null, '2.8.0').error).toBeTruthy();
  });
});

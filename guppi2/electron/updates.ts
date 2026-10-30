/**
 * Manual update check against GitHub Releases. Pure helpers, kept apart from
 * Electron so they can be tested. Nothing here runs on its own: the main
 * process calls GitHub only when the player clicks "Check for updates".
 */
export const RELEASES_PAGE = 'https://github.com/Izzo2thePoint/GUPPI/releases/latest';
export const RELEASES_API = 'https://api.github.com/repos/Izzo2thePoint/GUPPI/releases/latest';

export type UpdateCheck = { current: string; latest?: string; url?: string; newer?: boolean; publishedAt?: string; error?: string };

/** Numeric x.y.z compare; a pre-release suffix (2.8.0-beta.1) ranks below its release. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string) => {
    const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
    return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? '' } : null;
  };
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  if (a.pre === b.pre) return false;
  if (!a.pre) return true; // release beats pre-release
  if (!b.pre) return false;
  return a.pre > b.pre;
}

/** Reads GitHub's "latest release" JSON defensively. */
export function readLatestRelease(data: unknown, current: string): UpdateCheck {
  const d = (data ?? {}) as { tag_name?: unknown; html_url?: unknown; published_at?: unknown };
  const latest = typeof d.tag_name === 'string' ? d.tag_name.trim().replace(/^v/i, '') : '';
  if (!/^\d+\.\d+\.\d+/.test(latest)) return { current, error: 'Could not read the latest release from GitHub.' };
  const url = typeof d.html_url === 'string' && d.html_url.startsWith('https://github.com/Izzo2thePoint/GUPPI/') ? d.html_url : RELEASES_PAGE;
  return {
    current,
    latest,
    url,
    newer: isNewerVersion(latest, current),
    publishedAt: typeof d.published_at === 'string' ? d.published_at : undefined,
  };
}

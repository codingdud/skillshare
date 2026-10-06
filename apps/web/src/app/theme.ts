export type Theme = 'light' | 'dark';

export const themeStorageKey = 'skillshare-theme';

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Device preference remains available when browser storage is blocked.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f8fafc');
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The toggle still works for this visit without browser storage.
  }
}

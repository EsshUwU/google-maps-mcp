const THEME_STORAGE_KEY = 'theme';

export type Theme = 'light' | 'dark' | 'system';

function applyActualTheme(actualTheme: 'light' | 'dark') {
  if (actualTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function applyStoredTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  let themeToApply: 'light' | 'dark';

  if (storedTheme && storedTheme !== 'system') {
    themeToApply = storedTheme;
  } else {
    // If 'system' or no theme is stored, use system preference
    themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyActualTheme(themeToApply);
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  let themeToApply: 'light' | 'dark';

  if (theme === 'system') {
    themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    // If they explicitly choose 'system', we reflect it immediately.
  } else {
    themeToApply = theme;
  }
  applyActualTheme(themeToApply);
}

export function toggleTheme(): Theme {
  const isCurrentlyDark = document.documentElement.classList.contains('dark');
  const newTheme: Theme = isCurrentlyDark ? 'light' : 'dark';
  setTheme(newTheme); // This will store 'light' or 'dark', not 'system'
  return newTheme;
}

// Listen for system theme changes to auto-update if 'system' or no preference is set
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  if (storedTheme === 'system' || !storedTheme) { 
    applyActualTheme(e.matches ? 'dark' : 'light');
  }
});

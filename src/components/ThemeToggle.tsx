"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "opendocs-theme";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (!persist) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

function getCurrentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return getStoredTheme() ?? (document.documentElement.dataset.theme === "dark" ? "dark" : getSystemTheme());
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    const initialTheme = storedTheme ?? getSystemTheme();
    const syncThemeFrame = window.requestAnimationFrame(() => setTheme(initialTheme));
    applyTheme(initialTheme, Boolean(storedTheme));

    if (storedTheme) {
      return () => window.cancelAnimationFrame(syncThemeFrame);
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (event: MediaQueryListEvent) => {
      const nextTheme = event.matches ? "dark" : "light";
      applyTheme(nextTheme, false);
      setTheme(nextTheme);
    };

    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => {
      window.cancelAnimationFrame(syncThemeFrame);
      mediaQuery.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      return nextTheme;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleTheme();
  }

  return (
    <button
      type="button"
      className="theme-switch"
      onClick={toggleTheme}
      onKeyDown={handleKeyDown}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <span className="theme-switch__track" aria-hidden="true">
        <span className="theme-switch__stars">
          <span />
          <span />
          <span />
        </span>
        <span className="theme-switch__cloud theme-switch__cloud--one" />
        <span className="theme-switch__cloud theme-switch__cloud--two" />
        <span className="theme-switch__thumb">
          <svg className="theme-switch__sun" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <circle cx="12" cy="12" r="4.25" />
            <path d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.54 5.46l-1.48 1.48M6.94 17.06l-1.48 1.48M18.54 18.54l-1.48-1.48M6.94 6.94 5.46 5.46" />
          </svg>
          <svg className="theme-switch__moon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M19.2 14.7A7.65 7.65 0 0 1 9.3 4.8a7.85 7.85 0 1 0 9.9 9.9Z" />
          </svg>
        </span>
      </span>
      <span className="sr-only">{theme === "dark" ? "Dark theme enabled" : "Light theme enabled"}</span>
    </button>
  );
}

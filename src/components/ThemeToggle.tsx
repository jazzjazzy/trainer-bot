import { useState } from "react";
import { getTheme, setTheme, type Theme } from "../lib/theme";

/** Small light/dark toggle button. */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

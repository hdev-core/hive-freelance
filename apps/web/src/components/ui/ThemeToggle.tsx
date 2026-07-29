import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider";
import { IconButton } from "./IconButton";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <IconButton
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </IconButton>
  );
}

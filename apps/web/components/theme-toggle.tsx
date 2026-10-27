"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cx } from "@/lib/utils";

/** 亮/暗切换：单一图标按钮，沿用页面发丝线风格。 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "切换到亮色" : "切换到暗色"}
      title={dark ? "切换到亮色" : "切换到暗色"}
      className={cx(
        "flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-3 transition-colors hover:bg-fill hover:text-ink",
        className,
      )}
    >
      {dark ? <Sun size={15} strokeWidth={1.7} /> : <Moon size={15} strokeWidth={1.7} />}
    </button>
  );
}

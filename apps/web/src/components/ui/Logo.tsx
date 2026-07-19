import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";
import { useTheme } from "../../theme/ThemeProvider";

export type LogoSize = "sm" | "md" | "lg";

const badgeSizes: Record<LogoSize, string> = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

const imageSizes: Record<LogoSize, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

const wordmarkSizes: Record<LogoSize, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

export function Logo({
  className,
  iconOnly = false,
  size = "md",
  onClick,
}: {
  className?: string;
  iconOnly?: boolean;
  size?: LogoSize;
  onClick?: () => void;
}) {
  const { theme } = useTheme();
  const src = theme === "dark" ? "/hivework-logo-dark.png" : "/hivework-logo.png";

  return (
    <Link
      to="/"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md transition-shadow duration-150 hover:shadow-elevate",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/20",
          badgeSizes[size],
        )}
      >
        <img
          src={src}
          alt="HiveWork"
          width={imageSizes[size]}
          height={imageSizes[size]}
          className="object-contain"
        />
      </span>
      {!iconOnly && (
        <span className={cn("font-bold tracking-tight text-text-primary", wordmarkSizes[size])}>
          Hive<span className="text-accent">Work</span>
        </span>
      )}
    </Link>
  );
}

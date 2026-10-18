import { cn } from "@/lib/cn";

type Tone = "green" | "amber" | "red" | "gray";

const tones: Record<Tone, string> = {
  green: "bg-soft text-primary-dark",
  amber: "bg-amber-soft text-amber",
  red: "bg-danger-soft text-danger",
  gray: "bg-line/50 text-muted",
};

/** Wayline status pill — optional pulsing dot on the left. */
export function Pill({
  tone = "green",
  dot,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />}
      {children}
    </span>
  );
}

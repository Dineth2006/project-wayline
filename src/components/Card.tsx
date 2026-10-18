import { cn } from "@/lib/cn";
import { motion } from "framer-motion";

export function Card({
  className,
  children,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-2xl border border-line bg-white shadow-card", className)}
    >
      {children}
    </motion.section>
  );
}

/** Stat card: uppercase label, big value, small sub, optional corner icon. */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "default" | "amber" | "red";
  delay?: number;
}) {
  return (
    <Card delay={delay} className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            {label}
          </p>
          <p
            className={cn(
              "mt-1.5 text-2xl font-semibold tabular-nums sm:text-[1.7rem]",
              tone === "amber" && "text-amber",
              tone === "red" && "text-danger",
            )}
          >
            {value}
          </p>
          {sub && <p className="mt-1 truncate text-xs text-muted">{sub}</p>}
        </div>
        {icon && <div className="rounded-xl bg-soft p-2 text-primary-dark">{icon}</div>}
      </div>
    </Card>
  );
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-ink sm:text-lg">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

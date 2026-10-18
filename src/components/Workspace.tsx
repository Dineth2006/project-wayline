"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Bus, LogOut, Route as RouteIcon, UserCircle } from "lucide-react";
import { useAuth, logout } from "@/context/AuthContext";
import { Pill } from "./Pill";
import { cn } from "@/lib/cn";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Authenticated app shell: top header (brand, network status, clock, avatar)
 * + left sidebar on desktop, horizontal tabs on mobile. Content is animated.
 */
export function Workspace({
  workspace,
  items,
  active,
  onNavigate,
  alertCount = 0,
  children,
}: {
  workspace: string;
  items: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  alertCount?: number;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const first = (user?.displayName ?? "there").split(" ")[0];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Brand />
          <span className="hidden text-sm font-medium text-muted sm:block">
            {workspace} workspace
          </span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Pill tone="green" dot className="hidden sm:inline-flex">
              Network live
            </Pill>
            <Clock />
            <button
              className="relative rounded-xl border border-line bg-white p-2 text-muted"
              title="Alerts"
              onClick={() => alertCount > 0 && onNavigate(items[0].id)}
            >
              <Bell className="h-4 w-4" />
              {alertCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {alertCount}
                </span>
              )}
            </button>
            <div className="hidden items-center gap-2 rounded-xl border border-line bg-white py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-soft text-primary-dark">
                <UserCircle className="h-4 w-4" />
              </span>
              <span className="max-w-32 truncate text-sm font-medium">{first}</span>
            </div>
            <button
              onClick={() => void logout()}
              className="rounded-xl border border-line bg-white p-2 text-muted hover:text-danger"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* mobile tabs */}
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1.5 lg:hidden">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onNavigate(it.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                active === it.id
                  ? "bg-soft text-primary-dark"
                  : "text-muted hover:bg-canvas",
              )}
            >
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-5 px-4 py-5 sm:px-6">
        <nav className="hidden w-52 shrink-0 flex-col gap-1 lg:flex">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
            {workspace}
          </p>
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onNavigate(it.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                active === it.id
                  ? "bg-soft text-primary-dark"
                  : "text-muted hover:bg-white hover:text-ink",
              )}
            >
              <it.icon className="h-4 w-4 shrink-0" />
              {it.label}
              {it.id === items[0].id && alertCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                  {alertCount}
                </span>
              )}
            </button>
          ))}
          <div className="mt-auto rounded-xl border border-line bg-white p-3 text-xs text-muted">
            <p className="font-medium text-ink">Signed in</p>
            <p className="mt-0.5 truncate">{user?.email}</p>
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <a href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest text-white">
        <Bus className="h-4.5 w-4.5" />
      </span>
      {!small && (
        <span className="text-[15px] font-bold tracking-tight text-ink">
          Wayline
        </span>
      )}
    </a>
  );
}

function Clock() {
  return (
    <span className="hidden rounded-xl border border-line bg-white px-2.5 py-1.5 font-mono text-xs text-muted md:block">
      <LiveClock />
    </span>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      <span className="ml-1.5 text-faint">
        {now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
      </span>
    </>
  );
}

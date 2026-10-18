"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bus, Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { login } from "@/lib/firebase";

function roleHome(role?: string) {
  if (role === "operator") return "/operator";
  if (role === "driver") return "/driver";
  return "/passenger";
}

function LoginPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(
    params.get("mode") === "signup" ? "signup" : "login",
  );
  const { role, loading } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // if already signed in, straight to the right workspace
  useEffect(() => {
    if (!loading && role) router.replace(roleHome(role));
  }, [loading, role, router]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Sign-up failed.");
        const c = await login(form.email, form.password);
        const prof = await c.user?.getIdTokenResult();
        router.replace(roleHome(prof?.claims?.role as string | undefined));
      } else {
        const c = await login(form.email, form.password);
        const prof = await c.user?.getIdTokenResult();
        router.replace(roleHome(prof?.claims?.role as string | undefined));
      }
    } catch (e) {
      setError((e as Error).message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-soft";

  return (
    <div className="flex min-h-dvh">
      {/* left brand panel */}
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-forest p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Bus className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">Wayline</span>
        </div>
        <div className="relative">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-sm text-3xl font-bold leading-tight"
          >
            Where are you headed today?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-4 max-w-sm text-sm leading-relaxed text-white/70"
          >
            Log in to follow your route, drive your bus, or watch the whole
            network — all in one calm, live picture.
          </motion.p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse-dot" />
            Fleet live — ETAs refresh every second
          </div>
        </div>
        <p className="relative text-xs text-white/50">
          © 2026 Wayline — built for a city in motion.
        </p>
      </div>

      {/* right form panel */}
      <div className="flex flex-1 items-center justify-center bg-white p-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest text-white">
              <Bus className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">Wayline</span>
          </div>

          {/* tabs */}
          <div className="mb-6 flex rounded-xl bg-canvas p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m
                    ? "bg-white text-ink shadow-card"
                    : "text-muted hover:text-ink"
                }`}
              >
                {m === "login" ? "Sign in" : "Passenger sign-up"}
              </button>
            ))}
          </div>

          <h1 className="text-xl font-bold tracking-tight">
            {mode === "login" ? "Welcome back" : "Join the network"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Log in with your Wayline account."
              : "Create a rider account in seconds."}
          </p>

          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {mode === "signup" && (
              <label className="relative block">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  className={field}
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
            )}
            <label className="relative block">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                type="email"
                required
                className={field}
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="relative block">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                type="password"
                required
                minLength={6}
                className={field}
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Log in" : "Create account"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-faint">
            Drivers and operators are provisioned by the control room — pick
            rider sign-up.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPanel />
    </Suspense>
  );
}

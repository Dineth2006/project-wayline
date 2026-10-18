"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Bus,
  CircleUserRound,
  Gauge,
  MapPin,
  Radio,
} from "lucide-react";
import { NETWORK } from "@/lib/config";
import { WaylineMap } from "@/components/WaylineMap";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const roles = [
  {
    icon: CircleUserRound,
    title: "Riders",
    body: "Pick a route, watch the bus crawl closer on the map, and get a ping the moment it reaches your stop.",
  },
  {
    icon: Bus,
    title: "Drivers",
    body: "A quiet cockpit with the next stop, live ETA and your trip report — and the on-board drive controls when you need them.",
  },
  {
    icon: Gauge,
    title: "Operators",
    body: "Every bus on one map. Crashes, off-route movement and slow GPS ping straight to the fleet dashboard.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-white">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest text-white">
              <Bus className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">Wayline</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted md:flex">
            <a href="#how" className="hover:text-ink">Live network</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#roles" className="hover:text-ink">Who it's for</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-dark"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 rounded-full bg-soft px-3.5 py-1.5 text-xs font-semibold text-primary-dark"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
            Live tracking on {NETWORK.city} — {NETWORK.buses} buses, {NETWORK.routes} route
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]"
          >
            A better way to be{" "}
            <span className="text-primary">on your way.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg"
          >
            Wayline follows every bus in real time — riders see honest ETAs and
            arrival alerts, drivers get a calm cockpit, and operators watch the
            whole fleet from one map.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/login?mode=signup"
              className="group inline-flex items-center gap-2 rounded-2xl bg-forest px-6 py-3.5 text-sm font-semibold text-white shadow-lift transition hover:bg-forest-deep"
            >
              Create your account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-6 py-3.5 text-sm font-semibold text-ink hover:border-soft-deep"
            >
              I already have one
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10 grid max-w-md grid-cols-3 gap-4"
          >
            {[
              ["Live", "Arrival updates"],
              ["One map", "Fleet overview"],
              ["Instant", "Safety alerts"],
            ].map(([big, small]) => (
              <div key={big} className="border-l-2 border-soft-deep pl-3">
                <p className="text-sm font-bold text-ink">{big}</p>
                <p className="mt-0.5 text-xs text-muted">{small}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* map preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <WaylineMap
            demo
            routes={[
              {
                id: "loop_a",
                name: NETWORK.routeName,
                tolerance: 0.25,
                closed: true,
                points: [
                  { x: 0.3, y: 0.3 },
                  { x: 1.7, y: 0.3 },
                  { x: 1.7, y: 1.7 },
                  { x: 0.3, y: 1.7 },
                ],
                stops: [
                  { name: "Depot", x: 0.3, y: 0.3 },
                  { name: "East Gate", x: 1.7, y: 0.3 },
                  { name: "Market", x: 1.7, y: 1.7 },
                  { name: "Campus", x: 0.3, y: 1.7 },
                ],
              },
            ]}
            className="aspect-square shadow-lift"
          />
          <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 shadow-card backdrop-blur">
            <Radio className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">{NETWORK.routeName}</span>
            <span className="text-xs text-muted">— live preview</span>
          </div>
        </motion.div>
      </section>

      {/* who it's for */}
      <section id="roles" className="border-t border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <motion.div {...fadeUp} className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              One network, three workspaces.
            </h2>
            <p className="mt-3 text-muted">
              Wayline gives every person on the route the same live picture —
              shaped for how they use it.
            </p>
          </motion.div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {roles.map((r, i) => (
              <motion.div
                key={r.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-line bg-white p-6 shadow-card"
              >
                <span className="inline-flex rounded-xl bg-soft p-2.5 text-primary-dark">
                  <r.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
                <Link
                  href="/login"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dark"
                >
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <motion.h2
            {...fadeUp}
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            How Wayline works
          </motion.h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: MapPin,
                n: "01",
                t: "Pick your stop",
                b: "Search a route and the bus you're taking. Wayline shows the real distance to your stop, not a guess.",
              },
              {
                icon: Bus,
                n: "02",
                t: "Watch it come",
                b: "Follow the bus on the live map with an honest minute-by-minute ETA, refreshed every second.",
              },
              {
                icon: Bell,
                n: "03",
                t: "Get there early",
                b: "Save places and get a notification the moment the bus enters the zone — stand at the curb, not the street.",
              },
            ].map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.09 }}
                className="relative rounded-2xl border border-line bg-white p-6"
              >
                <span className="absolute right-5 top-4 font-mono text-4xl font-bold text-soft-deep">
                  {s.n}
                </span>
                <s.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line bg-forest-deep">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-white/60 sm:flex-row sm:px-6">
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white">
              <Bus className="h-4 w-4" />
            </span>
            <span className="font-semibold text-white">Wayline</span>
          </span>
          <p>© 2026 Wayline — built for a city in motion.</p>
        </div>
      </footer>
    </div>
  );
}

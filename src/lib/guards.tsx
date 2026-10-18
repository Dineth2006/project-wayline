"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/components/Workspace";

/** Redirect rule for a user who landed in the wrong workspace. */
export function homeForRole(role: string | null) {
  if (role === "operator") return "/operator";
  if (role === "driver") return "/driver";
  return "/passenger";
}

export function Gate({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, role: authRole, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (authRole !== role)
      router.replace("/" + (authRole === "operator" ? "operator" : "passenger"));
  }, [loading, user, authRole, role, router]);

  if (loading || !user || authRole !== role)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          <Brand />
        </motion.div>
        <p className="text-sm text-muted">Checking your workspace…</p>
      </div>
    );

  return <>{children}</>;
}

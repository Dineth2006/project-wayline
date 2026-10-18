"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import type { Role } from "@/lib/types";

interface AuthState {
  user: User | null;
  role: Role | null;
  busId?: string;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [busId, setBusId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) {
          setRole(null);
          setBusId(undefined);
          setLoading(false);
          return;
        }
        const off = onValue(
          ref(db, `users/${u.uid}`),
          (s) => {
            const data = s.val();
            setRole(data?.role ?? null);
            setBusId(data?.busId);
            setLoading(false);
          },
          () => setLoading(false),
        );
        return off;
      }),
    [],
  );

  return (
    <AuthContext.Provider value={{ user, role, busId, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export const logout = () => signOut(auth);

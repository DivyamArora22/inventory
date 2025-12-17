"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "owner" | "staff" | "supervisor";

type RoleContextValue = {
  loading: boolean;
  role: UserRole | null;
  email: string | null;
  userId: string | null;
  refresh: () => Promise<void>;
};

const RoleContext = createContext<RoleContextValue>({
  loading: true,
  role: null,
  email: null,
  userId: null,
  refresh: async () => {},
});

function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function fetchRole(userId: string): Promise<UserRole> {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (error) {
    // If profile row doesn't exist yet (rare), default to staff.
    return "staff";
  }
  const r = (data?.role as UserRole) ?? "staff";
  return r === "owner" || r === "staff" || r === "supervisor" ? r : "staff";
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  async function refresh() {
    try {
      setLoading(true);

      // getSession() is fast and reads local storage; avoids hanging requests on tab-switch.
      const { data } = await withTimeout(supabase.auth.getSession(), 8000, "session_timeout");
      const session = data.session;

      if (!session?.user) {
        if (!mountedRef.current) return;
        setRole(null);
        setEmail(null);
        setUserId(null);
        return;
      }

      const user = session.user;
      if (!mountedRef.current) return;

      setEmail(user.email ?? null);
      setUserId(user.id);

      const r = await withTimeout(fetchRole(user.id), 8000, "role_timeout");
      if (!mountedRef.current) return;
      setRole(r);
    } catch {
      // Never get stuck on a blank "Loading…" screen.
      if (!mountedRef.current) return;
      setRole(null);
      setEmail(null);
      setUserId(null);
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    refresh();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;
      if (!session?.user) {
        setRole(null);
        setEmail(null);
        setUserId(null);
        setLoading(false);
        return;
      }
      await refresh();
    });

    const onFocus = () => {
      // When returning to the tab, refresh session+role.
      refresh();
    };
    window.addEventListener("focus", onFocus);

    const onVis = () => {
      if (!document.hidden) onFocus();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<RoleContextValue>(
    () => ({ loading, role, email, userId, refresh }),
    [loading, role, email, userId]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "owner" | "staff";

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

async function fetchRole(userId: string): Promise<UserRole> {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (error) {
    // If profile row doesn't exist yet (rare), default to staff.
    return "staff";
  }
  return (data?.role as UserRole) ?? "staff";
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  async function refresh() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      setRole(null);
      setEmail(null);
      setUserId(null);
      return;
    }
    setEmail(user.email ?? null);
    setUserId(user.id);
    const r = await fetchRole(user.id);
    setRole(r);
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setRole(null);
        setEmail(null);
        setUserId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      await refresh();
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
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

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "@/components/RoleProvider";

const ownerTabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/dispatch", label: "Dispatch" },
  { href: "/dispatch-history", label: "Dispatch History" },
  { href: "/inward", label: "Inward" },
  { href: "/inward-history", label: "Inward History" },
  { href: "/customers", label: "Customer History" },
  { href: "/masters", label: "Masters" },
  { href: "/users", label: "Users" },
];

const staffTabs = [
  { href: "/dispatch", label: "Dispatch" },
  { href: "/inward", label: "Inward" },
  { href: "/masters", label: "Masters" },
];

const supervisorTabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
];

export default function NavTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { email, role } = useRole();

  const tabs = role === "owner" ? ownerTabs : role === "supervisor" ? supervisorTabs : staffTabs;

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="sticky top-0 z-20 bg-gray-50/80 backdrop-blur border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <div className="font-semibold">Inventory System</div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {tabs.map((t) => {
              const active = pathname === t.href || (t.href !== "/dashboard" && pathname?.startsWith(t.href));
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={
                    "px-3 py-1.5 rounded-xl text-sm border transition " +
                    (active
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white border-gray-200 hover:bg-gray-50")
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {email ? <span className="text-xs text-gray-600">{email}</span> : null}
          <button onClick={signOut} className="btn text-sm">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

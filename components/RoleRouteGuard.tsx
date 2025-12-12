"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRole } from "@/components/RoleProvider";

// Staff should be able to enter Dispatch + Inward + Masters.
const STAFF_ALLOWED_PREFIXES = ["/dispatch", "/inward", "/masters"];

function isStaffAllowedPath(pathname: string) {
  return STAFF_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function RoleRouteGuard({ children }: { children: React.ReactNode }) {
  const { loading, role } = useRole();
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (role === "staff" && !isStaffAllowedPath(pathname)) {
      router.replace("/dispatch");
    }
  }, [loading, role, pathname, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="card p-6">
          <div className="text-sm text-gray-600">Loading…</div>
        </div>
      </div>
    );
  }

  // If staff navigates to a blocked route, the effect will redirect.
  return <>{children}</>;
}

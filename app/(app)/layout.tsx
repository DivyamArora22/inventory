import NavTabs from "@/components/NavTabs";
import AuthGuard from "@/components/AuthGuard";
import { RoleProvider } from "@/components/RoleProvider";
import RoleRouteGuard from "@/components/RoleRouteGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoleProvider>
        <NavTabs />
        <RoleRouteGuard>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </RoleRouteGuard>
      </RoleProvider>
    </AuthGuard>
  );
}

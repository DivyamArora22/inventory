"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { supabase } from "@/lib/supabaseClient";
import { useRole, UserRole } from "@/components/RoleProvider";

type ProfileRow = {
  id: string;
  email: string | null;
  role: UserRole;
  created_at: string;
};

export default function UsersPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setMsg(null);
    const res = await supabase.from("profiles").select("id,email,role,created_at").order("created_at", { ascending: false });
    if (res.error) setMsg(res.error.message);
    setRows((res.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.email ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  async function setUserRole(userId: string, newRole: UserRole) {
    setMsg(null);
    const res = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    if (res.error) return setMsg(res.error.message);
    await load();
  }

  if (role !== "owner") {
    return (
      <div className="space-y-4">
        <SectionHeader title="Users" subtitle="Only the owner can manage roles." />
        <div className="card p-5 text-sm text-gray-700">
          You do not have permission to view this page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Users"
        subtitle="Set roles: owner can access everything; staff can only enter Dispatch + Inward. Staff accounts can sign up from the Login page, then you promote them here."
        right={
          <button className="btn" type="button" onClick={load}>
            Refresh
          </button>
        }
      />

      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Search by email</label>
            <input className="input mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name@company.com" />
          </div>
        </div>

        {msg ? <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{msg}</div> : null}

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-6 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-gray-500">
                    No users.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.email ?? "-"}</td>
                    <td>
                      <select
                        className="select"
                        value={r.role}
                        onChange={(e) => setUserRole(r.id, e.target.value as UserRole)}
                      >
                        <option value="staff">Staff</option>
                        <option value="owner">Owner</option>
                      </select>
                    </td>
                    <td className="text-xs text-gray-600">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

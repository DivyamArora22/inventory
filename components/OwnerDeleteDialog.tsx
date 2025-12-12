"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "@/components/RoleProvider";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  /**
   * If true, only an owner can confirm the delete. If false, any logged-in user
   * can confirm (still requires re-auth with their own email + password).
   */
  requireOwner?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

export default function OwnerDeleteDialog({
  open,
  title = "Confirm delete",
  description = "For safety, enter your username (email) and password to delete.",
  confirmText = "Delete",
  requireOwner = true,
  onCancel,
  onConfirm,
}: Props) {
  const { email, role, refresh } = useRole();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(email ?? "");
    setPassword("");
    setMsg(null);
  }, [open, email]);

  const canAttempt = useMemo(() => {
    return !!username.trim() && !!password;
  }, [username, password]);

  async function handleConfirm() {
    setMsg(null);
    if (!email) return setMsg("No active session.");
    if (requireOwner && role !== "owner") return setMsg("Only an owner can delete.");
    if (username.trim().toLowerCase() !== email.toLowerCase()) {
      return setMsg("Username must match your logged-in email.");
    }

    setBusy(true);
    try {
      // Re-authenticate by signing in again with the same account.
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("Login failed.");

      // Refresh role from DB (extra safety)
      await refresh();
      await onConfirm();
      onCancel();
    } catch (err: any) {
      setMsg(err?.message ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-md card p-6">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-gray-600 mt-1">{description}</div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Username (email)</label>
            <input
              className="input mt-1"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="name@company.com"
              disabled={busy}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              className="input mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {msg ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{msg}</div> : null}

        <div className="mt-4 flex gap-2 justify-end">
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-danger" type="button" onClick={handleConfirm} disabled={busy || !canAttempt}>
            {busy ? "Verifying…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

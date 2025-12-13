"use client";

import { useEffect, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import OwnerDeleteDialog from "@/components/OwnerDeleteDialog";
import { supabase } from "@/lib/supabaseClient";

type MasterRow = { id: string; name: string };

function MasterBox({ table, title, subtitle }: { table: "categories" | "components" | "colors" | "customers"; title: string; subtitle: string }) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await supabase.from(table).select("id,name").order("name");
    setRows((res.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    setMsg(null);
    const n = name.trim();
    if (!n) return setMsg("Name required.");
    const res = await supabase.from(table).insert({ name: n });
    if (res.error) return setMsg(res.error.message);
    setName("");
    await load();
  }

  async function del(id: string) {
    setDeleteId(id);
  }

  function startEdit(r: MasterRow) {
    setEditingId(r.id);
    setEditingName(r.name);
  }

  async function saveEdit() {
    setMsg(null);
    if (!editingId) return;
    const n = editingName.trim();
    if (!n) return setMsg("Name required.");
    const res = await supabase.from(table).update({ name: n }).eq("id", editingId);
    if (res.error) return setMsg(res.error.message);
    setEditingId(null);
    setEditingName("");
    await load();
  }

  return (
    <div className="card p-5 space-y-3">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-gray-600 mt-1">{subtitle}</div>
      </div>

      <div className="flex gap-2">
        <input className="input" placeholder={`Add new ${title.toLowerCase()}…`} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="button" onClick={add}>
          Add
        </button>
      </div>

      {msg ? <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{msg}</div> : null}

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2} className="py-6 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-gray-500">
                  No entries.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {editingId === r.id ? (
                      <input className="input" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                    ) : (
                      <span className="font-medium">{r.name}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {editingId === r.id ? (
                      <>
                        <button className="btn btn-primary text-sm mr-2" type="button" onClick={saveEdit}>
                          Save
                        </button>
                        <button className="btn text-sm" type="button" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn text-sm mr-2" type="button" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button className="btn btn-danger text-sm" type="button" onClick={() => del(r.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <OwnerDeleteDialog
        open={!!deleteId}
        title={`Delete ${title}`}
        description="For safety, enter username and password to delete. If this value is referenced by items/history, deletion may fail (by design)."
        confirmText="Delete"
        requireOwner={false}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          const res = await supabase.from(table).delete().eq("id", deleteId);
          if (res.error) throw res.error;
          await load();
        }}
      />
    </div>
  );
}

export default function MastersPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Masters"
        subtitle="Maintain dropdown values anytime. These power the SKU generator and dispatch customer list."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MasterBox table="categories" title="Categories" subtitle="Example: Lipstick, Vaseline, Lipbalm, Talcum" />
        <MasterBox table="components" title="Components" subtitle="Example: Body, Cap, Seal, etc." />
        <MasterBox table="colors" title="Colors" subtitle="Example: Clear, White, Black, Rose Gold, etc." />
        <MasterBox table="customers" title="Customers" subtitle="Company/customer names for Dispatch and Customer History." />
      </div>
    </div>
  );
}

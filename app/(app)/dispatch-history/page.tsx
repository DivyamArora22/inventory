"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { supabase } from "@/lib/supabaseClient";
import OwnerDeleteDialog from "@/components/OwnerDeleteDialog";
import { useRole } from "@/components/RoleProvider";

type Row = {
  id: string;
  date: string;
  challan_no: string | null;
  qty_pieces: number;
  qty_bags: number | null;
  entered_qty_type: string | null;
  customer: { id?: string; name: string } | null;
  item: { id?: string; item_number: number; name: string; sku: string; pieces_per_bag: number } | null;
  created_at: string;
};

type ItemOption = { id: string; item_number: number; name: string; sku: string; pieces_per_bag: number };
type CustomerOption = { id: string; name: string };

export default function DispatchHistoryPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<ItemOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const [edit, setEdit] = useState<Row | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const [fCustomerId, setFCustomerId] = useState<string>("");
  const [fItemId, setFItemId] = useState<string>("");
  const [fChallan, setFChallan] = useState<string>("");
  const [fQtyType, setFQtyType] = useState<"pieces" | "bags">("pieces");
  const [fQty, setFQty] = useState<number>(1);
  const [fDate, setFDate] = useState<string>("");

  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError(null);

    let q = supabase
      .from("dispatches")
      .select(
        "id,date,challan_no,qty_pieces,qty_bags,entered_qty_type,created_at,customer:customers(id,name),item:items(id,item_number,name,sku,pieces_per_bag)"
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (start) q = q.gte("date", start);
    if (end) q = q.lte("date", end);

    const res = await q;
    if (res.error) setError(res.error.message);
    setRows((res.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Options for edit modal
    supabase
      .from("items")
      .select("id,item_number,name,sku,pieces_per_bag")
      .order("item_number", { ascending: true })
      .then((r) => setItems((r.data ?? []) as any));
    supabase
      .from("customers")
      .select("id,name")
      .order("name", { ascending: true })
      .then((r) => setCustomers((r.data ?? []) as any));
  }, []);

  useEffect(() => {
    if (!edit) return;
    setEditMsg(null);

    const itemId = (edit.item as any)?.id ?? "";
    const customerId = (edit.customer as any)?.id ?? "";
    const qtyType = (edit.entered_qty_type === "bags" ? "bags" : "pieces") as "bags" | "pieces";
    const ppb = edit.item?.pieces_per_bag ?? 1;
    const qty = qtyType === "bags" ? edit.qty_bags ?? Math.max(1, Math.round(edit.qty_pieces / Math.max(1, ppb))) : edit.qty_pieces;

    setFItemId(itemId);
    setFCustomerId(customerId);
    setFChallan(edit.challan_no ?? "");
    setFQtyType(qtyType);
    setFQty(qty);
    setFDate(edit.date);
  }, [edit]);

  async function saveEdit() {
    if (!edit) return;
    setEditMsg(null);
    setEditBusy(true);
    try {
      const { error } = await supabase.rpc("update_dispatch", {
        p_dispatch_id: edit.id,
        p_customer_id: fCustomerId || null,
        p_item_id: fItemId,
        p_challan_no: fChallan || null,
        p_entered_qty_type: fQtyType,
        p_qty: Number(fQty),
        p_date: fDate,
      });
      if (error) throw error;
      setEdit(null);
      await load();
    } catch (e: any) {
      setEditMsg(e?.message ?? "Failed to update.");
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    const { error } = await supabase.rpc("delete_dispatch", { p_dispatch_id: id });
    if (error) throw error;
    await load();
  }

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const cust = r.customer?.name?.toLowerCase() ?? "";
      const itemName = r.item?.name?.toLowerCase() ?? "";
      const sku = r.item?.sku?.toLowerCase() ?? "";
      const challan = (r.challan_no ?? "").toLowerCase();
      return cust.includes(t) || itemName.includes(t) || sku.includes(t) || challan.includes(t) || String(r.qty_pieces).includes(t);
    });
  }, [rows, query]);

  const totals = useMemo(() => {
    const pcs = filtered.reduce((s, r) => s + (r.qty_pieces ?? 0), 0);
    return { pcs };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Dispatch History"
        subtitle="Full outgoing entries. Filter by date range or search by customer/item/SKU/challan. Owner can edit/delete entries and stock updates automatically."
        right={
          <button className="btn" onClick={load} type="button">
            Refresh
          </button>
        }
      />

      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-medium">Start date</label>
            <input className="input mt-1" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">End date</label>
            <input className="input mt-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Search</label>
            <input className="input mt-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Customer / item / SKU / challan…" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
          <span className="badge border-gray-200 bg-gray-50">Rows: {filtered.length}</span>
          <span className="badge border-gray-200 bg-gray-50">Total pcs: {totals.pcs}</span>
          <button
            className="btn text-sm"
            type="button"
            onClick={() => {
              setStart("");
              setEnd("");
              setQuery("");
            }}
          >
            Clear filters
          </button>
          <button className="btn btn-primary text-sm" type="button" onClick={load}>
            Apply date filter
          </button>
        </div>

        {error ? <div className="text-sm text-red-700">{error}</div> : null}

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Challan</th>
                <th>Item</th>
                <th>Qty</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-gray-500">
                    No entries.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.date}</td>
                    <td>{r.customer?.name ?? "-"}</td>
                    <td className="font-mono text-xs">{r.challan_no ?? "-"}</td>
                    <td>
                      <div className="font-medium">{r.item?.name ?? "-"}</div>
                      <div className="text-xs text-gray-500">
                        #{r.item?.item_number ?? "-"} • {r.item?.sku ?? "-"}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium">{r.qty_pieces} pcs</div>
                      {r.qty_bags ? <div className="text-xs text-gray-600">{r.qty_bags} bags</div> : null}
                    </td>
                    <td className="text-right">
                      {role === "owner" ? (
                        <div className="flex justify-end gap-2">
                          <button className="btn text-sm" type="button" onClick={() => setEdit(r)}>
                            Edit
                          </button>
                          <button className="btn btn-danger text-sm" type="button" onClick={() => setDelId(r.id)}>
                            Delete
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {edit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30" onClick={editBusy ? undefined : () => setEdit(null)} />
          <div className="relative w-full max-w-2xl card p-6">
            <div className="text-lg font-semibold">Edit Dispatch</div>
            <div className="text-sm text-gray-600 mt-1">Stock will be adjusted automatically based on your changes.</div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Customer</label>
                <select className="input mt-1" value={fCustomerId} onChange={(e) => setFCustomerId(e.target.value)} disabled={editBusy}>
                  <option value="">(No customer)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Challan No</label>
                <input className="input mt-1" value={fChallan} onChange={(e) => setFChallan(e.target.value)} disabled={editBusy} />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Item</label>
                <select className="input mt-1" value={fItemId} onChange={(e) => setFItemId(e.target.value)} disabled={editBusy}>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      #{it.item_number} • {it.name} • {it.sku}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Quantity type</label>
                <select className="input mt-1" value={fQtyType} onChange={(e) => setFQtyType(e.target.value as any)} disabled={editBusy}>
                  <option value="pieces">Pieces</option>
                  <option value="bags">Bags</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Quantity</label>
                <input
                  className="input mt-1"
                  type="number"
                  min={1}
                  value={fQty}
                  onChange={(e) => setFQty(Math.max(1, Number(e.target.value)))}
                  disabled={editBusy}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Date</label>
                <input className="input mt-1" type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} disabled={editBusy} />
              </div>
            </div>

            {editMsg ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{editMsg}</div> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" type="button" onClick={() => setEdit(null)} disabled={editBusy}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={saveEdit} disabled={editBusy || !fItemId || !fDate}>
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OwnerDeleteDialog
        open={!!delId}
        title="Delete dispatch entry?"
        description="This will delete the dispatch entry AND add the quantity back into stock. For safety, enter your email + password."
        confirmText="Delete entry"
        requireOwner
        onCancel={() => setDelId(null)}
        onConfirm={async () => {
          if (!delId) return;
          await confirmDelete(delId);
          setDelId(null);
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  date: string;
  type: string;
  qty_pieces: number;
  qty_bags: number | null;
  entered_qty_type: string | null;
  item: { item_number: number; name: string; sku: string } | null;
  created_at: string;
};

export default function InwardHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError(null);

    let q = supabase
      .from("inwards")
      .select("id,date,type,qty_pieces,qty_bags,entered_qty_type,created_at,item:items(item_number,name,sku)")
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
  }, []);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const itemName = r.item?.name?.toLowerCase() ?? "";
      const sku = r.item?.sku?.toLowerCase() ?? "";
      const type = (r.type ?? "").toLowerCase();
      return itemName.includes(t) || sku.includes(t) || type.includes(t) || String(r.qty_pieces).includes(t);
    });
  }, [rows, query]);

  const totals = useMemo(() => {
    const pcs = filtered.reduce((s, r) => s + (r.qty_pieces ?? 0), 0);
    return { pcs };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Inward History"
        subtitle="Full manufacturing inward entries. Filter by date range or search by item/SKU/type."
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
            <input className="input mt-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Item / SKU / Type…" />
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
                <th>Type</th>
                <th>Item</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-gray-500">
                    No entries.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.date}</td>
                    <td>{r.type}</td>
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

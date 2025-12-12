"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { supabase } from "@/lib/supabaseClient";

type Customer = { id: string; name: string };

type Row = {
  id: string;
  date: string;
  challan_no: string | null;
  qty_pieces: number;
  qty_bags: number | null;
  item: { item_number: number; name: string; sku: string } | null;
};

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CustomerHistoryPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("customers").select("id,name").order("name").then((res) => setCustomers((res.data ?? []) as any));
  }, []);

  async function load() {
    setError(null);
    setRows([]);
    if (!customerId) return;

    setLoading(true);
    let q = supabase
      .from("dispatches")
      .select("id,date,challan_no,qty_pieces,qty_bags,item:items(item_number,name,sku)")
      .eq("customer_id", customerId)
      .order("date", { ascending: false });

    if (start) q = q.gte("date", start);
    if (end) q = q.lte("date", end);

    const res = await q;
    if (res.error) setError(res.error.message);
    setRows((res.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    // Auto-load when customer changes (all-time by default)
    if (customerId) load();
  }, [customerId]);

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId)?.name ?? "", [customers, customerId]);

  const totals = useMemo(() => {
    const pcs = rows.reduce((s, r) => s + (r.qty_pieces ?? 0), 0);
    return { pcs };
  }, [rows]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Customer History"
        subtitle="Select a customer/company to see everything dispatched to them. Use date range or all-time."
      />

      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Customer</label>
            <select className="select mt-1" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Start date</label>
            <input className="input mt-1" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">End date</label>
            <input className="input mt-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary text-sm" type="button" onClick={load} disabled={!customerId || loading}>
            {loading ? "Loading…" : "Apply date filter"}
          </button>
          <button
            className="btn text-sm"
            type="button"
            onClick={() => {
              setStart("");
              setEnd("");
            }}
          >
            All time
          </button>
          <span className="badge border-gray-200 bg-gray-50">Rows: {rows.length}</span>
          <span className="badge border-gray-200 bg-gray-50">Total pcs: {totals.pcs}</span>
          <button
            className="btn text-sm"
            type="button"
            disabled={rows.length === 0}
            onClick={() => {
              downloadCSV(
                `dispatch_${selectedCustomer || "customer"}_${start || "all"}_${end || "all"}.csv`,
                [
                  ["Date", "Customer", "Challan", "Item #", "SKU", "Item Name", "Qty Pieces", "Qty Bags"],
                  ...rows.map((r) => [
                    r.date,
                    selectedCustomer,
                    r.challan_no ?? "",
                    String(r.item?.item_number ?? ""),
                    r.item?.sku ?? "",
                    r.item?.name ?? "",
                    String(r.qty_pieces ?? 0),
                    String(r.qty_bags ?? ""),
                  ]),
                ]
              );
            }}
          >
            Export CSV
          </button>
        </div>

        {error ? <div className="text-sm text-red-700">{error}</div> : null}

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Challan</th>
                <th>Item</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {!customerId ? (
                <tr>
                  <td colSpan={4} className="py-6 text-gray-500">
                    Select a customer to view entries.
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-gray-500">
                    No dispatch entries for this customer in the selected range.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.date}</td>
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

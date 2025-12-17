"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { supabase } from "@/lib/supabaseClient";

type Item = {
  id: string;
  item_number: number;
  name: string;
  sku: string;
  stock_pieces: number;
  low_stock_threshold_pieces: number | null;
};

export default function DashboardPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("items")
        .select("id,item_number,name,sku,stock_pieces,low_stock_threshold_pieces")
        .order("item_number", { ascending: true });

      if (!mounted) return;
      if (error) setError(error.message);
      setItems((data ?? []) as any);
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalItems = items.length;
    const outOfStock = items.filter((i) => (i.stock_pieces ?? 0) <= 0).length;
    const low = items.filter((i) => {
      const th = i.low_stock_threshold_pieces ?? 0;
      return th > 0 && (i.stock_pieces ?? 0) > 0 && (i.stock_pieces ?? 0) <= th;
    }).length;
    return { totalItems, outOfStock, low };
  }, [items]);

  const sorted = useMemo(() => {
    // Show urgent items on top but still show ALL stock.
    return items.slice().sort((a, b) => {
      const aOut = (a.stock_pieces ?? 0) <= 0 ? 1 : 0;
      const bOut = (b.stock_pieces ?? 0) <= 0 ? 1 : 0;
      if (aOut !== bOut) return bOut - aOut;

      const aTh = a.low_stock_threshold_pieces ?? 0;
      const bTh = b.low_stock_threshold_pieces ?? 0;
      const aLow = aTh > 0 && (a.stock_pieces ?? 0) > 0 && (a.stock_pieces ?? 0) <= aTh ? 1 : 0;
      const bLow = bTh > 0 && (b.stock_pieces ?? 0) > 0 && (b.stock_pieces ?? 0) <= bTh ? 1 : 0;
      if (aLow !== bLow) return bLow - aLow;

      return (a.item_number ?? 0) - (b.item_number ?? 0);
    });
  }, [items]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Dashboard"
        subtitle="All inventory stock with highlights. Red = 0 stock, Amber = low stock threshold reached."
      />

      {error ? <div className="card p-4 border-red-200 bg-red-50 text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-sm text-gray-600">Total items</div>
          <div className="text-2xl font-semibold mt-1">{stats.totalItems}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-600">Out of stock</div>
          <div className="text-2xl font-semibold mt-1">{stats.outOfStock}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-600">Low stock</div>
          <div className="text-2xl font-semibold mt-1">{stats.low}</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="font-semibold">All stock</div>
        <div className="text-sm text-gray-600 mt-1">Red = out of stock, Amber = low stock threshold reached.</div>

        <div className="mt-3 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Item #</th>
                <th>SKU</th>
                <th>Name</th>
                <th>Stock (pieces)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-gray-500">
                    No items yet.
                  </td>
                </tr>
              ) : (
                sorted.map((i) => {
                  const out = (i.stock_pieces ?? 0) <= 0;
                  const low = !out && (i.low_stock_threshold_pieces ?? 0) > 0 && (i.stock_pieces ?? 0) <= (i.low_stock_threshold_pieces ?? 0);
                  return (
                    <tr key={i.id} className={out ? "bg-red-50" : low ? "bg-amber-50" : ""}>
                      <td className="font-medium">{i.item_number}</td>
                      <td className="font-mono text-xs">{i.sku}</td>
                      <td>{i.name}</td>
                      <td>{i.stock_pieces}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

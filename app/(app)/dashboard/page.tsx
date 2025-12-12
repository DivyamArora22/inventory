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

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Dashboard"
        subtitle="Quick view of your inventory health. Use the tabs above to manage items, dispatches, and inwards."
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
        <div className="font-semibold">Items needing attention</div>
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
              ) : (
                items
                  .filter((i) => (i.stock_pieces ?? 0) <= 0 || ((i.low_stock_threshold_pieces ?? 0) > 0 && (i.stock_pieces ?? 0) <= (i.low_stock_threshold_pieces ?? 0)))
                  .slice(0, 20)
                  .map((i) => {
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

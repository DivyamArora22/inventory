"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { supabase } from "@/lib/supabaseClient";
import { toIntOrZero } from "@/lib/utils";

type Item = { id: string; item_number: number; name: string; sku: string; pieces_per_bag: number; stock_pieces: number };

const inwardTypes = ["Manufacturing", "Purchase", "Adjustment"] as const;

export default function InwardPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<(typeof inwardTypes)[number]>("Manufacturing");
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [qtyType, setQtyType] = useState<"pieces" | "bags">("bags");
  const [qty, setQty] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadItems() {
    setLoading(true);
    const res = await supabase.from("items").select("id,item_number,name,sku,pieces_per_bag,stock_pieces").order("item_number", { ascending: true });
    setItems((res.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || String(i.item_number).includes(q));
  }, [items, itemSearch]);

  const selectedItem = useMemo(() => items.find((i) => i.id === itemId) ?? null, [items, itemId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const q = toIntOrZero(qty);
    if (!itemId) return setMsg("Select item.");
    if (q <= 0) return setMsg("Quantity must be > 0.");
    if (!date) return setMsg("Select date.");

    const item = items.find((x) => x.id === itemId);
    if (!item) return setMsg("Invalid item.");

    const qtyPieces = qtyType === "bags" ? q * (item.pieces_per_bag ?? 0) : q;
    if (qtyPieces <= 0) return setMsg("This item has invalid pieces-per-bag. Fix it in Inventory.");

    setSaving(true);
    try {
      const rpcRes = await supabase.rpc("create_inward", {
        p_item_id: itemId,
        p_type: type,
        p_entered_qty_type: qtyType,
        p_qty: q,
        p_date: date,
      });
      if (rpcRes.error) throw rpcRes.error;

      setMsg("Inward saved. Stock updated automatically.");
      setQty("");
      setItemSearch("");
      setItemId("");
      await loadItems();
    } catch (err: any) {
      setMsg(err?.message ?? "Failed to add inward.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Inward" subtitle="Manufacturing inward / stock IN. Stock will increase automatically." />

      <div className="card p-5">
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Date</label>
              <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <select className="select mt-1" value={type} onChange={(e) => setType(e.target.value as any)}>
                {inwardTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Quantity</label>
              <div className="mt-1 flex gap-2">
                <select className="select" value={qtyType} onChange={(e) => setQtyType(e.target.value as any)}>
                  <option value="bags">Bags</option>
                  <option value="pieces">Pieces</option>
                </select>
                <input className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
              </div>
              {selectedItem ? (
                <div className="text-xs text-gray-600 mt-2">
                  Standard packing: <span className="font-medium">{selectedItem.pieces_per_bag}</span> pcs/bag • Current stock:{" "}
                  <span className="font-medium">{selectedItem.stock_pieces}</span> pcs
                </div>
              ) : (
                <div className="text-xs text-gray-500 mt-2">Select an item to see packing/stock.</div>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Item (search)</label>
            <input className="input mt-1" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Type item name / SKU / item number…" />
            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-gray-200 bg-white">
              {loading ? (
                <div className="p-3 text-sm text-gray-500">Loading…</div>
              ) : filteredItems.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No matches.</div>
              ) : (
                filteredItems.slice(0, 50).map((i) => {
                  const active = i.id === itemId;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setItemId(i.id)}
                      className={"w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 " + (active ? "bg-gray-900 text-white hover:bg-gray-900" : "")}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{i.name}</div>
                          <div className={"text-xs " + (active ? "text-gray-200" : "text-gray-500")}>
                            #{i.item_number} • {i.sku}
                          </div>
                        </div>
                        <div className={"text-sm font-medium " + (active ? "text-white" : "text-gray-800")}>{i.stock_pieces} pcs</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {msg ? <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{msg}</div> : null}

          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save inward (stock IN)"}
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { supabase } from "@/lib/supabaseClient";
import { toIntOrZero, piecesToBags } from "@/lib/utils";

type Master = { id: string; name: string };
type Item = { id: string; item_number: number; name: string; sku: string; pieces_per_bag: number; stock_pieces: number };

export default function DispatchPage() {
  const [customers, setCustomers] = useState<Master[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [customerId, setCustomerId] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");

  const [qtyType, setQtyType] = useState<"pieces" | "bags">("bags");
  const [qty, setQty] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [custRes, itemsRes] = await Promise.all([
      supabase.from("customers").select("id,name").order("name"),
      supabase.from("items").select("id,item_number,name,sku,pieces_per_bag,stock_pieces").order("item_number", { ascending: true }),
    ]);
    setCustomers((custRes.data ?? []) as any);
    setItems((itemsRes.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || String(i.item_number).includes(q));
  }, [items, itemSearch]);

  const selectedItem = useMemo(() => items.find((i) => i.id === itemId) ?? null, [items, itemId]);

  const preview = useMemo(() => {
    if (!selectedItem) return null;
    const q = toIntOrZero(qty);
    if (q <= 0) return null;
    const pcs = qtyType === "bags" ? q * (selectedItem.pieces_per_bag ?? 0) : q;
    const bags = piecesToBags(pcs, selectedItem.pieces_per_bag ?? 0);
    return { pcs, bags };
  }, [qty, qtyType, selectedItem]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const q = toIntOrZero(qty);
    if (!customerId) return setMsg("Select customer.");
    if (!itemId) return setMsg("Select item.");
    if (q <= 0) return setMsg("Quantity must be > 0.");
    if (!date) return setMsg("Select date.");

    const item = items.find((x) => x.id === itemId);
    if (!item) return setMsg("Invalid item.");

    const qtyPieces = qtyType === "bags" ? q * (item.pieces_per_bag ?? 0) : q;
    if (qtyPieces <= 0) return setMsg("This item has invalid pieces-per-bag. Fix it in Inventory.");

    if ((item.stock_pieces ?? 0) < qtyPieces) {
      return setMsg(`Not enough stock. Available: ${item.stock_pieces} pcs.`);
    }

    setSaving(true);
    try {
      // Use server-side RPC so staff can dispatch without having direct stock update permission.
      const rpcRes = await supabase.rpc("create_dispatch", {
        p_customer_id: customerId,
        p_item_id: itemId,
        p_challan_no: challanNo.trim() || null,
        p_entered_qty_type: qtyType,
        p_qty: q,
        p_date: date,
      });
      if (rpcRes.error) throw rpcRes.error;

      setMsg("Dispatch saved. Stock updated automatically.");
      setChallanNo("");
      setQty("");
      setItemSearch("");
      setItemId("");
      await loadAll();
    } catch (err: any) {
      setMsg(err?.message ?? "Failed to dispatch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Dispatch"
        subtitle="Enter customer, challan number, quantity, date. Stock will reduce automatically."
      />

      <div className="card p-5">
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
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
              <label className="text-sm font-medium">Challan No</label>
              <input className="input mt-1" value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="You enter this manually" />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Item (search)</label>
              <input
                className="input mt-1"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Type item name / SKU / item number…"
              />
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
                        className={
                          "w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 " +
                          (active ? "bg-gray-900 text-white hover:bg-gray-900" : "")
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{i.name}</div>
                            <div className={"text-xs " + (active ? "text-gray-200" : "text-gray-500")}>
                              #{i.item_number} • {i.sku}
                            </div>
                          </div>
                          <div className={"text-sm font-medium " + (i.stock_pieces <= 0 ? "text-red-600" : active ? "text-white" : "text-gray-800")}>
                            {i.stock_pieces} pcs
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
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
                <div className="mt-3 text-xs text-gray-600">
                  <div>
                    Standard packing: <span className="font-medium">{selectedItem.pieces_per_bag}</span> pcs/bag
                  </div>
                  <div>
                    Current stock: <span className="font-medium">{selectedItem.stock_pieces}</span> pcs
                  </div>
                  {preview ? (
                    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                      Will dispatch <span className="font-semibold">{preview.pcs}</span> pcs{" "}
                      <span className="text-gray-500">
                        ({preview.bags.bags} bags{preview.bags.leftoverPieces ? ` + ${preview.bags.leftoverPieces} pcs` : ""})
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-xs text-gray-500">Select an item to see stock preview.</div>
              )}
            </div>
          </div>

          {msg ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{msg}</div>
          ) : null}

          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save dispatch (stock OUT)"}
          </button>
        </form>
      </div>
    </div>
  );
}

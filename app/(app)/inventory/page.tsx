"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import OwnerDeleteDialog from "@/components/OwnerDeleteDialog";
import { useRole } from "@/components/RoleProvider";
import { supabase } from "@/lib/supabaseClient";
import { piecesToBags, toFloatOrZero, toIntOrZero } from "@/lib/utils";

type Master = { id: string; name: string };
type Item = {
  id: string;
  item_number: number;
  name: string;
  sku: string;
  size_num: number;
  weight_g: number;
  pieces_per_bag: number;
  low_stock_threshold_pieces: number | null;
  stock_pieces: number;
  category_id: string | null;
  component_id: string | null;
  color_id: string | null;
  category?: Master | null;
  component?: Master | null;
  color?: Master | null;
};

function codeFromName(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.slice(0, 4).toUpperCase() || "X";
}

export default function InventoryPage() {
  const { role } = useRole();
  const isOwner = role === "owner";
  const isSupervisor = role === "supervisor";
  const canInsert = isOwner || isSupervisor;

  const [activeTab, setActiveTab] = useState<"add" | "view">("view");

  const [categories, setCategories] = useState<Master[]>([]);
  const [components, setComponents] = useState<Master[]>([]);
  const [colors, setColors] = useState<Master[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  // Add / Edit form fields (owner only)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemNumber, setItemNumber] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [componentId, setComponentId] = useState<string>("");
  const [colorId, setColorId] = useState<string>("");
  const [sizeNum, setSizeNum] = useState("");
  const [weightG, setWeightG] = useState("");
  const [piecesPerBag, setPiecesPerBag] = useState("");
  const [lowStockTh, setLowStockTh] = useState("");
  const [initialQtyType, setInitialQtyType] = useState<"pieces" | "bags">("pieces");
  const [initialQty, setInitialQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form permissions
  const formDisabled = editingId ? !isOwner : !canInsert;
  const canSubmit = editingId ? isOwner : canInsert;

  const nextItemNumber = useMemo(() => {
    const max = items.reduce((m, i) => Math.max(m, Number(i.item_number || 0)), 0);
    return max + 1;
  }, [items]);

  const generatedSku = useMemo(() => {
    const cat = categories.find((x) => x.id === categoryId)?.name ?? "";
    const comp = components.find((x) => x.id === componentId)?.name ?? "";
    const col = colors.find((x) => x.id === colorId)?.name ?? "";
    const size = toIntOrZero(sizeNum);
    if (!cat || !comp || !col || !size) return "";
    return `${codeFromName(cat)}-${codeFromName(comp)}-${codeFromName(col)}-${size}`;
  }, [categoryId, componentId, colorId, sizeNum, categories, components, colors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      return String(i.item_number).includes(q) || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q);
    });
  }, [items, search]);

  function resetForm() {
    setEditingId(null);
    setItemNumber("");
    setName("");
    setCategoryId("");
    setComponentId("");
    setColorId("");
    setSizeNum("");
    setWeightG("");
    setPiecesPerBag("");
    setLowStockTh("");
    setInitialQtyType("pieces");
    setInitialQty("");
    setFormMsg(null);
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    const [catRes, compRes, colRes, itemsRes] = await Promise.all([
      supabase.from("categories").select("id,name").order("name"),
      supabase.from("components").select("id,name").order("name"),
      supabase.from("colors").select("id,name").order("name"),
      supabase
        .from("items")
        .select(
          "id,item_number,name,sku,size_num,weight_g,pieces_per_bag,low_stock_threshold_pieces,stock_pieces,category_id,component_id,color_id,category:categories(id,name),component:components(id,name),color:colors(id,name)"
        )
        .order("item_number", { ascending: true }),
    ]);

    if (catRes.error || compRes.error || colRes.error || itemsRes.error) {
      setError((catRes.error ?? compRes.error ?? colRes.error ?? itemsRes.error)?.message ?? "Failed to load.");
    }

    setCategories((catRes.data ?? []) as any);
    setComponents((compRes.data ?? []) as any);
    setColors((colRes.data ?? []) as any);
    setItems((itemsRes.data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(i: Item) {
    if (!isOwner) return;

    setEditingId(i.id);
    setItemNumber(String(i.item_number ?? ""));
    setName(i.name ?? "");
    setCategoryId(i.category_id ?? "");
    setComponentId(i.component_id ?? "");
    setColorId(i.color_id ?? "");
    setSizeNum(String(i.size_num ?? ""));
    setWeightG(String(i.weight_g ?? ""));
    setPiecesPerBag(String(i.pieces_per_bag ?? ""));
    setLowStockTh(String(i.low_stock_threshold_pieces ?? ""));
    setInitialQtyType("pieces");
    setInitialQty(String(i.stock_pieces ?? 0));
    setFormMsg(null);

    setActiveTab("add");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteItem(id: string) {
    if (!isOwner) return;
    setDeleteId(id);
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);

    // Permissions:
    // - Owner: add + edit
    // - Supervisor: add only
    if (editingId && !isOwner) {
      setFormMsg("Only the owner can edit existing items.");
      return;
    }

    if (!editingId && !canInsert) {
      setFormMsg("Only the owner or supervisor can add new items.");
      return;
    }

    const nItemNumber = itemNumber ? toIntOrZero(itemNumber) : nextItemNumber;
    const nSize = toIntOrZero(sizeNum);
    const nWeight = toFloatOrZero(weightG);
    const nPpb = toIntOrZero(piecesPerBag);
    const nTh = toIntOrZero(lowStockTh);

    if (!name.trim()) return setFormMsg("Item name is required.");
    if (!categoryId || !componentId || !colorId) return setFormMsg("Select Category, Component, and Color.");
    if (!nSize) return setFormMsg("Size must be a number (example: 28).");
    if (!nPpb || nPpb <= 0) return setFormMsg("Standard packing (pieces per bag) must be > 0.");
    if (!nWeight || nWeight <= 0) return setFormMsg("Weight per piece (grams) must be > 0.");

    const sku = generatedSku;
    if (!sku) return setFormMsg("SKU could not be generated. Check dropdowns + size.");

    const initQty = toIntOrZero(initialQty);
    const stockPiecesInput = initialQtyType === "bags" ? initQty * nPpb : initQty;

    setSaving(true);
    try {
      if (editingId) {
        // Update: overwrite stock with the value entered in the form (Set stock)
        const newStock = Math.max(0, stockPiecesInput);

        const { error } = await supabase
          .from("items")
          .update({
            item_number: nItemNumber,
            name: name.trim(),
            category_id: categoryId,
            component_id: componentId,
            color_id: colorId,
            size_num: nSize,
            sku,
            weight_g: nWeight,
            pieces_per_bag: nPpb,
            low_stock_threshold_pieces: nTh || null,
            stock_pieces: newStock,
          })
          .eq("id", editingId);

        if (error) throw error;
        setFormMsg("Updated successfully.");
      } else {
        const stockPieces = Math.max(0, stockPiecesInput);

        const { error } = await supabase.from("items").insert({
          item_number: nItemNumber,
          name: name.trim(),
          category_id: categoryId,
          component_id: componentId,
          color_id: colorId,
          size_num: nSize,
          sku,
          weight_g: nWeight,
          pieces_per_bag: nPpb,
          low_stock_threshold_pieces: nTh || null,
          stock_pieces: stockPieces,
        });

        if (error) throw error;
        setFormMsg("Item added successfully.");
      }

      await loadAll();

      // Keep message but clear fields for new entries
      if (!editingId) {
        setName("");
        setSizeNum("");
        setWeightG("");
        setPiecesPerBag("");
        setLowStockTh("");
        setInitialQty("");
      }
    } catch (err: any) {
      setFormMsg(err?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function printInventory() {
    // Print ALL inventory (not filtered), with only item name, color, qty in bags.
    window.print();
  }

  const printRows = useMemo(() => {
    return items
      .filter((item) => (item.stock_pieces ?? 0) > 0)
      .slice()
      .sort((a, b) => (a.item_number ?? 0) - (b.item_number ?? 0))
      .map((i) => {
        const bagsOnly = i.pieces_per_bag ? Math.floor((i.stock_pieces ?? 0) / i.pieces_per_bag) : 0;
        return { id: i.id, name: i.name, color: i.color?.name ?? "", bags: bagsOnly };
      });
  }, [items]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Inventory"
        subtitle="Add items (owner & supervisor). Edit/Delete items (owner only). Search/view stock with low-stock highlights."
        right={
          <div className="flex gap-2">
            <button
              className={"btn " + (activeTab === "add" ? "btn-primary" : "")}
              type="button"
              onClick={() => setActiveTab("add")}
            >
              Add item
            </button>
            <button
              className={"btn " + (activeTab === "view" ? "btn-primary" : "")}
              type="button"
              onClick={() => setActiveTab("view")}
            >
              View stock
            </button>
            {activeTab === "add" && (isOwner || isSupervisor) ? (
              <button className="btn" onClick={resetForm} type="button">
                Clear form
              </button>
            ) : null}
          </div>
        }
      />

      {activeTab === "add" ? (
        <div className="card p-5">
          <div className="font-semibold">{editingId ? "Edit item" : "Add new item"}</div>

          <div className="text-xs text-gray-600 mt-1">
            Next item number suggestion: <span className="font-mono">{nextItemNumber}</span>
          </div>

          {isSupervisor ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Supervisor can <span className="font-semibold">add new items</span>, but cannot <span className="font-semibold">edit or delete</span> existing items.
            </div>
          ) : null}

          <form className="mt-4 space-y-3" onSubmit={saveItem}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Item number</label>
                <input
                  className="input mt-1"
                  value={itemNumber}
                  onChange={(e) => setItemNumber(e.target.value)}
                  placeholder={String(nextItemNumber)}
                  disabled={formDisabled}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Item name</label>
                <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required disabled={formDisabled} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Category</label>
                <select className="select mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={formDisabled}>
                  <option value="">Select</option>
                  {categories.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Component</label>
                <select className="select mt-1" value={componentId} onChange={(e) => setComponentId(e.target.value)} disabled={formDisabled}>
                  <option value="">Select</option>
                  {components.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Color</label>
                <select className="select mt-1" value={colorId} onChange={(e) => setColorId(e.target.value)} disabled={formDisabled}>
                  <option value="">Select</option>
                  {colors.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-sm font-medium">Size (number)</label>
                <input className="input mt-1" value={sizeNum} onChange={(e) => setSizeNum(e.target.value)} placeholder="28" disabled={formDisabled} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Auto-generated SKU</label>
                <input className="input mt-1 font-mono" value={generatedSku} readOnly placeholder="Select dropdowns + size" />
              </div>
              <div>
                <label className="text-sm font-medium">Weight per piece (g)</label>
                <input className="input mt-1" value={weightG} onChange={(e) => setWeightG(e.target.value)} placeholder="12.5" disabled={formDisabled} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Standard packing (pieces per bag)</label>
                <input className="input mt-1" value={piecesPerBag} onChange={(e) => setPiecesPerBag(e.target.value)} placeholder="100" disabled={formDisabled} />
              </div>
              <div>
                <label className="text-sm font-medium">Low stock threshold (pieces)</label>
                <input className="input mt-1" value={lowStockTh} onChange={(e) => setLowStockTh(e.target.value)} placeholder="Optional" disabled={formDisabled} />
              </div>
              <div>
                <label className="text-sm font-medium">{editingId ? "Set stock" : "Initial stock"}</label>
                <div className="mt-1 flex gap-2">
                  <select className="select" value={initialQtyType} onChange={(e) => setInitialQtyType(e.target.value as any)} disabled={formDisabled}>
                    <option value="pieces">Pieces</option>
                    <option value="bags">Bags</option>
                  </select>
                  <input className="input" value={initialQty} onChange={(e) => setInitialQty(e.target.value)} placeholder="0" disabled={formDisabled} />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {editingId ? "On edit, this overwrites the current stock." : "Sets the starting stock for this item."}
                </div>
              </div>
            </div>

            {formMsg ? <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{formMsg}</div> : null}

            {((editingId && isOwner) || (!editingId && canInsert)) ? (
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Update item" : "Add item"}
                </button>
                {editingId ? (
                  <button className="btn" type="button" onClick={resetForm}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>

          <div className="text-xs text-gray-500 mt-4">
            Tip: Manage dropdown lists in <span className="font-medium">Masters</span> (owner, staff & supervisor).
          </div>
        </div>
      ) : (
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Search & View stock</div>
              <div className="text-xs text-gray-600 mt-1">
                Row colors: <span className="badge border-red-200 bg-red-50 text-red-700">0 stock</span>{" "}
                <span className="badge border-amber-200 bg-amber-50 text-amber-700">low stock</span>
              </div>
            </div>

            {(isOwner || isSupervisor) ? (
              <button className="btn" type="button" onClick={printInventory}>
                Print inventory
              </button>
            ) : null}
          </div>

          <div className="mt-3">
            <input
              className="input"
              placeholder="Search by item number, name, or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}

          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Item #</th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Stock</th>
                  {isOwner ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={isOwner ? 5 : 4} className="py-6 text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 5 : 4} className="py-6 text-gray-500">
                      No items found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((i) => {
                    const out = (i.stock_pieces ?? 0) <= 0;
                    const th = i.low_stock_threshold_pieces ?? 0;
                    const low = !out && th > 0 && (i.stock_pieces ?? 0) <= th;
                    const bags = piecesToBags(i.stock_pieces ?? 0, i.pieces_per_bag ?? 0);
                    const rowClass = out ? "bg-red-50" : low ? "bg-amber-50" : "";
                    return (
                      <tr key={i.id} className={rowClass}>
                        <td className="font-medium">{i.item_number}</td>
                        <td className="font-mono text-xs">{i.sku}</td>
                        <td>
                          <div className="font-medium">{i.name}</div>
                          <div className="text-xs text-gray-500">
                            {i.category?.name ?? ""} • {i.component?.name ?? ""} • {i.color?.name ?? ""} • size {i.size_num}
                          </div>
                        </td>
                        <td>
                          <div className="font-medium">{i.stock_pieces} pcs</div>
                          <div className="text-xs text-gray-600">
                            {bags.bags} bags{bags.leftoverPieces ? ` + ${bags.leftoverPieces} pcs` : ""}
                          </div>
                        </td>

                        {isOwner ? (
                          <td className="whitespace-nowrap">
                            <button className="btn text-sm mr-2" onClick={() => startEdit(i)} type="button">
                              Edit
                            </button>
                            <button className="btn btn-danger text-sm" onClick={() => deleteItem(i.id)} type="button">
                              Delete
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Print-only content */}
          <div className="print-only mt-6">
            <h1 className="text-xl font-semibold">Inventory List</h1>
            <div className="text-sm text-gray-600 mt-1">Generated on {new Date().toLocaleString()}</div>
            <table className="table mt-4">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Color</th>
                  <th>Qty (bags)</th>
                </tr>
              </thead>
              <tbody>
                {printRows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}</td>
                    <td>{r.color || "-"}</td>
                    <td>{r.bags}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OwnerDeleteDialog
        open={!!deleteId}
        title="Delete item"
        description="This will delete the item master. Past dispatch/inward history will remain, but if the item was used in history, deletion may fail (by design)."
        confirmText="Delete item"
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          const { error } = await supabase.from("items").delete().eq("id", deleteId);
          if (error) throw error;
          await loadAll();
        }}
      />
    </div>
  );
}

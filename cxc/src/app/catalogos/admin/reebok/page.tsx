"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import Image from "next/image";
import { validateCsvImport, type CsvImportRow } from "@/lib/csv-import-validator";
import { ConfirmModal } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReebokProduct {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number | null;
  category: string;
  gender: string | null;
  sub_category: string | null;
  image_url: string | null;
  active: boolean;
  on_sale: boolean;
  badge: string | null;
  created_at: string;
}

interface InventoryItem {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
}

// Fila de la vista unificada (presenciales + del link). El total ya viene
// recalculado por el endpoint /pedidos-unificado.
interface UnifiedPedido {
  origen: "mio" | "link";
  id_natural: string;
  cliente: string;
  total: number;
  created_at: string;
  vendor: string | null;
  item_count: number;
}

interface ImportRow {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  gender: string;
  badge: string;
}

type Tab = "productos" | "pedidos" | "importar";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadCSV(
  products: { sku: string; name: string; price: number; quantity: number; gender: string; badge: string; category: string }[],
  filename: string,
  includeCategory: boolean,
) {
  const header = includeCategory
    ? "SKU,Nombre,Precio,Cantidad,Genero,Estado,Categoria"
    : "SKU,Nombre,Precio,Cantidad,Genero,Estado";
  const rows = products.map(p => {
    const base = `${escapeCsvField(p.sku)},${escapeCsvField(p.name)},${p.price},${p.quantity},${escapeCsvField(p.gender)},${p.badge || ""}`;
    return includeCategory ? `${base},${escapeCsvField(p.category)}` : base;
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function categoryToSpanish(cat: string): string {
  if (cat === "footwear") return "Calzado";
  if (cat === "apparel") return "Ropa";
  if (cat === "accessories") return "Accesorios";
  return "";
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { vals.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    vals.push(current.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] || ""; });
    rows.push(obj);
  }
  return rows;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReebokAdminPage() {
  const { authChecked } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: ["admin"],
  });

  const [tab, setTab] = useState<Tab>("productos");
  const [products, setProducts] = useState<ReebokProduct[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [pedidos, setPedidos] = useState<UnifiedPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const getStock = useCallback((productId: string) => {
    return inventory
      .filter((i) => i.product_id === productId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }, [inventory]);

  const loadProducts = useCallback(async () => {
    try {
      const [pRes, iRes] = await Promise.all([
        fetch("/api/catalogo/reebok/products"),
        fetch("/api/catalogo/reebok/inventory"),
      ]);
      if (pRes.ok) {
        const data = await pRes.json();
        setProducts(Array.isArray(data) ? data : []);
      }
      if (iRes.ok) {
        const data = await iRes.json();
        setInventory(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  const loadPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/catalogo/reebok/pedidos-unificado");
      if (res.ok) {
        const data = await res.json();
        setPedidos(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    setLoading(true);
    Promise.all([loadProducts(), loadPedidos()]).finally(() => setLoading(false));
  }, [authChecked, loadProducts, loadPedidos]);

  if (!authChecked) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "productos", label: "Productos" },
    { key: "pedidos", label: "Pedidos" },
    { key: "importar", label: "Importar" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Administrar Catalogos" />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A2656] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]">
          {toast}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#1A2656] flex items-center justify-center">
            <span className="text-white font-extrabold text-[10px] tracking-tight">RBK</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">REEBOK</h1>
            <p className="text-xs text-gray-400">Administrar catalogo</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                tab === t.key
                  ? "bg-white text-[#1A2656] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#E4002B] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === "productos" && (
              <ProductosTab products={products} getStock={getStock} onProductsChanged={loadProducts} />
            )}
            {tab === "pedidos" && (
              <PedidosTab pedidos={pedidos} onRefresh={loadPedidos} showToast={showToast} />
            )}
            {tab === "importar" && (
              <ImportarTab
                products={products}
                inventory={inventory}
                showToast={showToast}
                onImportComplete={loadProducts}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── PRODUCTOS TAB (READ-ONLY) ────────────────────────────────────────────────

type ProductSubTab = "footwear" | "apparel" | "accessories";

function ProductosTab({
  products,
  getStock,
  onProductsChanged,
}: {
  products: ReebokProduct[];
  getStock: (id: string) => number;
  onProductsChanged: () => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<ProductSubTab>("footwear");
  const [search, setSearch] = useState("");
  const [ofertaFilter, setOfertaFilter] = useState<"" | "solo">("");
  const [genderFilter, setGenderFilter] = useState<"" | "male" | "female" | "kids" | "unisex" | "otro">("");
  const [estadoFilter, setEstadoFilter] = useState<"" | "nuevo" | "proximamente">("");

  // Optimistic price overrides keyed by product id — survive parent refetches.
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  const subTabs: { key: ProductSubTab; label: string }[] = [
    { key: "footwear", label: "Calzado" },
    { key: "apparel", label: "Ropa" },
    { key: "accessories", label: "Accesorios" },
  ];

  // Inactive products are hidden everywhere — counts and lists reflect actives only.
  const activeProducts = products.filter((p) => p.active !== false);

  const counts = {
    footwear: activeProducts.filter((p) => p.category === "footwear").length,
    apparel: activeProducts.filter((p) => p.category === "apparel").length,
    accessories: activeProducts.filter((p) => p.category === "accessories").length,
  };

  const inSubTab = activeProducts.filter((p) => p.category === subTab);

  const STANDARD_GENDERS = new Set(["male", "female", "kids", "unisex"]);

  const filtered = inSubTab.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !(p.sku || "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (ofertaFilter === "solo" && p.badge !== "oferta") return false;
    if (genderFilter) {
      if (genderFilter === "otro") {
        if (p.gender && STANDARD_GENDERS.has(p.gender)) return false;
      } else if (p.gender !== genderFilter) {
        return false;
      }
    }
    if (estadoFilter && p.badge !== estadoFilter) return false;
    return true;
  });

  const hasActiveFilters = Boolean(search || ofertaFilter || genderFilter || estadoFilter);

  const sorted = [...filtered].sort((a, b) => {
    const stockA = getStock(a.id);
    const stockB = getStock(b.id);
    if (stockA > 0 && stockB === 0) return -1;
    if (stockA === 0 && stockB > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  function displayPrice(p: ReebokProduct): number {
    return priceOverrides[p.id] !== undefined ? priceOverrides[p.id] : (p.price || 0);
  }

  function startEdit(p: ReebokProduct) {
    setEditingId(p.id);
    setErrorById((eb) => {
      if (!(p.id in eb)) return eb;
      const next = { ...eb };
      delete next[p.id];
      return next;
    });
  }

  function cancelEdit(p: ReebokProduct, inputEl: HTMLInputElement) {
    // Restore the input value to the original so onBlur sees "no change" and exits.
    inputEl.value = String(displayPrice(p));
    inputEl.blur();
  }

  async function commitEdit(p: ReebokProduct, raw: string) {
    setEditingId(null);

    const current = displayPrice(p);
    const trimmed = raw.trim().replace(",", ".");
    if (trimmed === "") {
      // Empty = treat as cancel, no error.
      return;
    }
    const next = parseFloat(trimmed);
    if (isNaN(next) || next < 0) {
      setErrorById((eb) => ({ ...eb, [p.id]: "Precio invalido" }));
      return;
    }
    if (next === current) {
      return;
    }

    const hadOverride = p.id in priceOverrides;
    const prevOverride = priceOverrides[p.id];

    setSavingId(p.id);
    setPriceOverrides((o) => ({ ...o, [p.id]: next })); // optimistic

    try {
      const res = await fetch("/api/catalogo/reebok/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, price: next }),
      });
      if (!res.ok) throw new Error("save failed");

      setJustSavedId(p.id);
      setTimeout(() => {
        setJustSavedId((s) => (s === p.id ? null : s));
      }, 1500);

      // Refresh in background so the rest of the app sees the new price.
      onProductsChanged().catch(() => { /* ignore */ });
    } catch {
      // Revert optimistic override to whatever it was before.
      setPriceOverrides((o) => {
        const copy = { ...o };
        if (hadOverride) copy[p.id] = prevOverride;
        else delete copy[p.id];
        return copy;
      });
      setErrorById((eb) => ({ ...eb, [p.id]: "No se pudo guardar. Intenta de nuevo." }));
    } finally {
      setSavingId((s) => (s === p.id ? null : s));
    }
  }

  return (
    <div>
      {/* Subtabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {subTabs.map((st) => {
          const active = subTab === st.key;
          return (
            <button
              key={st.key}
              onClick={() => setSubTab(st.key)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition ${
                active
                  ? "text-[#1A2656] border-[#1A2656]"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {st.label} ({counts[st.key]})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o SKU..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1A2656]/30 transition"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={ofertaFilter}
          onChange={(e) => setOfertaFilter(e.target.value as "" | "solo")}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-700 outline-none focus:border-[#1A2656]/30 transition cursor-pointer"
        >
          <option value="">Todas las ofertas</option>
          <option value="solo">Solo en oferta</option>
        </select>
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value as "" | "male" | "female" | "kids" | "unisex" | "otro")}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-700 outline-none focus:border-[#1A2656]/30 transition cursor-pointer"
        >
          <option value="">Todos los generos</option>
          <option value="male">Hombre</option>
          <option value="female">Mujer</option>
          <option value="kids">Ninos</option>
          <option value="unisex">Unisex</option>
          <option value="otro">Otro</option>
        </select>
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value as "" | "nuevo" | "proximamente")}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-700 outline-none focus:border-[#1A2656]/30 transition cursor-pointer"
        >
          <option value="">Todos los estados</option>
          <option value="nuevo">Nuevo</option>
          <option value="proximamente">Proximamente</option>
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
        {hasActiveFilters && filtered.length !== inSubTab.length && ` (de ${inSubTab.length})`}
      </p>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          {hasActiveFilters ? "Ningun producto coincide con los filtros" : "No hay productos en esta categoria"}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((product) => {
            const stock = getStock(product.id);
            const badgeLabel = product.badge === "nuevo" ? "Nuevo" : product.badge === "oferta" ? "Oferta" : null;
            const isInactive = product.active === false;
            const isEditing = editingId === product.id;
            const isSaving = savingId === product.id;
            const justSaved = justSavedId === product.id;
            const error = errorById[product.id];
            return (
              <div
                key={product.id}
                className={`bg-white border rounded-lg p-3 ${isInactive ? "opacity-50 border-gray-100 bg-gray-50/50" : stock === 0 ? "opacity-60 border-gray-100" : "border-gray-200"}`}
              >
                <div className="flex items-center gap-3">
                  {/* Image */}
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                      {isInactive && (
                        <span className="text-[10px] font-medium bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Inactivo</span>
                      )}
                      {!isInactive && badgeLabel && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          product.badge === "oferta"
                            ? "bg-orange-50 text-orange-600"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {badgeLabel}
                        </span>
                      )}
                      {!isInactive && stock === 0 && (
                        <span className="text-[10px] font-medium bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Sin stock</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {product.sku || "—"} &middot; {product.category} &middot; {product.gender || "—"} &middot; Stock: {stock}
                    </p>
                  </div>

                  {/* Price — inline editable */}
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus
                          defaultValue={displayPrice(product).toFixed(2)}
                          onBlur={(e) => commitEdit(product, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit(product, e.target as HTMLInputElement);
                            }
                          }}
                          className="w-20 px-2 py-1 text-sm text-right tabular-nums border border-[#1A2656] rounded focus:outline-none focus:ring-1 focus:ring-[#1A2656]/30"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(product)}
                        disabled={isSaving}
                        title="Editar precio"
                        className="text-sm font-semibold text-gray-900 tabular-nums hover:bg-gray-100 px-2 py-1 rounded transition disabled:opacity-50"
                      >
                        ${fmtMoney(displayPrice(product))}
                      </button>
                    )}
                    {isSaving && (
                      <svg className="w-3.5 h-3.5 text-gray-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {justSaved && !isSaving && (
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                {error && (
                  <p className="text-[11px] text-red-600 mt-1.5 ml-15">{error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PEDIDOS TAB (vista unificada) ─────────────────────────────────────────────

type OrigenFilter = "todos" | "link" | "mio";

function OrigenBadge({ origen }: { origen: "mio" | "link" }) {
  if (origen === "link") {
    return (
      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
        Del link
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      Mío
    </span>
  );
}

function PedidosTab({
  pedidos,
  onRefresh,
  showToast,
}: {
  pedidos: UnifiedPedido[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const router = useRouter();
  const [origenFilter, setOrigenFilter] = useState<OrigenFilter>("todos");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<UnifiedPedido | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const counts = {
    todos: pedidos.length,
    link: pedidos.filter((p) => p.origen === "link").length,
    mio: pedidos.filter((p) => p.origen === "mio").length,
  };

  const filtered = pedidos.filter((p) => {
    if (origenFilter !== "todos" && p.origen !== origenFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.cliente.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function detailHref(p: UnifiedPedido): string {
    return p.origen === "mio"
      ? `/catalogo/reebok/pedido/${p.id_natural}`
      : `/pedido-reebok/${p.id_natural}`;
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      // Borrar inline sólo aplica a pedidos del link (short_id en pedidos_publicos).
      const res = await fetch(
        `/api/catalogo/reebok/pedidos-publicos/${deleting.id_natural}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
      showToast("Pedido borrado");
      setDeleting(null);
      await onRefresh();
    } catch {
      showToast("No se pudo borrar el pedido");
    } finally {
      setDeleteLoading(false);
    }
  }

  const filterTabs: { key: OrigenFilter; label: string }[] = [
    { key: "todos", label: `Todos (${counts.todos})` },
    { key: "link", label: `Del link (${counts.link})` },
    { key: "mio", label: `Míos (${counts.mio})` },
  ];

  return (
    <div>
      {/* Filtros por origen */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {filterTabs.map((ft) => {
          const active = origenFilter === ft.key;
          return (
            <button
              key={ft.key}
              onClick={() => setOrigenFilter(ft.key)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition ${
                active
                  ? "text-[#1A2656] border-[#1A2656]"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {ft.label}
            </button>
          );
        })}
      </div>

      {/* Buscador por cliente */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1A2656]/30 transition"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">
            {search || origenFilter !== "todos" ? "Ningún pedido coincide" : "No hay pedidos aún"}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Origen</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cliente</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((pedido) => (
                <tr
                  key={`${pedido.origen}-${pedido.id_natural}`}
                  onClick={() => router.push(detailHref(pedido))}
                  className="hover:bg-gray-50 transition cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <OrigenBadge origen={pedido.origen} />
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {pedido.cliente === "Sin nombre" ? (
                      <span className="text-gray-300 italic">Sin nombre</span>
                    ) : (
                      pedido.cliente
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    ${fmtMoney(pedido.total)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(pedido.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {pedido.origen === "link" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(pedido);
                        }}
                        className="px-2.5 py-1 rounded-md border border-red-200 text-xs text-red-600 hover:bg-red-50 transition"
                      >
                        Borrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        onClose={() => !deleteLoading && setDeleting(null)}
        onConfirm={handleDelete}
        title="¿Borrar pedido?"
        message={
          deleting
            ? `¿Borrar el pedido de ${deleting.cliente === "Sin nombre" ? "cliente sin nombre" : deleting.cliente} por $${fmtMoney(deleting.total)}? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Borrar pedido"
        destructive
        loading={deleteLoading}
      />
    </div>
  );
}

// ── IMPORTAR TAB ──────────────────────────────────────────────────────────────

function ImportarTab({
  products,
  inventory,
  showToast,
  onImportComplete,
}: {
  products: ReebokProduct[];
  inventory: InventoryItem[];
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <ImportInstructions />
      <ImportSection
        title="Active Shoes"
        subtitle="Calzado (footwear)"
        company="active_shoes"
        products={products}
        inventory={inventory}
        filterFn={(p) => p.category === "footwear"}
        showToast={showToast}
        onImportComplete={onImportComplete}
        accentColor="#E4002B"
      />
      <ImportSection
        title="Active Wear"
        subtitle="Ropa y accesorios (apparel + accessories)"
        company="active_wear"
        products={products}
        inventory={inventory}
        filterFn={(p) => p.category === "apparel" || p.category === "accessories"}
        showToast={showToast}
        onImportComplete={onImportComplete}
        accentColor="#1A2656"
      />
      <BatchPhotosSection showToast={showToast} />
    </div>
  );
}

// ── Import Instructions ──────────────────────────────────────────────────────

function ImportInstructions() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Como importar productos</h3>

      <div className="space-y-3 text-xs text-gray-600">
        <div>
          <p className="font-medium text-gray-800 mb-1">Columnas del archivo</p>
          <p className="font-mono text-[11px] text-gray-700">SKU, Nombre, Precio, Cantidad, Genero, Estado, Categoria</p>
        </div>
        <div>
          <p className="font-medium text-gray-800 mb-1">Valores validos</p>
          <ul className="space-y-0.5">
            <li>
              <span className="font-mono text-gray-700">Genero</span>: male, female, kids, unisex
            </li>
            <li>
              <span className="font-mono text-gray-700">Estado</span>: nuevo, oferta, proximamente (o vacio)
            </li>
            <li>
              <span className="font-mono text-gray-700">Categoria</span> (solo Active Wear): Ropa o Accesorios. Active Shoes no usa esta columna.
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-3">
        <div className="flex gap-2">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">Importante</p>
            <p>
              El archivo debe contener <strong>TODOS</strong> los productos de la empresa. Cualquier producto que no este en el archivo se desactiva y su stock pasa a 0. Para actualizar solo algunos, descarga primero la plantilla &mdash; ya trae todos los productos actuales con su precio y categoria &mdash; y edita sobre ella.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Import Section (reusable for shoes/wear) ─────────────────────────────────

function ImportSection({
  title,
  subtitle,
  company,
  products,
  inventory,
  filterFn,
  showToast,
  onImportComplete,
  accentColor,
}: {
  title: string;
  subtitle: string;
  company: "active_shoes" | "active_wear";
  products: ReebokProduct[];
  inventory: InventoryItem[];
  filterFn: (p: ReebokProduct) => boolean;
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
  accentColor: string;
}) {
  const [parsed, setParsed] = useState<CsvImportRow[] | null>(null);
  const [preview, setPreview] = useState<{ updated: number; created: number; deactivated: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number; deactivated: number; reactivated: number; unclassifiedNew: string[] } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const companyProducts = products.filter(filterFn);

  function getProductStock(productId: string) {
    return inventory
      .filter((i) => i.product_id === productId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  function handleDownloadTemplate() {
    // Categoria only meaningful for active_wear (apparel vs accessories).
    // Active Shoes is always footwear — omit the column entirely so the operator
    // is not tempted to fill it.
    const includeCategory = company === "active_wear";
    const rows = companyProducts
      .filter((p) => p.active !== false)
      .map((p) => ({
        sku: p.sku || "",
        name: p.name,
        price: p.price || 0,
        quantity: getProductStock(p.id),
        gender: p.gender || "",
        badge: p.badge || "",
        category: categoryToSpanish(p.category),
      }));
    downloadCSV(rows, `Reebok_${title.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`, includeCategory);
    showToast("Plantilla descargada");
  }

  async function handleFile(file: File) {
    setImportResult(null);
    setParsed(null);
    setPreview(null);
    setValidationErrors([]);
    setValidationWarnings([]);

    try {
      const lower = file.name.toLowerCase();
      const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
      let text: string;

      if (isExcel) {
        const XLSX = (await import("xlsx-js-style")).default;
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(ws);
      } else {
        const buf = await file.arrayBuffer();
        let utf = new TextDecoder("utf-8").decode(buf);
        if (utf.includes("�")) utf = new TextDecoder("latin1").decode(buf);
        text = utf;
      }

      const existingSkus = new Set(companyProducts.map((p) => p.sku).filter(Boolean) as string[]);
      const result = validateCsvImport(text, existingSkus);

      setValidationErrors(result.errors);
      setValidationWarnings(result.warnings);

      if (result.rows.length > 0) {
        setParsed(result.rows);
      }

      if (result.errors.length === 0 && result.summary) {
        // Only currently-active SKUs missing from file will be soft-deleted.
        const incomingSkus = new Set(result.rows.map((r) => r.sku));
        const willDeactivate = companyProducts.filter(
          (p) => p.active !== false && p.sku && !incomingSkus.has(p.sku),
        ).length;
        setPreview({ updated: result.summary.update, created: result.summary.create, deactivated: willDeactivate });
      }
    } catch {
      showToast("Error al leer el archivo");
    }
  }

  async function handleConfirmImport() {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await fetch("/api/catalogo/reebok/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: parsed, company }),
      });
      if (res.ok) {
        const result = await res.json();
        setImportResult({
          updated: result.updated,
          created: result.created,
          deactivated: result.deactivated ?? 0,
          reactivated: result.reactivated ?? 0,
          unclassifiedNew: Array.isArray(result.unclassifiedNew) ? result.unclassifiedNew : [],
        });
        setParsed(null);
        setPreview(null);
        showToast("Importacion completada");
        await onImportComplete();
      } else {
        const err = await res.json();
        showToast(err.error || "Error al importar");
      }
    } catch {
      showToast("Error al importar");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{title}</h3>
      <p className="text-xs text-gray-400 mb-4">{subtitle} &middot; {companyProducts.length} productos</p>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={handleDownloadTemplate}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg active:scale-[0.97] transition flex items-center gap-2"
          style={{ backgroundColor: accentColor }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Descargar plantilla {title}
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          dragOver ? "border-[#E4002B] bg-[#E4002B]/5" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <svg className="w-7 h-7 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-gray-500">Subir archivo {title}</p>
        <p className="text-xs text-gray-400 mt-1">Arrastra un .csv, .xlsx o .xls — o haz click</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Validation errors (critical — block import) */}
      {validationErrors.length > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-red-800 mb-2">
            {validationErrors.length} error{validationErrors.length !== 1 ? "es" : ""} encontrado{validationErrors.length !== 1 ? "s" : ""}
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-xs text-red-700">{err}</li>
            ))}
          </ul>
          <p className="text-xs text-red-600 mt-2">Corrige el archivo antes de importar.</p>
          <button
            onClick={() => { setParsed(null); setPreview(null); setValidationErrors([]); setValidationWarnings([]); }}
            className="mt-2 px-3 py-1.5 text-xs text-red-700 border border-red-300 rounded-md hover:bg-red-100 transition"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Validation warnings (allow import) */}
      {validationWarnings.length > 0 && validationErrors.length === 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            {validationWarnings.length} advertencia{validationWarnings.length !== 1 ? "s" : ""}
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {validationWarnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* All good message */}
      {parsed && validationErrors.length === 0 && validationWarnings.length === 0 && preview && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-green-800">Todo bien — sin errores ni advertencias</p>
        </div>
      )}

      {/* Preview */}
      {preview && parsed && validationErrors.length === 0 && (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">Vista previa</p>
            <div className="flex gap-4 mt-1 text-xs">
              <span className="text-blue-600">{preview.updated} a actualizar</span>
              <span className="text-green-600">{preview.created} nuevos</span>
              <span className="text-gray-500">{preview.deactivated} se inactivaran</span>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">SKU</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Nombre</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Precio</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Cant.</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Estado</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parsed.slice(0, 50).map((row, i) => {
                  const existingSkus = new Set(companyProducts.map((p) => p.sku));
                  const exists = existingSkus.has(row.sku);
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-gray-600">{row.sku}</td>
                      <td className="px-3 py-1.5 text-gray-900">{row.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${fmtMoney(row.price)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.quantity}</td>
                      <td className="px-3 py-1.5">
                        {row.badge ? (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            row.badge === "oferta" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                          }`}>
                            {row.badge === "oferta" ? "Oferta" : "Nuevo"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          exists ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                        }`}>
                          {exists ? "Actualizar" : "Nuevo"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsed.length > 50 && (
              <p className="text-xs text-gray-400 px-3 py-2">... y {parsed.length - 50} mas</p>
            )}
          </div>

          <div className="flex gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-4 py-2 bg-[#E4002B] text-white text-sm font-semibold rounded-lg hover:bg-[#E4002B]/90 active:scale-[0.97] transition disabled:opacity-50"
            >
              {importing ? "Importando..." : "Confirmar importacion"}
            </button>
            <button
              onClick={() => { setParsed(null); setPreview(null); }}
              className="px-4 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-green-800">Importacion completada</p>
          <p className="text-xs text-green-600 mt-1">
            {importResult.updated} actualizados &middot; {importResult.created} nuevos &middot; {importResult.deactivated} inactivados
            {importResult.reactivated > 0 ? ` · ${importResult.reactivated} reactivados` : ""}
          </p>
          {importResult.unclassifiedNew.length > 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-300 rounded px-3 py-2">
              <p className="text-xs font-semibold text-amber-900">
                {importResult.unclassifiedNew.length} producto{importResult.unclassifiedNew.length !== 1 ? "s" : ""} nuevo{importResult.unclassifiedNew.length !== 1 ? "s" : ""} entr{importResult.unclassifiedNew.length !== 1 ? "aron" : "ó"} como Ropa por defecto
              </p>
              <p className="text-[11px] text-amber-800 mt-1">
                Clasificalos en el tab Productos o corrige la columna Categoria del archivo y vuelve a subir.
              </p>
              <p className="text-[11px] font-mono text-amber-900 mt-2 break-all">
                {importResult.unclassifiedNew.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Batch Photos ──────────────────────────────────────────────────────────────

function BatchPhotosSection({ showToast }: { showToast: (msg: string) => void }) {
  const [matchResult, setMatchResult] = useState<{ matched: { file: File; sku: string; preview: string }[]; unmatched: { file: File; name: string }[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(selectedFiles: FileList) {
    const fileArray = Array.from(selectedFiles);

    const res = await fetch("/api/catalogo/reebok/products");
    if (!res.ok) { showToast("Error cargando productos"); return; }
    const products: ReebokProduct[] = await res.json();

    const matched: { file: File; sku: string; preview: string }[] = [];
    const unmatched: { file: File; name: string }[] = [];

    for (const file of fileArray) {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").trim();
      const matchedProduct = products.find((p) =>
        p.sku === nameWithoutExt ||
        p.sku?.replace(/-/g, ".") === nameWithoutExt ||
        p.sku?.replace(/[.\-_]/g, "").toUpperCase() === nameWithoutExt.replace(/[.\-_]/g, "").toUpperCase()
      );

      if (matchedProduct) {
        matched.push({ file, sku: matchedProduct.sku!, preview: URL.createObjectURL(file) });
      } else {
        unmatched.push({ file, name: file.name });
      }
    }

    setMatchResult({ matched, unmatched });
  }

  async function handleUploadAll() {
    if (!matchResult || matchResult.matched.length === 0) return;
    setUploading(true);
    setProgress(0);

    const res = await fetch("/api/catalogo/reebok/products");
    if (!res.ok) { showToast("Error cargando productos"); setUploading(false); return; }
    const products: ReebokProduct[] = await res.json();
    const skuToId = new Map<string, string>();
    for (const p of products) {
      if (p.sku) skuToId.set(p.sku, p.id);
    }

    let done = 0;
    let errors = 0;

    for (const { file, sku } of matchResult.matched) {
      const productId = skuToId.get(sku);
      if (!productId) { errors++; done++; setProgress(done); continue; }

      try {
        const formData = new FormData();
        formData.append("file", file);
        // Send the resolved SKU so the upload route can use a deterministic
        // Storage path and overwrite previous photos for this product in place.
        formData.append("sku", sku);
        const uploadRes = await fetch("/api/catalogo/reebok/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          await fetch("/api/catalogo/reebok/products", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: productId, image_url: url }),
          });
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
      done++;
      setProgress(done);
    }

    setUploading(false);
    if (errors > 0) {
      showToast(`${done - errors} fotos subidas, ${errors} errores`);
    } else {
      showToast(`${done} fotos subidas correctamente`);
    }
    setMatchResult(null);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Subir fotos en batch</h3>
      <p className="text-xs text-gray-400 mb-4">Selecciona imagenes nombradas por SKU (ej: 100227359.jpg)</p>

      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-[#E4002B] transition cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[#E4002B]", "bg-[#E4002B]/5"); }}
        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-[#E4002B]", "bg-[#E4002B]/5"); }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("border-[#E4002B]", "bg-[#E4002B]/5");
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
      >
        <svg className="w-7 h-7 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-gray-500">Selecciona o arrastra imagenes</p>
        <p className="text-xs text-gray-400 mt-1">Nombra cada archivo con el SKU del producto</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {matchResult && (
        <div className="mt-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
            {matchResult.matched.map((match, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border-2 border-green-300">
                <Image src={match.preview} alt={match.sku} width={100} height={100} className="w-full aspect-square object-cover" unoptimized />
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] font-mono truncate bg-green-500/90 text-white">
                  {match.sku}
                </div>
              </div>
            ))}
            {matchResult.unmatched.map((item, i) => (
              <div key={`u-${i}`} className="relative rounded-lg overflow-hidden border-2 border-red-300">
                <div className="w-full aspect-square bg-red-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] font-mono truncate bg-red-500/90 text-white">
                  {item.name}
                </div>
              </div>
            ))}
          </div>

          {uploading && (
            <div className="mb-3">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#E4002B] h-2 rounded-full transition-all"
                  style={{ width: `${(progress / matchResult.matched.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{progress} de {matchResult.matched.length}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">
              {matchResult.matched.length} de {matchResult.matched.length + matchResult.unmatched.length} coinciden con un producto
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleUploadAll}
                disabled={uploading || matchResult.matched.length === 0}
                className="px-4 py-2 bg-[#E4002B] text-white text-sm font-semibold rounded-lg hover:bg-[#E4002B]/90 active:scale-[0.97] transition disabled:opacity-50"
              >
                {uploading ? "Subiendo..." : "Subir fotos"}
              </button>
              <button
                onClick={() => setMatchResult(null)}
                disabled={uploading}
                className="px-4 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

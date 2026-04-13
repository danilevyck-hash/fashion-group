"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import Image from "next/image";
import Link from "next/link";

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
  created_at: string;
}

interface InventoryItem {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
}

interface ReebokPedido {
  id: string;
  short_id: string;
  items: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }[];
  total: number;
  created_at: string;
}

interface ImportProduct {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  gender: string;
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReebokAdminPage() {
  const { authChecked } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: ["admin"],
  });

  const [tab, setTab] = useState<Tab>("productos");
  const [products, setProducts] = useState<ReebokProduct[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [pedidos, setPedidos] = useState<ReebokPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ReebokProduct>>({});

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
      const res = await fetch("/api/catalogo/reebok/pedidos-publicos");
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

  async function handleSaveProduct(product: Partial<ReebokProduct>) {
    setSaving(true);
    try {
      const res = await fetch("/api/catalogo/reebok/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
      if (res.ok) {
        showToast("Producto guardado");
        setEditingId(null);
        setEditForm({});
        await loadProducts();
      } else {
        const err = await res.json();
        showToast(err.error || "Error al guardar");
      }
    } catch {
      showToast("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePopular(product: ReebokProduct) {
    // popular is tracked via on_sale=false (nuevo) but we reuse active for popular
    // Actually, let's use a dedicated approach - toggle on the product via PUT
    // For "popular" we don't have a column, so we'll toggle on_sale
    // on_sale = false means "nuevo", on_sale = true means "oferta"
    // We'll need to handle popular differently - let's use the description field as a hack
    // Actually, the old admin uses `active` and `on_sale` fields. Let's keep it simple:
    // popular = we don't have a dedicated field. Let's use sub_category = 'popular' as a marker.
    const isPopular = product.sub_category === "popular";
    await handleSaveProduct({
      id: product.id,
      sub_category: isPopular ? null : "popular",
    } as Partial<ReebokProduct> & { sub_category: string | null });
  }

  async function handleToggleOnSale(product: ReebokProduct) {
    setSaving(true);
    try {
      const res = await fetch("/api/catalogo/reebok/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, on_sale: !product.on_sale }),
      });
      if (res.ok) {
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, on_sale: !p.on_sale } : p)));
        showToast(product.on_sale ? "Marcado como nuevo" : "Marcado como oferta");
      }
    } catch {
      showToast("Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadPhoto(productId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/catalogo/reebok/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url } = await res.json();
        await handleSaveProduct({ id: productId, image_url: url });
      } else {
        showToast("Error al subir imagen");
      }
    } catch {
      showToast("Error al subir imagen");
    }
  }

  if (!authChecked) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "productos", label: "Productos" },
    { key: "pedidos", label: "Pedidos" },
    { key: "importar", label: "Importar" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Administrar Catalogos" />

      {/* Toast */}
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
            {/* PRODUCTOS TAB */}
            {tab === "productos" && (
              <ProductosTab
                products={products}
                getStock={getStock}
                editingId={editingId}
                editForm={editForm}
                saving={saving}
                setEditingId={setEditingId}
                setEditForm={setEditForm}
                handleSaveProduct={handleSaveProduct}
                handleTogglePopular={handleTogglePopular}
                handleToggleOnSale={handleToggleOnSale}
                handleUploadPhoto={handleUploadPhoto}
              />
            )}

            {/* PEDIDOS TAB */}
            {tab === "pedidos" && (
              <PedidosTab pedidos={pedidos} />
            )}

            {/* IMPORTAR TAB */}
            {tab === "importar" && (
              <ImportarTab showToast={showToast} onImportComplete={loadProducts} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── PRODUCTOS TAB ─────────────────────────────────────────────────────────────

function ProductosTab({
  products,
  getStock,
  editingId,
  editForm,
  saving,
  setEditingId,
  setEditForm,
  handleSaveProduct,
  handleTogglePopular,
  handleToggleOnSale,
  handleUploadPhoto,
}: {
  products: ReebokProduct[];
  getStock: (id: string) => number;
  editingId: string | null;
  editForm: Partial<ReebokProduct>;
  saving: boolean;
  setEditingId: (id: string | null) => void;
  setEditForm: (f: Partial<ReebokProduct>) => void;
  handleSaveProduct: (p: Partial<ReebokProduct>) => Promise<void>;
  handleTogglePopular: (p: ReebokProduct) => Promise<void>;
  handleToggleOnSale: (p: ReebokProduct) => Promise<void>;
  handleUploadPhoto: (productId: string, file: File) => Promise<void>;
}) {
  const sorted = [...products].sort((a, b) => {
    const stockA = getStock(a.id);
    const stockB = getStock(b.id);
    if (stockA > 0 && stockB === 0) return -1;
    if (stockA === 0 && stockB > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">{products.length} productos</p>

      <div className="space-y-2">
        {sorted.map((product) => {
          const stock = getStock(product.id);
          const isPopular = (product as ReebokProduct & { sub_category?: string }).sub_category === "popular";

          return (
            <div
              key={product.id}
              className={`bg-white border rounded-lg p-4 ${stock === 0 ? "opacity-50 border-gray-100" : "border-gray-200"}`}
            >
              {editingId === product.id ? (
                /* Edit mode */
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <input
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Nombre"
                      className="border border-gray-200 rounded-md px-3 py-2 text-sm col-span-2"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.price || ""}
                      onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                      placeholder="Precio"
                      className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                    />
                    <select
                      value={editForm.gender || ""}
                      onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                      className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Sin genero</option>
                      <option value="hombre">Hombre</option>
                      <option value="mujer">Mujer</option>
                      <option value="unisex">Unisex</option>
                      <option value="nino">Nino</option>
                    </select>
                    <select
                      value={editForm.category || "calzado"}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="calzado">Calzado</option>
                      <option value="ropa">Ropa</option>
                      <option value="accesorios">Accesorios</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveProduct({ id: product.id, ...editForm })}
                      disabled={saving}
                      className="px-3 py-1.5 bg-[#1A2656] text-white text-sm font-medium rounded-md active:scale-[0.97] transition disabled:opacity-50"
                    >
                      {saving ? "Guardando..." : "Guardar"}
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditForm({}); }}
                      className="px-3 py-1.5 text-gray-500 text-sm rounded-md hover:bg-gray-100 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="flex items-center gap-3">
                  {/* Image */}
                  <label className="w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden cursor-pointer relative group">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadPhoto(product.id, file);
                      }}
                    />
                  </label>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                      {isPopular && (
                        <span className="text-[10px] font-medium bg-[#E4002B]/10 text-[#E4002B] px-1.5 py-0.5 rounded">Popular</span>
                      )}
                      {!product.on_sale && (
                        <span className="text-[10px] font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Nuevo</span>
                      )}
                      {product.on_sale && (
                        <span className="text-[10px] font-medium bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">Oferta</span>
                      )}
                      {stock === 0 && (
                        <span className="text-[10px] font-medium bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Sin stock</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {product.sku || "—"} &middot; {product.category} &middot; {product.gender || "—"} &middot; Stock: {stock}
                    </p>
                  </div>

                  {/* Price */}
                  <p className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
                    ${fmtMoney(product.price || 0)}
                  </p>

                  {/* Toggles */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Popular star */}
                    <button
                      onClick={() => handleTogglePopular(product)}
                      title={isPopular ? "Quitar popular" : "Marcar popular"}
                      className={`text-lg transition ${isPopular ? "text-[#E4002B]" : "text-gray-300 hover:text-gray-400"}`}
                    >
                      ★
                    </button>
                    {/* on_sale toggle */}
                    <button
                      onClick={() => handleToggleOnSale(product)}
                      title={product.on_sale ? "Marcar como nuevo" : "Marcar como oferta"}
                      className={`w-8 h-5 rounded-full transition relative ${product.on_sale ? "bg-orange-500" : "bg-blue-500"}`}
                    >
                      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${product.on_sale ? "right-[3px]" : "left-[3px]"}`} />
                    </button>
                  </div>

                  {/* Edit button */}
                  <button
                    onClick={() => {
                      setEditingId(product.id);
                      setEditForm({
                        name: product.name,
                        price: product.price || 0,
                        gender: product.gender || "",
                        category: product.category,
                      });
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition flex-shrink-0"
                    title="Editar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PEDIDOS TAB ───────────────────────────────────────────────────────────────

function PedidosTab({ pedidos }: { pedidos: ReebokPedido[] }) {
  if (pedidos.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No hay pedidos aun</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Pedido</th>
            <th className="text-right px-4 py-3 font-medium text-gray-500">Items</th>
            <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pedidos.map((pedido) => (
            <tr key={pedido.id} className="hover:bg-gray-50 transition">
              <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(pedido.created_at)}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/pedido-reebok/${pedido.short_id}`}
                  className="text-[#1A2656] font-medium hover:underline"
                >
                  {pedido.short_id}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                {Array.isArray(pedido.items) ? pedido.items.length : 0}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                ${fmtMoney(pedido.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── IMPORTAR TAB ──────────────────────────────────────────────────────────────

function ImportarTab({
  showToast,
  onImportComplete,
}: {
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <ImportExcelSection showToast={showToast} onImportComplete={onImportComplete} />
      <BatchPhotosSection showToast={showToast} />
    </div>
  );
}

// ── Import Excel/CSV ──────────────────────────────────────────────────────────

function ImportExcelSection({
  showToast,
  onImportComplete,
}: {
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}) {
  const [parsed, setParsed] = useState<ImportProduct[] | null>(null);
  const [preview, setPreview] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const [currentSkusSet, setCurrentSkusSet] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleDownloadTemplate() {
    try {
      const res = await fetch("/api/catalogo/reebok/export-template");
      if (!res.ok) { showToast("Error al descargar plantilla"); return; }
      const rows = await res.json();

      const XLSX = await import("xlsx-js-style");
      const ws = XLSX.utils.json_to_sheet(
        rows.map((r: ImportProduct) => ({
          SKU: r.sku,
          Nombre: r.name,
          Precio: r.price,
          Cantidad: r.quantity,
          Genero: r.gender,
        }))
      );
      ws["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Productos");
      XLSX.writeFile(wb, `Reebok-Plantilla-${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast("Plantilla descargada");
    } catch {
      showToast("Error al generar plantilla");
    }
  }

  async function handleFile(file: File) {
    setImportResult(null);
    try {
      const XLSX = await import("xlsx-js-style");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      const products: ImportProduct[] = [];
      for (const row of json) {
        const keys = Object.keys(row);
        const skuKey = keys.find((k) => ["SKU", "CODIGO", "COD"].includes(k.toUpperCase().trim()));
        const nameKey = keys.find((k) => ["NOMBRE", "NAME", "DESCRIPCION"].includes(k.toUpperCase().trim()));
        const priceKey = keys.find((k) => ["PRECIO", "PRICE"].includes(k.toUpperCase().trim()));
        const qtyKey = keys.find((k) => ["CANTIDAD", "QUANTITY", "QTY", "STOCK"].includes(k.toUpperCase().trim()));
        const genderKey = keys.find((k) => ["GENERO", "GENDER", "GÉNERO"].includes(k.toUpperCase().trim()));

        const sku = String(skuKey ? row[skuKey] : "").trim();
        const name = String(nameKey ? row[nameKey] : "").trim();
        const price = parseFloat(String(priceKey ? row[priceKey] : "0")) || 0;
        const quantity = parseInt(String(qtyKey ? row[qtyKey] : "0")) || 0;
        const gender = String(genderKey ? row[genderKey] : "").trim();

        if (sku) {
          products.push({ sku, name: name || sku, price, quantity, gender });
        }
      }

      if (products.length === 0) {
        showToast("No se encontraron productos en el archivo");
        return;
      }

      const res = await fetch("/api/catalogo/reebok/export-template");
      const current: ImportProduct[] = res.ok ? await res.json() : [];
      const cSkus = new Set(current.map((p) => p.sku));
      const incomingSkus = new Set(products.map((p) => p.sku));

      let updated = 0;
      let created = 0;
      let zeroed = 0;

      for (const p of products) {
        if (cSkus.has(p.sku)) updated++;
        else created++;
      }
      for (const sku of cSkus) {
        if (!incomingSkus.has(sku)) zeroed++;
      }

      setParsed(products);
      setPreview({ updated, created, zeroed });
      setCurrentSkusSet(cSkus);
    } catch (err) {
      console.error("Parse error:", err);
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
        body: JSON.stringify({ products: parsed }),
      });
      if (res.ok) {
        const result = await res.json();
        setImportResult({ updated: result.updated, created: result.created, zeroed: result.zeroed });
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Actualizar inventario</h3>
      <p className="text-xs text-gray-400 mb-4">Descarga la plantilla, llena los datos y subela para actualizar inventario</p>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={handleDownloadTemplate}
          className="px-4 py-2 bg-[#1A2656] text-white text-sm font-medium rounded-lg hover:bg-[#1A2656]/90 active:scale-[0.97] transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Descargar plantilla
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
          dragOver ? "border-[#E4002B] bg-[#E4002B]/5" : "border-gray-200 hover:border-[#E4002B]"
        }`}
      >
        <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-gray-500">Arrastra un archivo .xlsx o .csv aqui</p>
        <p className="text-xs text-gray-400 mt-1">o haz click para seleccionar</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Preview */}
      {preview && parsed && (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">Vista previa de importacion</p>
            <div className="flex gap-4 mt-1 text-xs">
              <span className="text-blue-600">{preview.updated} a actualizar</span>
              <span className="text-green-600">{preview.created} nuevos</span>
              <span className="text-red-500">{preview.zeroed} se pondran en 0</span>
            </div>
          </div>

          {/* Preview table */}
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">SKU</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Nombre</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Precio</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Cant</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parsed.slice(0, 50).map((row, i) => {
                  const exists = currentSkusSet.has(row.sku);
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-gray-600">{row.sku}</td>
                      <td className="px-3 py-1.5 text-gray-900">{row.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${fmtMoney(row.price)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.quantity}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${exists ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
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

      {/* Import result */}
      {importResult && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-green-800">Importacion completada</p>
          <p className="text-xs text-green-600 mt-1">
            {importResult.updated} actualizados &middot; {importResult.created} nuevos &middot; {importResult.zeroed} puestos en 0
          </p>
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
      const matchedProduct = products.find(p =>
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
        className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-[#E4002B] transition cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-[#E4002B]", "bg-[#E4002B]/5"); }}
        onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove("border-[#E4002B]", "bg-[#E4002B]/5"); }}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.classList.remove("border-[#E4002B]", "bg-[#E4002B]/5");
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
      >
        <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Photo preview grid */}
      {matchResult && (
        <div className="mt-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
            {matchResult.matched.map((match, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border-2 border-green-300">
                <Image
                  src={match.preview}
                  alt={match.sku}
                  width={100}
                  height={100}
                  className="w-full aspect-square object-cover"
                  unoptimized
                />
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

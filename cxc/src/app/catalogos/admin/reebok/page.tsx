"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import Image from "next/image";
import Link from "next/link";
import { validateCsvImport, type CsvImportRow } from "@/lib/csv-import-validator";

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

interface ReebokPedido {
  id: string;
  short_id: string;
  items: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }[];
  total: number;
  created_at: string;
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

function downloadCSV(products: { sku: string; name: string; price: number; quantity: number; gender: string; badge: string }[], filename: string) {
  const header = "SKU,Nombre,Precio,Cantidad,Genero,Estado";
  const rows = products.map(p =>
    `${escapeCsvField(p.sku)},${escapeCsvField(p.name)},${p.price},${p.quantity},${escapeCsvField(p.gender)},${p.badge || ""}`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  const [pedidos, setPedidos] = useState<ReebokPedido[]>([]);
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
              <ProductosTab products={products} getStock={getStock} />
            )}
            {tab === "pedidos" && (
              <PedidosTab pedidos={pedidos} />
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

function ProductosTab({
  products,
  getStock,
}: {
  products: ReebokProduct[];
  getStock: (id: string) => number;
}) {
  const [search, setSearch] = useState("");

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const stockA = getStock(a.id);
    const stockB = getStock(b.id);
    if (stockA > 0 && stockB === 0) return -1;
    if (stockA === 0 && stockB > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
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

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
        {search && ` (de ${products.length})`}
      </p>

      <div className="space-y-2">
        {sorted.map((product) => {
          const stock = getStock(product.id);
          const badgeLabel = product.badge === "nuevo" ? "Nuevo" : product.badge === "oferta" ? "Oferta" : null;

          return (
            <div
              key={product.id}
              className={`bg-white border rounded-lg p-3 ${stock === 0 ? "opacity-40 border-gray-100" : "border-gray-200"}`}
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
                    {badgeLabel && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        product.badge === "oferta"
                          ? "bg-orange-50 text-orange-600"
                          : "bg-blue-50 text-blue-600"
                      }`}>
                        {badgeLabel}
                      </span>
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
              </div>
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
  const [preview, setPreview] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
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
    const rows = companyProducts.map((p) => ({
      sku: p.sku || "",
      name: p.name,
      price: p.price || 0,
      quantity: getProductStock(p.id),
      gender: p.gender || "",
      badge: p.badge || "",
    }));
    downloadCSV(rows, `Reebok_${title.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast("Plantilla descargada");
  }

  function handleFile(file: File) {
    setImportResult(null);
    setParsed(null);
    setPreview(null);
    setValidationErrors([]);
    setValidationWarnings([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const existingSkus = new Set(companyProducts.map((p) => p.sku).filter(Boolean) as string[]);
        const result = validateCsvImport(text, existingSkus);

        setValidationErrors(result.errors);
        setValidationWarnings(result.warnings);

        if (result.rows.length > 0) {
          setParsed(result.rows);
        }

        if (result.errors.length === 0 && result.summary) {
          setPreview({ updated: result.summary.update, created: result.summary.create, zeroed: result.summary.zero });
        }
      } catch {
        showToast("Error al leer el archivo");
      }
    };
    reader.readAsText(file);
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
        <p className="text-xs text-gray-400 mt-1">Arrastra un .csv o haz click</p>
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
              <span className="text-red-500">{preview.zeroed} se pondran en 0</span>
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

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import Image from "next/image";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JoybeesProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  gender: string;
  price: number;
  stock: number;
  image_url: string | null;
  active: boolean;
  badge: string | null;
  created_at: string;
}

interface JoybeesPedido {
  id: string;
  short_id: string;
  items: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }[];
  total: number;
  status: string;
  created_at: string;
}

interface ImportRow {
  sku: string;
  name: string;
  price: number;
  stock: number;
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

function downloadCSV(products: { sku: string; name: string; price: number; stock: number; gender: string; badge: string }[], filename: string) {
  const header = "SKU,Nombre,Precio,Cantidad,Genero,Estado";
  const rows = products.map(p =>
    `${escapeCsvField(p.sku)},${escapeCsvField(p.name)},${p.price},${p.stock},${escapeCsvField(p.gender)},${p.badge || ""}`
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

export default function JoybeesAdminPage() {
  const { authChecked } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: ["admin"],
  });

  const [tab, setTab] = useState<Tab>("productos");
  const [products, setProducts] = useState<JoybeesProduct[]>([]);
  const [pedidos, setPedidos] = useState<JoybeesPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/catalogo/joybees/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch { /* ignore */ }
  }, []);

  const loadPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/catalogo/joybees/pedidos");
      if (res.ok) {
        const data = await res.json();
        setPedidos(data);
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#404041] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]">
          {toast}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#FFE443] flex items-center justify-center">
            <span className="text-[#404041] font-extrabold text-sm">JB</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">JOYBEES</h1>
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
                  ? "bg-white text-[#404041] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#FFE443] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === "productos" && (
              <ProductosTab products={products} />
            )}
            {tab === "pedidos" && (
              <PedidosTab pedidos={pedidos} />
            )}
            {tab === "importar" && (
              <ImportarTab
                products={products}
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

function ProductosTab({ products }: { products: JoybeesProduct[] }) {
  const [search, setSearch] = useState("");

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.stock > 0 && b.stock === 0) return -1;
    if (a.stock === 0 && b.stock > 0) return 1;
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
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#FFE443] transition"
        />
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
        {search && ` (de ${products.length})`}
      </p>

      <div className="space-y-2">
        {sorted.map((product) => {
          const badgeLabel = product.badge === "nuevo" ? "Nuevo" : product.badge === "oferta" ? "Oferta" : null;

          return (
            <div
              key={product.id}
              className={`bg-white border rounded-lg p-3 ${product.stock === 0 ? "opacity-40 border-gray-100" : "border-gray-200"}`}
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
                    {product.stock === 0 && (
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Sin stock</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {product.sku} &middot; {product.category} &middot; {product.gender} &middot; Stock: {product.stock}
                  </p>
                </div>

                {/* Price */}
                <p className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
                  ${fmtMoney(product.price)}
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

function PedidosTab({ pedidos }: { pedidos: JoybeesPedido[] }) {
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
                  href={`/pedido-joybees/${pedido.short_id}`}
                  className="text-[#404041] font-medium hover:underline"
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
  showToast,
  onImportComplete,
}: {
  products: JoybeesProduct[];
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <ImportSection
        products={products}
        showToast={showToast}
        onImportComplete={onImportComplete}
      />
      <BatchPhotosSection products={products} showToast={showToast} onComplete={onImportComplete} />
    </div>
  );
}

// ── Import Section ────────────────────────────────────────────────────────────

function ImportSection({
  products,
  showToast,
  onImportComplete,
}: {
  products: JoybeesProduct[];
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}) {
  const [parsed, setParsed] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleDownloadTemplate() {
    const rows = products.map((p) => ({
      sku: p.sku,
      name: p.name,
      price: p.price,
      stock: p.stock,
      gender: p.gender,
      badge: p.badge || "",
    }));
    downloadCSV(rows, `Joybees_Plantilla_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast("Plantilla descargada");
  }

  function handleFile(file: File) {
    setImportResult(null);
    setParsed(null);
    setPreview(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = parseCSV(text);

        if (json.length === 0) {
          showToast("El archivo esta vacio");
          return;
        }

        const rows: ImportRow[] = json.map((row) => {
          const sku = String(row["SKU"] || row["sku"] || "").trim();
          const name = String(row["Nombre"] || row["nombre"] || row["Name"] || "").trim();
          const price = parseFloat(String(row["Precio"] || row["precio"] || row["Price"] || "0")) || 0;
          const stock = parseInt(String(row["Cantidad"] || row["cantidad"] || row["Stock"] || row["stock"] || row["Qty"] || "0")) || 0;
          const gender = String(row["Genero"] || row["genero"] || row["Gender"] || "unisex").trim();
          const estado = String(row["Estado"] || row["estado"] || "").trim();
          const badge = estado.toLowerCase() === "nuevo" ? "nuevo" : estado.toLowerCase() === "oferta" ? "oferta" : "";
          return { sku, name: name || sku, price, stock, gender, badge };
        }).filter((r) => r.sku);

        if (rows.length === 0) {
          showToast("No se encontraron filas con SKU valido");
          return;
        }

        const existingSkus = new Set(products.map((p) => p.sku));
        const incomingSkus = new Set(rows.map((r) => r.sku));

        let updated = 0;
        let created = 0;
        let zeroed = 0;

        for (const r of rows) {
          if (existingSkus.has(r.sku)) updated++;
          else created++;
        }
        for (const sku of existingSkus) {
          if (!incomingSkus.has(sku)) zeroed++;
        }

        setParsed(rows);
        setPreview({ updated, created, zeroed });
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
      const res = await fetch("/api/catalogo/joybees/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed }),
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
      <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Actualizar inventario</h3>
      <p className="text-xs text-gray-400 mb-4">{products.length} productos en catalogo</p>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={handleDownloadTemplate}
          className="px-4 py-2 bg-[#404041] text-white text-sm font-medium rounded-lg hover:bg-[#404041]/90 active:scale-[0.97] transition flex items-center gap-2"
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
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          dragOver ? "border-[#FFE443] bg-[#FFE443]/5" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <svg className="w-7 h-7 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-gray-500">Arrastra un archivo .csv aqui</p>
        <p className="text-xs text-gray-400 mt-1">o haz click para seleccionar</p>
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

      {/* Preview */}
      {preview && parsed && (
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
                  const exists = products.some((p) => p.sku === row.sku);
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-gray-600">{row.sku}</td>
                      <td className="px-3 py-1.5 text-gray-900">{row.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${fmtMoney(row.price)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.stock}</td>
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
              className="px-4 py-2 bg-[#FFE443] text-[#404041] text-sm font-semibold rounded-lg hover:bg-[#FFE443]/80 active:scale-[0.97] transition disabled:opacity-50"
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

function BatchPhotosSection({
  products,
  showToast,
  onComplete,
}: {
  products: JoybeesProduct[];
  showToast: (msg: string) => void;
  onComplete: () => Promise<void>;
}) {
  const [photoMatches, setPhotoMatches] = useState<{ file: File; sku: string; matched: boolean; preview: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoFiles(files: FileList) {
    const matches: { file: File; sku: string; matched: boolean; preview: string }[] = [];

    Array.from(files).forEach((file) => {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      const matchedSku = products.find((p) =>
        p.sku === nameWithoutExt ||
        p.sku.replace(/-/g, ".") === nameWithoutExt ||
        p.sku.replace(/[.\-_]/g, "").toUpperCase() === nameWithoutExt.replace(/[.\-_]/g, "").toUpperCase()
      );

      matches.push({
        file,
        sku: matchedSku?.sku || nameWithoutExt,
        matched: !!matchedSku,
        preview: URL.createObjectURL(file),
      });
    });

    setPhotoMatches(matches);
  }

  async function handleUploadBatchPhotos() {
    const matched = photoMatches.filter((m) => m.matched);
    if (matched.length === 0) {
      showToast("No hay fotos con SKU valido");
      return;
    }

    setUploadingPhotos(true);
    let uploaded = 0;

    for (const match of matched) {
      const product = products.find((p) =>
        p.sku === match.sku ||
        p.sku.replace(/-/g, ".") === match.sku ||
        p.sku.replace(/[.\-_]/g, "").toUpperCase() === match.sku.replace(/[.\-_]/g, "").toUpperCase()
      );
      if (!product) continue;

      const formData = new FormData();
      formData.append("file", match.file);
      try {
        const res = await fetch("/api/catalogo/joybees/upload", { method: "POST", body: formData });
        if (res.ok) {
          const { url } = await res.json();
          await fetch("/api/catalogo/joybees/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...product, image_url: url }),
          });
          uploaded++;
        }
      } catch { /* continue */ }
    }

    showToast(`${uploaded} foto${uploaded !== 1 ? "s" : ""} subida${uploaded !== 1 ? "s" : ""}`);
    setPhotoMatches([]);
    setUploadingPhotos(false);
    await onComplete();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Subir fotos en batch</h3>
      <p className="text-xs text-gray-400 mb-4">Selecciona imagenes nombradas por SKU (ej: UAACG-BLK-M.jpg)</p>

      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-[#FFE443] transition cursor-pointer"
        onClick={() => photoInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[#FFE443]", "bg-[#FFE443]/5"); }}
        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-[#FFE443]", "bg-[#FFE443]/5"); }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("border-[#FFE443]", "bg-[#FFE443]/5");
          if (e.dataTransfer.files.length > 0) handlePhotoFiles(e.dataTransfer.files);
        }}
      >
        <svg className="w-7 h-7 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-gray-500">Selecciona o arrastra imagenes</p>
        <p className="text-xs text-gray-400 mt-1">Nombra cada archivo con el SKU del producto</p>
      </div>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handlePhotoFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {photoMatches.length > 0 && (
        <div className="mt-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
            {photoMatches.map((match, i) => (
              <div key={i} className={`relative rounded-lg overflow-hidden border-2 ${match.matched ? "border-green-300" : "border-red-300"}`}>
                <Image
                  src={match.preview}
                  alt={match.sku}
                  width={100}
                  height={100}
                  className="w-full aspect-square object-cover"
                  unoptimized
                />
                <div className={`absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] font-mono truncate ${match.matched ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"}`}>
                  {match.sku}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">
              {photoMatches.filter((m) => m.matched).length} de {photoMatches.length} coinciden con un producto
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleUploadBatchPhotos}
                disabled={uploadingPhotos || photoMatches.filter((m) => m.matched).length === 0}
                className="px-4 py-2 bg-[#FFE443] text-[#404041] text-sm font-semibold rounded-lg hover:bg-[#FFE443]/80 active:scale-[0.97] transition disabled:opacity-50"
              >
                {uploadingPhotos ? "Subiendo..." : "Subir fotos"}
              </button>
              <button
                onClick={() => setPhotoMatches([])}
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

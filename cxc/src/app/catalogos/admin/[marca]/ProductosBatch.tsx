"use client";

// Tabs de productos estilo "batch" (MARCA_THEME.admin.productosStyle = "batch"
// — hoy Joybees): batch simple nombre=SKU + lista de filas con ocultar (las
// etiquetas se muestran tal cual, NO se editan — decisión del dueño) + tab
// Importar por plantilla como RESPALDO (solo por URL directa ?tab=importar; el
// catálogo se sincroniza por API desde Switch, cron de la marca).

import { useState, useRef } from "react";
import Image from "next/image";
import { validateCsvImport, type CsvImportRow } from "@/lib/csv-import-validator";
import { csvBlob } from "@/lib/csv-export";
import { validateProductPhoto, uploadProductPhoto, toggleProductOculto, editProductName } from "./photoUpload";
import { getMarcaTheme, type AdminProducto, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tieneFoto(p: AdminProducto): boolean {
  return !!(p.image_url && p.image_url.trim());
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
  const blob = csvBlob(csv);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── FALTAN FOTO TAB ───────────────────────────────────────────────────────────
// Subida masiva (nombre de archivo = SKU) + grid de los productos sin foto.

export function FaltanFotoBatchTab({
  marca,
  products,
  sinFoto,
  showToast,
  onComplete,
}: {
  marca: MarcaUiKey;
  /** Catálogo visible completo — para la subida masiva (permite reemplazar fotos). */
  products: AdminProducto[];
  /** Cola precomputada (AdminCatalogoClient): activos sin foto, orden
   *  disponibilidad desc — lo más vendible primero. */
  sinFoto: AdminProducto[];
  showToast: (msg: string) => void;
  onComplete: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        {sinFoto.length === 0
          ? "Todos los productos tienen foto 🎉"
          : `${sinFoto.length} producto${sinFoto.length === 1 ? "" : "s"} sin foto. Sube los archivos con el nombre = SKU; se emparejan solos.`}
      </p>

      <BatchPhotosSection marca={marca} products={products} showToast={showToast} onComplete={onComplete} />

      {sinFoto.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Pendientes de foto</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {sinFoto.map((p) => (
              <div key={p.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className="aspect-square rounded bg-gray-100 flex items-center justify-center text-gray-300 text-xs mb-2">
                  sin foto
                </div>
                <p className="text-[11px] font-mono text-gray-500 truncate" title={p.sku || ""}>{p.sku}</p>
                <p className="text-sm text-gray-900 truncate" title={p.name}>{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PRODUCTOS TAB (lista) ─────────────────────────────────────────────────────
// Subida de foto por fila. Las etiquetas (badge) se muestran tal cual — NO se
// editan aquí (decisión del dueño).

export function ProductosBatchListTab({
  marca,
  products,
  showToast,
  onComplete,
}: {
  marca: MarcaUiKey;
  products: AdminProducto[];
  showToast: (msg: string) => void;
  onComplete: () => Promise<void>;
}) {
  const theme = getMarcaTheme(marca)!;
  const [search, setSearch] = useState("");
  const [visibilidad, setVisibilidad] = useState<"visibles" | "ocultos">("visibles");

  const ocultosCount = products.filter((p) => p.oculto_manual === true).length;
  // Si ya no queda ningún oculto (se re-mostró el último), el filtro vuelve solo
  // a "visibles" — el selector desaparece y la lista no queda vacía.
  const visibilidadEfectiva = ocultosCount === 0 ? "visibles" : visibilidad;

  const filtered = products.filter((p) => {
    const oculto = p.oculto_manual === true;
    if (visibilidadEfectiva === "visibles" ? oculto : !oculto) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if ((a.stock ?? 0) > 0 && (b.stock ?? 0) === 0) return -1;
    if ((a.stock ?? 0) === 0 && (b.stock ?? 0) > 0) return 1;
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
          placeholder="Buscar por nombre o SKU…"
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#FFE443] transition"
        />
      </div>

      {/* Filtro del toggle "Ocultar del catálogo" — solo aparece si hay ocultos. */}
      {ocultosCount > 0 && (
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5 mb-4">
          {([
            { key: "visibles", label: "Visibles" },
            { key: "ocultos", label: `Ocultos (${ocultosCount})` },
          ] as const).map((o) => (
            <button
              key={o.key}
              onClick={() => setVisibilidad(o.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                visibilidadEfectiva === o.key ? theme.admin.tabActive : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
        {search && ` (de ${products.length})`}
      </p>

      <div className="space-y-2">
        {sorted.map((product) => (
          <ProductRow key={product.id} marca={marca} product={product} showToast={showToast} onComplete={onComplete} />
        ))}
      </div>
    </div>
  );
}

// ── Fila de producto con subida de foto por fila ──────────────────────────────

function ProductRow({
  marca,
  product,
  showToast,
  onComplete,
}: {
  marca: MarcaUiKey;
  product: AdminProducto;
  showToast: (msg: string) => void;
  onComplete: () => Promise<void>;
}) {
  const theme = getMarcaTheme(marca)!;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nombre editable inline (solo marcas con nombreEditable — Tommy): al guardar,
  // el endpoint marca nombre_manual=true y el sync deja de pisar el nombre.
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreDraft, setNombreDraft] = useState(product.name);
  const [savingNombre, setSavingNombre] = useState(false);

  async function guardarNombre() {
    const n = nombreDraft.trim();
    if (!n || n === product.name) {
      setEditandoNombre(false);
      setNombreDraft(product.name);
      return;
    }
    setSavingNombre(true);
    try {
      await editProductName(marca, { id: product.id, sku: product.sku || "" }, n);
      showToast("Listo, nombre guardado — el sync ya no lo cambia");
      setEditandoNombre(false);
      await onComplete();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar el nombre.");
    } finally {
      setSavingNombre(false);
    }
  }

  // Toggle "Ocultar del catálogo / Mostrar en catálogo" (oculto_manual) —
  // espejo EXACTO del estilo tarjetas: confirmación simple inline, sobrevive al sync.
  const oculto = product.oculto_manual === true;
  const [confirmandoOculto, setConfirmandoOculto] = useState(false);
  const [savingOculto, setSavingOculto] = useState(false);

  async function toggleOculto() {
    setSavingOculto(true);
    try {
      await toggleProductOculto(marca, { id: product.id, sku: product.sku || "" }, !oculto);
      showToast(oculto ? "Listo — el producto vuelve a verse en el catálogo" : "Listo — producto oculto del catálogo");
      await onComplete();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo actualizar el producto.");
    } finally {
      setSavingOculto(false);
      setConfirmandoOculto(false);
    }
  }

  const badgeLabel = product.badge === "nuevo" ? "Nuevo" : product.badge === "oferta" ? "Oferta" : null;

  async function handleFile(file: File) {
    setError(null);
    const vErr = validateProductPhoto(file);
    if (vErr) { setError(vErr); return; }
    setUploading(true);
    try {
      await uploadProductPhoto(marca, { id: product.id, sku: product.sku || "" }, file);
      showToast("Foto subida");
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className={`bg-white border rounded-lg p-3 ${product.stock === 0 ? "border-gray-100" : "border-gray-200"}`}
    >
      <div className="flex items-center gap-3">
        {/* Image */}
        <div className={`relative w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden ${product.stock === 0 ? "opacity-40" : ""}`}>
          {tieneFoto(product) ? (
            <Image
              src={product.image_url!}
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
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="w-4 h-4 border-2 border-[#404041] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className={`flex-1 min-w-0 ${product.stock === 0 ? "opacity-60" : ""}`}>
          <div className="flex items-center gap-2">
            {editandoNombre ? (
              <input
                value={nombreDraft}
                onChange={(e) => setNombreDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void guardarNombre();
                  if (e.key === "Escape") {
                    setEditandoNombre(false);
                    setNombreDraft(product.name);
                  }
                }}
                onBlur={() => void guardarNombre()}
                disabled={savingNombre}
                autoFocus
                maxLength={200}
                className="w-full max-w-xs text-sm font-semibold text-gray-900 bg-transparent border-b border-gray-300 outline-none focus:border-gray-500 py-0.5"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
            )}
            {theme.admin.nombreEditable && !editandoNombre && (
              <button
                type="button"
                title="Editar nombre (el sync deja de cambiarlo)"
                onClick={() => {
                  setNombreDraft(product.name);
                  setEditandoNombre(true);
                }}
                className="text-gray-300 hover:text-gray-500 transition flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {theme.admin.nombreEditable && product.nombre_manual === true && !editandoNombre && (
              <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded" title="Nombre editado a mano — el sync no lo cambia">
                editado
              </span>
            )}
            {badgeLabel && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                product.badge === "oferta"
                  ? "bg-orange-50 text-orange-600"
                  : "bg-blue-50 text-blue-600"
              }`}>
                {badgeLabel}
              </span>
            )}
            {product.stock === 0 && (
              <span className="text-xs font-medium bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Sin stock</span>
            )}
            {oculto && (
              <span className="text-xs font-bold bg-gray-700 text-white px-1.5 py-0.5 rounded">Oculto</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {product.sku} &middot; {product.category} &middot; {product.gender} &middot; Stock: {product.stock}
          </p>
          {error && <p className="text-[11px] text-red-500 leading-tight mt-1">{error}</p>}
        </div>

        {/* Price */}
        <p className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
          ${fmtMoney(product.price ?? 0)}
        </p>

        {/* Subir / cambiar foto */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); if (inputRef.current) inputRef.current.value = ""; }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 px-3 py-2 rounded-md text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50 transition whitespace-nowrap"
        >
          {uploading ? "Subiendo…" : tieneFoto(product) ? "Cambiar" : "Subir foto"}
        </button>

        {/* Ocultar / mostrar en el catálogo (sobrevive al sync). */}
        {confirmandoOculto ? (
          <div className="flex-shrink-0 flex items-center gap-1.5 text-xs">
            <span className="text-gray-500 whitespace-nowrap">{oculto ? "¿Mostrar?" : "¿Ocultar?"}</span>
            <button
              onClick={toggleOculto}
              disabled={savingOculto}
              className="px-2 py-1 rounded-md font-semibold bg-[#404041] text-white hover:bg-[#404041]/90 active:scale-[0.97] disabled:opacity-50 transition"
            >
              {savingOculto ? "…" : "Sí"}
            </button>
            <button
              onClick={() => setConfirmandoOculto(false)}
              disabled={savingOculto}
              className="px-2 py-1 rounded-md font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmandoOculto(true)}
            className={`flex-shrink-0 text-xs font-medium underline-offset-2 hover:underline transition whitespace-nowrap ${
              oculto ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {oculto ? "Mostrar en catálogo" : "Ocultar del catálogo"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── IMPORTAR TAB ──────────────────────────────────────────────────────────────

export function ImportarTab({
  marca,
  products,
  showToast,
  onImportComplete,
}: {
  marca: MarcaUiKey;
  products: AdminProducto[];
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <ImportSection
        marca={marca}
        products={products}
        showToast={showToast}
        onImportComplete={onImportComplete}
      />
    </div>
  );
}

// ── Import Section ────────────────────────────────────────────────────────────

function ImportSection({
  marca,
  products,
  showToast,
  onImportComplete,
}: {
  marca: MarcaUiKey;
  products: AdminProducto[];
  showToast: (msg: string) => void;
  onImportComplete: () => Promise<void>;
}) {
  const theme = getMarcaTheme(marca)!;
  const [parsed, setParsed] = useState<CsvImportRow[] | null>(null);
  const [preview, setPreview] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleDownloadTemplate() {
    const rows = products.map((p) => ({
      sku: p.sku || "",
      name: p.name,
      price: p.price ?? 0,
      stock: p.stock ?? 0,
      gender: p.gender || "",
      badge: p.badge || "",
    }));
    downloadCSV(rows, `${theme.label}_Plantilla_${new Date().toISOString().slice(0, 10)}.csv`);
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

      const existingSkus = new Set(products.map((p) => p.sku || ""));
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
  }

  async function handleConfirmImport() {
    if (!parsed) return;
    setImporting(true);
    try {
      // Map quantity -> stock for the import API
      const apiRows = parsed.map(r => ({ ...r, stock: r.quantity }));
      const res = await fetch(`${theme.api}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: apiRows }),
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

      {/* Aviso de reemplazo total: el archivo es la fuente de verdad completa */}
      <div className="mb-4 bg-amber-50 border border-amber-300 rounded-lg p-3">
        <div className="flex gap-2">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">Importante</p>
            <p>
              El archivo debe contener <strong>TODOS</strong> los productos de {theme.label}. Cualquier producto que no este en el archivo se desactiva y su stock pasa a 0. Para actualizar solo algunos, descarga primero la plantilla &mdash; ya trae todos los productos actuales &mdash; y edita sobre ella.
            </p>
          </div>
        </div>
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
        <p className="text-sm text-gray-500">Arrastra un .csv, .xlsx o .xls aquí</p>
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
                  const exists = products.some((p) => p.sku === row.sku);
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-gray-600">{row.sku}</td>
                      <td className="px-3 py-1.5 text-gray-900">{row.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${fmtMoney(row.price)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.quantity}</td>
                      <td className="px-3 py-1.5">
                        {row.badge ? (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            row.badge === "oferta" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                          }`}>
                            {row.badge === "oferta" ? "Oferta" : "Nuevo"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
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
  marca,
  products,
  showToast,
  onComplete,
}: {
  marca: MarcaUiKey;
  products: AdminProducto[];
  showToast: (msg: string) => void;
  onComplete: () => Promise<void>;
}) {
  const theme = getMarcaTheme(marca)!;
  const [photoMatches, setPhotoMatches] = useState<{ file: File; sku: string; matched: boolean; preview: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function findProductBySku(sku: string): AdminProducto | undefined {
    return products.find((p) =>
      p.sku === sku ||
      (p.sku || "").replace(/-/g, ".") === sku ||
      (p.sku || "").replace(/[.\-_]/g, "").toUpperCase() === sku.replace(/[.\-_]/g, "").toUpperCase()
    );
  }

  function handlePhotoFiles(files: FileList) {
    const matches: { file: File; sku: string; matched: boolean; preview: string }[] = [];

    Array.from(files).forEach((file) => {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      const matchedSku = findProductBySku(nameWithoutExt);

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
      const product = findProductBySku(match.sku);
      if (!product) continue;

      const formData = new FormData();
      formData.append("file", match.file);
      try {
        const res = await fetch(`${theme.api}/upload`, { method: "POST", body: formData });
        if (res.ok) {
          const { url } = await res.json();
          // Solo {sku, image_url}: el endpoint tiene allow-list y rechaza el resto.
          // Mandar el producto entero pisaría active/existencia/stock/price del cron.
          await fetch(`${theme.api}/products`, {
            method: theme.admin.productEdit.verb,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              theme.admin.productEdit.idField === "id"
                ? { id: product.id, image_url: url }
                : { sku: product.sku, image_url: url },
            ),
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
                <div className={`absolute bottom-0 left-0 right-0 px-1.5 py-1 text-xs font-mono truncate ${match.matched ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"}`}>
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

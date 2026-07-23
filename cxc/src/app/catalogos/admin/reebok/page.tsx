"use client";

import { useState, useCallback, useRef, useMemo, Suspense } from "react";
import useSWR from "swr";
import Image from "next/image";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import SyncNowButton from "@/components/shared/SyncNowButton";
import PedidosTab, { type UnifiedPedido } from "./PedidosTab";
import BulkPhotoUpload from "./BulkPhotoUpload";
import { validateProductPhoto, uploadProductPhoto, updateProductBadge } from "./photoUpload";

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
  existencia: number | null;
  disponibilidad: number | null;
  created_at: string;
  /** Toggle "Ocultar del catálogo" — puede faltar pre-migración (DDL 20260723120000). */
  oculto_manual?: boolean | null;
}

type Tab = "faltan-foto" | "completo" | "pedidos";
type CategoriaFilter = "todas" | "footwear" | "apparel" | "accessories";
type FotoFilter = "todos" | "con" | "sin";
type BadgeFilter = "todas" | "ninguno" | "nuevo" | "oferta" | "proximamente";
type VisibilidadFilter = "visibles" | "ocultos";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Label por categoría real. Reebok vive 100% en active_shoes (Active Wear quedó
// obsoleto); el grupo del catálogo ES la categoría: Footwear / Apparel / Accessories.
const CATEGORIA_LABEL: Record<string, string> = {
  footwear: "Footwear",
  apparel: "Apparel",
  accessories: "Accessories",
};
function categoriaLabel(cat: string): string {
  return CATEGORIA_LABEL[cat] ?? cat;
}

function tieneFoto(p: ReebokProduct): boolean {
  return !!(p.image_url && p.image_url.trim());
}

// Etiquetas (badge) manuales. Mismo set que valida el endpoint y que pinta el
// catálogo público. "" = sin etiqueta (se guarda como null).
const BADGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Sin etiqueta" },
  { value: "nuevo", label: "Nuevo" },
  { value: "oferta", label: "Oferta" },
  { value: "proximamente", label: "Próximamente" },
];
const BADGE_CHIP: Record<string, { label: string; cls: string }> = {
  nuevo: { label: "Nuevo", cls: "bg-[#1A2656] text-white" },
  oferta: { label: "Oferta", cls: "bg-[#E4002B] text-white" },
  proximamente: { label: "Próximamente", cls: "bg-amber-500 text-white" },
};

function relativo(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

const REEBOK_SWR_OPTS = { dedupingInterval: 60_000, revalidateOnFocus: true } as const;

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReebokAdminPage() {
  return (
    <Suspense>
      <ReebokCatalogoInner />
    </Suspense>
  );
}

function ReebokCatalogoInner() {
  const { authChecked } = useAuth({ moduleKey: "catalogos", allowedRoles: ["admin"] });

  const [tab, setTab] = useUrlState<Tab>("tab", "faltan-foto");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // scope=admin: catálogo vivo (active=true) + ocultados a mano (oculto_manual)
  // para poder revertir el toggle "Ocultar del catálogo" desde aquí.
  const { data: productsData, isLoading: productsLoading, mutate: mutateProducts } = useSWR<ReebokProduct[]>(
    authChecked ? "reebok-catalogo-products" : null,
    () => fetchJson<ReebokProduct[]>("/api/catalogo/reebok/products?scope=admin", []),
    REEBOK_SWR_OPTS,
  );
  const { data: pedidosData, mutate: mutatePedidos } = useSWR<UnifiedPedido[]>(
    authChecked ? "reebok-catalogo-pedidos" : null,
    () => fetchJson<UnifiedPedido[]>("/api/catalogo/reebok/pedidos-unificado", []),
    REEBOK_SWR_OPTS,
  );
  const { data: syncData, mutate: mutateSyncStatus } = useSWR<{ lastSync: string | null }>(
    authChecked ? "reebok-sync-status" : null,
    () => fetchJson<{ lastSync: string | null }>("/api/catalogo/reebok/sync-status", { lastSync: null }),
    REEBOK_SWR_OPTS,
  );

  const products = useMemo(() => productsData ?? [], [productsData]);
  // Visibles = catálogo vivo (los ocultados a mano solo aparecen en el filtro
  // "Ocultos" del catálogo completo — no ensucian métricas ni cola de fotos).
  const visibles = useMemo(() => products.filter((p) => p.oculto_manual !== true), [products]);
  const pedidos = pedidosData ?? [];
  const loading = productsLoading && !productsData;

  const metrics = useMemo(() => {
    const total = visibles.length;
    const sinFoto = visibles.filter((p) => !tieneFoto(p)).length;
    const footwear = visibles.filter((p) => p.category === "footwear").length;
    const apparel = visibles.filter((p) => p.category === "apparel").length;
    const accessories = visibles.filter((p) => p.category === "accessories").length;
    return { total, sinFoto, footwear, apparel, accessories };
  }, [visibles]);

  const reloadProducts = useCallback(async () => { await mutateProducts(); }, [mutateProducts]);
  const reloadPedidos = useCallback(async () => { await mutatePedidos(); }, [mutatePedidos]);

  async function excelSinFoto() {
    const sin = visibles.filter((p) => !tieneFoto(p));
    if (sin.length === 0) { showToast("No hay productos sin foto — todo al día."); return; }
    try {
      // Imports dinámicos: xlsx-js-style no entra al bundle inicial de la página.
      const [{ buildReebokSinFotoWorkbook }, { downloadWorkbook, exportFilename }] = await Promise.all([
        import("@/lib/catalogos/sinfoto-excel"),
        import("@/lib/excel-export"),
      ]);
      const wb = buildReebokSinFotoWorkbook(
        sin.map((p) => ({
          sku: p.sku || "",
          nombre: p.name || "",
          categoria: categoriaLabel(p.category),
          disponible: p.disponibilidad ?? "",
          existencia: p.existencia ?? "",
        })),
      );
      downloadWorkbook(wb, exportFilename("reebok-sin-foto"));
      showToast("Excel listo — revisa tu carpeta de descargas");
    } catch {
      showToast("No se pudo generar el Excel. Intenta de nuevo.");
    }
  }

  if (!authChecked) return null;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "faltan-foto", label: "Faltan foto", badge: metrics.sinFoto },
    { key: "completo", label: "Catálogo completo" },
    { key: "pedidos", label: "Pedidos" },
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
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1A2656] flex items-center justify-center">
              <span className="text-white font-extrabold text-xs tracking-tight">RBK</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Catálogo Reebok</h1>
              <p className="text-xs text-gray-400">
                Sincronizado con Switch {relativo(syncData?.lastSync ?? null)} · 1×/día
              </p>
              {/* "Actualizar ahora" (admin/secretaria) — sync del catálogo desde
                  Switch (active_shoes). Es el sync más pesado (~3 min). */}
              <SyncNowButton
                className="mt-1.5"
                opciones={[{ modulo: "catalogo-reebok" }]}
                subtext="tarda ~3 min"
                onSuccess={async () => {
                  await Promise.all([mutateProducts(), mutateSyncStatus()]);
                }}
              />
            </div>
          </div>
          <button
            onClick={excelSinFoto}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Excel sin foto
          </button>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <Metric label="Productos" value={metrics.total} />
          <Metric label="Sin foto" value={metrics.sinFoto} highlight={metrics.sinFoto > 0} />
          <Metric label="Footwear" value={metrics.footwear} />
          <Metric label="Apparel" value={metrics.apparel} />
          <Metric label="Accessories" value={metrics.accessories} />
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition flex items-center justify-center gap-1.5 ${
                tab === t.key ? "bg-white text-[#1A2656] shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-bold rounded-full bg-[#E4002B] text-white">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#E4002B] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === "faltan-foto" && (
              <FaltanFotoTab products={visibles} onPhotoSaved={reloadProducts} showToast={showToast} />
            )}
            {tab === "completo" && (
              <CatalogoCompletoTab products={products} onPhotoSaved={reloadProducts} showToast={showToast} />
            )}
            {tab === "pedidos" && (
              <PedidosTab pedidos={pedidos} onRefresh={reloadPedidos} showToast={showToast} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Resumen ─────────────────────────────────────────────────────────────────

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-[#E4002B]/30 bg-[#E4002B]/5" : "border-gray-200 bg-white"}`}>
      <div className={`text-2xl font-bold tabular-nums ${highlight ? "text-[#E4002B]" : "text-[#1A2656]"}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// ── Tab: Faltan foto (cola de trabajo) ────────────────────────────────────────

function FaltanFotoTab({
  products, onPhotoSaved, showToast,
}: {
  products: ReebokProduct[];
  onPhotoSaved: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const sinFoto = products.filter((p) => !tieneFoto(p));

  return (
    <div>
      {/* Subida masiva: asigna por nombre=SKU contra TODOS los productos (permite
          también reemplazar fotos existentes). La subida por tarjeta sigue abajo. */}
      <BulkPhotoUpload products={products} onDone={onPhotoSaved} showToast={showToast} />

      {sinFoto.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium">Todo al día</p>
          <p className="text-gray-400 text-sm mt-1">Ningún producto activo sin foto.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {sinFoto.map((p) => (
            <ProductPhotoCard key={p.id} product={p} onPhotoSaved={onPhotoSaved} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Catálogo completo ────────────────────────────────────────────────────

function CatalogoCompletoTab({
  products, onPhotoSaved, showToast,
}: {
  products: ReebokProduct[];
  onPhotoSaved: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaFilter>("todas");
  const [foto, setFoto] = useState<FotoFilter>("todos");
  const [badge, setBadge] = useState<BadgeFilter>("todas");
  const [visibilidad, setVisibilidad] = useState<VisibilidadFilter>("visibles");
  const [search, setSearch] = useState("");

  const ocultosCount = products.filter((p) => p.oculto_manual === true).length;
  // Si ya no queda ningún oculto (se re-mostró el último), el filtro vuelve solo
  // a "visibles" — el segmented desaparece y la lista no queda vacía.
  const visibilidadEfectiva: VisibilidadFilter = ocultosCount === 0 ? "visibles" : visibilidad;

  const filtered = products
    .filter((p) => {
      const oculto = p.oculto_manual === true;
      if (visibilidadEfectiva === "visibles" ? oculto : !oculto) return false;
      if (categoria !== "todas" && p.category !== categoria) return false;
      if (foto === "con" && !tieneFoto(p)) return false;
      if (foto === "sin" && tieneFoto(p)) return false;
      if (badge !== "todas") {
        const b = p.badge ?? null;
        if (badge === "ninguno" ? b !== null : b !== badge) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!(p.sku || "").toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    // Orden alfabético por nombre ascendente (locale es).
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const categoriaTabs: { key: CategoriaFilter; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "footwear", label: "Footwear" },
    { key: "apparel", label: "Apparel" },
    { key: "accessories", label: "Accessories" },
  ];
  const fotoTabs: { key: FotoFilter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "con", label: "Con foto" },
    { key: "sin", label: "Sin foto" },
  ];
  const badgeTabs: { key: BadgeFilter; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "ninguno", label: "Sin etiqueta" },
    { key: "nuevo", label: "Nuevo" },
    { key: "oferta", label: "Oferta" },
    { key: "proximamente", label: "Próximamente" },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o nombre…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1A2656]/30 transition"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented options={categoriaTabs} value={categoria} onChange={setCategoria} />
        <Segmented options={fotoTabs} value={foto} onChange={setFoto} />
        <Segmented options={badgeTabs} value={badge} onChange={setBadge} />
        {/* Filtro del toggle "Ocultar del catálogo" — solo aparece si hay ocultos. */}
        {ocultosCount > 0 && (
          <Segmented
            options={[
              { key: "visibles" as VisibilidadFilter, label: "Visibles" },
              { key: "ocultos" as VisibilidadFilter, label: `Ocultos (${ocultosCount})` },
            ]}
            value={visibilidadEfectiva}
            onChange={setVisibilidad}
          />
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} productos</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">Ningún producto coincide.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <ProductListRow key={p.id} product={p} onPhotoSaved={onPhotoSaved} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
            value === o.key ? "bg-white text-[#1A2656] shadow-sm" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Acciones de producto (foto + etiqueta), compartidas por tarjeta y fila ─────

function useProductActions(
  product: ReebokProduct,
  onPhotoSaved: () => Promise<void>,
  showToast: (msg: string) => void,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edición de etiqueta (badge). El optimista vive en `pendingBadge` solo mientras
  // guarda; la fuente de verdad es product.badge (revalida SWR tras el PUT) — así
  // se evita el bug de useState seedeado de props que queda stale.
  const [pendingBadge, setPendingBadge] = useState<string | null>(null);
  const [savingBadge, setSavingBadge] = useState(false);
  const [badgeSaved, setBadgeSaved] = useState(false);
  const currentBadge = savingBadge ? pendingBadge : product.badge;
  const chip = currentBadge ? BADGE_CHIP[currentBadge] : null;

  async function handleBadgeChange(raw: string) {
    const next = raw === "" ? null : raw;
    if (next === (product.badge ?? null)) return;
    setPendingBadge(next);
    setSavingBadge(true);
    setBadgeSaved(false);
    try {
      await updateProductBadge(product.id, next);
      await onPhotoSaved(); // revalida → product.badge se actualiza
      setBadgeSaved(true);
      setTimeout(() => setBadgeSaved(false), 2000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar la etiqueta.");
    } finally {
      setSavingBadge(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    const vErr = validateProductPhoto(file);
    if (vErr) { setError(vErr); return; }
    setUploading(true);
    try {
      await uploadProductPhoto(product.id, product.sku || "", file);
      showToast("Foto subida");
      await onPhotoSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setUploading(false);
    }
  }

  // Toggle "Ocultar del catálogo / Mostrar en catálogo" (oculto_manual).
  // Confirmación simple inline (dos clicks); el flag sobrevive al sync.
  const oculto = product.oculto_manual === true;
  const [confirmandoOculto, setConfirmandoOculto] = useState(false);
  const [savingOculto, setSavingOculto] = useState(false);

  async function toggleOculto() {
    setSavingOculto(true);
    try {
      const res = await fetch("/api/catalogo/reebok/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, oculto: !oculto }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "No se pudo actualizar el producto.");
      }
      showToast(oculto ? "Listo — el producto vuelve a verse en el catálogo" : "Listo — producto oculto del catálogo");
      await onPhotoSaved(); // revalida la lista
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo actualizar el producto.");
    } finally {
      setSavingOculto(false);
      setConfirmandoOculto(false);
    }
  }

  return {
    inputRef, uploading, error, handleFile, currentBadge, savingBadge, badgeSaved, chip, handleBadgeChange,
    oculto, confirmandoOculto, setConfirmandoOculto, savingOculto, toggleOculto,
  };
}

// Botón del toggle con confirmación simple inline (compartido tarjeta/fila).
function OcultarToggle({
  oculto, confirmando, saving, onConfirmStart, onCancel, onConfirm,
}: {
  oculto: boolean;
  confirmando: boolean;
  saving: boolean;
  onConfirmStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (confirmando) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-gray-500">{oculto ? "¿Mostrar en catálogo?" : "¿Ocultar del catálogo?"}</span>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="px-2 py-1 rounded-md font-semibold bg-[#1A2656] text-white hover:bg-[#1A2656]/90 active:scale-[0.97] disabled:opacity-50 transition"
        >
          {saving ? "…" : "Sí"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-2 py-1 rounded-md font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition"
        >
          No
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onConfirmStart}
      className={`text-xs font-medium underline-offset-2 hover:underline transition ${
        oculto ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"
      }`}
    >
      {oculto ? "Mostrar en catálogo" : "Ocultar del catálogo"}
    </button>
  );
}

// ── Tarjeta de producto con subida de foto ────────────────────────────────────

function ProductPhotoCard({
  product, onPhotoSaved, showToast,
}: {
  product: ReebokProduct;
  onPhotoSaved: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const {
    inputRef, uploading, error, handleFile, currentBadge, savingBadge, badgeSaved, chip, handleBadgeChange,
    oculto, confirmandoOculto, setConfirmandoOculto, savingOculto, toggleOculto,
  } = useProductActions(product, onPhotoSaved, showToast);
  const disp = product.disponibilidad;
  const exist = product.existencia;
  const agotado = disp == null || disp <= 0;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden flex flex-col ${oculto ? "border-gray-100 opacity-80" : "border-gray-200"}`}>
      {/* Imagen / placeholder */}
      <div className="relative aspect-square bg-[#F5F0E8]">
        {oculto && (
          <span className="absolute top-2 right-2 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">
            Oculto
          </span>
        )}
        {chip && (
          <span className={`absolute top-2 left-2 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded ${chip.cls}`}>
            {chip.label}
          </span>
        )}
        {tieneFoto(product) ? (
          <Image src={product.image_url!} alt={product.name} fill sizes="(max-width:640px) 50vw, 25vw" className="object-contain" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#1A2656]/30 gap-1">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
            <span className="text-[11px] font-medium">Sin foto</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="w-6 h-6 border-2 border-[#1A2656] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Datos */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {product.sku && (
          <span className="self-start text-[11px] bg-[#F5F0E8] text-[#1A2656]/60 px-1.5 py-0.5 rounded font-medium tabular-nums">
            {product.sku}
          </span>
        )}
        <h3 className="text-sm font-semibold text-[#1A2656] line-clamp-2 leading-snug">{product.name}</h3>

        {product.price != null && (
          <div className="text-sm font-bold text-[#1A2656] tabular-nums">${product.price.toFixed(2)}</div>
        )}

        {/* Disponible (principal) + En bodega (secundario) */}
        <div className="flex items-baseline justify-between gap-2 pt-1 mt-auto border-t border-[#1A2656]/10">
          <span className={`text-sm font-semibold tabular-nums ${agotado ? "text-[#1A2656]/40" : "text-[#1A2656]"}`}>
            {agotado ? "Agotado" : `Disponible: ${disp}`}
          </span>
          <span className="text-xs text-[#1A2656]/45 tabular-nums">En bodega: {exist == null ? "—" : exist}</span>
        </div>

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
          className={`mt-1.5 w-full py-2 rounded-md text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50 ${
            tieneFoto(product)
              ? "border border-gray-200 text-gray-600 hover:bg-gray-50"
              : "bg-[#1A2656] text-white hover:bg-[#1A2656]/90"
          }`}
        >
          {uploading ? "Subiendo…" : tieneFoto(product) ? "Cambiar foto" : "Subir foto"}
        </button>
        {error && <p className="text-[11px] text-[#E4002B] leading-tight">{error}</p>}

        {/* Etiqueta manual (badge). No toca inventario — solo la etiqueta visual. */}
        <div className="mt-1.5 pt-2 border-t border-[#1A2656]/10">
          <div className="flex items-center justify-between mb-1">
            <label htmlFor={`badge-${product.id}`} className="text-[11px] font-medium text-gray-500">Etiqueta</label>
            {savingBadge ? (
              <span className="text-[10px] text-gray-400 inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                Guardando…
              </span>
            ) : badgeSaved ? (
              <span className="text-[10px] text-emerald-600 font-medium inline-flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                Guardado
              </span>
            ) : null}
          </div>
          <select
            id={`badge-${product.id}`}
            value={currentBadge ?? ""}
            disabled={savingBadge}
            onChange={(e) => handleBadgeChange(e.target.value)}
            className="w-full py-1.5 px-2 rounded-md border border-gray-200 text-xs text-[#1A2656] bg-white outline-none focus:border-[#1A2656]/40 disabled:opacity-50 transition"
          >
            {BADGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Ocultar / mostrar en el catálogo (sobrevive al sync). */}
        <div className="mt-1.5 pt-2 border-t border-[#1A2656]/10">
          <OcultarToggle
            oculto={oculto}
            confirmando={confirmandoOculto}
            saving={savingOculto}
            onConfirmStart={() => setConfirmandoOculto(true)}
            onCancel={() => setConfirmandoOculto(false)}
            onConfirm={toggleOculto}
          />
        </div>
      </div>
    </div>
  );
}

// ── Fila de producto (vista lista densa) ──────────────────────────────────────

function ProductListRow({
  product, onPhotoSaved, showToast,
}: {
  product: ReebokProduct;
  onPhotoSaved: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const {
    inputRef, uploading, error, handleFile, currentBadge, savingBadge, badgeSaved, chip, handleBadgeChange,
    oculto, confirmandoOculto, setConfirmandoOculto, savingOculto, toggleOculto,
  } = useProductActions(product, onPhotoSaved, showToast);
  const disp = product.disponibilidad;
  const exist = product.existencia;
  const agotado = disp == null || disp <= 0;

  return (
    <div className={`flex items-center gap-3 bg-white border rounded-lg p-2.5 ${oculto ? "border-gray-100 opacity-80" : "border-gray-200"}`}>
      {/* Miniatura */}
      <div className="relative w-[88px] h-[88px] shrink-0 rounded-md overflow-hidden bg-[#F5F0E8]">
        {chip && (
          <span className={`absolute top-1 left-1 z-10 text-[9px] font-bold px-1 py-0.5 rounded ${chip.cls}`}>{chip.label}</span>
        )}
        {tieneFoto(product) ? (
          <Image src={product.image_url!} alt={product.name} fill sizes="88px" className="object-contain" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#1A2656]/30">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-[#1A2656] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Datos en línea */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {product.sku && (
            <span className="shrink-0 text-[11px] bg-[#F5F0E8] text-[#1A2656]/60 px-1.5 py-0.5 rounded font-medium tabular-nums">{product.sku}</span>
          )}
          <h3 className="text-sm font-semibold text-[#1A2656] truncate">{product.name}</h3>
          {oculto && (
            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Oculto</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs">
          {product.price != null && (
            <span className="font-bold text-[#1A2656] tabular-nums">${product.price.toFixed(2)}</span>
          )}
          <span className={`tabular-nums ${agotado ? "text-[#1A2656]/40" : "text-[#1A2656]/80"}`}>
            {agotado ? "Agotado" : `Disp: ${disp}`}
          </span>
          <span className="text-[#1A2656]/45 tabular-nums">Bodega: {exist == null ? "—" : exist}</span>
        </div>
        {error && <p className="text-[11px] text-[#E4002B] leading-tight mt-1">{error}</p>}
      </div>

      {/* Controles a la derecha */}
      <div className="shrink-0 flex items-center gap-2">
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
          className="px-3 py-2 rounded-md text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50 transition whitespace-nowrap"
        >
          {uploading ? "Subiendo…" : tieneFoto(product) ? "Cambiar" : "Subir foto"}
        </button>
        <div className="flex flex-col items-end gap-0.5">
          <select
            value={currentBadge ?? ""}
            disabled={savingBadge}
            onChange={(e) => handleBadgeChange(e.target.value)}
            aria-label={`Etiqueta de ${product.name}`}
            className="py-2 px-2 rounded-md border border-gray-200 text-xs text-[#1A2656] bg-white outline-none focus:border-[#1A2656]/40 disabled:opacity-50 transition"
          >
            {BADGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {savingBadge ? (
            <span className="text-[10px] text-gray-400">Guardando…</span>
          ) : badgeSaved ? (
            <span className="text-[10px] text-emerald-600 font-medium">✓ Guardado</span>
          ) : null}
          <OcultarToggle
            oculto={oculto}
            confirmando={confirmandoOculto}
            saving={savingOculto}
            onConfirmStart={() => setConfirmandoOculto(true)}
            onCancel={() => setConfirmandoOculto(false)}
            onConfirm={toggleOculto}
          />
        </div>
      </div>
    </div>
  );
}

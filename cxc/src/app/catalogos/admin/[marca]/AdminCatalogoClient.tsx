"use client";

// Shell del admin de catálogos — ÚNICO por marca (PR-2). El encabezado,
// métricas, tabs y data-layer (SWR) son compartidos; el contenido del tab de
// productos depende del estilo de la marca (MARCA_THEME.admin.productosStyle):
//   · "tarjetas" (Reebok): bulk upload por SKU + tarjetas con etiqueta/stock/
//     ocultar + catálogo completo con filtros.
//   · "batch" (Joybees): batch simple nombre=SKU + lista con ocultar + tab
//     Importar de respaldo (solo por URL ?tab=importar).

import { useState, useCallback, useMemo, Suspense } from "react";
import useSWR from "swr";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { FaltanFotoTarjetasTab, CatalogoCompletoTab } from "./ProductosTarjetas";
import { FaltanFotoBatchTab, ProductosBatchListTab, ImportarTab } from "./ProductosBatch";
import { getMarcaTheme, type AdminProducto, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { catalogoAdminRoles } from "@/lib/catalogo/roles";
import { colaSinFoto } from "@/lib/catalogos/fotos-faltantes";
import { normalizarSkuStorage } from "@/lib/catalogos/fotos-b2b";
import { contarAlternativas, type StorageMarcaKey } from "@/lib/catalogos/variantes-paths";

/** Respuesta de GET /products/variantes (sin `sku`): el mapa completo de la marca. */
interface VariantesResp {
  skus: string[];
  /** skuStorage → vistas guardadas. Ausente = ese SKU no tiene carpeta. */
  vistas: Record<string, number[]>;
  /** false = no se pudo leer el contenido; el cliente asume que SÍ hay alternativas. */
  exacto: boolean;
}

// 🔴 `pedidos` YA NO ES UNA PESTAÑA DE ESTE PANEL (25-ago-2026). Los
// comprobantes son UNA pantalla propia, la misma para los tres roles:
// `/catalogo/<marca>/pedidos`. La `key` vieja no murió — `page.tsx` redirige
// `?tab=pedidos` allá, así que el marcador guardado sigue llegando.
type Tab = "faltan-foto" | "completo" | "importar";

const ADMIN_SWR_OPTS = { dedupingInterval: 60_000, revalidateOnFocus: true } as const;

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export default function AdminCatalogoClient({ marca }: { marca: MarcaUiKey }) {
  return (
    <Suspense>
      <AdminCatalogoInner marca={marca} />
    </Suspense>
  );
}

function AdminCatalogoInner({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  // Administrar catálogos = admin + secretaria (fuente única en lib/catalogo/roles).
  const { authChecked } = useAuth({ moduleKey: "catalogos", allowedRoles: catalogoAdminRoles() });

  const [tab, setTab] = useUrlState<Tab>("tab", "faltan-foto");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const { data: productsData, isLoading: productsLoading, mutate: mutateProducts } = useSWR<AdminProducto[]>(
    authChecked ? `${marca}-catalogo-products` : null,
    () => fetchJson<AdminProducto[]>(theme.admin.productsUrl, []),
    ADMIN_SWR_OPTS,
  );
  const { data: syncData, mutate: mutateSyncStatus } = useSWR<{ lastSync: string | null }>(
    authChecked ? `${marca}-sync-status` : null,
    () => fetchJson<{ lastSync: string | null }>(`${theme.api}/sync-status`, { lastSync: null }),
    ADMIN_SWR_OPTS,
  );
  // Qué SKUs tienen fotos del banco B2B guardadas — UNA petición para todo el
  // catálogo (en vez de una por fila) que habilita el botón "Cambiar foto".
  const { data: variantesData, mutate: mutateVariantes } = useSWR<VariantesResp>(
    authChecked ? `${marca}-catalogo-variantes` : null,
    () => fetchJson<VariantesResp>(`${theme.api}/products/variantes`, { skus: [], vistas: {}, exacto: true }),
    ADMIN_SWR_OPTS,
  );

  const products = useMemo(() => productsData ?? [], [productsData]);
  // Visibles = catálogo vivo: sin ocultados a mano (oculto_manual) NI ocultos
  // por el sync (active=false — en Joybees/Tommy el GET admin también trae los
  // inactivos, que no deben ensuciar métricas ni cola de fotos; en Reebok el
  // scope=admin ya filtra y esto es no-op).
  const visibles = useMemo(
    () => products.filter((p) => p.oculto_manual !== true && p.active !== false),
    [products],
  );
  // Cola "Faltan foto": visibles sin foto, ordenados por disponibilidad desc
  // (lo más vendible primero). Regla única en lib/catalogos/fotos-faltantes.ts.
  const sinFoto = useMemo(() => colaSinFoto(visibles), [visibles]);
  const loading = productsLoading && !productsData;

  const metrics = useMemo(() => theme.admin.metrics(visibles), [theme, visibles]);
  const sinFotoCount = sinFoto.length;

  // Cuántas fotos ALTERNATIVAS tiene cada SKU — o sea, distintas a la que ya
  // está puesta. Se calcula UNA vez para toda la lista, con datos que ya
  // llegaron: cero consultas por fila.
  //
  // 🩸 No alcanza con "existe la carpeta _v/{sku}/": tras la limpieza del banco
  // esa carpeta conserva UN archivo, que es justamente la foto elegida. Ese era
  // el bug de `THS10159C000` — botón visible que al tocarlo decía que no había
  // más fotos.
  const alternativasPorSku = useMemo(() => {
    const vistas = variantesData?.vistas ?? {};
    const exacto = variantesData?.exacto !== false;
    const out = new Map<string, number>();
    for (const p of products) {
      if (!p.sku) continue;
      const key = normalizarSkuStorage(p.sku);
      out.set(key, contarAlternativas(vistas[key], p.image_url, marca as StorageMarcaKey, p.sku, exacto));
    }
    return out;
  }, [products, variantesData, marca]);
  const tieneVariantes = useCallback(
    (sku: string | null) => (sku ? alternativasPorSku.get(normalizarSkuStorage(sku)) ?? 0 : 0),
    [alternativasPorSku],
  );

  const reloadProducts = useCallback(async () => { await mutateProducts(); }, [mutateProducts]);
  // Tras el ZIP hay que revalidar productos Y la lista de variantes.
  const reloadTrasZip = useCallback(async () => {
    await Promise.all([mutateProducts(), mutateVariantes()]);
  }, [mutateProducts, mutateVariantes]);

  async function excelSinFoto() {
    // Mismo conjunto y orden que la pestaña "Faltan foto" (cola sinFoto).
    if (sinFoto.length === 0) { showToast("No hay productos sin foto — todo al día."); return; }
    try {
      await theme.admin.excelSinFoto(sinFoto);
      showToast("Excel listo — revisa tu carpeta de descargas");
    } catch {
      showToast("No se pudo generar el Excel. Intenta de nuevo.");
    }
  }

  if (!authChecked) return null;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    theme.admin.fotoTabBadge === "chip"
      ? { key: "faltan-foto", label: "Faltan foto", badge: sinFotoCount }
      : { key: "faltan-foto", label: sinFotoCount > 0 ? `Faltan foto (${sinFotoCount})` : "Faltan foto" },
    { key: "completo", label: "Catálogo completo" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catálogos" />

      {toast && (
        <div className={theme.admin.toastBg}>
          {toast}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            {theme.logos.admin()}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{theme.admin.titulo}</h1>
              <p className="text-xs text-gray-400">
                {theme.admin.subtituloSync(syncData?.lastSync ?? null)}
              </p>
              {/* "Actualizar ahora" (admin/secretaria) — sync del catálogo desde
                  Switch (empresa de la marca). */}
              <SyncNowButton
                className="mt-1.5"
                opciones={[{ modulo: theme.admin.syncModulo }]}
                subtext={theme.admin.syncSubtext}
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
          {metrics.map((m) => (
            <Metric key={m.label} marca={marca} label={m.label} value={m.value} highlight={m.highlight} />
          ))}
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition flex items-center justify-center gap-1.5 ${
                tab === t.key ? theme.admin.tabActive : "text-gray-400 hover:text-gray-600"
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
            <div className={theme.admin.spinner} />
          </div>
        ) : (
          <>
            {tab === "faltan-foto" && (
              theme.admin.productosStyle === "tarjetas" ? (
                <FaltanFotoTarjetasTab marca={marca} products={visibles} sinFoto={sinFoto} onPhotoSaved={reloadProducts} onZipDone={reloadTrasZip} tieneVariantes={tieneVariantes} showToast={showToast} />
              ) : (
                <FaltanFotoBatchTab marca={marca} products={visibles} sinFoto={sinFoto} showToast={showToast} onComplete={reloadProducts} onZipDone={reloadTrasZip} tieneVariantes={tieneVariantes} />
              )
            )}
            {tab === "completo" && (
              theme.admin.productosStyle === "tarjetas" ? (
                <CatalogoCompletoTab marca={marca} products={products} onPhotoSaved={reloadProducts} tieneVariantes={tieneVariantes} showToast={showToast} />
              ) : (
                <ProductosBatchListTab marca={marca} products={products} showToast={showToast} onComplete={reloadProducts} tieneVariantes={tieneVariantes} />
              )
            )}
            {tab === "importar" && theme.admin.importarTab && (
              <ImportarTab marca={marca} products={products} showToast={showToast} onImportComplete={reloadProducts} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Resumen ─────────────────────────────────────────────────────────────────

function Metric({ marca, label, value, highlight }: { marca: MarcaUiKey; label: string; value: number; highlight?: boolean }) {
  const theme = getMarcaTheme(marca)!;
  return (
    <div className={`rounded-lg border p-3 ${highlight ? theme.admin.metricHighlightBox : "border-gray-200 bg-white"}`}>
      <div className={`text-2xl font-bold tabular-nums ${highlight ? theme.admin.metricHighlightValue : theme.admin.metricValue}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

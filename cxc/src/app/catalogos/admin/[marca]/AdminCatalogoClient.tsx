"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «Administrar» el catálogo — UNA pantalla, UNA lista, para las cuatro marcas.
// Rediseño del 6-sep-2026, aprobado punto por punto por Daniel.
//
// 🩸 SE ENTRABA A UNA PESTAÑA VACÍA. Eran dos pestañas —«Faltan foto» y
// «Catálogo completo»— y abría la de fotos. En Reebok hay 0 productos sin foto,
// así que lo primero que se veía al entrar era «Ningún producto activo sin
// foto» y dos cajas de arrastre: dos pantallas de alto, y para llegar a los
// productos había que tocar la otra pestaña. Ahora hay UNA lista y «Sin foto»
// es un chip más.
//
// 🩸 LOS MISMOS NÚMEROS ESTABAN DOS VECES. Arriba cinco tarjetas
// —`232 Productos · 0 Sin foto · 162 Footwear · 54 Apparel · 16 Accessories`—
// y justo debajo los mismos números como chips, en inglés. Quedó UNA fila:
// `Todos 232 · Calzado 162 · Ropa 54 · Accesorios 16 · Sin foto 0 ·
// Escondidos 1`. 🔴 Los números se CALCULAN (`admin-chips.ts`) y los nombres
// de categoría salen del mapa que ya existe por marca, nunca de una traducción
// escrita acá.
//
// 🔴 Se retiraron de la pantalla la ETIQUETA (Nuevo/Oferta/Próximamente), el
// NOMBRE editado a mano y la importación por plantilla de Joybees: 0 usos
// medidos el 6-sep-2026. Las COLUMNAS de la base no se dropean.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState, Suspense } from "react";
import useSWR from "swr";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { FiltroDesplegable } from "@/components/catalogo/CatalogoFilters";
import SubirFotos from "./SubirFotos";
import ProductoFila from "./ProductoFila";
import { getMarcaTheme, type AdminProducto, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { catalogoAdminRoles } from "@/lib/catalogo/roles";
import { normalizarSkuStorage } from "@/lib/catalogos/fotos-b2b";
import { contarAlternativas, type StorageMarcaKey } from "@/lib/catalogos/variantes-paths";
import {
  categoriasDeLaMarca, chipValido, chipsDelCatalogo, pasaElChip,
} from "@/lib/catalogos/admin-chips";
import { colaSinFoto } from "@/lib/catalogos/fotos-faltantes";
import { coincideBusqueda, ordenarParaTrabajar } from "@/lib/catalogos/admin-lista";

/** Respuesta de GET /products/variantes (sin `sku`): el mapa completo de la marca. */
interface VariantesResp {
  skus: string[];
  /** skuStorage → vistas guardadas. Ausente = ese SKU no tiene carpeta. */
  vistas: Record<string, number[]>;
  /** false = no se pudo leer el contenido; el cliente asume que SÍ hay alternativas. */
  exacto: boolean;
}

/** Opciones del filtro de bulto. Los dos tamaños que existen en el negocio. */
const BULTO_FILTRO_OPCIONES = [
  { value: "", label: "Todos" },
  { value: "12", label: "12 piezas" },
  { value: "8", label: "8 piezas" },
];

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

  // El chip elegido vive en la URL (`?ver=`): sobrevive al refresh y se comparte.
  // Es un filtro del MISMO nivel → `replace`, como manda la convención.
  const [verBruto, setVer] = useUrlState("ver", "todos");
  const [busqueda, setBusqueda] = useState("");
  const [genero, setGenero] = useState("");
  const [bulto, setBulto] = useState("");
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
  // Lo que el sync apagó (active=false) no es lo mismo que lo escondido a mano:
  // el GET de Joybees/Tommy/Calvin también trae inactivos y no deben ensuciar
  // ni los chips ni la lista. En Reebok el scope=admin ya filtra y esto es no-op.
  const vivos = useMemo(() => products.filter((p) => p.active !== false), [products]);

  // Categorías de los chips: el mapa que YA existe por marca, nunca una lista
  // escrita en la pantalla (ver `marcas-ui` → `admin.categorias`).
  const categorias = useMemo(
    () => theme.admin.categorias ?? categoriasDeLaMarca(theme.filtros.categoryOptions),
    [theme],
  );
  const categoriaDe = useMemo(
    () => theme.admin.categoriaDe ?? ((p: AdminProducto) => p.category ?? null),
    [theme],
  );

  const chips = useMemo(
    () => chipsDelCatalogo(vivos, categorias, categoriaDe),
    [vivos, categorias, categoriaDe],
  );
  const ver = chipValido(verBruto, chips);

  // El Excel «sin foto» sale de la MISMA cola de siempre (activos, sin los
  // escondidos, lo más vendible primero) — `fotos-faltantes.ts`, la fuente que
  // comparten el admin, la alerta del sync y el resumen semanal de los lunes.
  const sinFoto = useMemo(() => colaSinFoto(vivos), [vivos]);

  const lista = useMemo(() => {
    const filtrados = vivos.filter((p) => {
      if (!pasaElChip(p, ver, categoriaDe)) return false;
      if (!theme.genero.match(p.gender, genero)) return false;
      // Se compara contra el tamaño EFECTIVO, no contra la columna: un producto
      // sin marcar es de 12, y filtrar por 12 tiene que traerlo.
      if (bulto && String(theme.bulto(p.category, p.bulto_pzas)) !== bulto) return false;
      return coincideBusqueda(p, busqueda);
    });
    return ordenarParaTrabajar(filtrados);
  }, [vivos, ver, categoriaDe, genero, bulto, busqueda, theme]);

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

  const recargar = useCallback(async () => { await mutateProducts(); }, [mutateProducts]);
  // Tras el ZIP hay que revalidar productos Y la lista de variantes.
  const recargarTrasZip = useCallback(async () => {
    await Promise.all([mutateProducts(), mutateVariantes()]);
  }, [mutateProducts, mutateVariantes]);

  const hayFiltros = !!(genero || bulto || busqueda);
  const cargando = productsLoading && !productsData;

  async function descargarExcelSinFoto() {
    try {
      await theme.admin.excelSinFoto(sinFoto);
      showToast("Excel listo — revisa tu carpeta de descargas");
    } catch {
      showToast("No se pudo generar el Excel. Intenta de nuevo.");
    }
  }

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catálogos" />

      {toast && <div className={theme.admin.toastBg}>{toast}</div>}

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
          {/* 🩸 Con 0 productos sin foto el botón seguía encendido y bajaba un
              Excel vacío. Apagado dice por qué. */}
          <button
            onClick={descargarExcelSinFoto}
            disabled={sinFoto.length === 0}
            title={sinFoto.length === 0 ? "Todos los productos tienen foto" : undefined}
            className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {sinFoto.length === 0 ? "Todos tienen foto" : "Descargar Excel sin foto"}
          </button>
        </div>

        {cargando ? (
          <div className="flex justify-center py-20">
            <div className={theme.admin.spinner} />
          </div>
        ) : (
          <>
            <SubirFotos
              marca={marca}
              products={products}
              onFotoSubida={recargar}
              onZipListo={recargarTrasZip}
              showToast={showToast}
            />

            {/* Buscador */}
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por código o nombre…"
                className="w-full min-h-[44px] pl-10 pr-4 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 transition"
              />
            </div>

            {/* UNA fila de chips, con el número adentro. */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setVer(c.key)}
                  aria-pressed={ver === c.key}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition active:scale-[0.97] ${
                    ver === c.key
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {c.label}
                  <span className={`tabular-nums ${ver === c.key ? "text-white/60" : "text-gray-400"}`}>
                    {c.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Género y bulto — los MISMOS controles y opciones del catálogo. */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <FiltroDesplegable
                etiqueta="Género"
                valor={genero}
                opciones={theme.filtros.genderOptions}
                onChange={setGenero}
                chipActive={theme.filtros.chipActive}
                chipInactive={theme.filtros.chipInactive}
              />
              {theme.admin.bultoEditable && (
                <FiltroDesplegable
                  etiqueta="Bulto"
                  valor={bulto}
                  opciones={BULTO_FILTRO_OPCIONES}
                  onChange={setBulto}
                  chipActive={theme.filtros.chipActive}
                  chipInactive={theme.filtros.chipInactive}
                />
              )}
              {hayFiltros && (
                <button
                  type="button"
                  onClick={() => { setGenero(""); setBulto(""); setBusqueda(""); }}
                  className="min-h-[44px] px-3 text-xs font-medium text-gray-500 underline-offset-2 hover:underline hover:text-gray-700 transition"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Que los filtros no dejen una pantalla vacía sin explicación: es la
                diferencia entre "no hay ninguno así" y "algo se rompió". */}
            {lista.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">
                {hayFiltros ? "Ningún producto con esos filtros." : "Ningún producto aquí."}
              </p>
            ) : (
              <div className="space-y-2">
                {lista.map((p) => (
                  <ProductoFila
                    key={p.id}
                    marca={marca}
                    product={p}
                    onCambio={recargar}
                    tieneVariantes={tieneVariantes}
                    showToast={showToast}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { Toast } from "@/components/ui";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { estaALaVenta } from "@/lib/catalogo/a-la-venta";
import { CATALOGO_ADMIN_ROLES, COMPROBANTES_ROLES, catalogoRoles } from "@/lib/catalogo/roles";

// Catálogos en UNA pantalla: una tarjeta por marca con sus acciones adentro
// (Ver catálogo · Comprobantes · Administrar · Copiar enlace) + contadores en
// vivo (productos a la venta, sin foto). Elimina los pasos intermedios (elegir
// marca → Administrar → elegir marca otra vez).
//
// 🔴 «COMPROBANTES», ACCESO DIRECTO DESDE LA TARJETA (25-ago-2026)
//
// Daniel, textual: *"En el card donde están las marcas. Hay catálogo,
// administrar, debe de estar también pedidos para acceso directo."*
//
// Lleva a la lista ÚNICA de comprobantes del #611 (`/catalogo/<marca>/pedidos`),
// que es la que quedó: el panel de administrar ya redirige ahí. Antes, para
// verla desde el hub había que entrar al catálogo de la marca y buscar el botón
// en la fila del logo — dos toques por una lista que se mira todo el día.
//
// 🔴 EL BOTÓN SE LLAMA «COMPROBANTES» (6-sep-2026). Daniel, textual: *«todo
// Comprobantes, porque ahí también hay cotizaciones y borradores»*. El mismo
// lugar tenía TRES nombres: el botón decía «Pedidos», el título de la pantalla
// «Comprobantes» y el camino de vuelta «← Catálogo». ⚠️ La `key` del módulo y
// de la pestaña sigue siendo `pedidos` —vive en `role_permissions` y en enlaces
// guardados—: se cambia el RÓTULO, nunca la llave (lo mismo que se hizo al
// pasar Cheques a `/recordatorios`).
//
// El destino NO se escribe acá: sale de `theme.pedidosHref`, el mismo campo del
// que ya sale «Ver comprobantes» de la confirmación. Un href a mano en el hub es
// exactamente la deriva que ese campo existe para evitar.
//
// 🔴 «COPIAR ENLACE» (6-sep-2026). Para pasarle el catálogo a un cliente había
// que ENTRAR al catálogo de la marca y buscar «Compartir › Copiar link
// público». Ahora se copia desde la tarjeta. Lo que se copia es
// `theme.publicoShareUrl` **pelado, sin un solo parámetro** — el mismo enlace
// limpio que desde hoy copia el vendedor (ver `CatalogoVendedorPage`).
//
// 🔴 EL CONTADOR DICE LO QUE SE VE AL ENTRAR (6-sep-2026). Contaba las filas de
// `products?active=true` —lo que EXISTE en Switch— mientras el catálogo muestra
// lo VENDIBLE: Reebok decía 232 y adentro salían 182. Daniel: *«no sabía que
// los productos eran los de Switch, no con existencia»*. La regla es la del
// catálogo, importada de `lib/catalogo/a-la-venta` (una sola definición), y el
// rótulo lo dice: «182 productos a la venta».
//
// Los COLORES de cada tarjeta salen del tema de la marca (MARCA_THEME.hub) —
// aquí solo vive la identidad no-visual (nombre, rutas). Agregar una marca =
// agregar una entrada a BRANDS + su tema.
//
// La tarjeta NO lleva bajada ("Calzado deportivo", "Clogs, sandalias y más"):
// describía la marca a gente que trabaja con esa marca todos los días. Lo que sí
// se queda son los contadores, que son los que hacen tocar la tarjeta.

interface BrandCounters {
  /** Productos que se ven al entrar al catálogo (los vendibles). */
  aLaVenta: number;
  sinFoto: number;
}

interface Brand {
  key: MarcaUiKey;
  name: string;
  productsUrl: string;   // endpoint para contar (active=true)
  inventoryUrl?: string; // Reebok: la existencia por talla vive aparte
  catalogoHref: string;  // "Ver catálogo"
  adminHref: string;     // "Administrar" (CATALOGO_ADMIN_ROLES)
}

const BRANDS: Brand[] = [
  {
    key: "reebok",
    name: "REEBOK",
    productsUrl: "/api/catalogo/reebok/products?active=true",
    inventoryUrl: "/api/catalogo/reebok/inventory",
    catalogoHref: "/catalogo/reebok",
    adminHref: "/catalogos/admin/reebok",
  },
  {
    key: "joybees",
    name: "JOYBEES",
    productsUrl: "/api/catalogo/joybees/products?active=true",
    catalogoHref: "/catalogo/joybees",
    adminHref: "/catalogos/admin/joybees",
  },
  {
    key: "tommy",
    name: "TOMMY HILFIGER",
    productsUrl: "/api/catalogo/tommy/products?active=true",
    catalogoHref: "/catalogo/tommy",
    adminHref: "/catalogos/admin/tommy",
  },
  {
    key: "calvin",
    name: "CALVIN KLEIN",
    productsUrl: "/api/catalogo/calvin/products?active=true",
    catalogoHref: "/catalogo/calvin",
    adminHref: "/catalogos/admin/calvin",
  },
];

/** Fila de producto tal como llega del endpoint de conteo. */
interface FilaContada {
  id?: string;
  image_url?: string | null;
  disponibilidad?: number | null;
  existencia?: number | null;
  stock?: number | null;
  is_regalia?: boolean | null;
  badge?: string | null;
}

export default function CatalogosMarcasPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: catalogoRoles(),
  });

  const [counters, setCounters] = useState<Record<string, BrandCounters | null>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    for (const b of BRANDS) {
      // Reebok necesita `inventory` como respaldo de existencia (su stock por
      // talla no vive en la fila del producto) — es el MISMO respaldo que usa
      // el catálogo, así que los dos números no pueden separarse.
      Promise.all([
        fetch(b.productsUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        b.inventoryUrl
          ? fetch(b.inventoryUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : []))
          : Promise.resolve([]),
      ])
        .then(([rows, inv]: [FilaContada[], { product_id: string; quantity: number }[]]) => {
          if (cancelled || !Array.isArray(rows)) return;
          const stockMap: Record<string, number> = {};
          for (const i of Array.isArray(inv) ? inv : []) {
            stockMap[i.product_id] = (stockMap[i.product_id] || 0) + i.quantity;
          }
          const visibles = rows.filter((p) => estaALaVenta(p, p.id ? stockMap[p.id] : undefined));
          const sinFoto = visibles.filter((p) => !p.image_url || !String(p.image_url).trim()).length;
          setCounters((prev) => ({ ...prev, [b.key]: { aLaVenta: visibles.length, sinFoto } }));
        })
        .catch(() => { if (!cancelled) setCounters((prev) => ({ ...prev, [b.key]: null })); });
    }
    return () => { cancelled = true; };
  }, [authChecked]);

  if (!authChecked) return null;

  // Quién ve "Administrar": admin y secretaria (CATALOGO_ADMIN_ROLES). El
  // vendedor NO administra (ve el catálogo y sus pedidos) y bodega solo ve el
  // catálogo. El gate de verdad está en el server (requireAdminOSecretaria/requireRole en
  // /api/catalogo/**) — esto solo evita mostrar un botón que terminaría en 403.
  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);

  // Quién ve "Comprobantes": admin, secretaria y vendedor (COMPROBANTES_ROLES).
  // 🔴 BODEGA NO. Ve el catálogo y punto: el feed de la lista
  // (GET /api/catalogo/<marca>/orders) le responde 403, así que el botón lo
  // dejaría frente a una pantalla vacía. Nadie gana un permiso con este botón.
  const puedeVerComprobantes = (COMPROBANTES_ROLES as readonly string[]).includes(role);

  function copiarEnlace(marca: MarcaUiKey) {
    // El enlace PELADO de la marca: sin filtros, sin búsqueda, sin precio. Es
    // la misma regla que el «Copiar link público» del vendedor desde hoy —
    // Daniel: *«quiero que el cliente cuando abra el catálogo por el link se
    // sienta como si fuese el mismo catálogo»*.
    const url = getMarcaTheme(marca)!.publicoShareUrl;
    navigator.clipboard.writeText(url)
      .then(() => setToast("Link copiado"))
      .catch(() => setToast("No se pudo copiar el link"));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catálogos" breadcrumbs={[{ label: "Marcas" }]} />
      {/* max-w-7xl (6-sep-2026): era `max-w-3xl` (768 px), el más angosto de
          los tres del módulo —el catálogo usa 7xl (1.280) y administrar 5xl
          (1.024)— y el que menos lo necesitaba: en escritorio quedaban cuatro
          tarjetas chicas con media pantalla en blanco. Con las 4 marcas, la
          grilla llega a 4 columnas en `xl` para que la fila se llene en vez de
          estirar cada tarjeta. */}
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* El h1 VISIBLE decía "Catálogos" justo debajo de la barra que ya dice
            "Catálogos" — en escritorio el breadcrumb ("Catálogos › Marcas") y en
            celular el chip sticky del AppHeader. Es la MISMA repetición que el
            propio AppHeader ya había recortado ("nombre 3×: chip + breadcrumb +
            h1", ver su comentario); acá se termina el trabajo. Se queda como
            sr-only para que la página no pierda su encabezado accesible: podar
            ruido visual no es motivo para dejar un documento sin h1. */}
        <h1 className="sr-only">Catálogos</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {BRANDS.map((b) => {
            const c = counters[b.key];
            // Paleta de la tarjeta desde el tema de la marca (no hardcodear).
            const theme = getMarcaTheme(b.key)!;
            const hub = theme.hub;

            return (
              <div key={b.key} className={`relative overflow-hidden rounded-2xl border p-6 ${hub.card}`}>
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 ${hub.blob}`} />
                <div className="relative">
                  <h2 className={`text-3xl font-extrabold tracking-tight ${hub.name}`}>{b.name}</h2>

                  {/* Contadores */}
                  <div className={`mt-4 text-sm font-medium tabular-nums ${hub.counter}`}>
                    {c === undefined ? (
                      <span className="opacity-50">Cargando…</span>
                    ) : c === null ? (
                      <span className="opacity-50">Contadores no disponibles</span>
                    ) : (
                      <span>
                        {c.aLaVenta} producto{c.aLaVenta === 1 ? "" : "s"} a la venta
                        {c.sinFoto > 0 && (
                          <>
                            {" · "}
                            <span className={hub.sinFoto}>
                              {c.sinFoto} sin foto
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Acciones — iPhone: los links medían 39px de alto (px-4
                      py-2). min-h-[44px] los sube al mínimo táctil de la casa;
                      el ancho ya pasaba. Se repite en las 4 marcas porque el
                      bloque se renderiza por cada BRAND.

                      🔴 CON VARIOS BOTONES LA FILA BAJA DE LÍNEA, NO SE APLASTA.
                      El `flex-wrap` que ya estaba los baja de renglón en vez de
                      comprimir a los otros, y la tarjeta CRECE HACIA ABAJO. Vale
                      igual con el cuarto botón («Copiar enlace») y con la
                      grilla de 4 columnas de `xl`. */}
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Link
                      href={b.catalogoHref}
                      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition active:scale-[0.97] ${hub.primaryBtn}`}
                    >
                      Ver catálogo
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </Link>
                    <button
                      type="button"
                      onClick={() => copiarEnlace(b.key)}
                      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copiar enlace
                    </button>
                    {puedeVerComprobantes && (
                      <Link
                        href={theme.pedidosHref}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                      >
                        Comprobantes
                      </Link>
                    )}
                    {puedeAdministrar && (
                      <Link
                        href={b.adminHref}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                      >
                        Administrar
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}

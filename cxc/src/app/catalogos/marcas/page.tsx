"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { CATALOGO_ADMIN_ROLES, COMPROBANTES_ROLES, catalogoRoles } from "@/lib/catalogo/roles";

// Catálogos en UNA pantalla: una tarjeta por marca con sus acciones adentro
// (Ver catálogo · Pedidos · Administrar) + contadores en vivo (productos, sin
// foto). Elimina los pasos intermedios (elegir marca → Administrar → elegir
// marca otra vez).
//
// 🔴 «PEDIDOS», ACCESO DIRECTO DESDE LA TARJETA (25-ago-2026)
//
// Daniel, textual: *"En el card donde están las marcas. Hay catálogo,
// administrar, debe de estar también pedidos para acceso directo."*
//
// Lleva a la lista ÚNICA de comprobantes del #611 (`/catalogo/<marca>/pedidos`),
// que es la que quedó: el panel de administrar ya redirige ahí. Antes, para
// verla desde el hub había que entrar al catálogo de la marca y buscar el botón
// «Pedidos» en la fila del logo — dos toques por una lista que se mira todo el
// día.
//
// El destino NO se escribe acá: sale de `theme.pedidosHref`, el mismo campo del
// que ya sale «Ver comprobantes» de la confirmación. Un href a mano en el hub es
// exactamente la deriva que ese campo existe para evitar.
//
// Los COLORES de cada tarjeta salen del tema de la marca (MARCA_THEME.hub) —
// aquí solo vive la identidad no-visual (nombre, rutas). Agregar una marca =
// agregar una entrada a BRANDS + su tema.
//
// La tarjeta NO lleva bajada ("Calzado deportivo", "Clogs, sandalias y más"):
// describía la marca a gente que trabaja con esa marca todos los días. Lo que sí
// se queda son los contadores, que son los que hacen tocar la tarjeta.

interface BrandCounters {
  total: number;
  sinFoto: number;
}

interface Brand {
  key: MarcaUiKey;
  name: string;
  productsUrl: string;   // endpoint para contar (active=true)
  catalogoHref: string;  // "Ver catálogo"
  adminHref: string;     // "Administrar" (CATALOGO_ADMIN_ROLES)
}

const BRANDS: Brand[] = [
  {
    key: "reebok",
    name: "REEBOK",
    productsUrl: "/api/catalogo/reebok/products?active=true",
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

export default function CatalogosMarcasPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: catalogoRoles(),
  });

  const [counters, setCounters] = useState<Record<string, BrandCounters | null>>({});

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    for (const b of BRANDS) {
      fetch(b.productsUrl, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((rows: { image_url?: string | null }[]) => {
          if (cancelled || !Array.isArray(rows)) return;
          const total = rows.length;
          const sinFoto = rows.filter((p) => !p.image_url || !String(p.image_url).trim()).length;
          setCounters((prev) => ({ ...prev, [b.key]: { total, sinFoto } }));
        })
        .catch(() => { if (!cancelled) setCounters((prev) => ({ ...prev, [b.key]: null })); });
    }
    return () => { cancelled = true; };
  }, [authChecked]);

  if (!authChecked) return null;

  // Quién ve "Administrar": admin y secretaria (CATALOGO_ADMIN_ROLES). El
  // vendedor NO administra (ve el catálogo y sus pedidos) y bodega solo ve el
  // catálogo. El gate de verdad está en el server (requireAdmin/requireRole en
  // /api/catalogo/**) — esto solo evita mostrar un botón que terminaría en 403.
  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);

  // Quién ve "Pedidos": admin, secretaria y vendedor (COMPROBANTES_ROLES).
  // 🔴 BODEGA NO. Ve el catálogo y punto: el feed de la lista
  // (GET /api/catalogo/<marca>/orders) le responde 403, así que el botón lo
  // dejaría frente a una pantalla vacía. Nadie gana un permiso con este botón.
  const puedeVerPedidos = (COMPROBANTES_ROLES as readonly string[]).includes(role);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catálogos" breadcrumbs={[{ label: "Marcas" }]} />
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* El h1 VISIBLE decía "Catálogos" justo debajo de la barra que ya dice
            "Catálogos" — en escritorio el breadcrumb ("Catálogos › Marcas") y en
            celular el chip sticky del AppHeader. Es la MISMA repetición que el
            propio AppHeader ya había recortado ("nombre 3×: chip + breadcrumb +
            h1", ver su comentario); acá se termina el trabajo. Se queda como
            sr-only para que la página no pierda su encabezado accesible: podar
            ruido visual no es motivo para dejar un documento sin h1. */}
        <h1 className="sr-only">Catálogos</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                        {c.total} producto{c.total === 1 ? "" : "s"}
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

                      🔴 CON TRES BOTONES LA FILA BAJA DE LÍNEA, NO SE APLASTA.
                      Los tres miden 137,6 + 88 + 111,4 px (+2 huecos de 10) =
                      357, y la tarjeta NUNCA da tanto: el contenedor está
                      capado en max-w-3xl, así que son 358 px de tarjeta (310
                      útiles con el p-6) en 390, 1024 y 1440, y 279 en 834. En
                      TODOS los anchos sobra un botón, y el `flex-wrap` que ya
                      estaba lo baja de renglón en vez de comprimir a los otros.
                      La tarjeta CRECE HACIA ABAJO: 187 → 241 px.

                      MEDIDO en el build de producción, los 4 anchos, y
                      comparado contra origin/main:
                        · 390 · 1024 · 1440 → [Ver catálogo · Pedidos] / [Administrar]
                        · 834 (tarjeta 279) → [Ver catálogo] / [Pedidos · Administrar]
                                              (ahí ya medía 241 px ANTES de este botón)
                      Cero arrastre horizontal (scrollWidth = clientWidth en los
                      cuatro), cero botones por debajo de 44 px, cero textos por
                      debajo de 12 px y ningún botón se sale de su tarjeta — los
                      mismos cuatro ceros que da origin/main. */}
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
                    {puedeVerPedidos && (
                      <Link
                        href={theme.pedidosHref}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${hub.outlineBtn}`}
                      >
                        Pedidos
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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { CATALOGO_ADMIN_ROLES, catalogoRoles } from "@/lib/catalogo/roles";

// Catálogos en UNA pantalla: una tarjeta por marca con sus dos acciones adentro
// (Ver catálogo · Administrar) + contadores en vivo (productos, sin foto). Elimina
// los pasos intermedios (elegir marca → Administrar → elegir marca otra vez).
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

  // Quién ve "Administrar": admin y secretaria (CATALOGO_ADMIN_ROLES). Vendedor
  // y bodega solo ven "Ver catálogo". El gate de verdad está en el server
  // (requireAdmin/requireRole en /api/catalogo/**) — esto solo evita mostrar un
  // botón que terminaría en 403.
  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(role);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catálogos" breadcrumbs={[{ label: "Marcas" }]} />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Catálogos</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {BRANDS.map((b) => {
            const c = counters[b.key];
            // Paleta de la tarjeta desde el tema de la marca (no hardcodear).
            const hub = getMarcaTheme(b.key)!.hub;

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

                  {/* Acciones — iPhone: ambos links medían 39px de alto (px-4
                      py-2). min-h-[44px] los sube al mínimo táctil de la casa;
                      el ancho ya pasaba (137px y 111px). Se repite en las 3
                      marcas porque el bloque se renderiza por cada BRAND. */}
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

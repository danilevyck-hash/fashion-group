"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";

// Catálogos en UNA pantalla: una tarjeta por marca con sus dos acciones adentro
// (Ver catálogo · Administrar) + contadores en vivo (productos, sin foto). Elimina
// los pasos intermedios (elegir marca → Administrar → elegir marca otra vez).

interface BrandCounters {
  total: number;
  sinFoto: number;
}

interface Brand {
  key: "reebok" | "joybees";
  name: string;
  tagline: string;
  productsUrl: string;   // endpoint para contar (active=true)
  catalogoHref: string;  // "Ver catálogo"
  adminHref: string;     // "Administrar" (solo admin)
}

const BRANDS: Brand[] = [
  {
    key: "reebok",
    name: "REEBOK",
    tagline: "Calzado deportivo",
    productsUrl: "/api/catalogo/reebok/products?active=true",
    catalogoHref: "/catalogo/reebok",
    adminHref: "/catalogos/admin/reebok",
  },
  {
    key: "joybees",
    name: "JOYBEES",
    tagline: "Clogs, sandalias y más",
    productsUrl: "/api/catalogo/joybees/products?active=true",
    catalogoHref: "/catalogo/joybees",
    adminHref: "/catalogos/admin/joybees",
  },
];

export default function CatalogosMarcasPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
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

  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catalogos" breadcrumbs={[{ label: "Marcas" }]} />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Catálogos</h1>
        <p className="text-sm text-gray-400 mb-8">Reebok y Joybees</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {BRANDS.map((b) => {
            const isReebok = b.key === "reebok";
            const c = counters[b.key];
            // Paletas por marca (Reebok navy + rojo; Joybees amarillo + gris).
            const cardBg = isReebok ? "bg-[#1A2656] border-[#1A2656]/10" : "bg-[#FFE443] border-[#FFE443]/30";
            const nameColor = isReebok ? "text-white" : "text-[#404041]";
            const tagColor = isReebok ? "text-white/50" : "text-[#404041]/50";
            const counterColor = isReebok ? "text-white/70" : "text-[#404041]/70";
            const blobBg = isReebok ? "bg-[#E4002B]/15" : "bg-[#404041]/10";
            // Botón primario (Ver catálogo): contraste fuerte sobre la marca.
            const primaryBtn = isReebok
              ? "bg-white text-[#1A2656] hover:bg-white/90"
              : "bg-[#404041] text-white hover:bg-[#404041]/90";
            // Botón secundario (Administrar): outline.
            const outlineBtn = isReebok
              ? "border border-white/40 text-white hover:bg-white/10"
              : "border border-[#404041]/40 text-[#404041] hover:bg-[#404041]/10";

            return (
              <div key={b.key} className={`relative overflow-hidden rounded-2xl border p-6 ${cardBg}`}>
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 ${blobBg}`} />
                <div className="relative">
                  <h2 className={`text-3xl font-extrabold tracking-tight ${nameColor}`}>{b.name}</h2>
                  <p className={`text-sm mt-1 ${tagColor}`}>{b.tagline}</p>

                  {/* Contadores */}
                  <div className={`mt-4 text-sm font-medium tabular-nums ${counterColor}`}>
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
                            <span className={isReebok ? "text-[#FFD1D1] font-semibold" : "text-[#8a1a1a] font-semibold"}>
                              {c.sinFoto} sin foto
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Link
                      href={b.catalogoHref}
                      className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition active:scale-[0.97] ${primaryBtn}`}
                    >
                      Ver catálogo
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </Link>
                    {isAdmin && (
                      <Link
                        href={b.adminHref}
                        className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${outlineBtn}`}
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

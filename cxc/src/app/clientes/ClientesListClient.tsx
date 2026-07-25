"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { SkeletonTable, EmptyState, ScrollableTable, PullToRefresh } from "@/components/ui";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { telHref, mailtoHref } from "@/lib/contact-links";

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  provincia: string | null;
}

interface Props {
  initialClientes: Cliente[];
  initialTotal: number;
  provincias: string[];
  pageSize: number;
}

interface ClientesPage {
  clientes: Cliente[];
  total: number;
  page: number;
}

export default function ClientesListClient({ initialClientes, initialTotal, provincias, pageSize }: Props) {
  const { authChecked } = useAuth({
    moduleKey: "directorio",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
  });
  const router = useRouter();

  const [page, setPage] = useState(1);
  // Input inmediato (UI) vs término que entra a la clave SWR (debounced 250ms).
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [provincia, setProvincia] = useState("");
  const [provinciaDebounced, setProvinciaDebounced] = useState("");

  // Pre-llenar búsqueda desde ?search= (enlaces como "Ver en directorio" de
  // CXC, antes apuntaban a /directorio?search=). Se lee tras montar para no
  // romper la hidratación (el render del server usa q="").
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("search");
    if (s) setQ(s);
  }, []);

  // Debounce de q/provincia (250ms, igual que antes): solo el valor debounced
  // entra a la clave SWR → el fetch del nuevo término dispara tras el debounce.
  // El prefill de ?search= (setQ) también pasa por aquí y dispara el fetch.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQDebounced(q);
      setProvinciaDebounced(provincia);
      setPage(1); // cambiar filtro vuelve a la página 1
    }, q || provincia ? 250 : 0);
    return () => clearTimeout(handle);
  }, [q, provincia]);

  // Caché SWR de la lista. La clave incluye TODOS los params que cambian la data
  // (page, q, provincia) → volver a una página/búsqueda ya vista sirve caché al
  // instante (SWRProvider mantiene la caché entre navegaciones).
  const swrKey = authChecked
    ? (["clientes-list", page, qDebounced, provinciaDebounced] as const)
    : null;

  // fallbackData SOLO para la página 1 sin filtros = lo que entregó el SSR
  // (initialClientes) → cero parpadeo en la primera carga, sin re-fetch redundante.
  const isInitialView = page === 1 && !qDebounced && !provinciaDebounced;
  const fallbackData: ClientesPage | undefined = isInitialView
    ? { clientes: initialClientes, total: initialTotal, page: 1 }
    : undefined;

  const { data, isLoading, mutate } = useSWR<ClientesPage>(
    swrKey,
    async ([, p, query, prov]: readonly [string, number, string, string]): Promise<ClientesPage> => {
      const params = new URLSearchParams({ page: String(p), limit: String(pageSize) });
      if (query) params.set("q", query);
      if (prov) params.set("provincia", prov);
      const res = await fetch(`/api/clientes?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar clientes");
      const json = await res.json();
      return {
        clientes: (json.clientes ?? []) as Cliente[],
        total: (json.total ?? 0) as number,
        page: (json.page ?? p) as number,
      };
    },
    {
      fallbackData,
      dedupingInterval: 5 * 60_000,
      revalidateOnFocus: false,
    },
  );

  const clientes = data?.clientes ?? [];
  const total = data?.total ?? 0;
  const loading = isLoading && !data;

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  // Pull-to-refresh (mobile): revalida la clave actual (página + filtros vigentes).
  const onRefresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Clientes" />
      <PullToRefresh onRefresh={onRefresh}>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          </div>
          {/* "Actualizar ahora" (admin/secretaria) — refresca clientes_master
              desde el espejo de Switch (solo DB, no toca Switch). */}
          <SyncNowButton
            opciones={[{ modulo: "clientes-master" }]}
            onSuccess={async () => { await mutate(); }}
          />
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="search"
            placeholder="Buscar por nombre o código (D-XXX)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition"
          />
          <select
            value={provincia}
            onChange={(e) => setProvincia(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition sm:w-48"
          >
            <option value="">Todas las provincias</option>
            {provincias.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="text-xs text-gray-500 mb-2 tabular-nums">
          {total.toLocaleString("es")} {total === 1 ? "cliente" : "clientes"}
          {(q || provincia) && " (filtrados)"}
        </div>

        {/* Tabla */}
        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : clientes.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            subtitle={q || provincia ? "Probá con otros filtros." : "No hay clientes cargados aún."}
          />
        ) : (
          <>
            {/* Desktop: tabla */}
            <div className="hidden sm:block">
              <ScrollableTable>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Nombre</th>
                      <th className="py-2 px-3">Teléfono</th>
                      <th className="py-2 px-3">Email</th>
                      <th className="py-2 px-3">Provincia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-2 px-3 tabular-nums text-gray-500">{c.codigo}</td>
                        <td className="py-2 px-3 font-medium">
                          <Link href={`/clientes/${encodeURIComponent(c.codigo)}`} className="hover:underline">
                            {c.nombre}
                          </Link>
                        </td>
                        <td className="py-2 px-3 text-gray-600">{(() => {
                          const tel = c.telefono || c.celular;
                          const href = telHref(tel);
                          return href ? <a href={href} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{tel}</a> : (tel || "—");
                        })()}</td>
                        <td className="py-2 px-3 text-gray-600 max-w-[14rem] truncate">{(() => {
                          const href = mailtoHref(c.email);
                          return href ? <a href={href} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{c.email}</a> : (c.email || "—");
                        })()}</td>
                        <td className="py-2 px-3 text-gray-600">{c.provincia || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>

            {/* Mobile: card-list (toda la card navega a la ficha) */}
            <ul className="sm:hidden border-t border-gray-100">
              {clientes.map((c) => {
                const tel = c.telefono || c.celular;
                const tHref = telHref(tel);
                return (
                  <li
                    key={c.id}
                    onClick={() => router.push(`/clientes/${encodeURIComponent(c.codigo)}`)}
                    className="border-b border-gray-100 px-1 py-3 active:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{c.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-400">{c.codigo}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      {tHref ? (
                        <a href={tHref} className="text-blue-600" onClick={(e) => e.stopPropagation()}>{tel}</a>
                      ) : (
                        <span>{tel || "Sin teléfono"}</span>
                      )}
                      {c.provincia && <span className="text-gray-400">· {c.provincia}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <div className="text-gray-500 tabular-nums">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border border-gray-200 rounded-md px-4 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
              >
                ← Anterior
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="border border-gray-200 rounded-md px-4 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </main>
      </PullToRefresh>
    </div>
  );
}

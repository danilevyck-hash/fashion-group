"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import { opcionesDelServidor, useSembrarDelServidor } from "@/lib/swr-servidor";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { SkeletonTable, EmptyState, ScrollableTable, PullToRefresh } from "@/components/ui";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { telHref, mailtoHref } from "@/lib/contact-links";
import { fmt } from "@/lib/format";

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  razon_social?: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  provincia: string | null;
  /** Puesto = Switch ya no lo manda en ninguna de las 6 empresas: se muestra
   *  con rótulo (la ficha dice desde cuándo), pero los selectores no lo
   *  ofrecen. `null`/`undefined` = vivo. */
  ausente_desde?: string | null;
}

interface YtdResp {
  anio: number;
  ytd: Record<string, number>;
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

  // 🔴 LA BÚSQUEDA Y LA PÁGINA VIVEN EN LA URL (24-ago-2026)
  //
  // 🩸 Estaban en `useState`, así que entrar a la ficha de un cliente y volver
  // dejaba el buscador VACÍO y de nuevo en la página 1: revisar 10 clientes
  // seguidos era escribir la búsqueda 10 veces. La regla de navegación de la
  // casa ya lo resolvía y esta pantalla no la usaba — filtros y páginas van a la
  // URL con `replace` (no crean entrada de historial: el Atrás no cicla por
  // ellos), el drill-down a la ficha va con `push` (que es lo que ya hacían el
  // `<Link>` y el `router.push` de la tarjeta, y no se tocó).
  //
  // Se REUSA `useUrlState`, el hook del sistema; no se inventó otro mecanismo.
  //
  // ⚠️ El `?search=` pegado a mano o guardado en un marcador sigue llegando
  // igual — ahora es el mismo parámetro que la pantalla escribe, no un prefill
  // aparte que se leía una sola vez al montar.
  const searchParams = useSearchParams();
  const [qDebounced, setQDebounced] = useUrlState("search", "");
  const [provincia, setProvincia] = useUrlState("provincia", "");
  const [page, setPage] = useUrlState("page", 1);

  // Input inmediato (UI) vs término que entra a la URL y a la clave SWR
  // (debounced 250ms). Lo que se debouncea es la ESCRITURA en la URL: sin eso
  // cada tecla sería una navegación.
  const [q, setQ] = useState(qDebounced);

  // La URL manda sobre el input cuando cambia por fuera (atrás/adelante, un
  // enlace pegado, volver de una ficha).
  const qEnUrlRef = useRef(qDebounced);
  useEffect(() => {
    if (qEnUrlRef.current === qDebounced) return;
    qEnUrlRef.current = qDebounced;
    setQ(qDebounced);
  }, [qDebounced]);

  // Debounce de q (250ms, igual que antes): solo el valor estabilizado entra a
  // la URL → el fetch del nuevo término dispara tras el debounce.
  useEffect(() => {
    if (q === qDebounced) return;
    const handle = setTimeout(() => {
      qEnUrlRef.current = q;
      setQDebounced(q);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, qDebounced, setQDebounced]);

  // Cambiar de filtro vuelve a la página 1.
  //
  // 🔑 Se dispara mirando los parámetros REALES de la URL, no el valor
  // optimista de `useUrlState`: cada setter reconstruye la query desde
  // `searchParams`, así que dos escrituras en el mismo tick se pisan y la
  // segunda borraría el filtro que acaba de escribir la primera. Esperando a
  // que la URL alcance, `setPage` ya ve la búsqueda puesta.
  const searchEnUrl = searchParams.get("search") ?? "";
  const provinciaEnUrl = searchParams.get("provincia") ?? "";
  const filtrosRef = useRef(`${searchEnUrl}|${provinciaEnUrl}`);
  useEffect(() => {
    const clave = `${searchEnUrl}|${provinciaEnUrl}`;
    if (filtrosRef.current === clave) return;
    filtrosRef.current = clave;
    if (page !== 1) setPage(1);
  }, [searchEnUrl, provinciaEnUrl, page, setPage]);


  // Caché SWR de la lista. La clave incluye TODOS los params que cambian la data
  // (page, q, provincia) → volver a una página/búsqueda ya vista sirve caché al
  // instante (SWRProvider mantiene la caché entre navegaciones).
  const swrKey = authChecked
    ? (["clientes-list", page, qDebounced, provincia] as const)
    : null;

  // Los datos del servidor sirven SOLO para la página 1 sin filtros. Cualquier
  // otra vista (página 2, una búsqueda, una provincia) NO los tiene y tiene que
  // pedirlos: por eso `opcionesDelServidor` recibe `undefined` ahí y SWR pide
  // como siempre. Apagar la revalidación inicial sin esa distinción dejaría la
  // página 2 en blanco para siempre.
  //
  // Memoizado porque su REFERENCIA es la señal de "el servidor mandó datos
  // nuevos" que usa `useSembrarDelServidor`.
  const isInitialView = page === 1 && !qDebounced && !provincia;
  const delServidor = useMemo<ClientesPage | undefined>(
    () =>
      isInitialView
        ? { clientes: initialClientes, total: initialTotal, page: 1 }
        : undefined,
    [isInitialView, initialClientes, initialTotal],
  );

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
      dedupingInterval: 5 * 60_000,
      revalidateOnFocus: false,
      ...opcionesDelServidor(delServidor),
    },
  );

  // Que un render nuevo del servidor gane sobre lo que quedó en caché (sin red).
  useSembrarDelServidor(mutate, delServidor);

  const clientes = data?.clientes ?? [];
  const total = data?.total ?? 0;
  const loading = isLoading && !data;

  // Compras del año — se piden APARTE, con los códigos de la página que ya se
  // está mostrando. Va en su propia llamada a propósito: leer las facturas del
  // año de 50 clientes cuesta ~1.000 filas, y si viajara junto con la lista, la
  // tabla entera esperaría por la columna. Así la tabla sale igual de rápido
  // que antes y el monto aparece un instante después.
  const codigosPagina = useMemo(
    () => clientes.map(c => c.codigo).filter(Boolean).join(","),
    [clientes],
  );
  const { data: ytdData } = useSWR<YtdResp>(
    codigosPagina ? (["clientes-ytd", codigosPagina] as const) : null,
    async ([, codigos]: readonly [string, string]): Promise<YtdResp> => {
      const res = await fetch(`/api/clientes/ytd?codigos=${encodeURIComponent(codigos)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar compras del año");
      return (await res.json()) as YtdResp;
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false, keepPreviousData: false },
  );
  const anioYtd = ytdData?.anio ?? new Date().getFullYear();
  // Sin respuesta todavía → `undefined` (se muestra "…"). Con respuesta y sin
  // entrada para el cliente → 0, que es la verdad: no compró nada este año.
  const comprasDe = useCallback(
    (codigo: string): number | undefined => (ytdData ? (ytdData.ytd[codigo] ?? 0) : undefined),
    [ytdData],
  );

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
        {/* Sin título grande: "Clientes" ya lo dicen la barra sticky (celular)
            y el breadcrumb (escritorio). Queda sr-only para no dejar la página
            sin encabezado, y la fila pasa a `justify-end` — con `between` y un
            solo hijo, el botón se habría corrido al borde izquierdo. */}
        <div className="mb-6 flex flex-wrap items-start justify-end gap-3">
          <h1 className="sr-only">Clientes</h1>
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
            placeholder="Buscar por nombre, razón social o código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 border border-gray-200 rounded-md px-3 min-h-[44px] text-sm outline-none focus:border-black transition"
          />
          <select
            value={provincia}
            onChange={(e) => setProvincia(e.target.value)}
            className="border border-gray-200 rounded-md px-3 min-h-[44px] text-sm outline-none focus:border-black transition sm:w-48"
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
          // Con filtros puestos, "probá con otros" no agrega nada a "Sin
          // resultados": los filtros están a la vista, arriba. Sin filtros, la
          // segunda línea SÍ dice otra cosa (no hay nada cargado) y se queda.
          <EmptyState
            title="Sin resultados"
            subtitle={q || provincia ? undefined : "No hay clientes cargados aún."}
          />
        ) : (
          <>
            {/* Escritorio: tabla. El corte es `lg` y no `sm` porque lo que
                decide es el ancho ÚTIL, no el de la ventana: la barra lateral se
                lleva 224 px, así que un iPad de 834 deja 562 y esta tabla pide
                788 — 226 px de arrastre, medidos en el navegador. Las tarjetas
                de abajo ya existían; solo se les amplió el tramo. */}
            <div data-vista="tabla" className="hidden lg:block">
              <ScrollableTable>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                      <th className="py-2 px-1.5 xl:px-3">Código</th>
                      <th className="py-2 px-1.5 xl:px-3">Nombre</th>
                      <th className="py-2 px-1.5 xl:px-3 text-right whitespace-nowrap">Compras {anioYtd}</th>
                      <th className="py-2 px-1.5 xl:px-3">Teléfono</th>
                      <th className="py-2 px-1.5 xl:px-3">Email</th>
                      <th className="py-2 px-1.5 xl:px-3">Provincia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-2 px-1.5 xl:px-3 tabular-nums text-gray-500">{c.codigo}</td>
                        <td className="py-2 px-1.5 xl:px-3 font-medium">
                          <Link href={`/clientes/${encodeURIComponent(c.codigo)}`} className="hover:underline">
                            {c.nombre}
                          </Link>
                          {/* Ausente de Switch: se ve (con su ficha), no se ofrece. */}
                          {c.ausente_desde && (
                            <span className="ml-2 align-middle rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-normal text-amber-800">
                              Ya no está en Switch
                            </span>
                          )}
                        </td>
                        {/* Compras del año. "…" mientras carga; $0.00 en gris
                            cuando de verdad no compró — un cliente en cero es
                            un dato, no un hueco. */}
                        <td className="py-2 px-1.5 xl:px-3 text-right tabular-nums whitespace-nowrap">
                          {(() => {
                            const v = comprasDe(c.codigo);
                            if (v === undefined) return <span className="text-gray-300">…</span>;
                            return <span className={v > 0 ? "text-gray-900" : "text-gray-400"}>${fmt(v)}</span>;
                          })()}
                        </td>
                        <td className="py-2 px-1.5 xl:px-3 text-gray-600">{(() => {
                          const tel = c.telefono || c.celular;
                          const href = telHref(tel);
                          return href ? <a href={href} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{tel}</a> : (tel || "—");
                        })()}</td>
                        <td className="py-2 px-1.5 xl:px-3 text-gray-600 max-w-[14rem] truncate">{(() => {
                          const href = mailtoHref(c.email);
                          return href ? <a href={href} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{c.email}</a> : (c.email || "—");
                        })()}</td>
                        <td className="py-2 px-1.5 xl:px-3 text-gray-600">{c.provincia || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>

            {/* Celular e iPad: card-list (toda la card navega a la ficha) */}
            <ul data-vista="tarjetas" className="border-t border-gray-100 lg:hidden">
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
                      <span className="min-w-0 truncate font-medium">
                        {c.nombre}
                        {c.ausente_desde && (
                          <span className="ml-2 align-middle rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-normal text-amber-800">
                            Ya no está en Switch
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-400">{c.codigo}</span>
                    </div>
                    {/* Llamar es LA acción del módulo en el celular y el link
                        medía 18px de alto. Ahora 44x44 (min-w-[44px] cubre los
                        teléfonos cortos) sin estirar la card: el alto extra se
                        absorbe con -my-1.5. */}
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      {tHref ? (
                        <a
                          href={tHref}
                          aria-label={`Llamar a ${c.nombre}`}
                          className="-my-1.5 inline-flex min-h-[44px] min-w-[44px] items-center text-blue-600"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {tel}
                        </a>
                      ) : (
                        <span>{tel || "Sin teléfono"}</span>
                      )}
                      {c.provincia && <span className="truncate text-gray-400">· {c.provincia}</span>}
                      {/* En el celular no hay lugar para una columna más sin
                          que la lista se vaya de lado, así que las compras del
                          año van acá, empujadas a la derecha de esta misma
                          línea. `shrink-0` + `truncate` en la provincia: si el
                          nombre de la provincia es largo, se recorta ella, no
                          el monto. */}
                      <span className="ml-auto shrink-0 tabular-nums">
                        {(() => {
                          const v = comprasDe(c.codigo);
                          if (v === undefined) return <span className="text-gray-300">…</span>;
                          return <span className={v > 0 ? "font-medium text-gray-900" : "text-gray-400"}>${fmt(v)}</span>;
                        })()}
                      </span>
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
                onClick={() => setPage(Math.max(1, page - 1))}
                className="border border-gray-200 rounded-md px-4 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
              >
                ← Anterior
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
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

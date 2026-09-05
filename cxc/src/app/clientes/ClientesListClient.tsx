"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE CLIENTES — lo que se ve.
//
// Cuatro columnas y nada más: **Cliente · Compró <año> · Debe · Cómo
// contactarlo**. No hay «vs el año pasado», ni «empresas», ni «nuevos»: eso ya
// lo hace Ventas › Clientes y sería una segunda pantalla igual.
//
// 🔴 SE ORDENA TOCANDO EL ENCABEZADO, de mayor a menor primero (otro toque
// invierte). Mismo patrón que Cuentas por Cobrar. La regla vive en
// `lib/clientes/lista.ts`, no acá.
//
// 🔴 EN CELULAR SON TARJETAS, no tabla: Daniel entra desde el iPhone.
//
// 🩸 SE FUERON la paginación y el filtro por provincia — ver el encabezado de
// `page.tsx` con los números medidos.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { EmptyState, PullToRefresh, ScrollableTable, SkeletonTable } from "@/components/ui";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { telHref, mailtoHref } from "@/lib/contact-links";
import { coincideBusqueda } from "@/lib/buscar-normalizado";
import { dinero } from "@/lib/clientes/ficha";
import {
  contarChips,
  contarClientes,
  comoContactarlo,
  filtrarPorChip,
  flechaOrden,
  ordenar,
  ordenAlTocar,
  ORDEN_INICIAL,
  type ChipId,
  type ColumnaOrden,
  type Orden,
} from "@/lib/clientes/lista";

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  razon_social?: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  /** Saldo de hoy, ya sumado entre las 6 del grupo. Viene del servidor. */
  debe: number;
}

interface YtdResp {
  anio: number;
  ytd: Record<string, number>;
}

const CHIPS_VALIDOS: ChipId[] = ["todos", "sin-contacto", "sin-correo", "sin-telefono", "deben"];

export default function ClientesListClient({ initialClientes }: { initialClientes: Cliente[] }) {
  const { authChecked } = useAuth({
    moduleKey: "directorio",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
  });
  const router = useRouter();

  // 🔴 LA BÚSQUEDA Y EL CHIP VIVEN EN LA URL, con `replace`: son filtros del
  // MISMO nivel, así que no crean entrada de historial y el Atrás no cicla por
  // ellos. Entrar a una ficha y volver conserva lo que se estaba mirando — eso
  // es lo que resolvió el `useUrlState` de esta pantalla y no se toca.
  const [qUrl, setQUrl] = useUrlState("search", "");
  const [chipUrl, setChipUrl] = useUrlState("filtro", "todos");
  const chip: ChipId = CHIPS_VALIDOS.includes(chipUrl as ChipId) ? (chipUrl as ChipId) : "todos";

  // Input inmediato vs término que entra a la URL (debounce 250 ms): sin el
  // debounce cada tecla sería una navegación.
  const [q, setQ] = useState(qUrl);
  useEffect(() => { setQ(qUrl); }, [qUrl]);
  useEffect(() => {
    if (q === qUrl) return;
    const t = setTimeout(() => setQUrl(q), 250);
    return () => clearTimeout(t);
  }, [q, qUrl, setQUrl]);

  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);

  // Compras del año: se piden APARTE, con TODOS los códigos de la lista. Va en
  // su propia llamada a propósito — leer las facturas del año de 150 clientes
  // cuesta ~2.280 filas (medido), y si viajara junto con la lista la tabla
  // entera esperaría por la columna. Así la tabla sale al instante y el monto
  // aparece un momento después.
  const codigos = useMemo(
    () => initialClientes.map((c) => c.codigo).filter(Boolean).join(","),
    [initialClientes],
  );
  const { data: ytdData, mutate } = useSWR<YtdResp>(
    authChecked && codigos ? (["clientes-ytd", codigos] as const) : null,
    async ([, lista]: readonly [string, string]): Promise<YtdResp> => {
      const res = await fetch(`/api/clientes/ytd?codigos=${encodeURIComponent(lista)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar compras del año");
      return (await res.json()) as YtdResp;
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const anio = ytdData?.anio ?? new Date().getFullYear();

  // Sin respuesta todavía → `undefined` (se muestra «…»). Con respuesta y sin
  // entrada → 0, que es la verdad: no compró nada este año.
  const conCompras = useMemo(
    () =>
      initialClientes.map((c) => ({
        ...c,
        compras: ytdData ? (ytdData.ytd[c.codigo] ?? 0) : undefined,
      })),
    [initialClientes, ytdData],
  );

  // 🔴 LOS CONTEOS SE CALCULAN. Y se cuentan sobre la lista ENTERA, no sobre lo
  // que la búsqueda dejó: un chip que dice «Sin correo 3» porque estás buscando
  // «City» no sirve para nada.
  const chips = useMemo(() => contarChips(conCompras), [conCompras]);

  const visibles = useMemo(() => {
    const porChip = filtrarPorChip(conCompras, chip);
    const buscados = q.trim()
      ? porChip.filter((c) => coincideBusqueda(q, [c.nombre, c.codigo, c.razon_social ?? ""]))
      : porChip;
    return ordenar(buscados, orden);
  }, [conCompras, chip, q, orden]);

  const tocarColumna = useCallback((columna: ColumnaOrden) => {
    setOrden((actual) => ordenAlTocar(actual, columna));
  }, []);

  const onRefresh = useCallback(async () => {
    await mutate();
    router.refresh();
  }, [mutate, router]);

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Clientes" />
      <PullToRefresh onRefresh={onRefresh}>
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="mb-4 flex flex-wrap items-start justify-end gap-3">
            <h1 className="sr-only">Clientes</h1>
            <SyncNowButton
              opciones={[{ modulo: "clientes-master" }]}
              onSuccess={async () => { router.refresh(); await mutate(); }}
            />
          </div>

          <input
            type="search"
            placeholder="Buscar por nombre o código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 border border-gray-200 rounded-md px-3 min-h-[44px] text-sm outline-none focus:border-black transition w-full"
          />

          {/* Chips. El número va pegado a la etiqueta y sale de contar, nunca de
              una constante escrita a mano. */}
          <div data-bloque="chips" className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => {
              const activo = c.id === chip;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setChipUrl(c.id)}
                  className={`inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs transition ${
                    activo
                      ? "border-black bg-black text-white"
                      : "border-gray-200 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {c.etiqueta}{" "}
                  <span className={`ml-1.5 tabular-nums ${activo ? "text-white/70" : "text-gray-400"}`}>
                    {c.cuantos}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 mb-2 text-xs text-gray-500 tabular-nums">{contarClientes(visibles.length)}</p>

          {!ytdData && initialClientes.length === 0 ? (
            <SkeletonTable rows={8} cols={4} />
          ) : visibles.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              subtitle={q || chip !== "todos" ? undefined : "Todavía no hay clientes cargados."}
            />
          ) : (
            <>
              {/* Escritorio: tabla. El corte es `lg` porque lo que decide es el
                  ancho ÚTIL: la barra lateral se lleva 224 px. */}
              <div data-vista="tabla" className="hidden lg:block">
                <ScrollableTable>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                        <Encabezado columna="cliente" orden={orden} onClick={tocarColumna}>Cliente</Encabezado>
                        <Encabezado columna="compras" orden={orden} onClick={tocarColumna} derecha>Compró {anio}</Encabezado>
                        <Encabezado columna="debe" orden={orden} onClick={tocarColumna} derecha>Debe</Encabezado>
                        <th className="py-2 px-1.5 xl:px-3 font-normal">Cómo contactarlo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((c) => {
                        const contacto = comoContactarlo(c);
                        return (
                          <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                            <td className="py-2 px-1.5 xl:px-3">
                              <Link href={`/clientes/${encodeURIComponent(c.codigo)}`} className="font-medium hover:underline">
                                {c.nombre}
                              </Link>
                              <span className="ml-2 text-xs tabular-nums text-gray-400">{c.codigo}</span>
                            </td>
                            <CeldaMonto valor={c.compras} />
                            <CeldaDebe valor={c.debe} />
                            <td className="py-2 px-1.5 xl:px-3">
                              <Contacto c={contacto} nombre={c.nombre} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>

              {/* Celular e iPad: tarjetas. Toda la tarjeta navega a la ficha. */}
              <ul data-vista="tarjetas" className="border-t border-gray-100 lg:hidden">
                {visibles.map((c) => {
                  const contacto = comoContactarlo(c);
                  return (
                    <li
                      key={c.id}
                      onClick={() => router.push(`/clientes/${encodeURIComponent(c.codigo)}`)}
                      className="border-b border-gray-100 px-1 py-3 active:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{c.nombre}</span>
                        <span className="shrink-0 text-xs tabular-nums text-gray-400">{c.codigo}</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-3 text-xs tabular-nums">
                        <span className="text-gray-500">
                          Compró{" "}
                          {c.compras === undefined ? (
                            <span className="text-gray-300">…</span>
                          ) : (
                            <span className={c.compras > 0 ? "font-medium text-gray-900" : "text-gray-400"}>
                              {dinero(c.compras)}
                            </span>
                          )}
                        </span>
                        <span className={c.debe > 0 ? "font-medium text-red-700" : c.debe < 0 ? "text-blue-600" : "text-gray-400"}>
                          {c.debe === 0 ? "No debe" : c.debe < 0 ? `A favor ${dinero(Math.abs(c.debe))}` : `Debe ${dinero(c.debe)}`}
                        </span>
                      </div>
                      <div className="mt-1 text-xs">
                        <Contacto c={contacto} nombre={c.nombre} tocable />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}

function Encabezado({
  columna, orden, onClick, derecha, children,
}: {
  columna: ColumnaOrden;
  orden: Orden;
  onClick: (c: ColumnaOrden) => void;
  derecha?: boolean;
  children: React.ReactNode;
}) {
  const activo = orden.columna === columna;
  return (
    <th className={`py-2 px-1.5 xl:px-3 font-normal ${derecha ? "text-right" : ""}`} aria-sort={activo ? (orden.sentido === "desc" ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => onClick(columna)}
        className={`inline-flex min-h-[32px] items-center gap-1 uppercase tracking-[0.05em] transition hover:text-gray-700 ${activo ? "text-gray-700" : ""}`}
      >
        {children}
        <span aria-hidden="true" className="text-[10px]">{flechaOrden(orden, columna)}</span>
      </button>
    </th>
  );
}

/** «…» mientras el monto no llegó; gris cuando de verdad es cero — un cliente en
 *  cero es un dato, no un hueco. */
function CeldaMonto({ valor }: { valor: number | undefined }) {
  if (valor === undefined) {
    return <td className="py-2 px-1.5 xl:px-3 text-right tabular-nums text-gray-300">…</td>;
  }
  return (
    <td className={`py-2 px-1.5 xl:px-3 text-right tabular-nums ${valor > 0 ? "text-gray-900" : "text-gray-400"}`}>
      {dinero(valor)}
    </td>
  );
}

/** Saldo a favor del CLIENTE (negativo) en azul: no es deuda, es crédito. */
function CeldaDebe({ valor }: { valor: number }) {
  if (valor < 0) {
    return <td className="py-2 px-1.5 xl:px-3 text-right tabular-nums text-blue-600">A favor {dinero(Math.abs(valor))}</td>;
  }
  return (
    <td className={`py-2 px-1.5 xl:px-3 text-right tabular-nums ${valor > 0 ? "text-red-700" : "text-gray-400"}`}>
      {valor > 0 ? dinero(valor) : "—"}
    </td>
  );
}

/**
 * 🔴 SI FALTA, SE DICE EN ROJO. Es el trabajo de esta pantalla: de 150 clientes,
 * 50 no tienen correo y 48 no tienen teléfono.
 *
 * 🔴 EN CELULAR, LLAMAR ES LA ACCIÓN NATURAL DEL MÓDULO y el enlace tiene que
 * medir 44×44 — antes era un `tel:` de 18 px de alto. El alto extra se absorbe
 * con `-my-1.5` para no estirar la tarjeta, y `min-w-[44px]` cubre los teléfonos
 * cortos. Tocar el teléfono **no navega a la ficha**: `stopPropagation`.
 */
function Contacto({
  c,
  nombre,
  tocable = false,
}: {
  c: ReturnType<typeof comoContactarlo>;
  nombre: string;
  /** En la tarjeta de celular los enlaces son de 44 px; en la tabla, no. */
  tocable?: boolean;
}) {
  const tHref = telHref(c.telefono);
  const mHref = mailtoHref(c.correo);
  const grande = tocable ? "-my-1.5 inline-flex min-h-[44px] min-w-[44px] items-center" : "";
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {c.correo && (
        <a
          href={mHref ?? undefined}
          onClick={(e) => e.stopPropagation()}
          className={`max-w-[14rem] truncate text-blue-600 hover:underline ${grande}`}
        >
          {c.correo}
        </a>
      )}
      {c.telefono && (
        <a
          href={tHref ?? undefined}
          aria-label={`Llamar a ${nombre}`}
          onClick={(e) => e.stopPropagation()}
          className={`tabular-nums text-blue-600 hover:underline ${grande}`}
        >
          {c.telefono}
        </a>
      )}
      {c.falta && <span className="text-red-600">{c.falta}</span>}
    </span>
  );
}

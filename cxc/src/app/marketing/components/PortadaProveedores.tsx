"use client";

// ============================================================================
// Marketing › PROVEEDORES — la lista y la ficha (6-oct-2026)
//
// La pregunta de la pantalla (docs/diseno.md, regla 1):
//   Lista → «¿a quién le pagamos, y cuánto de eso recobramos?»
//   Ficha → «¿todo lo que se le pagó a este proveedor, y a dónde fue?»
//
// Reglas de diseño que esta pantalla sigue:
//   · Paleta estándar: negro, grises, `emerald` para lo recobrado. Nada de
//     colores inventados (`docs/diseno.md` › «La paleta estándar»).
//   · Nada de párrafos arriba: lo que aporta va en UNA línea gris AL FINAL.
//   · Toda columna se ordena tocando el encabezado (`useOrdenTabla`).
//   · Un cero que dice que falta algo SÍ se muestra: «recobrado $0.00» avisa
//     que a ese proveedor no se le pasó nada a ninguna marca.
//   · En el celular una fila es un nombre y UN monto; el resto, al tocar
//     (24-sep-2026, `MARKETING_CELULAR`).
// ============================================================================

import { MKT_SOLO_COBRABLE_2026_10 } from "@/lib/marketing/solo-cobrable-2026-10";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Aviso } from "@/components/ui/Aviso";
import { ThOrden, useOrdenTabla } from "@/components/ui/OrdenTabla";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import {
  ROTULO_A_CARGO_EMPRESA,
  type FichaProveedor,
  type FilaProveedor,
} from "@/lib/marketing/proveedores-2026-10";
import { useEsCelular } from "./celular/useEsCelular";

interface Respuesta {
  lista: FilaProveedor[];
  ficha: FichaProveedor | null;
}

/** Las columnas que se ordenan tocando el encabezado. */
const COLUMNAS_ORDEN = ["nombre", "facturas", "pagado", "recobrado"] as const;

export default function PortadaProveedores({ refreshKey }: { refreshKey?: number }) {
  // Abrir una ficha es un DRILL-DOWN: `push`, para que Atrás vuelva a la lista
  // (CLAUDE.md › «Navegación e Historial»).
  const [prov, setProv] = useUrlState<string>("prov", "", { history: "push" });
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const cel = useEsCelular();

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const q = prov ? `?prov=${encodeURIComponent(prov)}` : "";
    fetch(`/api/marketing/proveedores-ficha${q}`)
      .then(async (r) => {
        const j = (await r.json()) as Respuesta & { error?: string };
        if (!r.ok) throw new Error(j.error ?? "No se pudo leer");
        return j;
      })
      .then((j) => {
        if (!vivo) return;
        setDatos(j);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : "No se pudo leer");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [prov, refreshKey]);

  const abrir = useCallback((clave: string) => setProv(clave), [setProv]);

  // 🔴 UN SOLO AVISO EN LÍNEA: `<Aviso>` y nada más (candado `aviso-en-linea`).
  if (error) return <Aviso tono="error">{error}</Aviso>;
  if (cargando && !datos) {
    return <p className="py-6 text-sm text-gray-500">Cargando…</p>;
  }
  if (prov && datos?.ficha) {
    return <Ficha ficha={datos.ficha} cel={cel} onVolver={() => setProv("")} />;
  }
  return <Lista filas={datos?.lista ?? []} cel={cel} onAbrir={abrir} />;
}

// ─── LA LISTA ────────────────────────────────────────────────────────────────

function Lista({
  filas,
  cel,
  onAbrir,
}: {
  filas: FilaProveedor[];
  cel: boolean;
  onAbrir: (clave: string) => void;
}) {
  // Abre por lo PAGADO, de más a menos: la pregunta es «¿a quién le pagamos
  // más?». Tocar un encabezado reordena (`docs/diseno.md`, 6-oct-2026).
  const api = useOrdenTabla("mkt-proveedores", {
    columnas: COLUMNAS_ORDEN,
    textos: ["nombre"],
    inicial: { col: "pagado", dir: "desc" },
  });
  const ordenadas = useMemo(
    () => api.ordenar(filas, (f, col) => f[col]),
    [filas, api],
  );
  const totalPagado = filas.reduce((s, f) => s + f.pagado, 0);
  const totalRecobrado = filas.reduce((s, f) => s + f.recobrado, 0);

  if (filas.length === 0) {
    return <p className="py-6 text-sm text-gray-500">Todavía no hay facturas de proveedores.</p>;
  }

  // 🔴 En el celular, una fila es un nombre y UN monto.
  if (cel) {
    return (
      <div>
        <ul className="divide-y divide-gray-100">
          {ordenadas.map((f) => (
            <li key={f.clave}>
              <button
                type="button"
                onClick={() => onAbrir(f.clave)}
                className="flex w-full min-h-[44px] items-center justify-between gap-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-gray-900">{f.nombre}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {f.facturas} {f.facturas === 1 ? "factura" : "facturas"}
                    {f.alias.length > 0 ? ` · Alias: ${f.alias.join(" · ")}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-gray-900">
                  {formatearMonto(f.pagado)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <PieDeLaLista
          n={filas.length}
          pagado={totalPagado}
          recobrado={totalRecobrado}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <ThOrden col="nombre" api={api} className="px-3 py-2 font-medium">
                Proveedor
              </ThOrden>
              <ThOrden col="facturas" api={api} derecha className="px-3 py-2 font-medium">
                Facturas
              </ThOrden>
              <ThOrden col="pagado" api={api} derecha className="px-3 py-2 font-medium">
                Pagado
              </ThOrden>
              <ThOrden col="recobrado" api={api} derecha className="px-3 py-2 font-medium">
                Recobrado
              </ThOrden>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => (
              <tr
                key={f.clave}
                onClick={() => onAbrir(f.clave)}
                className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <td className="px-3 py-2">
                  <span className="text-gray-900">{f.nombre}</span>
                  {f.alias.length > 0 && (
                    <span className="ml-2 text-xs text-gray-500">
                      Alias: {f.alias.join(" · ")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {f.facturas}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                  {formatearMonto(f.pagado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                  {formatearMonto(f.recobrado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PieDeLaLista n={filas.length} pagado={totalPagado} recobrado={totalRecobrado} />
    </div>
  );
}

/** 🔴 Lo que aporta va en UNA línea gris AL FINAL, nunca arriba. */
function PieDeLaLista({
  n,
  pagado,
  recobrado,
}: {
  n: number;
  pagado: number;
  recobrado: number;
}) {
  return (
    <p className="mt-2 text-xs text-gray-500">
      {n} {n === 1 ? "proveedor" : "proveedores"} · pagado {formatearMonto(pagado)} ·
      recobrado {formatearMonto(recobrado)}
    </p>
  );
}

// ─── LA FICHA ────────────────────────────────────────────────────────────────

function Ficha({
  ficha,
  cel,
  onVolver,
}: {
  ficha: FichaProveedor;
  cel: boolean;
  onVolver: () => void;
}) {
  // 🔴 SOLO LO COBRABLE: lo de un período abierto no es «a cargo de la
  // empresa», es lo que falta cobrar. Apagado, `porCobrar` es 0.
  const propio = ficha.pagado - ficha.recobrado - (MKT_SOLO_COBRABLE_2026_10 ? ficha.porCobrar : 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onVolver}
          className="min-h-[44px] text-sm text-blue-600 hover:text-blue-800"
        >
          ← Proveedores
        </button>
        <h2 className="text-base font-medium text-gray-900">{ficha.nombre}</h2>
        {ficha.alias.length > 0 && (
          <span className="text-xs text-gray-500">Alias: {ficha.alias.join(" · ")}</span>
        )}
      </div>

      {ficha.renglones.length === 0 ? (
        <p className="py-6 text-sm text-gray-500">Sin facturas registradas.</p>
      ) : cel ? (
        <ul className="divide-y divide-gray-100">
          {ficha.renglones.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm text-gray-900">{r.concepto}</span>
                <span className="block truncate text-xs text-gray-500">
                  {formatearFecha(r.fecha)} · {r.destino}
                  {r.seReporta ? "" : " · no se reporta"}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-gray-900">
                {formatearMonto(r.monto)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">N° factura</th>
                <th className="px-3 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 font-medium">Destino</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {ficha.renglones.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">
                    {formatearFecha(r.fecha)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">
                    {r.numeroFactura}
                  </td>
                  <td className="px-3 py-2 text-gray-900">{r.concepto}</td>
                  <td className="px-3 py-2">
                    <span className={r.recobra ? "text-gray-900" : "text-gray-500"}>
                      {r.destino}
                    </span>
                    {!r.seReporta && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        No se reporta
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                    {formatearMonto(r.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* 🔴 LOS DOS TOTALES DEL PIE, que cierran con la pantalla. */}
            <tfoot>
              <tr className="border-t border-gray-300 font-medium">
                <td colSpan={4} className="px-3 py-2 text-gray-700">
                  Total pagado
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                  {formatearMonto(ficha.pagado)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-gray-700">
                  Recobrado de marcas
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                  {formatearMonto(ficha.recobrado)}
                </td>
              </tr>
              {MKT_SOLO_COBRABLE_2026_10 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-gray-700">
                    Por cobrar
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                    {formatearMonto(ficha.porCobrar)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {ficha.renglones.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {ficha.renglones.length}{" "}
          {ficha.renglones.length === 1 ? "factura" : "facturas"} · pagado{" "}
          {formatearMonto(ficha.pagado)} · recobrado {formatearMonto(ficha.recobrado)} ·{" "}
          {MKT_SOLO_COBRABLE_2026_10 && <>por cobrar {formatearMonto(ficha.porCobrar)} ·{" "}</>}
          {ROTULO_A_CARGO_EMPRESA.toLowerCase()} {formatearMonto(propio)}
        </p>
      )}
    </div>
  );
}

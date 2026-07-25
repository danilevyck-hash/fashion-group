"use client";

// Subtab "Caja" de Multifashion: cierre diario de la tienda según Switch
// (/apireporte/diarioventas vía api/multifashion/caja, con caché server-side).
// Para el cuadre de caja de ACS: la gerente compara el gran total y el desglose
// por forma de pago contra lo contado físicamente al cierre.

import { useState } from "react";
import useSWR from "swr";
import { fmt } from "@/lib/format";
import type { SwitchDiarioVentas } from "@/lib/switch-api/client";

interface CajaResponse {
  fecha: string;
  caja: SwitchDiarioVentas;
  synced_at: string;
  cached: boolean;
  stale?: boolean;
  error?: string;
}

function hoyPanama(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
}

async function fetchCaja(fecha: string): Promise<CajaResponse> {
  const res = await fetch(`/api/multifashion/caja?fecha=${fecha}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json as CajaResponse;
}

function minutosDesde(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function CajaSubtab() {
  const hoy = hoyPanama();
  const [fecha, setFecha] = useState(hoy);

  const { data, error, isLoading, mutate, isValidating } = useSWR<CajaResponse>(
    ["multifashion-caja", fecha],
    () => fetchCaja(fecha),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const caja = data?.caja;
  const ventas = num(caja?.totalVentas);
  const nc = Math.abs(num(caja?.totalNotasCredito)); // llega negativa (quirk Switch)
  const impuestos = num(caja?.totalImpuestoVenta) - num(caja?.totalImpuestoNotaCredito);
  const granTotal = num(caja?.granTotal);
  const formas = (caja?.formasDePago ?? []).map((f) => ({ nombre: f.nombre, total: num(f.total) }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      {/* Selector de día + freshness */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="caja-fecha" className="text-xs uppercase tracking-[0.05em] text-gray-400">Día</label>
          <input
            id="caja-fecha"
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => { if (e.target.value) setFecha(e.target.value); }}
            className="border border-gray-200 rounded-md px-3 min-h-[44px] text-sm tabular-nums outline-none focus:border-black transition bg-white"
          />
        </div>
        {data && (
          <div className="flex items-center gap-2 text-xs text-gray-400 tabular-nums">
            {data.stale && <span className="text-amber-600 font-medium">Switch no respondió — mostrando último dato</span>}
            <span>Actualizado hace {minutosDesde(data.synced_at)} min</span>
            <button
              onClick={() => mutate()}
              disabled={isValidating}
              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 transition active:scale-[0.97] disabled:opacity-40"
            >
              {isValidating ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-hidden>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />)}
          </div>
          <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-700">{error instanceof Error ? error.message : "No se pudo cargar la caja."}</p>
          <button onClick={() => mutate()} className="mt-3 bg-black text-white text-sm px-4 py-2 rounded-md hover:bg-gray-800 transition active:scale-[0.97]">
            Reintentar
          </button>
        </div>
      ) : caja ? (
        <>
          {/* KPIs del día */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Ventas</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">${fmt(ventas)}</div>
              <div className="text-xs text-gray-400 tabular-nums">{Math.round(num(caja.totalVentasEmitidas))} facturas</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Notas de crédito</div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${nc > 0 ? "text-red-700" : "text-gray-400"}`}>
                {nc > 0 ? `−$${fmt(nc)}` : "—"}
              </div>
              <div className="text-xs text-gray-400 tabular-nums">{Math.round(num(caja.totalNotaCreditoEmitidas))} emitidas</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs uppercase tracking-[0.05em] text-gray-400">ITBMS neto</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-gray-700">${fmt(impuestos)}</div>
              <div className="text-xs text-gray-400">impuesto ventas − NC</div>
            </div>
            <div className="rounded-lg border-2 border-teal-700 p-4">
              <div className="text-xs uppercase tracking-[0.05em] text-teal-700 font-medium">Gran total del día</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-teal-800">${fmt(granTotal)}</div>
              {caja.horaUltimaVenta && (
                <div className="text-xs text-gray-400 tabular-nums">última venta {caja.horaUltimaVenta.slice(0, 5)}</div>
              )}
            </div>
          </div>

          {/* Desglose por forma de pago — el corazón del cuadre de caja */}
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-3">Formas de pago</h3>
            {formas.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Sin movimientos este día</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {formas.map((f) => (
                    <tr key={f.nombre} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 text-gray-700">{f.nombre}</td>
                      <td className="py-2 text-right tabular-nums text-gray-500">
                        {granTotal > 0 ? `${Math.round((f.total / granTotal) * 100)}%` : ""}
                      </td>
                      <td className="py-2 pl-4 text-right tabular-nums font-medium w-32">${fmt(f.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5">Total</td>
                    <td />
                    <td className="py-2.5 pl-4 text-right tabular-nums">${fmt(formas.reduce((s, f) => s + f.total, 0))}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-gray-400">
            El día en curso se refresca cada 10 minutos.
          </p>
        </>
      ) : null}
    </div>
  );
}

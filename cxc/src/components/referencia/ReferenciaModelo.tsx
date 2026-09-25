"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DEL MODELO Y SUS COLORES (25-sep-2026, `REFERENCIA_2026_09`).
//
// 🩸 HASTA HOY, BUSCAR `NB2570` DIBUJABA 26 TARJETAS DE COLOR Y NINGUNA DEL
// MODELO. Lo que Daniel compra es el modelo, y para saber cuánto llevaba
// comprado tenía que sumar 26 tarjetas a mano.
//
// La forma, tal cual el mockup aprobado:
//   NB2570 · Men-Boxer Brief · Vistana · 26 colores
//   ┌ La mercancía ────────────────────────────────┐
//   │ Compré · Vendí · Stock · % vendido            │   ← rótulos del oficio
//   ├ Llegadas ────────────────────────────────────┤
//   │ 27 desde oct 2022                             │
//   ├ Las dos últimas llegadas ────────────────────┤
//   │ ago 2026 · 360 · el 80 % en — · queda 100 %   │
//   │ nov 2025 · 360 · el 80 % en 21 sem · vendida  │
//   ├──────────────────────────────────────────────┤
//   │ FOB $15.05 · Precio prom $26.60 · Margen 38 % │
//   │ Ene–Mar 245 · Abr–Jun 112 · Jul–Sep 211 · …   │   ← trimestres, plano
//   └ Más info › ──────────────────────────────────┘
//
// 🔴 LA MISMA VISTA EN EL CELULAR Y EN LA COMPUTADORA. Daniel: *«lo mismo para
// los dos»*. No hay una rama por aparato: la tabla de colores desliza sola
// cuando no cabe, y nada más cambia.
//
// 🔴 ACÁ NO SE CALCULA NADA. Todo sale de `referencia-modelo.ts` y
// `referencia-llegadas.ts` (puros); el 80 % se declara «aprox.» porque lo es.
//
// 🩸 LO QUE NO ESTÁ, PORQUE DANIEL LO SACÓ: cliente principal, hermanos,
// semáforo, «piezas/mes» y «te dura».
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ArticuloCompras } from "@/lib/ventas/compras";
import { ROTULOS } from "@/lib/ventas/referencia-pantalla";
import {
  armarTarjetaModelo,
  type FilaColor,
  type TarjetaModelo,
  type TrimestreVenta,
} from "@/lib/ventas/referencia-modelo";
import type { LlegadaMedida } from "@/lib/ventas/referencia-llegadas";
import { barrasDeVentana, fmtFechaCorta, fmtMesAnio, fmtMesCorto, pctVendido } from "@/lib/ventas/resumen-articulo";
import { etiquetaEmpresa, fmtInt, fmtMoney, fmtPct } from "./ReferenciaTarjeta";

// ─── Textos (una sola definición para pantalla y candado) ────────────────────

/** «21 sem» o «—» cuando la llegada todavía no completó su 80 %. */
export function textoOchenta(l: LlegadaMedida | null): string {
  if (!l || l.semanas == null) return "—";
  return `${fmtInt(l.semanas)} sem`;
}

/** «vendida» cuando ya salió entera; si no, «queda N %». */
export function textoQueda(l: LlegadaMedida | null): string {
  if (!l || l.quedaPct == null) return "—";
  return l.quedaPct === 0 ? "vendida" : `queda ${l.quedaPct} %`;
}

/** «27 desde oct 2022». `null` = no hay ninguna registrada. */
export function textoLlegadas(t: Pick<TarjetaModelo, "llegadas" | "primerMesLlegada">): string | null {
  if (t.llegadas.length === 0) return null;
  const desde = t.primerMesLlegada ? ` desde ${fmtMesAnio(t.primerMesLlegada)}` : "";
  return `${fmtInt(t.llegadas.length)}${desde}`;
}

/** El % vendido con la MISMA regla de siempre (stock > 0 nunca dice 100 %). */
function textoPct(parte: number | null): string {
  return parte == null ? "—" : `${pctVendido(parte)} %`;
}

// ─── Piezas chicas ───────────────────────────────────────────────────────────

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">{titulo}</p>
      {children}
    </div>
  );
}

function TablaMercancia({
  comprado,
  vendido,
  stock,
  parteVendida,
}: {
  comprado: number | null;
  vendido: number;
  stock: number | null;
  parteVendida: number | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
            <th className="py-1 text-left font-medium">{ROTULOS.comprado}</th>
            <th className="py-1 text-right font-medium">{ROTULOS.vendido}</th>
            <th className="py-1 text-right font-medium">{ROTULOS.stock}</th>
            <th className="py-1 text-right font-medium">{ROTULOS.pctVendido}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-2 text-left text-gray-900">{comprado == null ? "—" : fmtInt(comprado)}</td>
            <td className="py-2 text-right text-gray-900">{fmtInt(vendido)}</td>
            <td className="py-2 text-right text-lg font-semibold text-gray-900">
              {stock == null ? "—" : fmtInt(stock)}
            </td>
            <td className="py-2 text-right text-gray-900">{textoPct(parteVendida)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Las DOS últimas llegadas: la última y la anterior QUE SÍ SE VENDIÓ. */
function TablaLlegadas({ ultima, vara }: { ultima: LlegadaMedida | null; vara: LlegadaMedida | null }) {
  const filas = [ultima, vara].filter((l): l is LlegadaMedida => l != null);
  if (filas.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
            <th className="py-1 text-left font-medium">{ROTULOS.llegada}</th>
            <th className="py-1 text-right font-medium">{ROTULOS.piezas}</th>
            <th className="py-1 text-right font-medium">{ROTULOS.ochenta}</th>
            <th className="py-1 text-right font-medium">{ROTULOS.queda}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => (
            <tr key={l.fecha} className="border-b border-gray-100 last:border-0">
              <td className="py-2 text-left text-gray-900">{fmtMesAnio(l.fecha.slice(0, 7))}</td>
              <td className="py-2 text-right text-gray-900">{fmtInt(l.unidades)}</td>
              <td className="py-2 text-right font-medium text-gray-900">{textoOchenta(l)}</td>
              <td className="py-2 text-right text-gray-600">{textoQueda(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-gray-600">
        El 80 % es aprox.: se vende primero lo que llegó primero, y las cajas no vienen marcadas.
      </p>
    </div>
  );
}

/** FOB · Precio prom · Margen, en UNA línea. */
function LineaPlata({ t, mostrarMargen }: { t: TarjetaModelo; mostrarMargen: boolean }) {
  const partes: string[] = [];
  if (t.fob != null) partes.push(`FOB ${fmtMoney(t.fob)}`);
  if (t.margen.precioReal != null) partes.push(`Precio prom ${fmtMoney(t.margen.precioReal)}`);
  if (mostrarMargen && t.margen.margen != null) partes.push(`Margen ${fmtPct(t.margen.margen)}`);
  if (!partes.length) return null;
  return <p className="mt-3 border-t border-gray-100 pt-2.5 text-sm text-gray-900">{partes.join(" · ")}</p>;
}

/** «Ene–Mar 245 · Abr–Jun 112 · Jul–Sep 211 · Oct–Dic 431» — plano. */
function RenglonTrimestres({ trimestres, titulo }: { trimestres: TrimestreVenta[]; titulo?: string }) {
  if (!trimestres.length) return null;
  return (
    <p className="mt-1.5 text-sm text-gray-700">
      {titulo && <span className="text-gray-600">{titulo} </span>}
      {trimestres.map((q, i) => (
        <span key={`${q.etiqueta}·${q.anio}`}>
          {i > 0 && <span className="text-gray-400"> · </span>}
          {q.etiqueta} <span className="font-semibold tabular-nums text-gray-900">{fmtInt(q.unidades)}</span>
        </span>
      ))}
    </p>
  );
}

/** La gráfica mes a mes, SOLA: barras, mes y unidades. Sin líneas de texto. */
function GraficaMesAMes({ serie, hoyMes }: { serie: TarjetaModelo["serie"]; hoyMes: string }) {
  const barras = useMemo(() => barrasDeVentana(serie, hoyMes), [serie, hoyMes]);
  const pico = Math.max(1, ...barras.map((b) => Math.max(0, b.unidades)));
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, barras.length)}, minmax(0, 1fr))` };
  return (
    <div>
      <div className="grid items-end gap-[2px]" style={{ ...cols, height: 44 }} aria-hidden="true">
        {barras.map((b) => (
          <span
            key={b.mes}
            className={`block rounded-t-sm ${b.unidades > 0 ? (b.fuerte ? "bg-gray-900" : "bg-gray-400") : "bg-gray-200"}`}
            style={{ height: b.unidades > 0 ? Math.max(3, Math.round((b.unidades / pico) * 44)) : 3 }}
          />
        ))}
      </div>
      <div className="mt-1 grid gap-[2px]" style={cols}>
        {barras.map((b) => (
          <span
            key={b.mes}
            className={`overflow-hidden text-center text-xs ${b.fuerte ? "font-semibold text-gray-900" : "text-gray-500"}`}
          >
            {fmtMesCorto(b.mes)}
          </span>
        ))}
      </div>
      <div className="grid gap-[2px]" style={cols}>
        {barras.map((b) => (
          <span key={b.mes} className="overflow-hidden text-center text-xs tabular-nums text-gray-900">
            {b.unidades === 0 ? "—" : fmtInt(b.unidades)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── «Más info ›» ────────────────────────────────────────────────────────────

function MasInfo({ t, hoyMes }: { t: TarjetaModelo; hoyMes: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex min-h-[44px] w-full items-center gap-1.5 text-left text-sm font-medium text-gray-900"
      >
        {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Más info
        {!abierto && (
          <span className="font-normal text-gray-600">· llegadas, mes a mes, precio de lista y CIF</span>
        )}
      </button>
      {abierto && (
        <div className="pb-1">
          {t.llegadas.length > 0 && (
            <Seccion titulo={`Todas las llegadas · ${textoLlegadas(t) ?? ""}`}>
              <ul className="grid grid-cols-2 gap-x-4 text-sm tabular-nums sm:grid-cols-3">
                {t.llegadas.map((l) => (
                  <li key={l.fecha} className="flex justify-between border-b border-gray-100 py-0.5 text-gray-700">
                    <span>{fmtFechaCorta(l.fecha)}</span>
                    <span className="font-medium text-gray-900">{fmtInt(l.unidades)}</span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
          <Seccion titulo="Mes a mes · unidades">
            <GraficaMesAMes serie={t.serie} hoyMes={hoyMes} />
          </Seccion>
          <Seccion titulo="Precio y costo">
            <p className="text-sm text-gray-900">
              {[
                t.precioLista != null ? `Precio de lista ${fmtMoney(t.precioLista)}` : null,
                t.margen.costo != null ? `Costo CIF ${fmtMoney(t.margen.costo)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </Seccion>
          {t.trimestresAnterior.length > 0 && (
            <Seccion titulo="Por trimestre · el año anterior">
              <RenglonTrimestres trimestres={t.trimestresAnterior} />
            </Seccion>
          )}
        </div>
      )}
    </div>
  );
}

// ─── El cuerpo de la tarjeta (modelo o color: la MISMA forma) ────────────────

export function CuerpoTarjetaModelo({
  t,
  hoyMes,
  mostrarMargen,
}: {
  t: TarjetaModelo;
  hoyMes: string;
  mostrarMargen: boolean;
}) {
  const llegadas = textoLlegadas(t);
  return (
    <div className="px-3.5 py-3">
      <Seccion titulo="La mercancía">
        <TablaMercancia
          comprado={t.comprado}
          vendido={t.vendido}
          stock={t.stock}
          parteVendida={t.parteVendida}
        />
      </Seccion>
      {llegadas && (
        <Seccion titulo="Llegadas">
          <p className="text-sm tabular-nums text-gray-900">{llegadas}</p>
        </Seccion>
      )}
      {t.ultima && (
        <Seccion titulo="Las dos últimas llegadas">
          <TablaLlegadas ultima={t.ultima} vara={t.vara} />
        </Seccion>
      )}
      <LineaPlata t={t} mostrarMargen={mostrarMargen} />
      <RenglonTrimestres trimestres={t.trimestres} />
      <MasInfo t={t} hoyMes={hoyMes} />
    </div>
  );
}

// ─── La tabla de colores ─────────────────────────────────────────────────────

function FilaDeColor({
  f,
  hoyMes,
  mostrarMargen,
  abierta,
  onTocar,
}: {
  f: FilaColor;
  hoyMes: string;
  mostrarMargen: boolean;
  abierta: boolean;
  onTocar: () => void;
}) {
  const detalle = useMemo(
    () => (abierta ? armarTarjetaModelo(f.codigo, [f.art], hoyMes) : null),
    [abierta, f.art, f.codigo, hoyMes],
  );
  return (
    <>
      <tr
        onClick={onTocar}
        className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
      >
        <td className="py-2.5 pr-2 text-left font-mono text-gray-900">{f.color ?? f.codigo}</td>
        <td className="py-2.5 pr-2 text-right text-gray-900">{f.comprado == null ? "—" : fmtInt(f.comprado)}</td>
        <td className="py-2.5 pr-2 text-right text-gray-900">{fmtInt(f.vendido)}</td>
        <td className="py-2.5 pr-2 text-right font-semibold text-gray-900">
          {f.stock == null ? "—" : fmtInt(f.stock)}
        </td>
        <td className="py-2.5 pr-2 text-right text-gray-900">{textoPct(f.parteVendida)}</td>
        <td className="py-2.5 pr-2 text-right text-gray-700">
          {f.ultima ? fmtMesAnio(f.ultima.fecha.slice(0, 7)) : "—"}
        </td>
        <td className="py-2.5 text-right text-gray-700">
          {textoOchenta(f.ultima)}
          {f.ultima?.semanas == null && f.vara && (
            <span className="text-gray-500"> · ant. {textoOchenta(f.vara)}</span>
          )}
        </td>
      </tr>
      {abierta && detalle && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-0 py-0">
            <CuerpoTarjetaModelo t={detalle} hoyMes={hoyMes} mostrarMargen={mostrarMargen} />
          </td>
        </tr>
      )}
    </>
  );
}

function TablaColores({
  filas,
  hoyMes,
  mostrarMargen,
}: {
  filas: FilaColor[];
  hoyMes: string;
  mostrarMargen: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
            <th className="py-1.5 pr-2 text-left font-medium">{ROTULOS.color}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{ROTULOS.comprado}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{ROTULOS.vendido}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{ROTULOS.stock}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{ROTULOS.pctVendido}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{ROTULOS.ultimaLlegada}</th>
            <th className="py-1.5 text-right font-medium">{ROTULOS.ochenta}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <FilaDeColor
              key={f.codigo}
              f={f}
              hoyMes={hoyMes}
              mostrarMargen={mostrarMargen}
              abierta={abierta === f.codigo}
              onTocar={() => setAbierta((v) => (v === f.codigo ? null : f.codigo))}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── La pantalla ─────────────────────────────────────────────────────────────

export function ReferenciaModelo({
  modelo,
  arts,
  hoyMes,
  mostrarMargen = true,
  soloColor = false,
}: {
  modelo: string;
  arts: ArticuloCompras[];
  hoyMes: string;
  mostrarMargen?: boolean;
  /** `true` = se buscó un código COMPLETO: una sola fila y su tarjeta. */
  soloColor?: boolean;
}) {
  const t = useMemo(() => armarTarjetaModelo(modelo, arts, hoyMes), [modelo, arts, hoyMes]);
  const [verSinStock, setVerSinStock] = useState(false);

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white">
        {/* 🔴 El título es lo que se buscó: el MODELO cuando trae sus colores,
            y el CÓDIGO COMPLETO cuando se buscó un color — nunca el modelo
            recortado al lado de un solo color, que se leería como otro
            artículo. */}
        <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-gray-200 px-3.5 py-3">
          <h2 className="font-mono text-sm font-semibold text-gray-900">
            {soloColor ? (arts[0]?.codigo ?? t.modelo) : t.modelo}
          </h2>
          {soloColor && arts[0] && arts[0].codigo.length > 3 && (
            <span className="text-xs text-gray-600">color {arts[0].codigo.slice(-3)}</span>
          )}
          <span className="text-sm text-gray-700">{t.descripcion || "—"}</span>
          <span className="text-xs text-gray-600">{etiquetaEmpresa(t.empresa)}</span>
          {!soloColor && (
            <span className="text-xs text-gray-600">
              {fmtInt(t.colores)} {t.colores === 1 ? "color" : "colores"}
            </span>
          )}
        </header>
        <CuerpoTarjetaModelo t={t} hoyMes={hoyMes} mostrarMargen={mostrarMargen} />
      </section>

      {!soloColor && (
        <section className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-600">
            Sus colores · {fmtInt(t.filas.length)} con mercancía
          </p>
          <TablaColores filas={t.filas} hoyMes={hoyMes} mostrarMargen={mostrarMargen} />
          {t.sinStock.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setVerSinStock((v) => !v)}
                aria-expanded={verSinStock}
                className="mt-2 flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-gray-700"
              >
                {verSinStock ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {fmtInt(t.sinStock.length)} sin stock
              </button>
              {verSinStock && (
                <TablaColores filas={t.sinStock} hoyMes={hoyMes} mostrarMargen={mostrarMargen} />
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

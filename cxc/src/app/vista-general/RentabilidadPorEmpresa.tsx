"use client";

// ── RENTABILIDAD POR EMPRESA ────────────────────────────────────────────────
//
// 🔴 LA REGLA DE DANIEL, textual (13-ago-2026):
//
//     "no quiero Rentabilidad del grupo, lo quiero por empresa"
//
// Antes esta pantalla tenía DOS cosas: una tarjeta "Rentabilidad" con el número
// del GRUPO arriba, y esta lista abajo llamada "Semáforo por empresa". La
// tarjeta se fue —ver `page.tsx`— y esta lista pasó a llamarse por lo que es.
// El nombre importa: "Semáforo" es jerga nuestra, y alguien que busca la
// rentabilidad de una empresa no la encuentra debajo de esa palabra.
//
// ── 🩸 CADA EMPRESA COMPARA SU VENTA CONTRA SU GASTO ────────────────────────
//
// Es lo único que hace honesto este número. Los gastos van cargados hasta un mes
// DISTINTO en cada empresa (medido el 13-ago-2026: vistana hasta julio,
// fashion_wear hasta mayo, fashion_shoes y active_wear hasta abril, y
// active_shoes, joystep, Boston y Multifashion sin nada), así que en cualquier
// mes hay empresas con gasto y empresas sin gasto. A la que NO tiene gasto
// cargado no se le puede restar cero: su rentabilidad saldría igual a su
// utilidad bruta —o sea, preciosa— y se vería exactamente igual que la de una
// empresa que de verdad gana plata.
//
// Por eso, cuando falta el gasto, acá NO va un número: va el motivo en palabras
// ("Sin cargar" no es lo mismo que "Nada es gasto", y confundirlos es lo que
// haría creer que el dato ya está). El texto lo arma el servidor con la misma
// función para todas (`textoSinGastoEgresos`).
//
// ── EL PUNTO DE EQUILIBRIO SE RETIRÓ (11-ago-2026) ─────────────────────────
// Su fórmula es `gastos fijos ÷ margen`, y la marca de "fijo" venía de la carga
// manual de gastos, que ya no existe. El mayor no la trae. Calcularlo con una
// clasificación de cuentas que Daniel no aprobó habría dado un "necesitás
// vender $X" con un X inventado. Vuelve el día que exista esa clasificación.

import { useState } from "react";
import Link from "next/link";
import {
  ETIQUETA_SIN_GASTO_EGRESOS,
  type MotivoSinGastoEgresos,
} from "@/lib/egresos/gasto-mostrable";
import { money, moneyK, pct } from "./formato";

/** Una empresa con SU venta, SU utilidad y SU gasto — nunca los de otra. */
export interface RentabilidadEmpresaRow {
  key: string;
  name: string;
  ventas: number;
  utilidad: number;
  /**
   * Gasto de CAJA (Egresos Varios, grupo 6). `null` cuando el mes de ESA
   * empresa no se puede mostrar.
   * 🔴 Cambió de fuente el 13-ago-2026: antes era el mayor contable, que va 7
   * meses atrás y no producía número para ninguna empresa. Ver
   * `src/lib/egresos/gasto-mostrable.ts`.
   */
  gasto: number | null;
  motivo: MotivoSinGastoEgresos | null;
  /** Frase honesta cuando no hay número. */
  texto: string | null;
  /** Hasta qué mes llegan los egresos de ESA empresa (`YYYY-MM`), o `null`. */
  ultimoMesCerrado: string | null;
  /** `utilidad − gasto` de ESTA empresa. `null` si le falta el gasto. */
  rentabilidad: number | null;
  pct: number | null;
  estado: "verde" | "ambar" | "rojo" | "sin_gastos";
}

const DOT: Record<RentabilidadEmpresaRow["estado"], string> = {
  verde: "bg-green-500",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
  sin_gastos: "bg-stone-300",
};

const PILL: Record<RentabilidadEmpresaRow["estado"], { label: string; cls: string }> = {
  verde: { label: "Sana", cls: "bg-green-50 text-green-700" },
  ambar: { label: "Al límite", cls: "bg-amber-50 text-amber-700" },
  rojo: { label: "Pierde plata", cls: "bg-red-50 text-red-700" },
  // Sin gasto utilizable la píldora DICE POR QUÉ (ver `pillDe`); esto es sólo el
  // caso en que ni siquiera hay gastos conectados.
  sin_gastos: { label: "Sin conectar", cls: "bg-stone-100 text-stone-500" },
};

/**
 * La píldora de una empresa. Cuando no hay número, en vez de un genérico dice el
 * motivo exacto — "Sin cargar" (todavía no hay egresos de ese mes) no es lo
 * mismo que "Nada es gasto" (salió plata pero nada quedó registrado como gasto)
 * ni que "No se baja sola" (Boston, que no entra al cron por decisión de
 * Daniel). Confundirlos es lo que haría creer que el dato ya está.
 */
export function pillDe(e: RentabilidadEmpresaRow): { label: string; cls: string } {
  if (e.rentabilidad !== null) return PILL[e.estado];
  if (e.motivo) {
    return { label: ETIQUETA_SIN_GASTO_EGRESOS[e.motivo], cls: "bg-stone-100 text-stone-500" };
  }
  return PILL.sin_gastos;
}

export default function RentabilidadPorEmpresa({
  rows,
  mes,
}: {
  rows: RentabilidadEmpresaRow[];
  mes: string;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-stone-900">Rentabilidad por empresa</h2>
      {/* La bajada NO es decorativa: dice de dónde sale cada número y, sobre
          todo, que no hay un total. Sin ella, alguien suma las filas de cabeza
          y se arma el número del grupo que Daniel pidió no tener. */}
      <p className="mt-0.5 mb-3 text-xs text-stone-500">
        Cada empresa contra lo suyo: su utilidad bruta menos sus gastos. No hay un total del grupo.
      </p>

      {/* ─── Tarjetas (< md): iPhone ──────────────────────────────────────
          🩸 POR QUÉ. Medido con scripts/_ancho-util-ventas.mjs: la tabla necesita
          530 px como MÍNIMO absoluto (con el navegador partiendo cada texto
          donde puede) contra 356 disponibles en un iPhone de 390. Eran los 204 px
          de arrastre del censo. No hay relleno que sacar que cierre 174 px, y de
          las cuatro columnas la que más pesa es la píldora de Estado ("Sin
          gastos cargados"), que es justo la que no se puede abreviar sin cambiar
          un texto que ve el usuario. Va a tarjetas.

          De `md` para arriba la tabla se queda como estaba: a 834 px el útil es
          576 y el mínimo 530 — entra, y de hecho ya medía 0. */}
      <div className="space-y-2 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-[14px] border border-stone-200 bg-white px-4 py-6 text-center text-stone-400">
            Sin datos este mes.
          </div>
        ) : rows.map((e) => {
          const abiertaEsta = abierta === e.key;
          return (
            <Tarjeta
              key={e.key}
              e={e}
              pill={pillDe(e)}
              abierta={abiertaEsta}
              onToggle={() => setAbierta(abiertaEsta ? null : e.key)}
              mes={mes}
            />
          );
        })}
      </div>

      <div className="hidden rounded-[14px] border border-stone-200 bg-white overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-stone-400 border-b border-stone-100">
              <th className="text-left font-medium px-3 py-2.5">Empresa</th>
              <th className="text-right font-medium px-3 py-2.5">Ventas</th>
              <th className="text-right font-medium px-3 py-2.5">Rentabilidad</th>
              <th className="text-right font-medium px-3 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-stone-400">Sin datos este mes.</td></tr>
            ) : rows.map((e) => {
              const pill = pillDe(e);
              const abiertaEsta = abierta === e.key;
              return (
                <Fila
                  key={e.key}
                  e={e}
                  pill={pill}
                  abierta={abiertaEsta}
                  onToggle={() => setAbierta(abiertaEsta ? null : e.key)}
                  mes={mes}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Desglose de una empresa. Se dibuja UNA sola vez para las dos formas (la fila
 * desplegada de la tabla y la tarjeta abierta): tener dos copias del mismo
 * párrafo es exactamente como divergen los números entre pantallas.
 */
function Desglose({ e }: { e: RentabilidadEmpresaRow }) {
  // 🔑 Sin número, la pantalla DICE POR QUÉ — y no le pide al usuario que cargue
  // nada, porque no hay dónde cargarlo. El texto lo arma el servidor con la
  // misma función para todas las empresas (`textoSinGasto`).
  if (e.rentabilidad == null || e.gasto == null) {
    return (
      <p data-col="sin-gasto" className="text-sm text-stone-500">
        {e.texto ?? "Todavía no hay gastos cargados de esta empresa para este mes."}
      </p>
    );
  }
  return (
    <p className="text-sm text-stone-700 tabular-nums">
      Utilidad bruta <span data-col="utilidad" className="font-medium">{money(e.utilidad)}</span>
      {" − "}Gastos <span data-col="gastos" className="font-medium">{money(e.gasto)}</span>
      {" = "}Rentabilidad <span data-col="rentabilidad-detalle" className={`font-semibold ${e.rentabilidad >= 0 ? "text-green-600" : "text-red-600"}`}>{money(e.rentabilidad)}</span>
    </p>
  );
}

/** Enlace "Ver gastos de X →". 44 px de alto en las dos formas. */
function VerGastosLink({ e, mes }: { e: RentabilidadEmpresaRow; mes: string }) {
  return (
    <Link
      href={`/gastos-contabilidad?mes=${mes}&empresa=${e.key}`}
      onClick={(ev) => ev.stopPropagation()}
      className="inline-flex min-h-[44px] items-center text-xs text-teal-600 hover:text-teal-700 font-medium"
    >
      Ver gastos de {e.name} →
    </Link>
  );
}

/** Tarjeta (< md) equivalente a `Fila`: mismos cuatro datos de la fila cerrada
 *  y el mismo desglose al abrirla. */
function Tarjeta({ e, pill, abierta, onToggle, mes }: {
  e: RentabilidadEmpresaRow;
  pill: { label: string; cls: string };
  abierta: boolean;
  onToggle: () => void;
  mes: string;
}) {
  return (
    <div data-fila-semaforo={e.key} className="rounded-[14px] border border-stone-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        className="flex min-h-[44px] w-full items-center gap-2.5 px-4 py-3 text-left active:bg-stone-50"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[e.estado]}`} />
        <span data-col="empresa" className="min-w-0 flex-1 font-medium text-stone-800">{e.name}</span>
        <svg className={`w-3.5 h-3.5 shrink-0 text-stone-300 transition-transform ${abierta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-4 pb-3 text-sm">
        <span className="text-xs text-stone-400">Ventas</span>
        <span data-col="ventas" className="tabular-nums text-stone-700">{moneyK(e.ventas)}</span>
        <span className="text-xs text-stone-400">Rentabilidad</span>
        <span data-col="rentabilidad" className="tabular-nums">
          {e.rentabilidad == null ? (
            <span className="text-stone-400">—</span>
          ) : (
            <>
              <span className={`font-semibold ${e.rentabilidad >= 0 ? "text-stone-900" : "text-red-600"}`}>{moneyK(e.rentabilidad)}</span>
              <span data-col="pct" className="text-xs text-stone-400 ml-1.5">{pct(e.pct)}</span>
            </>
          )}
        </span>
        <span data-col="estado" className={`ml-auto inline-block text-xs font-medium rounded-full px-2.5 py-1 ${pill.cls}`}>{pill.label}</span>
      </div>

      {abierta && (
        <div className="border-t border-stone-100 bg-stone-50/60 px-4 py-3">
          <Desglose e={e} />
          <div className="mt-0.5">
            <VerGastosLink e={e} mes={mes} />
          </div>
        </div>
      )}
    </div>
  );
}

function Fila({ e, pill, abierta, onToggle, mes }: {
  e: RentabilidadEmpresaRow;
  pill: { label: string; cls: string };
  abierta: boolean;
  onToggle: () => void;
  mes: string;
}) {
  return (
    <>
      {/* `data-fila-semaforo` es el ancla estable que cruza tarjeta y fila en el
          verificador — no una clase de breakpoint. El nombre del atributo se
          MANTIENE aunque la sección haya pasado a llamarse "Rentabilidad por
          empresa": lo usan cuatro scripts de medición (`_verif-ventas-ipad`,
          `_ancho-util-ventas`, `_medir-ventas-vista-general`,
          `_medir-vista-general-gastos`) y renombrarlo los dejaría midiendo cero
          filas EN VERDE, que es el peor modo de fallo de un verificador. */}
      <tr
        data-fila-semaforo={e.key}
        onClick={onToggle}
        className="border-b border-stone-50 last:border-0 hover:bg-stone-50 cursor-pointer transition"
      >
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[e.estado]}`} />
            <span data-col="empresa" className="font-medium text-stone-800">{e.name}</span>
            <svg className={`w-3.5 h-3.5 shrink-0 text-stone-300 transition-transform ${abierta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </span>
        </td>
        <td data-col="ventas" className="px-3 py-3 text-right tabular-nums text-stone-700">{moneyK(e.ventas)}</td>
        <td data-col="rentabilidad" className="px-3 py-3 text-right tabular-nums">
          {e.rentabilidad == null ? (
            <span className="text-stone-400">—</span>
          ) : (
            <>
              <span className={`font-semibold ${e.rentabilidad >= 0 ? "text-stone-900" : "text-red-600"}`}>{moneyK(e.rentabilidad)}</span>
              <span data-col="pct" className="text-xs text-stone-400 ml-1.5">{pct(e.pct)}</span>
            </>
          )}
        </td>
        <td className="px-3 py-3 text-right">
          <span data-col="estado" className={`inline-block text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap ${pill.cls}`}>{pill.label}</span>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-stone-50 last:border-0 bg-stone-50/60">
          <td colSpan={4} className="px-3 py-3">
            <Desglose e={e} />
            <div className="mt-0.5">
              <VerGastosLink e={e} mes={mes} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

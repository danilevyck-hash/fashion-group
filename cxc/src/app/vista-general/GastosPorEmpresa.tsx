"use client";

// ── GASTOS, POR EMPRESA ─────────────────────────────────────────────────────
//
// 🔴 LA REGLA DE DANIEL, textual (13-ago-2026):
//
//     "La tarjeta de Gastos de Vista General también por empresa"
//
// y, sobre el módulo Gastos, también textual:
//
//     "cada compañia por separado, sin juntar los gastos entre todos"
//
// Antes acá había UNA tarjeta con un total: la suma de las empresas cuyo mes se
// podía mostrar. Ese número no era de nadie. La contadora va atrasada de forma
// DISTINTA en cada empresa, así que el total juntaba tres empresas un mes y
// cinco al siguiente, y en los dos casos se leía como "el gasto del grupo".
//
// ── 🩸 EL ERROR CARO NO ES SUMAR: ES MOSTRAR $0 ─────────────────────────────
//
// A la empresa sin el mes cerrado no se le puede pintar un cero: un total corto
// y un total bueno se ven idénticos. Va el MOTIVO en palabras, y el motivo
// exacto — "Sin cerrar" no es lo mismo que "Falta planilla", y confundirlos es
// lo que hace creer que el dato ya está.
//
// El mecanismo NO es nuevo: es el MISMO que ya usa "Rentabilidad por empresa"
// (`motivo` + `texto`, armados en el servidor con `textoSinGasto` para todas
// las empresas por igual). Acá se reusa; no se inventa un segundo.

import Link from "next/link";
import { ETIQUETA_SIN_GASTO, type MotivoSinGasto } from "@/lib/mayor/gastos";
import { money } from "./formato";

export interface GastoEmpresaRow {
  key: string;
  name: string;
  /** Gasto del mayor. `null` cuando el mes de ESA empresa no se puede mostrar. */
  gasto: number | null;
  motivo: MotivoSinGasto | null;
  texto: string | null;
  ultimoMesCerrado: string | null;
}

export interface GastosData {
  disponible: boolean;
  empresasConGasto: number;
  empresasTotal: number;
  porEmpresa: GastoEmpresaRow[];
}

/** La píldora de una empresa: el motivo exacto, nunca un genérico. */
export function pillGasto(g: GastoEmpresaRow): { label: string; cls: string } | null {
  if (g.gasto !== null) return null;
  if (g.motivo) return { label: ETIQUETA_SIN_GASTO[g.motivo], cls: "bg-stone-100 text-stone-500" };
  return { label: "Sin conectar", cls: "bg-stone-100 text-stone-500" };
}

export default function GastosPorEmpresa({ gastos, mes }: { gastos: GastosData; mes: string }) {
  return (
    <div data-panel="gastos" className="rounded-[14px] border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold text-stone-700">Gastos por empresa</h3>
        <span data-col="cobertura" className="text-xs text-stone-400 tabular-nums">
          {gastos.empresasConGasto} de {gastos.empresasTotal} con el mes cerrado
        </span>
      </div>
      {/* La bajada NO es decorativa: dice que no hay total, y por qué. Sin ella,
          alguien suma las filas de cabeza y se arma el número del grupo que
          Daniel pidió no tener. */}
      <p className="mt-0.5 text-xs text-stone-500">
        Cada empresa con lo suyo. No hay un total: la contabilidad va atrasada distinto en cada una,
        así que sumarlas daría un número que no es de ninguna.
      </p>

      {!gastos.disponible ? (
        <p className="mt-3 text-sm text-stone-500">
          La contabilidad de Switch todavía no está conectada.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {gastos.porEmpresa.map((g) => {
            const pill = pillGasto(g);
            return (
              <div key={g.key} data-fila-gasto={g.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span data-col="empresa" className="min-w-0 truncate text-sm font-medium text-stone-800">
                    {g.name}
                  </span>
                  {g.gasto !== null ? (
                    <span data-col="gasto" className="shrink-0 text-sm font-semibold tabular-nums text-stone-900">
                      {money(g.gasto)}
                    </span>
                  ) : (
                    <span
                      data-col="sin-gasto"
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${pill!.cls}`}
                    >
                      {pill!.label}
                    </span>
                  )}
                </div>
                {/* 🔑 Cuando no hay número, la pantalla DICE POR QUÉ — y hasta
                    dónde llega la contabilidad de esa empresa. */}
                {g.gasto === null && g.texto && (
                  <p data-col="motivo" className="mt-0.5 text-xs text-stone-400">{g.texto}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link
        href={`/gastos-contabilidad?mes=${mes}`}
        className="mt-1 inline-flex min-h-[44px] min-w-[44px] items-center text-xs font-medium text-teal-600 hover:text-teal-700"
      >
        Ir a Gastos →
      </Link>
    </div>
  );
}

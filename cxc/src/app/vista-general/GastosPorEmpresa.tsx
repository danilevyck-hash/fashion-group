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
// (`motivo` + `texto`, armados en el servidor con la misma función para todas
// las empresas por igual). Acá se reusa; no se inventa un segundo.
//
// ── 🔴 LA FUENTE ES EGRESOS VARIOS, NO EL MAYOR (13-ago-2026) ───────────────
//
// Daniel: *"no deberia de ser egresos varios y ya?"*. El mayor es lo que la
// contadora CERRÓ (va 7 meses atrás y no daba número para NADIE); Egresos
// Varios es lo que SALIÓ de caja y banco, y está vivo. Por eso los motivos
// cambiaron de vocabulario: acá no hay "mes cerrado" ni "falta planilla" —
// hay plata que salió, o que todavía no se cargó. Ver
// `src/lib/egresos/gasto-mostrable.ts`.

import Link from "next/link";
import {
  ETIQUETA_SIN_GASTO_EGRESOS,
  type MotivoSinGastoEgresos,
} from "@/lib/egresos/gasto-mostrable";
import { money } from "./formato";

export interface GastoEmpresaRow {
  key: string;
  name: string;
  /** Gasto de caja (grupo 6). `null` cuando el mes de ESA empresa no se puede mostrar. */
  gasto: number | null;
  motivo: MotivoSinGastoEgresos | null;
  texto: string | null;
  /** Hasta qué mes llegan los egresos de ESA empresa (`YYYY-MM`), o `null`. */
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
  if (g.motivo) {
    return { label: ETIQUETA_SIN_GASTO_EGRESOS[g.motivo], cls: "bg-gray-100 text-gray-500" };
  }
  return { label: "Sin datos", cls: "bg-gray-100 text-gray-500" };
}

export default function GastosPorEmpresa({ gastos, mes }: { gastos: GastosData; mes: string }) {
  return (
    <div data-panel="gastos" className="rounded-[14px] border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold text-gray-700">Gastos por empresa</h3>
        <span data-col="cobertura" className="text-xs text-gray-400 tabular-nums">
          {gastos.empresasConGasto} de {gastos.empresasTotal} con gastos cargados
        </span>
      </div>
      {!gastos.disponible ? (
        <p className="mt-3 text-sm text-gray-500">
          Los gastos de Switch todavía no están conectados.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {gastos.porEmpresa.map((g) => {
            const pill = pillGasto(g);
            return (
              <div key={g.key} data-fila-gasto={g.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span data-col="empresa" className="min-w-0 truncate text-sm font-medium text-gray-800">
                    {g.name}
                  </span>
                  {g.gasto !== null ? (
                    <span data-col="gasto" className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
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
                  <p data-col="motivo" className="mt-0.5 text-xs text-gray-400">{g.texto}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* La bajada NO es decorativa: dice DE DÓNDE sale el número y que no hay
          total. 4-oct-2026: UNA línea al final, no arriba. */}
      {gastos.disponible && (
        <p data-pie-gastos className="mt-2 text-xs text-gray-500">
          Egresos de caja y banco, sin transferencias ni préstamos · sin total consolidado (cada empresa va en su mes)
        </p>
      )}

      <Link
        href={`/gastos-contabilidad?mes=${mes}`}
        className="mt-1 inline-flex min-h-[44px] min-w-[44px] items-center text-xs font-medium text-blue-600 hover:text-blue-800"
      >
        Ir a Gastos →
      </Link>
    </div>
  );
}

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
import { VG_GASTOS_PAUSADO_UNA_LINEA } from "@/lib/ui/revision-110-ventas";
import { PAUSA_CUENTA_CARGA_MANUAL } from "@/lib/ui/revision-110-ajustes";

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

/** El registro de gastos está pausado (7-oct-2026): ninguna empresa trae
 *  número y todas dicen el motivo de la pausa. */
const MOTIVOS_DE_PAUSA: ReadonlySet<string> = new Set(["sin_movimientos", "sin_datos"]);
export function gastosPausados(filas: readonly { gasto: number | null; motivo: string | null }[]): boolean {
  if (PAUSA_CUENTA_CARGA_MANUAL) {
    // Revisión 110 · ajustes (8): Boston es «Carga manual» y nunca trae número
    // solo; con ella adentro el panel seguía en 8 renglones (en la computadora).
    // Pausado = ninguna trae número, y todas las demás dicen la pausa.
    const conPausa = filas.filter((f) => !!f.motivo && MOTIVOS_DE_PAUSA.has(f.motivo));
    return conPausa.length > 0 && filas.every((f) => f.gasto === null && !!f.motivo && (MOTIVOS_DE_PAUSA.has(f.motivo) || f.motivo === "no_automatico"));
  }
  return filas.length > 0 && filas.every((f) => f.gasto === null && !!f.motivo && MOTIVOS_DE_PAUSA.has(f.motivo));
}

export default function GastosPorEmpresa({ gastos, mes }: { gastos: GastosData; mes: string }) {
  // n.º 24 (revisión 110): mientras esté pausado, UNA línea y no 8 renglones iguales.
  if (VG_GASTOS_PAUSADO_UNA_LINEA && gastos.disponible && gastosPausados(gastos.porEmpresa)) {
    return (
      <div data-panel="gastos" data-gastos-pausado className="rounded-[14px] border border-gray-200 bg-white px-4">
        <Link
          href={`/gastos-contabilidad?mes=${mes}`}
          className="flex min-h-[52px] items-center gap-2 text-sm"
        >
          <span className="font-semibold text-gray-700">Gastos</span>
          <span className="text-gray-500">· registro pausado</span>
          <span className="ml-auto text-xs font-medium text-blue-600">Ir a Gastos ›</span>
        </Link>
      </div>
    );
  }
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

"use client";

// UNA FILA POR EMPRESA, con lo que SALIÓ de caja y banco en el mes.
//
// 🔑 DOS NÚMEROS, NO UNO. "Salió" y "de eso, gastos" no son lo mismo: el reporte
// trae TODO lo que sale de caja y banco, y solo el grupo 6 es gasto. Medido
// sobre los 378 renglones reales de Vistana, de $243.342,48 que salieron solo
// $118.753,76 son gasto — el resto son transferencias entre cuentas propias,
// planilla por pagar y pagos intercompañía. Mostrar un solo número sería
// llamarle "gasto" a un préstamo devuelto.
//
// Dos formas del MISMO modelo (`filas`) para que no puedan decir cosas
// distintas: tarjetas por debajo de `lg` y tabla desde `lg`. El corte es `lg`
// (1024) y no `sm`/`md` porque a 834 (iPad) la barra lateral se lleva 224 px y
// quedan ~610 útiles — más angosto que un iPhone acostado.

import { ETIQUETA_ESTADO_EGRESOS, type EstadoEgresos } from "@/lib/egresos/reglas";
import type { EmpresaEgresosResumen } from "./tipos";
import { mesLargo, usd } from "./tipos";

/** Sólo `con_movimientos` autoriza a pintar el número como un hecho. */
export const muestraMontoEgresos = (e: EstadoEgresos): boolean => e === "con_movimientos";

/**
 * La frase de abajo. `sin_movimientos` y `sin_datos` NO pueden verse iguales:
 * el primero dice "no salió plata" (un hecho), el segundo "no sabemos".
 */
export function explicacionEgresos(
  estado: EstadoEgresos,
  ultimoMesConMovimientos: string | null,
): string {
  switch (estado) {
    case "con_movimientos":
      return "";
    case "sin_movimientos":
      return "Este mes no salió plata de caja ni del banco.";
    case "sin_datos":
      return ultimoMesConMovimientos
        ? `Este mes todavía no se ha traído de Switch. Lo último que hay es de ${mesLargo(ultimoMesConMovimientos)}.`
        : "Este mes todavía no se ha traído de Switch.";
  }
}

interface Fila {
  empresa: EmpresaEgresosResumen;
  estado: EstadoEgresos;
  hayMonto: boolean;
  salidaTexto: string;
  gastoTexto: string;
  explicacion: string;
}

function armarFilas(empresas: EmpresaEgresosResumen[]): Fila[] {
  return empresas.map((empresa) => {
    const estado = empresa.resumen.estado;
    const hayMonto = muestraMontoEgresos(estado);
    return {
      empresa,
      estado,
      hayMonto,
      salidaTexto: hayMonto
        ? usd(empresa.resumen.totalSalidaCent)
        : ETIQUETA_ESTADO_EGRESOS[estado],
      gastoTexto: hayMonto ? usd(empresa.resumen.totalGastoCent) : "—",
      explicacion: explicacionEgresos(estado, empresa.ultimoMesConMovimientos),
    };
  });
}

function EstadoTag({ estado }: { estado: EstadoEgresos }) {
  const color =
    estado === "con_movimientos"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : estado === "sin_movimientos"
        ? "border-gray-200 bg-gray-50 text-gray-600"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-sm ${color}`}>
      {ETIQUETA_ESTADO_EGRESOS[estado]}
    </span>
  );
}

function Monto({ texto, hayMonto, fuerte }: { texto: string; hayMonto: boolean; fuerte?: boolean }) {
  return (
    <span
      className={
        !hayMonto
          ? "text-sm font-medium text-gray-500"
          : fuerte
            ? "text-base font-semibold tabular-nums text-gray-900"
            : "text-sm tabular-nums text-gray-700"
      }
    >
      {texto}
    </span>
  );
}

// ── Tarjetas (hasta lg) ──────────────────────────────────────────────────────

function Tarjeta({ fila, onAbrir }: { fila: Fila; onAbrir: (key: string) => void }) {
  const { empresa } = fila;
  // Un mes sin movimientos no se puede abrir: adentro no hay nada que ver.
  const Contenedor = fila.hayMonto ? "button" : "div";
  return (
    <Contenedor
      {...(fila.hayMonto
        ? { type: "button" as const, onClick: () => onAbrir(empresa.empresaKey) }
        : {})}
      className={`w-full rounded-lg border border-gray-200 bg-white p-3 text-left ${
        fila.hayMonto ? "transition active:scale-[0.99]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900">{empresa.nombre}</span>
        <EstadoTag estado={fila.estado} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="text-sm text-gray-500">Salió de caja y banco</div>
          <div className="mt-0.5">
            <Monto texto={fila.salidaTexto} hayMonto={fila.hayMonto} fuerte />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm text-gray-500">De eso, gastos</div>
          <div className="mt-0.5">
            <Monto texto={fila.gastoTexto} hayMonto={fila.hayMonto} />
          </div>
        </div>
      </div>

      {fila.hayMonto && (
        <p className="mt-2 text-sm text-gray-600">
          {empresa.resumen.renglones} {empresa.resumen.renglones === 1 ? "pago" : "pagos"}
        </p>
      )}

      {fila.explicacion && <p className="mt-3 text-sm text-gray-600">{fila.explicacion}</p>}

      {fila.hayMonto && (
        <span className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-gray-900">
          Ver en qué salió
          <svg viewBox="0 0 20 20" fill="none" className="ml-1 h-4 w-4" aria-hidden="true">
            <path d="M7.5 4L13 10l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </Contenedor>
  );
}

// ── Tabla (desde lg) ─────────────────────────────────────────────────────────

function FilaTabla({ fila, onAbrir }: { fila: Fila; onAbrir: (key: string) => void }) {
  const { empresa } = fila;
  return (
    <tr
      {...(fila.hayMonto ? { onClick: () => onAbrir(empresa.empresaKey) } : {})}
      className={`border-t border-gray-200 ${fila.hayMonto ? "cursor-pointer hover:bg-gray-50" : ""}`}
    >
      <td className="px-3 py-3 align-top">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{empresa.nombre}</span>
          <EstadoTag estado={fila.estado} />
        </div>
        {fila.explicacion && (
          <p className="mt-1 max-w-sm text-sm text-gray-600">{fila.explicacion}</p>
        )}
      </td>
      <td className="px-3 py-3 text-right align-top">
        <Monto texto={fila.salidaTexto} hayMonto={fila.hayMonto} fuerte />
      </td>
      <td className="px-3 py-3 text-right align-top">
        <Monto texto={fila.gastoTexto} hayMonto={fila.hayMonto} />
      </td>
      <td className="px-3 py-3 text-right align-top text-sm tabular-nums text-gray-600">
        {fila.hayMonto ? empresa.resumen.renglones : "—"}
      </td>
      <td className="px-3 py-3 text-right align-top text-gray-400">
        {fila.hayMonto && (
          <svg viewBox="0 0 20 20" fill="none" className="ml-auto h-4 w-4" aria-hidden="true">
            <path d="M7.5 4L13 10l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </td>
    </tr>
  );
}

// ── Público ──────────────────────────────────────────────────────────────────

interface Props {
  empresas: EmpresaEgresosResumen[];
  onAbrir: (empresaKey: string) => void;
}

export default function ResumenEgresos({ empresas, onAbrir }: Props) {
  const filas = armarFilas(empresas);

  return (
    <div>
      {/* Tarjetas: iPhone (390) e iPad (834 → ~610 útiles). */}
      <div className="space-y-2.5 lg:hidden">
        {filas.map((f) => (
          <Tarjeta key={f.empresa.empresaKey} fila={f} onAbrir={onAbrir} />
        ))}
      </div>

      {/* Tabla: sólo desde 1024, donde las columnas entran de verdad. */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white lg:block">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 text-sm text-gray-600">
              <th className="px-3 py-2 text-left font-medium">Empresa</th>
              <th className="px-3 py-2 text-right font-medium">Salió de caja y banco</th>
              <th className="px-3 py-2 text-right font-medium">De eso, gastos</th>
              <th className="px-3 py-2 text-right font-medium">Pagos</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaTabla key={f.empresa.empresaKey} fila={f} onAbrir={onAbrir} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

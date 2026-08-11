"use client";

// El desglose de UNA empresa en UN mes: cada cuenta con su código de 3 segmentos,
// su nombre y su monto.
//
// Reglas de negocio ya decididas por Daniel (no relitigar):
//  · El IMPUESTO SOBRE LA RENTA va DENTRO del total pero en SU PROPIA LÍNEA al
//    final — no revuelto con el gasto de operación, porque no cae todos los
//    meses y compararlo así engaña.
//  · Las cuentas que NO son plata que salió del banco (depreciación, faltantes,
//    …) se marcan DISCRETAMENTE y cuentan en el total igual, para cuadrar al
//    centavo con la contadora.
//  · Los montos NEGATIVOS son correctos (reversos) y se muestran negativos.
//    Nunca valor absoluto.
//  · Un mes sin contabilidad NO muestra monto: muestra su estado y su
//    explicación.

import type { CuentaGasto } from "@/lib/mayor/gastos";
import type { EmpresaResumen } from "./tipos";
import { mesLargo, usd } from "./tipos";
import EstadoMesTag, { explicacionDe, muestraMonto } from "./EstadoMesTag";
import AvisosDelMes from "./AvisosDelMes";

function FilaCuenta({ c }: { c: CuentaGasto }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-gray-100 py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm tabular-nums text-gray-500">{c.corta}</span>
          <span className="text-sm text-gray-900">{c.nombre || "Sin nombre"}</span>
        </div>
        {c.sinSalidaDeCaja && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-sm text-gray-500">
            <span aria-hidden="true">•</span> no salió del banco
          </span>
        )}
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
        {usd(c.netoCent)}
      </span>
    </div>
  );
}

function LineaTotal({
  label,
  cent,
  fuerte = false,
}: {
  label: string;
  cent: number;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={fuerte ? "text-sm font-semibold text-gray-900" : "text-sm text-gray-600"}>
        {label}
      </span>
      <span
        className={
          fuerte
            ? "text-base font-semibold tabular-nums text-gray-900"
            : "text-sm tabular-nums text-gray-700"
        }
      >
        {usd(cent)}
      </span>
    </div>
  );
}

interface Props {
  empresa: EmpresaResumen;
  /** Sólo cuando se llegó desde la lista. Sin esto no se dibuja "Volver". */
  onVolver?: () => void;
}

export default function DetalleEmpresa({ empresa, onVolver }: Props) {
  const r = empresa.resumen;
  // El mes sale del propio resumen: es el mismo dato, y pasarlo aparte permitiría
  // que el título dijera un mes y las cifras fueran de otro.
  const mes = r.mes;
  const hayMonto = muestraMonto(r.estado);
  const explicacion = explicacionDe(r.estado, empresa.ultimoMesCerrado);
  const sinNadaQueMostrar = hayMonto && r.cuentas.length === 0 && r.isr.length === 0;
  const s = r.salarios;

  return (
    <div>
      {onVolver && (
        <button
          type="button"
          onClick={onVolver}
          className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-gray-700 active:scale-[0.97]"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M12.5 4L7 10l5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Volver
        </button>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{empresa.nombre}</h1>
          <p className="text-sm capitalize text-gray-600">{mesLargo(mes)}</p>
        </div>
        <EstadoMesTag estado={r.estado} />
      </div>

      <p className="mb-3 text-sm text-gray-600">{explicacion}</p>

      {empresa.avisos.length > 0 && (
        <div className="mb-4">
          <AvisosDelMes avisos={empresa.avisos} />
        </div>
      )}

      {!hayMonto ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            Todavía no hay nada que mostrar de este mes. Cuando la contadora lo cierre, acá aparece
            en qué se gastó.
          </p>
        </div>
      ) : sinNadaQueMostrar ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          {/* Ojo: acá NO va un "$0.00". Febrero-2026 de Vistana es exactamente
              este caso —un solo movimiento suelto y ni una cuenta de gasto— y
              pintarle un cero diría "no gastó nada", que es falso. */}
          <p className="text-sm text-gray-700">
            {r.estado === "cerrado"
              ? "Este mes está cerrado y no tiene ni un gasto registrado."
              : "Este mes todavía no está cerrado y, por ahora, no tiene ni un gasto registrado."}
          </p>
        </div>
      ) : (
        <>
          {/* Cuánto fue en total, arriba de todo. */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
            <LineaTotal label="Gastos del mes" cent={r.totalCent} fuerte />
            {r.totalIsrCent !== 0 && (
              <div className="mt-1 border-t border-gray-100 pt-1">
                <LineaTotal label="De eso, gasto de operación" cent={r.totalOperacionCent} />
                <LineaTotal label="De eso, impuesto sobre la renta" cent={r.totalIsrCent} />
              </div>
            )}
            {s.totalCent !== 0 && (
              <div className="mt-1 border-t border-gray-100 pt-1">
                <LineaTotal label="De eso, salarios" cent={s.totalCent} />
                {s.comisionesCent !== 0 && (
                  <LineaTotal label="De eso, comisiones de vendedores" cent={s.comisionesCent} />
                )}
              </div>
            )}
            {r.totalSinSalidaDeCajaCent !== 0 && (
              <div className="mt-1 border-t border-gray-100 pt-1">
                <LineaTotal
                  label="De eso, no salió del banco"
                  cent={r.totalSinSalidaDeCajaCent}
                />
              </div>
            )}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-gray-900">En qué se gastó</h2>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-1">
            {r.cuentas.length === 0 ? (
              <p className="py-2.5 text-sm text-gray-600">
                Este mes no tiene gastos de operación, sólo impuesto sobre la renta.
              </p>
            ) : (
              r.cuentas.map((c) => <FilaCuenta key={c.cuenta} c={c} />)
            )}
          </div>

          {/* El impuesto sobre la renta, SIEMPRE aparte y al final. */}
          {r.isr.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 text-sm font-semibold text-gray-900">
                Impuesto sobre la renta
              </h2>
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-1">
                {r.isr.map((c) => (
                  <FilaCuenta key={c.cuenta} c={c} />
                ))}
              </div>
            </>
          )}

          <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-1">
            <LineaTotal label="Total del mes" cent={r.totalCent} fuerte />
          </div>
        </>
      )}
    </div>
  );
}

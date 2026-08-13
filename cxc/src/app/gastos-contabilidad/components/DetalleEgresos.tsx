"use client";

// En qué salió la plata de UNA empresa en UN mes, por cuenta.
//
// Reglas que no se relitigan:
//  · Lo que SALIÓ y lo que es GASTO son DOS números distintos, y se muestran
//    separados. Solo el grupo 6 es gasto; el resto son transferencias entre
//    cuentas propias, planilla por pagar, pagos intercompañía.
//  · Las cuentas que NO son gasto van en su propia sección, abajo, con el
//    porqué escrito. Esconderlas haría que el total no cuadrara contra el panel
//    de Switch; mezclarlas con las de gasto sería llamarle gasto a lo que no lo
//    es.
//  · Los montos NEGATIVOS (reversos) se muestran negativos. Nunca valor
//    absoluto: su firma es que la diferencia da exactamente el doble.
//  · El CSV de egresos NO trae el nombre de la cuenta, solo el código — por eso
//    debajo va la REFERENCIA de los pagos, que es el dato humano que sí trae
//    ("DANIEL LEVY", "MUNICIOIO DE PANAMA").

import type { CuentaEgreso } from "@/lib/egresos/reglas";
import type { EmpresaEgresosResumen } from "./tipos";
import { mesLargo, usd } from "./tipos";
import { explicacionEgresos, muestraMontoEgresos } from "./ResumenEgresos";

function FilaCuenta({ c }: { c: CuentaEgreso }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-gray-100 py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm tabular-nums text-gray-500">{c.corta}</span>
          <span className="text-sm text-gray-600">
            {c.renglones} {c.renglones === 1 ? "pago" : "pagos"}
          </span>
        </div>
        {c.ejemplos.length > 0 && (
          <p className="mt-0.5 text-sm text-gray-900">{c.ejemplos.join(" · ")}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
        {usd(c.totalCent)}
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
  empresa: EmpresaEgresosResumen;
  /** Sólo cuando se llegó desde la lista. Sin esto no se dibuja "Volver". */
  onVolver?: () => void;
}

export default function DetalleEgresos({ empresa, onVolver }: Props) {
  const r = empresa.resumen;
  const hayMonto = muestraMontoEgresos(r.estado);
  const explicacion = explicacionEgresos(r.estado, empresa.ultimoMesConMovimientos);

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

      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{empresa.nombre}</h1>
        <p className="text-sm capitalize text-gray-600">{mesLargo(r.mes)}</p>
      </div>

      {explicacion && <p className="mb-3 text-sm text-gray-600">{explicacion}</p>}

      {!hayMonto ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            Todavía no hay nada que mostrar de este mes.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
            <LineaTotal label="Salió de caja y banco" cent={r.totalSalidaCent} fuerte />
            <div className="mt-1 border-t border-gray-100 pt-1">
              <LineaTotal label="De eso, gastos" cent={r.totalGastoCent} />
              {r.totalNoGastoCent !== 0 && (
                <LineaTotal label="De eso, no es gasto" cent={r.totalNoGastoCent} />
              )}
            </div>
            <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-600">
              {r.renglones} {r.renglones === 1 ? "pago" : "pagos"}
              {r.documentos !== r.renglones && ` en ${r.documentos} documentos`}
            </p>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-gray-900">En qué se gastó</h2>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-1">
            {r.cuentasGasto.length === 0 ? (
              <p className="py-2.5 text-sm text-gray-600">
                Este mes salió plata, pero nada de eso fue un gasto.
              </p>
            ) : (
              r.cuentasGasto.map((c) => <FilaCuenta key={c.cuenta} c={c} />)
            )}
          </div>

          {r.cuentasNoGasto.length > 0 && (
            <>
              <h2 className="mb-1 mt-4 text-sm font-semibold text-gray-900">
                Salió, pero no es gasto
              </h2>
              {/* Sin esta frase, alguien lee "salió plata" y anota gasto. */}
              <p className="mb-2 text-sm text-gray-600">
                Plata que salió de caja o del banco y no es un gasto: pasa de una cuenta a otra
                (transferencias, anticipos), paga algo que ya se debía o cancela un préstamo.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-1">
                {r.cuentasNoGasto.map((c) => (
                  <FilaCuenta key={c.cuenta} c={c} />
                ))}
              </div>
            </>
          )}

          <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-1">
            <LineaTotal label="Total que salió" cent={r.totalSalidaCent} fuerte />
          </div>
        </>
      )}
    </div>
  );
}

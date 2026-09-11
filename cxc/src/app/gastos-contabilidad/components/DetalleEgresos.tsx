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
//  · El reporte de egresos NO trae el nombre de la cuenta, sólo el código. El
//    nombre sale del CATÁLOGO DE CUENTAS (`lib/cuentas/`), y cuando no se sabe
//    va el código SOLO — nunca un nombre deducido: `6.02.01` parece "salarios"
//    por vecindad con 6.01 y en realidad es SERVICIOS PROFESIONALES, el gasto
//    más grande de Vistana.
//  · La REFERENCIA de los pagos se queda igual ("DANIEL LEVY", "MUNICIOIO DE
//    PANAMA"): es de qué se trató el pago, no de qué cuenta salió.

import type { CuentaEgreso } from "@/lib/egresos/reglas";
import type { EmpresaEgresosResumen } from "./tipos";
import { mesLargo, usd } from "./tipos";
import { explicacionEgresos, muestraMontoEgresos } from "./ResumenEgresos";
import { useMemo } from "react";
import BuscadorDeLista, { VacioDeBusqueda } from "@/components/BuscadorDeLista";
import {
  LIMPIAR_BUSQUEDA,
  PARAM_BUSCAR,
  PLACEHOLDER_CUENTA,
  VACIO_CUENTA,
  filtrarPorTexto,
  textoDeConteo,
} from "@/lib/buscar-en-lista";
import { useUrlState } from "@/lib/hooks/useUrlState";

/**
 * 🔴 POR DÓNDE SE BUSCA UNA CUENTA (11-sep-2026).
 *
 * Por el NOMBRE («servicios profesionales»), por el CÓDIGO —el completo y el
 * que se pinta, que son distintos— y por las REFERENCIAS de los pagos que
 * cayeron ahí («DANIEL LEVY», «MUNICIOIO DE PANAMA»), que es como la contadora
 * se acuerda de un pago.
 *
 * ⚠️ **Por N° INTERNO no se puede buscar, y no es un olvido**: el reporte de
 * Egresos Varios sí lo trae, pero `resumirMesEgresos` agrupa por cuenta en el
 * SERVIDOR y al navegador solo le llega cuántos documentos hubo (`documentos`),
 * nunca cuáles. Buscar por N° interno pediría cambiar lo que la ruta devuelve.
 */
const camposDeCuenta = (c: CuentaEgreso) => [c.nombre, c.visible, c.cuenta, ...c.ejemplos];

/** Los centavos de un montón de cuentas. Se suma acá para que el total siga al filtro. */
const sumaCent = (cs: readonly CuentaEgreso[]) => cs.reduce((a, c) => a + c.totalCent, 0);
const sumaRenglones = (cs: readonly CuentaEgreso[]) => cs.reduce((a, c) => a + c.renglones, 0);

function FilaCuenta({ c }: { c: CuentaEgreso }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-gray-100 py-2.5 first:border-t-0">
      <div className="min-w-0">
        {/* El NOMBRE manda y el código va de apoyo: "6.02.01" no le dice nada a
            nadie, "SERVICIOS PROFESIONALES" sí. Sin nombre queda el código
            solo, en el mismo lugar y con el mismo peso que tenía antes. */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          {c.nombre ? (
            <>
              <span className="text-sm font-medium text-gray-900">{c.nombre}</span>
              <span className="text-sm tabular-nums text-gray-500">{c.visible}</span>
            </>
          ) : (
            <span className="text-sm font-medium tabular-nums text-gray-900">{c.visible}</span>
          )}
          <span className="text-sm text-gray-600">
            {c.renglones} {c.renglones === 1 ? "pago" : "pagos"}
          </span>
        </div>
        {c.ejemplos.length > 0 && (
          <p className="mt-0.5 text-sm text-gray-600">{c.ejemplos.join(" · ")}</p>
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

  // ── 🔴 EL BUSCADOR DE CUENTAS, Y EL TOTAL QUE LO SIGUE (11-sep-2026) ──────
  //
  // Daniel: *«pon buscador a lo que normalmente llevaría buscador»*. Un mes de
  // Vistana son decenas de cuentas y se entra a buscar UNA.
  //
  // 🔴 EL TOTAL SIGUE AL FILTRO — la regla de `lib/buscar-en-lista.ts`: o el
  // total sigue al filtro, o no hay buscador. 🩸 Acá cuesta un poco más porque
  // los totales vienen SUMADOS DEL SERVIDOR (`r.totalSalidaCent`, etc.), así que
  // con búsqueda escrita se vuelven a sumar en el navegador sobre las cuentas
  // que quedaron — de sus propios `totalCent`, que son los mismos centavos
  // enteros, sin volver a dividir ni redondear nada.
  //
  // ⚠️ **«en N documentos» desaparece mientras se busca, y es a propósito**: un
  // documento puede tocar varias cuentas, así que no se puede sumar por cuenta
  // y el navegador no tiene los N° internos. Dejarlo con el número del mes
  // entero al lado de un total recortado sería justo la mezcla que esta regla
  // prohíbe.
  //
  // 🔴 Y esto NO toca la regla de la casa: acá se ve UNA empresa y sus gastos
  // nunca se suman con los de otra.
  const [busqueda, setBusqueda] = useUrlState(PARAM_BUSCAR, "");
  const buscando = busqueda.trim() !== "";
  const gastoVistas = useMemo(
    () => filtrarPorTexto(r.cuentasGasto, busqueda, camposDeCuenta),
    [r.cuentasGasto, busqueda],
  );
  const noGastoVistas = useMemo(
    () => filtrarPorTexto(r.cuentasNoGasto, busqueda, camposDeCuenta),
    [r.cuentasNoGasto, busqueda],
  );
  const totalCuentas = r.cuentasGasto.length + r.cuentasNoGasto.length;
  const vistas = gastoVistas.length + noGastoVistas.length;
  const sinResultados = buscando && vistas === 0;
  const conteo = textoDeConteo(vistas, totalCuentas, busqueda, ["cuenta", "cuentas"]);

  const totalGastoCent = buscando ? sumaCent(gastoVistas) : r.totalGastoCent;
  const totalNoGastoCent = buscando ? sumaCent(noGastoVistas) : r.totalNoGastoCent;
  const totalSalidaCent = buscando ? totalGastoCent + totalNoGastoCent : r.totalSalidaCent;
  const renglones = buscando ? sumaRenglones(gastoVistas) + sumaRenglones(noGastoVistas) : r.renglones;
  const explicacion = explicacionEgresos(
    r.estado,
    empresa.ultimoMesConMovimientos,
    empresa.descargaAutomatica,
  );

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
          {/* 🔴 El buscador ARRIBA del total: lo que se escribe manda sobre lo
              que el cuadro dice, y el conteo de al lado («3 de 41 cuentas»)
              impide leer ese total recortado como el del mes. */}
          {totalCuentas > 0 && (
            <BuscadorDeLista
              className="mb-3"
              valor={busqueda}
              onCambiar={setBusqueda}
              placeholder={PLACEHOLDER_CUENTA}
              etiqueta="Buscar cuenta por nombre, código o referencia"
              conteo={conteo}
            />
          )}

          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
            <LineaTotal label="Salió de caja y banco" cent={totalSalidaCent} fuerte />
            <div className="mt-1 border-t border-gray-100 pt-1">
              <LineaTotal label="De eso, gastos" cent={totalGastoCent} />
              {totalNoGastoCent !== 0 && (
                <LineaTotal label="De eso, no es gasto" cent={totalNoGastoCent} />
              )}
            </div>
            <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-600">
              {renglones} {renglones === 1 ? "pago" : "pagos"}
              {!buscando && r.documentos !== r.renglones && ` en ${r.documentos} documentos`}
            </p>
          </div>

          {sinResultados && (
            <VacioDeBusqueda texto={VACIO_CUENTA} onLimpiar={() => setBusqueda("")} rotulo={LIMPIAR_BUSQUEDA} />
          )}

          {/* 🔴 Con la búsqueda sin resultados no se dibuja ninguna de las dos
              secciones: el aviso de arriba ya lo dijo, y repetir «nada de eso
              fue un gasto» sería decir algo que no es cierto del mes. */}
          {!sinResultados && (gastoVistas.length > 0 || !buscando) && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">En qué se gastó</h2>
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-1">
                {gastoVistas.length === 0 ? (
                  <p className="py-2.5 text-sm text-gray-600">
                    Este mes salió plata, pero nada de eso fue un gasto.
                  </p>
                ) : (
                  gastoVistas.map((c) => <FilaCuenta key={c.cuenta} c={c} />)
                )}
              </div>
            </>
          )}

          {noGastoVistas.length > 0 && (
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
                {noGastoVistas.map((c) => (
                  <FilaCuenta key={c.cuenta} c={c} />
                ))}
              </div>
            </>
          )}

          {!sinResultados && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-1">
              <LineaTotal label="Total que salió" cent={totalSalidaCent} fuerte />
            </div>
          )}
        </>
      )}
    </div>
  );
}

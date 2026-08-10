"use client";

import type { MouseEvent } from "react";
import { fmt } from "@/lib/format";

/**
 * Confirmación de "este gasto deja el fondo en negativo".
 *
 * 🩸 ESTABA ESCRITO DOS VECES, palabra por palabra: en el Drawer inline
 * (`NuevoGastoDrawer`) y en la ruta suelta (`/caja/[periodoId]/nuevo`, viva
 * para los deep-links de las sugerencias). Los dos caminos guardan el MISMO
 * gasto contra el MISMO fondo, así que dos copias del aviso es una que se
 * corrige y otra que se queda vieja — y la que se queda vieja es un freno a una
 * acción que descuadra la caja.
 *
 * El texto en pantalla NO cambió al unificarlo. Lo único que cada llamador
 * sigue decidiendo es el apilamiento: dentro del Drawer este aviso tiene que ir
 * POR ENCIMA de él (el Drawer vive en z-50), y en la página suelta alcanza con
 * el z-50 de siempre.
 */
interface Props {
  fondo: number;
  gastado: number;
  nuevo: number;
  saldoFuturo: number;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Handlers de `useBackdropDismiss`: clic fuera = Cancelar, NUNCA guardar.
   * Los pone el llamador porque también decide cuándo se puede cerrar (con el
   * guardado en vuelo no se cierra).
   */
  backdropProps?: {
    onMouseDown: (e: MouseEvent) => void;
    onClick: (e: MouseEvent) => void;
  };
  /** true = por encima del Drawer de "Nuevo gasto". */
  sobreDrawer?: boolean;
}

export default function AvisoSaldoNegativo({
  fondo,
  gastado,
  nuevo,
  saldoFuturo,
  onConfirm,
  onCancel,
  backdropProps,
  sobreDrawer = false,
}: Props) {
  return (
    <div
      className={`skin-caja fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center ${sobreDrawer ? "z-[60]" : "z-50"}`}
      {...backdropProps}
    >
      {/* Sin stopPropagation: el hook del fondo solo cierra si el mousedown Y
          el click cayeron sobre el fondo mismo. */}
      <div
        className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4"
        style={{ border: "1px solid var(--caja-border-default)" }}
      >
        <h3 className="text-base font-medium mb-3" style={{ color: "var(--caja-fg-strong)" }}>
          ¿Continuar con saldo negativo?
        </h3>
        <p className="text-sm mb-2" style={{ color: "var(--caja-fg-default)" }}>
          Este gasto deja el fondo en <strong className="caja-mono">${fmt(saldoFuturo)}</strong> (fondo <span className="caja-mono">${fmt(fondo)}</span>, gastos <span className="caja-mono">${fmt(gastado)}</span>, nuevo <span className="caja-mono">${fmt(nuevo)}</span>).
        </p>
        <p className="text-xs mb-6" style={{ color: "var(--caja-fg-muted)" }}>
          Considera solicitar reabastecimiento antes de seguir gastando.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium text-white active:scale-[0.97] transition-all min-h-[44px]"
            style={{ background: "var(--caja-danger)" }}
          >
            Sí, guardar igual
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-md text-sm transition-all min-h-[44px]"
            style={{
              background: "#fff",
              color: "var(--caja-fg-default)",
              border: "1px solid var(--caja-border-default)",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { fmt } from "@/lib/format";
import { montoEnPantalla, reposicionDelPeriodo, saldoDelPeriodo, saldoEsNegativo } from "@/lib/caja/dinero";
import { diferenciaDeCaja, hayDescuadre, leerConteo, mensajeDeDiferencia } from "@/lib/caja/conteo-cierre";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Cierra el período con la plata que se CONTÓ en la caja. */
  onConfirm: (efectivoContado: number) => void;
  fondo: number;
  gastado: number;
  recibos: number;
  /** Número del período que se abre al cerrar este. */
  siguienteNumero: number;
}

/**
 * Cierre de período: las cuatro líneas de la cuenta, el conteo de la plata y un
 * botón. El cierre real de la caja es «queda poca plata» (criterio de la
 * secretaria) y la reposición devuelve el fondo a $200 — el saldo NO tiene que
 * dar cero. Un saldo negativo se ve en rojo, pero tampoco bloquea: es un hecho,
 * no un error.
 *
 * 🔴 SE PREGUNTA CUÁNTA PLATA HAY DE VERDAD (20-sep-2026). 🩸 Los dos cierres
 * de toda la historia dieron exactamente $0.00, y en los dos el último recibo
 * cargado —7 y 10 segundos antes de cerrar— es exactamente lo que faltaba para
 * llegar a $200: el sistema no podía distinguir «cuadró» de «le puse lo que
 * faltaba». El campo es OBLIGATORIO; el descuadre se DICE («Faltan $2.00» /
 * «Sobran $1.50»), se guarda y NO frena el cierre.
 */
export default function CerrarPeriodoModal({ open, onClose, onConfirm, fondo, gastado, recibos, siguienteNumero }: Props) {
  useEscapeClose(open, onClose);
  const [contadoTexto, setContadoTexto] = useState("");
  const [tocado, setTocado] = useState(false);

  // Cada vez que se abre, la casilla arranca vacía: el conteo es de ESTE cierre
  // y no se hereda del anterior.
  useEffect(() => {
    if (open) { setContadoTexto(""); setTocado(false); }
  }, [open]);

  if (!open) return null;

  // Las MISMAS cuentas que la lista, el encabezado, el papel y el Excel.
  const queda = saldoDelPeriodo(fondo, gastado);
  const reposicion = reposicionDelPeriodo(fondo, gastado);
  const monto = montoEnPantalla;

  const contado = leerConteo(contadoTexto);
  const diferencia = contado === null ? 0 : diferenciaDeCaja(contado, queda);
  const descuadra = contado !== null && hayDescuadre(diferencia);

  const filas: Array<{ label: string; value: number; negativo?: boolean }> = [
    { label: "Fondo", value: fondo },
    { label: `Gastado (${recibos} ${recibos === 1 ? "recibo" : "recibos"})`, value: gastado },
    { label: "Queda en caja", value: queda, negativo: saldoEsNegativo(queda) },
    { label: `Reposición para volver a $${fmt(fondo)}`, value: reposicion },
  ];

  function confirmar() {
    setTocado(true);
    if (contado === null) return;
    onConfirm(contado);
  }

  return (
    <ModalOverlay onBackdropClick={onClose}>
      <div className="skin-caja bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200">
        <h3 className="text-base font-medium mb-4">Cerrar período</h3>
        <div className="mb-2 space-y-2.5">
          {filas.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-4 text-sm">
              <span style={{ color: "var(--caja-fg-muted)" }}>{f.label}</span>
              <span
                className="caja-mono font-medium"
                style={{ color: f.negativo ? "var(--caja-danger)" : "var(--caja-fg-strong)" }}
              >
                {monto(f.value)}
              </span>
            </div>
          ))}
        </div>
        {saldoEsNegativo(queda) && (
          <p className="text-xs mb-2" style={{ color: "var(--caja-danger-onSoft)" }}>
            Se gastó más que el fondo.
          </p>
        )}

        {/* 🔴 La plata de verdad. Obligatorio; el descuadre no frena nada. */}
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--caja-border-subtle)" }}>
          <label
            htmlFor="caja-efectivo-contado"
            className="block text-sm mb-1.5"
            style={{ color: "var(--caja-fg-default)", fontWeight: 500 }}
          >
            ¿Cuánto dinero hay en la caja? <span style={{ color: "var(--caja-danger)" }}>*</span>
          </label>
          <div style={{ position: "relative" }}>
            <span
              className="caja-mono"
              style={{
                position: "absolute", left: 12, top: 0, bottom: 0,
                display: "flex", alignItems: "center",
                color: "var(--caja-fg-muted)", fontSize: 14, pointerEvents: "none",
              }}
            >
              $
            </span>
            <input
              id="caja-efectivo-contado"
              value={contadoTexto}
              onChange={(e) => { setContadoTexto(e.target.value.replace(/[^0-9.]/g, "")); setTocado(true); }}
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              className="caja-mono w-full"
              style={{
                boxSizing: "border-box",
                height: 48,
                padding: "0 14px 0 26px",
                fontSize: 14,
                textAlign: "right",
                color: "var(--caja-fg-strong)",
                background: "#fff",
                outline: "none",
                borderRadius: 6,
                border: "1px solid var(--caja-border-default)",
              }}
            />
          </div>
          <p className="text-xs mt-1.5" style={{ color: "var(--caja-fg-muted)" }}>
            Cuenta los billetes y las monedas que quedan, y escribe el total.
          </p>
          {contado !== null && (
            <p
              className="text-sm mt-2 font-medium"
              style={{ color: descuadra ? "var(--caja-danger-onSoft)" : "var(--caja-fg-default)" }}
            >
              {mensajeDeDiferencia(diferencia)}
              {descuadra && (
                <span className="block text-xs font-normal mt-0.5" style={{ color: "var(--caja-fg-muted)" }}>
                  Se cierra igual y la diferencia queda anotada.
                </span>
              )}
            </p>
          )}
          {tocado && contado === null && (
            <p className="text-xs mt-2" style={{ color: "var(--caja-danger-onSoft)" }}>
              Escribe cuánta plata hay en la caja para poder cerrar.
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={confirmar}
            disabled={contado === null}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-black text-white hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px] disabled:opacity-40"
          >
            Cerrar y abrir el {siguienteNumero}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all min-h-[44px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

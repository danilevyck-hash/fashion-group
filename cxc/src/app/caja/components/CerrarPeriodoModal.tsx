"use client";

import { ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { fmt } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fondo: number;
  gastado: number;
  recibos: number;
  /** Número del período que se abre al cerrar este. */
  siguienteNumero: number;
}

/**
 * Cierre de período: cuatro líneas y un botón. El cierre real de la caja es
 * «queda poca plata» (criterio de la secretaria) y la reposición devuelve el
 * fondo a $200 — el saldo NO tiene que dar cero. Un saldo negativo se ve en
 * rojo, pero tampoco bloquea: es un hecho, no un error.
 */
export default function CerrarPeriodoModal({ open, onClose, onConfirm, fondo, gastado, recibos, siguienteNumero }: Props) {
  useEscapeClose(open, onClose);
  if (!open) return null;

  const queda = Math.round((fondo - gastado) * 100) / 100;
  const reposicion = Math.round((fondo - queda) * 100) / 100;
  const monto = (v: number) => (v < 0 ? `-$${fmt(Math.abs(v))}` : `$${fmt(v)}`);

  const filas: Array<{ label: string; value: number; negativo?: boolean }> = [
    { label: "Fondo", value: fondo },
    { label: `Gastado (${recibos} ${recibos === 1 ? "recibo" : "recibos"})`, value: gastado },
    { label: "Queda en caja", value: queda, negativo: queda < 0 },
    { label: `Reposición para volver a $${fmt(fondo)}`, value: reposicion },
  ];

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
        {queda < 0 && (
          <p className="text-xs mb-2" style={{ color: "var(--caja-danger-onSoft)" }}>
            Se gastó más que el fondo.
          </p>
        )}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-black text-white hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px]"
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

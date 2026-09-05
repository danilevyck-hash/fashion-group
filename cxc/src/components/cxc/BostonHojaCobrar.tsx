"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «COBRAR» EN LA CARTERA DE CONFECCIONES BOSTON.
//
// 🔴 ES SU PROPIA HOJA, con sus propios datos. No comparte una sola línea de
// consulta con la del grupo: los teléfonos y correos de Boston salen de
// `switch_clientes` acotado a Boston (llegan dentro de `/api/cxc/boston`),
// nunca de `clientes_master`, donde Boston no está a propósito.
//
// ⚠️ ACÁ NO HAY «CORREO», Y ES UNA DECISIÓN, NO UN OLVIDO (5-sep-2026).
// Medido: de los 390 clientes de Boston con saldo, **272 tienen teléfono pero
// solo 113 tienen correo**, y el texto de cobro del sistema está escrito y
// firmado por Fashion Group —Boston no está en esa lista de empresas—. Mandar
// un correo desde acá exige decidir quién lo firma y con qué texto, y eso es
// una decisión de negocio de Daniel, no un detalle de pantalla. Las tres
// salidas que SÍ se pueden dar con el dato que hay están todas.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ModalOverlay } from "@/components/ui";
import { fmt } from "@/lib/format";
import { waHref } from "@/lib/contact-links";

export interface ClienteCobrarBoston {
  codigo: string;
  nombre: string;
  telefono: string;
  celular: string;
  d0_90: number;
  d91_120: number;
  d121_plus: number;
  total: number;
}

/**
 * El mensaje que LEE EL CLIENTE.
 *
 * 🔴 La palabra «vencido» está PROHIBIDA hacia el cliente, igual que en el
 * mensaje del grupo: `dias` es la EDAD del documento desde su emisión, NO días
 * de mora. Se rotula por ANTIGÜEDAD.
 */
export function mensajeBoston(c: ClienteCobrarBoston): string {
  const lineas = [
    "Estimado/a cliente,",
    "",
    "Le escribimos de Confecciones Boston para informarle sobre su estado de cuenta actualizado.",
    "",
    `Estado de Cuenta - ${c.nombre}`,
    "",
  ];
  if (c.d0_90 > 0) lineas.push(`Hasta 90 días: $${fmt(c.d0_90)}`);
  if (c.d91_120 > 0) lineas.push(`De 91 a 120 días: $${fmt(c.d91_120)}`);
  if (c.d121_plus > 0) lineas.push(`Más de 120 días: $${fmt(c.d121_plus)}`);
  lineas.push(`Total: $${fmt(c.total)}`);
  lineas.push("");
  lineas.push("Agradecemos su pronta atencion a este saldo. Quedamos a su disposicion para cualquier consulta.");
  lineas.push("");
  lineas.push("Atentamente,");
  lineas.push("Confecciones Boston - Departamento de Cobros");
  return lineas.join("\n");
}

export default function BostonHojaCobrar({
  cliente,
  onClose,
  onVerDocumentos,
}: {
  cliente: ClienteCobrarBoston | null;
  onClose: () => void;
  onVerDocumentos: (c: ClienteCobrarBoston) => void;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  if (!cliente) return null;

  const tel = cliente.celular || cliente.telefono;

  function abrirWhatsApp() {
    if (!cliente) return;
    const href = waHref(tel, mensajeBoston(cliente));
    if (!href) { setAviso("Este cliente no tiene teléfono — cárgalo en Switch."); return; }
    window.open(href, "_blank");
    onClose();
  }

  function copiar() {
    if (!cliente) return;
    navigator.clipboard.writeText(mensajeBoston(cliente))
      .then(() => onClose())
      .catch(() => setAviso("No se pudo copiar. Intenta de nuevo."));
  }

  return (
    <ModalOverlay onBackdropClick={onClose} align="start">
      <div className="bg-white rounded-lg w-full sm:max-w-md mx-0 sm:mx-4 my-0 sm:my-16 border border-gray-200">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Cobrar</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-700 transition -mr-1 p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-base font-semibold text-gray-900">{cliente.nombre}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Confecciones Boston · {cliente.codigo} · ${fmt(cliente.total)}
            </p>
          </div>

          {aviso && <p role="alert" className="text-sm text-red-600">{aviso}</p>}

          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            <li>
              <button
                type="button"
                disabled={!tel}
                onClick={abrirWhatsApp}
                className="w-full text-left px-4 py-3 min-h-[44px] transition hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <span className="block text-sm font-medium text-gray-900">WhatsApp</span>
                <span className="block text-xs text-gray-500 mt-0.5 truncate">
                  {tel || "Este cliente no tiene teléfono — cárgalo en Switch"}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={copiar}
                className="w-full text-left px-4 py-3 min-h-[44px] transition hover:bg-gray-50"
              >
                <span className="block text-sm font-medium text-gray-900">Copiar el mensaje</span>
                <span className="block text-xs text-gray-500 mt-0.5">Para pegarlo donde quieras</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onVerDocumentos(cliente)}
                className="w-full text-left px-4 py-3 min-h-[44px] transition hover:bg-gray-50"
              >
                <span className="block text-sm font-medium text-gray-900">Ver los documentos</span>
                <span className="block text-xs text-gray-500 mt-0.5">Su estado de cuenta, documento por documento</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </ModalOverlay>
  );
}

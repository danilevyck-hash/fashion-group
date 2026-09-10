"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «COBRAR» EN LA CARTERA DE CONFECCIONES BOSTON.
//
// 🔴 ES SU PROPIA HOJA, con sus propios datos. No comparte una sola línea de
// consulta con la del grupo: los teléfonos y correos de Boston salen de
// `switch_clientes` acotado a Boston (llegan dentro de `/api/cxc/boston` y de
// `/api/cxc/boston/enviar-email`), nunca de `clientes_master`, donde Boston no
// está a propósito.
//
// 🔴 EL CORREO SE PRENDIÓ EL 9-SEP-2026, Y LO FIRMA BOSTON. Daniel, textual:
// *«Firma Confecciones Boston»*. Hasta ese día esta hoja no mandaba correos y
// eso era una decisión pendiente, no un olvido: el texto de cobro del sistema
// lo firmaba Fashion Group, que no es quien le vendió a este cliente. Ahora el
// remitente, el asunto, el cuerpo, la firma y el PDF adjunto dicen Confecciones
// Boston, y nada de lo que recibe el cliente dice Fashion Group.
//
// 🔴 UN CLIC, CON DESHACER DE 5 SEGUNDOS — el mismo patrón del grupo
// (`useUndoAction`/`UndoToast`): el envío real ocurre recién al vencer esos 5
// segundos, así que «Deshacer» no cancela un correo que ya salió: impide que
// salga.
//
// ⚠️ Sin correo cargado la fila de Correo sale APAGADA y dice dónde cargarlo.
// Medido el 9-sep-2026: de los 398 clientes con saldo, 284 tienen teléfono y
// solo 119 correo.
//
// ⚠️ ACÁ NO HAY «MANDAR A VARIOS»: el encargo era el correo de UN cliente, y
// estrenar el lote sin decidir qué pasa con los 279 sin correo sería inventar
// una regla que nadie aprobó.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ModalOverlay } from "@/components/ui";
import { fmt } from "@/lib/format";
import { waHref } from "@/lib/contact-links";

export interface ClienteCobrarBoston {
  codigo: string;
  nombre: string;
  telefono: string;
  celular: string;
  correo: string;
  d0_90: number;
  d91_120: number;
  d121_plus: number;
  total: number;
}

/** Lo que hay que saber para mandar el correo cuando venzan los 5 segundos. */
export interface CorreoProgramadoBoston {
  codigo: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
}

/** Lo que contesta `/api/cxc/boston/enviar-email` cuando se abre la hoja. */
interface Preview {
  destinatario: string;
  asunto: string;
  cuerpo: string;
  totalDocs: number;
  marcaEnvio: string | null;
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
  onProgramarCorreo,
}: {
  cliente: ClienteCobrarBoston | null;
  onClose: () => void;
  onVerDocumentos: (c: ClienteCobrarBoston) => void;
  /** Programa el envío con sus 5 segundos de «Deshacer». */
  onProgramarCorreo: (datos: CorreoProgramadoBoston) => void;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [cargando, setCargando] = useState(false);

  const abierta = !!cliente;
  const codigo = cliente?.codigo ?? null;

  useEffect(() => {
    if (!abierta || !codigo) return;
    let cancelado = false;
    setCargando(true);
    setPreview(null);
    setAviso(null);
    fetch(`/api/cxc/boston/enviar-email?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: Preview) => { if (!cancelado) setPreview(d); })
      .catch(() => {
        if (!cancelado) setAviso("No se pudo preparar el estado de cuenta. Intenta de nuevo en unos segundos.");
      })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [abierta, codigo]);

  if (!cliente) return null;

  const tel = cliente.celular || cliente.telefono;
  const tieneCorreo = !!preview?.destinatario;

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

  function mandarCorreo() {
    if (!cliente || !preview?.destinatario) return;
    onProgramarCorreo({
      codigo: cliente.codigo,
      destinatario: preview.destinatario,
      asunto: preview.asunto,
      cuerpo: preview.cuerpo,
    });
    onClose();
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
            {preview?.marcaEnvio && (
              <p className="text-xs text-gray-400 mt-0.5">{preview.marcaEnvio}</p>
            )}
          </div>

          {aviso && <p role="alert" className="text-sm text-red-600">{aviso}</p>}

          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            <li>
              <button
                type="button"
                disabled={!tieneCorreo || cargando}
                onClick={mandarCorreo}
                className="w-full text-left px-4 py-3 min-h-[44px] transition hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <span className="block text-sm font-medium text-gray-900">Correo</span>
                <span className="block text-xs text-gray-500 mt-0.5 truncate">
                  {cargando
                    ? "Buscando el correo del cliente…"
                    : tieneCorreo
                      ? preview!.destinatario
                      : "Este cliente no tiene correo — cárgalo en Switch"}
                </span>
              </button>
            </li>
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
                <span className="block text-xs text-gray-500 mt-0.5">
                  {preview
                    ? `Su estado de cuenta — ${preview.totalDocs} ${preview.totalDocs === 1 ? "documento" : "documentos"} con saldo`
                    : "Su estado de cuenta, documento por documento"}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </ModalOverlay>
  );
}

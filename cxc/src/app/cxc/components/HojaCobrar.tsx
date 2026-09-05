"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «COBRAR» — UNA HOJA, CUATRO SALIDAS.
//
// 🩸 QUÉ REEMPLAZA (5-sep-2026). Para mandarle el estado de cuenta a un cliente
// había SEIS puertas que hacían lo mismo: las 4 opciones del menú "···", el
// botón negro «Estado de cuenta» del panel expandido, y el menú de clic
// derecho. Ninguna se veía sin abrir algo, ninguna decía qué iba a salir, y las
// tres listas de opciones vivían en tres archivos distintos que había que
// mantener iguales a mano.
//
// Ahora hay UN botón visible en cada fila —«Cobrar»— que abre esta hoja. La
// hoja dice ARRIBA qué se va a mandar (al día, cuántas empresas, cuánto) y
// ofrece las cuatro salidas, en el orden en que se usan.
//
// 🔴 LO QUE SE MANDA SON SIEMPRE LAS 6 EMPRESAS, sin importar el filtro de la
// pantalla. Daniel: *«todo»*. La regla vive en el SERVIDOR
// (`empresasDelEnvio()` en `/api/cxc/enviar-email`), no acá: esta hoja pinta lo
// que esa ruta le contesta. Candado: `cxc-cobrar-manda-las-seis.test.ts`.
//
// 🔴 EL CORREO SE MANDA CON UN CLIC, y por eso trae DESHACER de 5 segundos —el
// patrón `useUndoAction`/`UndoToast` del sistema—: el envío real ocurre recién
// al vencer esos 5 segundos. Sin ventana de compose de por medio; quien quiera
// escribirlo tiene «Escribirlo yo», que abre el formulario completo de siempre.
//
// ⚠️ Sin correo cargado la fila de Correo sale APAGADA y dice dónde cargarlo.
// Medido el 5-sep-2026: 21 de los 100 clientes con saldo no tienen correo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ModalOverlay } from "@/components/ui";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtDate } from "@/lib/format";
import type { EstadoCuenta } from "./EstadoCuentaDrawer";

/** El código Switch (D-XXX) es el mismo en todas las empresas del cliente. */
function codigoDe(client: ConsolidatedClient): string | null {
  return Object.values(client.companies).find((c) => c?.codigo)?.codigo ?? null;
}
function nombreDe(client: ConsolidatedClient): string {
  return Object.values(client.companies).find((c) => c?.nombre)?.nombre ?? client.nombre_normalized;
}

/** Lo que hay que saber para mandar el correo cuando venzan los 5 segundos. */
export interface CorreoProgramado {
  codigo: string;
  nombre: string;
  nombreNormalizado: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
}

interface Preview {
  destinatario: string;
  asunto: string;
  cuerpo: string;
  sharedCount: number;
  totalDocs: number;
  estadoCuenta: EstadoCuenta;
}

interface Props {
  client: ConsolidatedClient | null;
  onClose: () => void;
  /** Programa el envío con sus 5 segundos de «Deshacer». */
  onProgramarCorreo: (datos: CorreoProgramado) => void;
  onWhatsApp: (client: ConsolidatedClient) => void;
  onCopiar: (client: ConsolidatedClient) => void;
  /** Abre el formulario completo (destinatario/asunto/cuerpo editables). */
  onEscribirloYo: (client: ConsolidatedClient) => void;
  /** «Le enviaste el estado de cuenta hace 3 días», o `null`. */
  marcaEnvio: string | null;
}

export default function HojaCobrar({
  client,
  onClose,
  onProgramarCorreo,
  onWhatsApp,
  onCopiar,
  onEscribirloYo,
  marcaEnvio,
}: Props) {
  const abierto = !!client;
  const codigo = client ? codigoDe(client) : null;
  const nombre = client ? nombreDe(client) : "";
  const nombreNormalizado = client?.nombre_normalized ?? "";

  const [preview, setPreview] = useState<Preview | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto || !codigo) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    setPreview(null);
    const params = new URLSearchParams({ codigo, nombre, nombreNormalizado });
    fetch(`/api/cxc/enviar-email?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: Preview) => { if (!cancelado) setPreview(d); })
      .catch(() => { if (!cancelado) setError("No se pudo preparar el estado de cuenta. Intenta de nuevo en unos segundos."); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [abierto, codigo, nombre, nombreNormalizado]);

  if (!abierto || !client) return null;

  const datos = preview?.estadoCuenta ?? null;
  const empresas = datos?.empresas.length ?? 0;
  const encabezado = datos
    ? `Estado de cuenta al ${fmtDate(datos.generadoEn.slice(0, 10))} · ${empresas} ${empresas === 1 ? "empresa" : "empresas"} · $${fmt(datos.total)}`
    : "Preparando el estado de cuenta…";

  const tieneCorreo = !!preview?.destinatario;

  async function entregarPdf() {
    if (!datos) return;
    setOcupado(true);
    setError(null);
    try {
      const { buildEstadoCuentaPDF } = await import("@/lib/pdf-estado-cuenta");
      const { doc, filename } = buildEstadoCuentaPDF(datos, nombre);
      const blob = doc.output("blob");
      const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
      const file = new File([blob], filename, { type: "application/pdf" });
      if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "Estado de cuenta", text: `Estado de cuenta — ${nombre}` });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Cerrar la hoja de compartir del sistema no es un error.
      if ((e as Error)?.name === "AbortError") return;
      console.error("[cxc/cobrar] PDF:", e);
      setError("No se pudo preparar el PDF. Intenta de nuevo en unos segundos.");
    } finally {
      setOcupado(false);
    }
  }

  function mandarCorreo() {
    if (!preview || !codigo || !preview.destinatario) return;
    onProgramarCorreo({
      codigo,
      nombre,
      nombreNormalizado,
      destinatario: preview.destinatario,
      asunto: preview.asunto,
      cuerpo: preview.cuerpo,
    });
    onClose();
  }

  const cuerpo = (
    <div className="space-y-3">
      <div>
        <p className="text-base font-semibold text-gray-900">{nombre}</p>
        <p className="text-xs text-gray-500 mt-0.5">{encabezado}</p>
        {marcaEnvio && <p className="text-xs text-gray-400 mt-0.5">{marcaEnvio}</p>}
      </div>

      {preview && preview.sharedCount >= 10 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Ese correo está registrado en {preview.sharedCount} clientes distintos. Verifica que sea el correcto.
        </p>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
        <FilaAccion
          titulo="Correo"
          detalle={
            cargando ? "Buscando el correo del cliente…"
              : tieneCorreo ? preview!.destinatario
              : "Este cliente no tiene correo — cárgalo en su ficha"
          }
          apagada={!tieneCorreo || cargando}
          onClick={mandarCorreo}
        />
        <FilaAccion
          titulo="WhatsApp"
          detalle={client.celular || client.telefono || "Este cliente no tiene teléfono — cárgalo en su ficha"}
          apagada={!client.celular && !client.telefono}
          onClick={() => { onWhatsApp(client); onClose(); }}
        />
        <FilaAccion
          titulo="Copiar el mensaje"
          detalle="Para pegarlo donde quieras"
          onClick={() => { onCopiar(client); onClose(); }}
        />
        <FilaAccion
          titulo="Ver o bajar el PDF"
          detalle={datos ? `${preview?.totalDocs ?? 0} documentos con saldo` : "Preparando…"}
          apagada={!datos || ocupado}
          onClick={entregarPdf}
        />
      </ul>

      <button
        type="button"
        onClick={() => { onEscribirloYo(client); onClose(); }}
        className="inline-flex items-center min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800 transition"
      >
        Escribirlo yo ›
      </button>
    </div>
  );

  // 🔴 EN CELULAR LA HOJA SUBE DESDE ABAJO. No hace falta un segundo
  // componente: `ModalOverlay` con `align="center"` ES el patrón de
  // hoja-desde-abajo del sistema (`items-end sm:items-center`) — pegada al
  // borde inferior en celular y centrada desde iPad. Una hoja aparte solo para
  // el celular sería una segunda que mantener igual a mano.
  return (
    <ModalOverlay onBackdropClick={onClose} align="center">
      <div className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-md mx-0 sm:mx-4 mb-0 sm:my-16 border border-gray-200 max-h-[92vh] overflow-y-auto">
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
        <div className="px-5 py-4">{cuerpo}</div>
      </div>
    </ModalOverlay>
  );
}

function FilaAccion({
  titulo,
  detalle,
  apagada = false,
  onClick,
}: {
  titulo: string;
  detalle: string;
  apagada?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={apagada}
        onClick={onClick}
        className="w-full text-left px-4 py-3 min-h-[44px] transition hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        <span className="block text-sm font-medium text-gray-900">{titulo}</span>
        <span className="block text-xs text-gray-500 mt-0.5 truncate">{detalle}</span>
      </button>
    </li>
  );
}

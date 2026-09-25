"use client";

// ============================================================================
// «MANDAR» — la «9r» (25-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR: el papel de un vendedor se BAJABA al teléfono y de
// ahí había que buscarlo en la carpeta de descargas y adjuntarlo a mano.
//
// 🔴 ES LA MISMA HOJA DEL ESTADO DE CUENTA DE CUENTAS POR COBRAR: tres salidas,
// **Correo · WhatsApp · Copiar el link**, y sale desde el DETALLE, que es donde
// se está mirando lo que se va a mandar.
//
// 🔴 EL PDF ES EL MISMO QUE BAJA «DESCARGAR»: lo arma `construirPdfComision`,
// el generador de siempre, y de acá viajan sus BYTES. No hay un segundo papel.
//
// 🔑 EL CORREO PIDE LA DIRECCIÓN, porque el sistema no guarda el correo de
// ningún vendedor. Inventar una sería peor que preguntarla.
//
// ⚠️ EL LINK NECESITA EL CAJÓN `comisiones-papeles` en Storage. Mientras no
// exista, WhatsApp y «Copiar el link» **dicen que no se pudo** en vez de
// mandar una dirección rota; el correo sigue funcionando porque lleva el papel
// adjunto.
// ============================================================================

import { useState } from "react";
import {
  DIAS_DEL_LINK,
  LINK_COPIADO,
  SIN_CAJON,
  mensajeDeWhatsApp,
} from "@/lib/comisiones/mandar";
import { OPCIONES_MANDAR, tituloDeLaHojaMandar, type ComoSeManda } from "@/lib/comisiones/celular";

interface Props {
  abierta: boolean;
  onCerrar: () => void;
  /** El nombre del vendedor, ya en pantalla. */
  vendedor: string;
  empresa: string;
  /** `2026-08`, para el título. */
  mes: string;
  year: number;
  mesNumero: number;
  /** «Agosto 2026» — lo que dice el correo y el WhatsApp. */
  periodo: string;
  /** Arma el papel y devuelve sus bytes en base64. Es el MISMO de «Descargar». */
  armarPdf: () => Promise<{ base64: string; nombre: string }>;
  /** Para el aviso de arriba. */
  onAviso: (texto: string) => void;
}

export function HojaMandarComision({
  abierta,
  onCerrar,
  vendedor,
  empresa,
  mes,
  year,
  mesNumero,
  periodo,
  armarPdf,
  onAviso,
}: Props) {
  const [pidiendoCorreo, setPidiendoCorreo] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  const [trabajando, setTrabajando] = useState<ComoSeManda | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!abierta) return null;

  async function mandar(canal: ComoSeManda, correo?: string) {
    setTrabajando(canal);
    setError(null);
    try {
      const { base64, nombre } = await armarPdf();
      const res = await fetch("/api/comisiones/mandar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal: canal === "correo" ? "correo" : "link",
          vendedor,
          empresa,
          periodo,
          year,
          mes: mesNumero,
          pdf: base64,
          nombreArchivo: nombre,
          destinatario: correo,
        }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { ok?: boolean; link?: string; error?: string };
      if (!res.ok || !cuerpo.ok) {
        // 🔴 Sin el cajón no se manda un link roto: se dice.
        throw new Error(cuerpo.error ?? (canal === "correo" ? "No se pudo mandar el correo." : SIN_CAJON));
      }
      if (canal === "correo") {
        onAviso("Listo, el correo salió");
      } else if (canal === "whatsapp" && cuerpo.link) {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(mensajeDeWhatsApp(vendedor, periodo, cuerpo.link))}`,
          "_blank",
        );
        onAviso("Listo, elige a quién mandárselo");
      } else if (cuerpo.link) {
        await navigator.clipboard?.writeText(cuerpo.link);
        onAviso(LINK_COPIADO);
      }
      cerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mandar. Intenta de nuevo.");
    } finally {
      setTrabajando(null);
    }
  }

  function cerrar() {
    setPidiendoCorreo(false);
    setDestinatario("");
    setError(null);
    onCerrar();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tituloDeLaHojaMandar(mes, vendedor)}
      data-hoja-mandar
      className="fixed inset-0 z-[70] flex flex-col justify-end sm:items-center sm:justify-center"
    >
      <button type="button" aria-label="Cerrar" onClick={cerrar} className="absolute inset-0 bg-black/30" />
      <div
        className="relative mx-2 mb-2 overflow-hidden rounded-2xl bg-white sm:mb-0 sm:w-full sm:max-w-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="px-4 py-3 text-center text-[13px] leading-snug text-gray-500">
          {tituloDeLaHojaMandar(mes, vendedor)}
        </div>

        {pidiendoCorreo ? (
          <div className="border-t border-gray-100 p-4">
            <label className="block">
              <span className="mb-1 block text-[12px] text-gray-500">
                ¿A qué correo se lo mando?
              </span>
              <input
                type="email"
                autoFocus
                inputMode="email"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                aria-label="Correo del vendedor"
                placeholder="nombre@correo.com"
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[16px] text-gray-900"
              />
            </label>
            <p className="mt-1 text-[12px] text-gray-500">
              El papel va adjunto, igual que el que baja «Descargar».
            </p>
            <button
              type="button"
              disabled={!destinatario.includes("@") || trabajando !== null}
              onClick={() => void mandar("correo", destinatario.trim())}
              className="mt-3 block w-full rounded-xl bg-gray-900 px-4 py-3 text-center text-[17px] font-semibold text-white disabled:bg-gray-300"
            >
              {trabajando === "correo" ? "Mandando…" : "Mandar"}
            </button>
          </div>
        ) : (
          OPCIONES_MANDAR.map((o) => (
            <button
              key={o.clave}
              type="button"
              disabled={trabajando !== null}
              data-mandar={o.clave}
              onClick={() => {
                if (o.clave === "correo") setPidiendoCorreo(true);
                else void mandar(o.clave);
              }}
              className="block w-full border-t border-gray-100 px-4 py-3.5 text-center text-[17px] text-gray-900 active:bg-gray-100 disabled:text-gray-400"
            >
              {trabajando === o.clave ? "Preparando…" : o.rotulo}
              {o.clave === "link" && (
                <span className="mt-0.5 block text-[13px] text-gray-500">
                  vence en {DIAS_DEL_LINK} días
                </span>
              )}
            </button>
          ))
        )}

        {error && <p role="alert" className="px-4 pb-2 text-center text-[13px] text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={cerrar}
          className="block w-full border-t-[6px] border-gray-100 px-4 py-3.5 text-center text-[17px] font-semibold text-gray-900 active:bg-gray-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS FIRMAS DE UNA GUÍA YA FIRMADA, PLEGADAS (5-sep-2026).
//
// Una línea que dice si está firmada por las dos partes o cuál falta, y un
// «Ver firmas» que las abre. El porqué, la medición y la regla de no mentir
// están en `@/lib/guias/firmas-resumen`.
//
// 🔴 ESTO ES PARA MIRAR, NO PARA FIRMAR. `SignatureCanvas` no se toca: al
// despachar los dos cuadros siguen midiendo 150 px de alto y todo el ancho.
// Este componente no se usa en `DespachoForm` y no debe usarse nunca ahí.
//
// Se dibuja en los DOS lugares donde se lee una guía firmada —el acordeón de la
// lista y `/guias/[id]`— para que no vuelvan a divergir.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  resumenDeFirmas,
  etiquetaFirmaTransportista,
  etiquetaFirmaEntregador,
  type GuiaConFirmas,
} from "@/lib/guias/firmas-resumen";

export default function FirmasPlegadas({
  guia,
  directa,
}: {
  guia: GuiaConFirmas;
  directa: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const resumen = resumenDeFirmas(guia, directa);

  // Sin ninguna firma no se dibuja nada: es lo que se ve hoy en las 65 guías
  // viejas, y ya las marca el ámbar «Salió incompleta».
  if (!resumen.hayAlguna) return null;

  const cajas: Array<[string, string | null | undefined]> = [
    [etiquetaFirmaTransportista(directa), guia.firma_base64],
    [etiquetaFirmaEntregador(directa), guia.firma_entregador_base64],
  ];

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3">
        <span className={`text-xs ${resumen.completas ? "text-gray-500" : "text-amber-700"}`}>
          {resumen.texto}
        </span>
        {/* 44 px con el dedo; los márgenes negativos evitan que engorde la línea. */}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="text-xs font-medium text-gray-500 hover:text-black underline transition inline-flex items-center justify-center min-h-[44px] px-2 -my-2 -mx-2"
        >
          {abierto ? "Ocultar firmas" : "Ver firmas"}
        </button>
      </div>
      {abierto && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          {cajas.map(([etiqueta, src]) =>
            src ? (
              <div key={etiqueta}>
                <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">{etiqueta}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={etiqueta} className="h-12 border border-gray-200 rounded p-1 bg-white" />
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

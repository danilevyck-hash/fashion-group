"use client";

import { useEffect, useState } from "react";
import type { Guia } from "./types";
import PrintDocument from "./PrintDocument";
import HojaEscalada from "./HojaEscalada";
import { compartirGuia } from "@/lib/guias/papel-de-la-guia";
import { precargarFirmasGuia } from "@/lib/guias/png-guia";
import { useToast } from "@/components/ToastSystem";

interface GuiaDetailProps {
  guia: Guia;
  onBack: () => void;
}

export default function GuiaDetail({ guia, onBack }: GuiaDetailProps) {
  const { toast } = useToast();
  const [compartiendo, setCompartiendo] = useState(false);

  // 🔑 Las firmas, decodificadas al ABRIR la pantalla: con hasta 6 renglones
  // «Compartir» manda una IMAGEN y dibujarla es síncrono a propósito.
  useEffect(() => {
    precargarFirmasGuia(guia);
  }, [guia]);

  // Compartir la guía por WhatsApp, correo o lo que ofrezca el celular.
  //
  // 🔴 UNA SOLA PUERTA: `compartirGuia` decide imagen o PDF según los renglones
  // (5-sep-2026). Acá vivía una SEGUNDA copia que armaba el PDF a mano, así que
  // esta pantalla se habría quedado mandando PDF siempre.
  //
  // ⚠️ El archivo se arma ANTES de llamar a la hoja de compartir y sin ningún
  // `await` en el medio: Safari en iOS solo deja abrirla dentro del gesto del
  // toque, y un `await` largo hace que deje de contar como tal.
  async function compartir() {
    setCompartiendo(true);
    try {
      const r = await compartirGuia(guia);
      if (r === "descargado") toast("Guía descargada — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo preparar la guía. Intenta de nuevo en unos segundos.", "error");
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-8 no-print">
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center text-sm text-gray-400 hover:text-black transition">
          ← Guías
        </button>
        <button
          onClick={() => void compartir()}
          disabled={compartiendo}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 text-sm bg-black text-white px-6 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M12 16V4" />
            <path d="m8 8 4-4 4 4" />
            <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          </svg>
          {compartiendo ? "Preparando…" : "Compartir"}
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] items-center justify-center text-sm border border-gray-200 text-gray-700 px-6 rounded-md font-medium hover:border-gray-400 hover:text-black active:scale-[0.97] transition-all"
        >
          Imprimir
        </button>
      </div>
      {/* ── 🩸 LA GUÍA IMPRESA ES UN DOCUMENTO DE PAPEL, NO UNA TABLA ──────
          Mide ~548px (7 columnas: cliente, dirección, empresa, facturas,
          bultos, guía de transporte) y en un iPhone de 390 no entra.

          **No se convierte en tarjetas a propósito.** Esto es la guía que se
          imprime, se firma y se le entrega al transportista: partirla en una
          versión de pantalla y otra de papel rompe el respaldo de la entrega.
          Daniel eligió verla COMPLETA Y ACHICADA, como la vista previa de un
          PDF, y tocarla para agrandarla. El porqué, la aritmética del corte y
          —sobre todo— el candado para que el papel no se entere de la escala
          están en `HojaEscalada`. */}
      <HojaEscalada>
        <PrintDocument guia={guia} />
      </HojaEscalada>
    </div>
  );
}

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA FLECHITA ↓ DE LA CELDA — dos líneas y listo.
//
// Pegada al número y en gris, para que no compita con la plata. Se toca y sale
// un menú de dos líneas con el encabezado de a quién y de qué es:
//
//     Reynaldo Espinosa · Fashion Shoes · Septiembre
//       📄  Descargar en PDF
//       📊  Descargar en Excel
//
// 🔴 TOCAR EL NÚMERO SIGUE ABRIENDO EL DETALLE. La flecha para el clic (no lo
// deja llegar a la celda) justamente para que los dos caminos convivan: quien
// quiere mirar antes de bajar, mira.
//
// 🔴 Y SOLO SE DIBUJA DONDE HAY ALGO QUE BAJAR — la decisión no vive acá, sale
// de `lib/comisiones/descarga`, que se la pregunta a la MISMA función que
// decide si la celda dice `—`.
//
// 🩸 EL MENÚ VA EN `DesplegableFlotante`, NO EN UN `absolute`. La tabla de la
// matriz vive dentro de un `overflow-x-auto`: un panel `absolute` colgado de la
// celda lo RECORTA ese contenedor —y subir el z-index no arregla nada—, así que
// el menú saldría cortado justo en la fila de abajo. Es el desplegable de la
// casa (portal a <body> + `position: fixed`); el porqué completo está en
// `components/ui/DesplegableFlotante.tsx`.
//
// El error se dice DENTRO del menú, que se queda abierto mientras prepara: un
// aviso que aparece cuando el menú ya se cerró no lo lee nadie.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import {
  ROTULO_DESCARGAR_EXCEL,
  ROTULO_DESCARGAR_PDF,
  ROTULO_FLECHA,
} from "@/lib/comisiones/descarga";

interface Props {
  /** Lo que dice el encabezado del menú (`lib/comisiones/descarga`). */
  titulo: string;
  onPdf: () => Promise<void>;
  onExcel: () => Promise<void>;
  /** El texto de error de la casa, ya redactado. */
  mensajeError: string;
  /** Más chica dentro de la fila del celular. */
  compacta?: boolean;
}

export function MenuDescargaComision({ titulo, onPdf, onExcel, mensajeError, compacta }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ancla = useRef<HTMLButtonElement>(null);

  const correr = async (accion: () => Promise<void>) => {
    if (cargando) return;
    setCargando(true);
    setError(null);
    try {
      await accion();
      setAbierto(false);
    } catch {
      setError(mensajeError);
    } finally {
      setCargando(false);
    }
  };

  const claseItem =
    "flex min-h-[44px] w-full items-center gap-2 px-3 text-sm text-gray-800 transition hover:bg-gray-50 disabled:opacity-50";

  return (
    /* 🔴 UNA SOLA PARADA DEL CLIC, y va acá: la celda entera abre el detalle, y
       tocar la flecha no puede abrirlo además. El menú ya no necesita esta
       protección —vive en <body>, fuera de la celda— pero la flecha sí. */
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        ref={ancla}
        type="button"
        aria-label={`${ROTULO_FLECHA} — ${titulo}`}
        title={ROTULO_FLECHA}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        /* -my-2 en la tabla: el target sigue midiendo 44px pero no engorda la
           fila (mismo truco que «Ver los que no se pagan»). */
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-gray-300 transition hover:text-gray-700 active:scale-[0.97] ${
          compacta ? "" : "-my-2"
        } ${abierto ? "text-gray-700" : ""}`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <DesplegableFlotante
        abierto={abierto}
        anclaRef={ancla}
        onCerrar={() => setAbierto(false)}
        role="menu"
        marca="comision-descargar"
        alinear="derecha"
        ancho={260}
        aria-label={titulo}
        className="rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg"
      >
        <p className="truncate px-3 py-1.5 text-xs text-gray-500">{titulo}</p>
        <button
          type="button"
          role="menuitem"
          disabled={cargando}
          onClick={() => void correr(onPdf)}
          className={claseItem}
        >
          <FileText className="h-4 w-4 shrink-0 text-gray-400" /> {ROTULO_DESCARGAR_PDF}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={cargando}
          onClick={() => void correr(onExcel)}
          className={claseItem}
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-gray-400" /> {ROTULO_DESCARGAR_EXCEL}
        </button>
        {cargando && <p className="px-3 py-1.5 text-xs text-gray-500">Preparando…</p>}
        {error && <p role="alert" className="px-3 py-1.5 text-xs text-rose-600">{error}</p>}
      </DesplegableFlotante>
    </span>
  );
}

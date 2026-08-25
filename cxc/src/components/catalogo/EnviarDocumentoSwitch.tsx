"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS SALIDAS, DIRECTO — SIN VENTANA EN EL MEDIO (25-ago-2026)
//
// Antes había UN botón "Enviar a Switch" que abría un modal preguntando pedido
// o cotización, con un párrafo explicando la diferencia. Daniel lo revirtió,
// textual: ***"quiero que en vez de que diga «enviar a switch», salga cotización
// o pedido como opción (sin párrafo explicando, btw no siempre hay q estar
// explicando todo, se vuelve tedioso)"***.
//
// 🔴 EL RIESGO QUE EL MODAL CUBRÍA NO DESAPARECIÓ, ASÍ QUE NO SE TIRA ENTERO.
// Una cotización NO aparta mercancía, y el que toca la equivocada manda 500
// pares de la forma que no era. De toda la explicación queda lo único material,
// pegado a la opción y en el mínimo de palabras: «no aparta mercancía»
// (`NOTA_COTIZACION`). Eso NO es un párrafo, es una etiqueta.
//
// Y las dos NO se ven iguales: dos botones gemelos se tocan sin leer. El pedido
// es el sólido (lo de todos los días) y la cotización es la de contorno ámbar
// con su etiqueta. La diferencia se ve antes de que el dedo baje.
//
// 🔴 LO QUE ESTA PIEZA NO PUEDE AFLOJAR. `deshabilitado` viene de la MISMA
// regla de siempre (sin cliente, sin vendedor, sin productos no se manda) y el
// motivo se dice acá mismo, apagado Y explicado, como en Guías. Igual, éste no
// es EL candado: el que no se puede saltear es el 422 del servidor.
//
// Una sola pieza para las 4 marcas (Reebok · Joybees · Tommy · Calvin) y para
// las 3 pantallas que mandan a Switch. Joybees es espejo exacto de Reebok.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type DocumentoSwitch,
  OPCIONES_DOCUMENTO,
  esCotizacion,
} from "@/lib/catalogo/documento-switch";

interface Props {
  /** Se llama con la salida elegida. El envío lo dispara la pantalla que la usa. */
  onElegir: (documento: DocumentoSwitch) => void;
  /** Mientras se manda: en vez de las dos opciones va UN renglón con el paso vivo. */
  enviando?: boolean;
  /** Qué se lee mientras manda ("Enviando…", o el paso vivo del detalle). */
  textoEnviando?: string;
  /** Apagado por la regla de la pantalla (sin cliente, sin productos…). */
  deshabilitado?: boolean;
  /** Por qué está apagado, con todas las letras. Se dibuja debajo. */
  faltaTexto?: string | null;
  /** Color del botón sólido: el negro del checkout/confirmación o el verde del detalle. */
  tono?: "negro" | "verde";
}

const TONOS = {
  negro: "bg-black hover:bg-gray-800",
  verde: "bg-emerald-600 hover:bg-emerald-700",
} as const;

export default function EnviarDocumentoSwitch({
  onElegir,
  enviando = false,
  textoEnviando = "Enviando…",
  deshabilitado = false,
  faltaTexto = null,
  tono = "negro",
}: Props) {
  return (
    <div data-medir="enviar-documento" className="w-full">
      {enviando ? (
        <div
          data-medir="enviando-switch"
          className={`flex min-h-[52px] w-full items-center justify-center rounded-lg px-4 text-sm font-medium text-white opacity-60 ${TONOS[tono]}`}
        >
          {textoEnviando}
        </div>
      ) : (
        <div className="grid w-full grid-cols-2 gap-2">
          {OPCIONES_DOCUMENTO.map((o) => {
            const cot = esCotizacion(o.clave);
            return (
              <button
                key={o.clave}
                type="button"
                data-medir={`documento-${o.clave}`}
                disabled={deshabilitado}
                onClick={() => onElegir(o.clave)}
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg px-3 py-2 text-center transition active:scale-[0.97] disabled:opacity-40 ${
                  cot
                    ? "border-2 border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    : `text-white ${TONOS[tono]}`
                }`}
              >
                <span className="text-sm font-medium leading-tight">{o.titulo}</span>
                {/* 🔴 La etiqueta. Lo único que queda del párrafo, y lo único
                    que hay que saber antes de que el dedo baje. */}
                {o.nota && (
                  <span className="mt-0.5 text-xs leading-tight text-amber-800">{o.nota}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {/* Apagado Y explicado, acá mismo: un botón que se deja tocar y contesta
          con un toast obliga a tocarlo una vez por cada cosa que falta. */}
      {!enviando && faltaTexto && (
        <p data-medir="falta-enviar" className="mt-2 text-center text-xs text-amber-800">
          {faltaTexto}
        </p>
      )}
    </div>
  );
}

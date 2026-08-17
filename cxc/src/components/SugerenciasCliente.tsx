"use client";

// ─────────────────────────────────────────────────────────────────────────────
// "¿Es este cliente?" — la RED DE SEGURIDAD de todo el sistema.
//
// 🩸 POR QUÉ EXISTE. De las 121 líneas de guía que quedaban sin atar, **la mitad
// son el mismo cliente escrito con un dedo torcido**: "Hanna Calzado" por "Hanna
// Calzados", "Jerusalem Dutty Free" por "Jerusalem Duty Free", "American
// Clasicc" con tres c. Buscarlos a mano en un directorio de 146 obliga a
// adivinar cómo está escrito el bueno — que es exactamente lo que la persona no
// sabe. Acá se le ofrecen los candidatos y elige.
//
// 📌 Desde ago-2026 esto NO es de Guías: vive en `src/components/` porque lo
// dibuja **`ClientePicker`**, o sea que aparece en TODAS las pantallas donde se
// puede escribir un cliente a mano (guías, cheques…). Daniel, textual: *"sí,
// todos deben de tener mismo selector, tiene que hacer sentido con el sistema"*.
// Si hay que tocar cómo se sugiere un cliente, se toca acá y cambian todas.
//
// 🔴 NINGUNA SUGERENCIA ATA NADA POR SU CUENTA. Tocarla solo la copia al
// selector; después hay que apretar **Guardar**. Ni siquiera cuando hay un solo
// candidato clavado: `Sporting Shoes N7` y `Sporting Shoes N 4` comparten TODAS
// las palabras y son tiendas distintas. Por eso los avisos de número se ven al
// lado del candidato en vez de esconderse detrás de un puntaje.
//
// 🔴 CUANDO NO HAY NADA PARECIDO, SE DICE — pero solo donde la tarea ES
// encontrar al cliente (`avisarSinParecidos`, o sea la ventana "Atar cliente").
// Medido contra producción el 9-ago-2026: 7 de los 68 nombres sin atar no
// tienen NINGÚN cliente parecido en el directorio — `ALMACEN JORDANIA`,
// `DUCASA`, `HOTEL GRAN DAVID`… Dejar esa ventana muda manda a alguien a buscar
// durante minutos algo que no está.
//
// ⚠️ En el FORMULARIO de una guía va apagado a propósito, y no es pereza: **272
// de los 441 renglones (62%) tienen un destino que hoy no existe en el
// directorio**. Un cartel por renglón diciendo "no hay ninguno parecido" sería
// gritarle a bodega lo que acaba de declarar al elegir "escribir a mano" — la
// fricción que Daniel pidió no meter. Cuando no hay candidatos, se calla.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import {
  sugerirClientes,
  TEXTO_AVISO,
  type ClienteCandidato,
  type Sugerencia,
} from "@/lib/clientes/sugerencias";

interface Props {
  /** El texto escrito a mano. Es contra esto que se busca el parecido. */
  clienteTexto: string;
  /** El directorio del grupo. Vacío = todavía no cargó: no se dibuja nada. */
  clientes: readonly ClienteCandidato[];
  /** Se llama al TOCAR una sugerencia. Copia al selector; NO guarda. */
  onElegir: (nombre: string, codigo: string) => void;
  /** "No, es otro": esconde el bloque para este texto. Sin esto, no se puede
   *  terminar de escribir a mano en paz. */
  onDescartar?: () => void;
  /**
   * Decir "no hay ningún cliente parecido" cuando la lista sale vacía.
   *
   * Default **false** = callarse. Solo lo enciende la ventana "Atar cliente",
   * donde la tarea entera es encontrar al cliente y quedarse mudo mandaría a
   * buscar algo que no está. Ver el encabezado.
   */
  avisarSinParecidos?: boolean;
}

/** Nombre + código + sus avisos. El mismo cuerpo para uno o para varios. */
function Aviso({ s }: { s: Sugerencia }) {
  return (
    <>
      {s.tambienConocidoComo && (
        <span className="block text-xs text-gray-500 mt-0.5 break-words">
          factura como {s.tambienConocidoComo}
        </span>
      )}
      {s.avisos.map((a) => (
        <span key={a} className="block text-xs text-amber-700 mt-0.5">
          {TEXTO_AVISO[a]}
        </span>
      ))}
    </>
  );
}

const BOTON =
  "rounded-lg border px-3 min-h-[44px] text-sm transition active:scale-[0.99]";

export default function SugerenciasCliente({
  clienteTexto,
  clientes,
  onElegir,
  onDescartar,
  avisarSinParecidos = false,
}: Props) {
  const sugerencias = useMemo(
    () => sugerirClientes(clienteTexto, clientes),
    [clienteTexto, clientes],
  );

  // Sin directorio no se puede afirmar NI que hay parecidos NI que no los hay.
  // Callarse es lo correcto: decir "no hay ninguno" sin haber podido mirar
  // sería mandar a dar de alta un cliente que quizá ya existe.
  if (clientes.length === 0 || !clienteTexto.trim()) return null;

  if (sugerencias.length === 0) {
    if (!avisarSinParecidos) return null;
    return (
      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
        <p className="text-sm text-amber-900">
          No hay ningún cliente parecido en el directorio.
        </p>
        <p className="text-xs text-amber-800 mt-1">
          Hay que darlo de alta en Switch. Mientras tanto queda escrito a mano.
        </p>
      </div>
    );
  }

  // Un solo candidato → se pregunta con todas las letras, tal cual lo aprobó
  // Daniel: *"¿Es City Mall Paso Canoa (D-25)? → Sí · No, es otro"*. Un toque y
  // queda atado. El nombre va en la PREGUNTA, no escondido en un botón.
  const uno = sugerencias.length === 1 ? sugerencias[0] : null;

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
      <p className="text-sm text-black break-words">
        {uno ? (
          <>
            ¿Es {uno.nombre}{" "}
            <span className="font-mono text-xs text-gray-500">({uno.codigo})</span>?
          </>
        ) : (
          "¿Es alguno de estos?"
        )}
      </p>

      {uno ? (
        <>
          <Aviso s={uno} />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => onElegir(uno.nombre, uno.codigo)}
              className={`${BOTON} border-black bg-black text-white hover:bg-gray-800`}
            >
              Sí, es {uno.nombre}
            </button>
            {onDescartar && (
              <button
                type="button"
                onClick={onDescartar}
                className={`${BOTON} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
              >
                No, es otro
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5 mt-1.5">
            {sugerencias.map((s) => (
              <button
                key={s.codigo}
                type="button"
                onClick={() => onElegir(s.nombre, s.codigo)}
                className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-2 min-h-[44px] hover:border-gray-400 active:scale-[0.99] transition-all"
              >
                <span className="flex items-baseline justify-between gap-2">
                  {/* No se trunca: esconder el nombre sería deshacer lo que esto
                      vino a arreglar. El peor caso real son 47 caracteres. */}
                  <span className="text-sm text-black break-words">{s.nombre}</span>
                  <span className="text-xs font-mono text-gray-400 shrink-0">{s.codigo}</span>
                </span>
                <Aviso s={s} />
              </button>
            ))}
          </div>
          {onDescartar && (
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={onDescartar}
                className={`${BOTON} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
              >
                No, es otro
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-gray-400 mt-1.5">
        Tocar una solo la elige. Nada se guarda hasta que aprietes Guardar.
      </p>
    </div>
  );
}

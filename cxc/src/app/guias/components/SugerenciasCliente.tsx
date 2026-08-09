"use client";

// ─────────────────────────────────────────────────────────────────────────────
// "¿Quisiste decir…?" — las sugerencias, arriba del selector.
//
// 🩸 POR QUÉ EXISTE. De las 121 líneas que hoy quedan sin atar, **la mitad son
// el mismo cliente escrito con un dedo torcido**: "Hanna Calzado" por "Hanna
// Calzados", "Jerusalem Dutty Free" por "Jerusalem Duty Free", "American
// Clasicc" con tres c. Buscarlos a mano en un directorio de 146 obliga a
// adivinar cómo está escrito el bueno — que es exactamente lo que la persona
// no sabe. Acá se le ofrecen los candidatos y elige.
//
// 🔴 NINGUNA SUGERENCIA ATA NADA POR SU CUENTA. Tocar una solo la copia al
// selector; después hay que apretar **Guardar**. Ni siquiera cuando hay un solo
// candidato clavado: `Sporting Shoes N7` y `Sporting Shoes N 4` comparten TODAS
// las palabras y son tiendas distintas. Por eso los avisos de número se ven al
// lado del candidato en vez de esconderse detrás de un puntaje.
//
// 🔴 Y CUANDO NO HAY NADA PARECIDO, SE DICE. Medido contra producción el
// 9-ago-2026: 7 de los 68 nombres sin atar (10 líneas) no tienen NINGÚN cliente
// parecido en el directorio — `ALMACEN JORDANIA`, `DUCASA`, `HOTEL GRAN
// DAVID`, `Punto Maravilloso`… Dejar la ventana muda ahí manda a alguien a
// buscar durante minutos algo que no está. La pantalla lo dice con todas las
// letras: hay que darlo de alta en Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import {
  sugerirClientes,
  TEXTO_AVISO,
  type ClienteCandidato,
} from "@/lib/clientes/sugerencias";

interface Props {
  /** El texto que escribió bodega. Es contra esto que se busca el parecido. */
  clienteTexto: string;
  /** El directorio del grupo. Vacío = todavía no cargó: no se dibuja nada. */
  clientes: readonly ClienteCandidato[];
  /** Se llama al TOCAR una sugerencia. Copia al selector; NO guarda. */
  onElegir: (nombre: string, codigo: string) => void;
}

export default function SugerenciasCliente({ clienteTexto, clientes, onElegir }: Props) {
  const sugerencias = useMemo(
    () => sugerirClientes(clienteTexto, clientes),
    [clienteTexto, clientes],
  );

  // Sin directorio no se puede afirmar NI que hay parecidos NI que no los hay.
  // Callarse es lo correcto: decir "no hay ninguno" sin haber podido mirar
  // sería mandar a dar de alta un cliente que quizá ya existe.
  if (clientes.length === 0 || !clienteTexto.trim()) return null;

  if (sugerencias.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
        <p className="text-sm text-amber-900">
          No hay ningún cliente parecido en el directorio.
        </p>
        <p className="text-xs text-amber-800 mt-1">
          Hay que darlo de alta en Switch. Mientras tanto la línea puede quedarse sin
          cliente: la guía no cambia.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <p className="text-xs uppercase tracking-wide text-gray-400 mb-1.5">
        ¿Quisiste decir…?
      </p>
      <div className="space-y-1.5">
        {sugerencias.map((s) => (
          <button
            key={s.codigo}
            type="button"
            onClick={() => onElegir(s.nombre, s.codigo)}
            className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 min-h-[44px] hover:border-gray-400 hover:bg-gray-50 active:scale-[0.99] transition-all"
          >
            <span className="flex items-baseline justify-between gap-2">
              {/* No se trunca: esconder el nombre sería deshacer lo que esto
                  vino a arreglar. El peor caso real son 47 caracteres. */}
              <span className="text-sm text-black break-words">{s.nombre}</span>
              <span className="text-xs font-mono text-gray-400 shrink-0">{s.codigo}</span>
            </span>
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
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Tocar una solo la copia abajo. Se guarda cuando aprietas Guardar.
      </p>
    </div>
  );
}

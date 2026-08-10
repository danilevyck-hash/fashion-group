"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <Ayuda /> — el ⓘ QUE SE TOCA. Único en toda la app.
//
// Existe por una regla de Daniel (ago-2026): *"un texto se queda si cambia lo
// que HAGO; se va si solo describe lo que ya estoy viendo"*. En el medio queda
// una tercera clase — la METODOLOGÍA: cómo se calcula el margen, que las notas
// de crédito ya están restadas, qué cuenta como "u/mes real". Eso **no se
// borra** (sin ello alguien cuadra mal contra Switch), pero tampoco tiene que
// gritar en cada carga de pantalla. Va acá adentro: sigue accesible, deja de
// ocupar lugar.
//
// 🔴 LO QUE NUNCA SE PUEDE HACER CON ESTE COMPONENTE: meterle un AVISO. Un
// aviso —"se agotó", "descontinuado", "dato viejo", "stock negativo", "sin
// contrato"— cambia una decisión, y esconderlo detrás de un toque es
// exactamente igual que borrarlo: nadie abre un ⓘ que no sabe que tiene algo
// adentro. Esto es SOLO para lo que se aprende una vez.
//
// 🩸 EL PANEL FLOTA CON `<DesplegableFlotante>`, NO CON UN `absolute`. La
// mayoría de estos ⓘ viven al pie de una tabla o dentro de una `Card`, o sea
// justo debajo de un ancestro con `overflow` — que es lo que recorta un panel
// `absolute` sin que ningún z-index lo salve (ver la nota entera en
// `components/ui/DesplegableFlotante.tsx`; el barrido
// `desplegables-flotan.test.ts` pone el build ROJO si alguien vuelve al
// `absolute`). Un ⓘ recortado es un ⓘ que no dice nada, o sea la poda
// convertida en pérdida de información.
//
// Del disparador:
//   · es un <button> de verdad → llega por Tab y abre con Enter o barra
//     espaciadora, sin escribir un solo `onKeyDown`,
//   · 44×44 px mínimo (regla de la casa),
//   · Escape y el click afuera los cierra el propio DesplegableFlotante; acá
//     solo se devuelve el foco al botón, que él no puede saber.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";

interface Props {
  /** Título del panel. Corto, en español simple ("Cómo se calcula"). */
  titulo: string;
  /** La metodología. Se muestra solo al abrir. */
  children: ReactNode;
  /** Texto al lado del ícono. Se esconde en celular (ahí manda el ícono). */
  etiqueta?: string;
  className?: string;
}

export function Ayuda({ titulo, children, etiqueta, className }: Props) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  // Cerrar sin devolver el foco dejaría a quien navega con teclado tirado en el
  // <body>, teniendo que tabular otra vez desde el principio.
  const cerrar = useCallback(() => {
    setAbierto(false);
    boton.current?.focus();
  }, []);

  return (
    <span className={`inline-flex align-middle ${className ?? ""}`}>
      <button
        ref={boton}
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={titulo}
        title={titulo}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-2 text-xs text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 active:scale-[0.97]"
      >
        <Info className="h-4 w-4 shrink-0" />
        {etiqueta && <span className="hidden md:inline">{etiqueta}</span>}
      </button>

      <DesplegableFlotante
        abierto={abierto}
        anclaRef={boton}
        onCerrar={cerrar}
        role="dialog"
        aria-label={titulo}
        marca="ayuda"
        ancho={290}
        className="rounded-xl border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg"
      >
        <p className="mb-1.5 text-sm font-medium text-gray-900">{titulo}</p>
        {children}
      </DesplegableFlotante>
    </span>
  );
}

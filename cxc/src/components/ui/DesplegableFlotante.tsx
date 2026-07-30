"use client";

// EL desplegable de la casa. Todo lo que se despliega, flota o aparece POR
// ENCIMA de otra cosa se dibuja con esto — no con un `absolute` adentro del
// contenedor de turno.
//
// ── 🩸 POR QUÉ EXISTE (30-jul-2026) ──────────────────────────────────────────
//
// Daniel, textual, después del arreglo de Guías: *"sobre el bug que paso con
// guia, debe de pasar en otros modulos y otros campos across todo el sistema,
// hay q arreglar eso"*. Tenía razón: el barrido midió el MISMO defecto en 5
// controles más.
//
// El defecto es siempre el mismo. Un panel `position: absolute` es hijo del
// contenedor que lo ancla, y si ESE contenedor (o cualquier ancestro) tiene
// `overflow` distinto de `visible`, lo RECORTA. Ojo con el disfraz más común:
// `overflow-x: auto` con `overflow-y: visible` computa `overflow-y: auto`, así
// que un `ScrollableTable` —que solo quería scroll horizontal— recorta también
// hacia abajo Y se vuelve scrolleable, y la fila se va de la vista.
//
// **Subir el z-index no arregla nada**: el recorte de un ancestro con overflow
// no lo gana ningún apilamiento. El panel tiene que SALIR DEL FLUJO. Eso es lo
// que hace este componente: `createPortal` a <body> + `position: fixed`, en
// coordenadas de viewport calculadas por `calcularPosicionDesplegable` (módulo
// PURO, probado aparte).
//
// Lo medido en el navegador ANTES del arreglo (3 anchos, build de producción):
//
//   Cheques › Nuevo cheque › Vendedor .......... 34 px recortados @390, 17 @834
//   Caja › Nuevo gasto › Responsable ........... 228 px recortados @390
//   Caja › tabla › editar fila › Categoría ..... 62 px recortados @834, y el
//        ScrollableTable pasaba a tener 62 px scrolleables (el bug de Guías)
//   Cheques › menú ⋯ de la fila ................ 121 px recortados @834 y @1440
//        (+206 px de desplazamiento de las columnas)
//   Cheques › Calendario › globo del cheque .... 138 px FUERA de la pantalla @1440
//   Header › campana de notificaciones ......... 54 px fuera por la IZQUIERDA @390
//
// ── QUÉ GARANTIZA ────────────────────────────────────────────────────────────
//
//  • Ningún ancestro con overflow lo puede recortar (vive en <body>).
//  • No mueve ni una columna: está fuera del flujo.
//  • Nunca se sale de la pantalla: se abre abajo si hay lugar, arriba si no, y
//    el `maxHeight` siempre CABE en el espacio elegido (nada de recorte
//    invisible). La aritmética vive en `lib/ui/posicion-desplegable.ts`.
//  • Sigue al ancla: `fixed` no se mueve con el scroll, así que se reancla en
//    `scroll` (con `capture`, para oír también el del ScrollableTable) y en
//    `resize`. Sin esto quedaría flotando en el aire.
//  • Cierra con click afuera y con Escape, mirando el ancla Y el panel: el panel
//    ya no es hijo del ancla, así que preguntar solo por el ancla haría que el
//    primer toque en una opción cerrara la lista sin elegir nada.
//
// ── CÓMO SE USA ──────────────────────────────────────────────────────────────
//
//   const anclaRef = useRef<HTMLInputElement>(null);
//   <input ref={anclaRef} … />
//   <DesplegableFlotante abierto={abierto} anclaRef={anclaRef} onCerrar={cerrar}>
//     …opciones…
//   </DesplegableFlotante>
//
// El `z-[60]` por defecto es a propósito: por encima de la barra lateral y de
// los paneles `z-50`, y por DEBAJO de los `z-[100]` (toasts, confirmaciones) —
// un diálogo tiene que poder taparlo. Al vivir en <body> el apilamiento ya no
// depende del orden del DOM, que era lo frágil.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  calcularPosicionDesplegable,
  type OpcionesDesplegable,
  type PosicionDesplegable,
} from "@/lib/ui/posicion-desplegable";

export interface DesplegableFlotanteProps extends OpcionesDesplegable {
  abierto: boolean;
  /** El campo o botón del que se cuelga. */
  anclaRef: RefObject<HTMLElement | null>;
  /**
   * Cerrar por click afuera o Escape. Si no se pasa, el llamador se encarga
   * (algunos ya tienen su propio manejo y duplicarlo cerraría dos veces).
   */
  onCerrar?: () => void;
  /**
   * Elemento extra que TAMPOCO debe contar como "afuera" (ej. el botón que
   * abre, cuando no es el mismo nodo que el ancla).
   */
  extraDentroRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Clases del panel. Las de posición las pone el componente. */
  className?: string;
  /** z-index. Default `z-[60]`. */
  zIndex?: string;
  role?: string;
  id?: string;
  /**
   * Nombre del control, SOLO para poder encontrarlo desde el navegador al
   * medir (`scripts/_medir-desplegables.mjs`). Sale como
   * `data-desplegable="<nombre>"` y `data-hacia="abajo|arriba"`.
   */
  marca?: string;
  "aria-label"?: string;
}

export default function DesplegableFlotante({
  abierto,
  anclaRef,
  onCerrar,
  extraDentroRef,
  children,
  className = "",
  zIndex = "z-[60]",
  role,
  id,
  marca,
  altoDeseado,
  ancho,
  anchoMinimo,
  alinear,
  ...rest
}: DesplegableFlotanteProps) {
  const [pos, setPos] = useState<PosicionDesplegable | null>(null);
  const [montado, setMontado] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMontado(true), []);

  const reubicar = useCallback(() => {
    const el = anclaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(
      calcularPosicionDesplegable(
        { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
        { width: window.innerWidth, height: window.innerHeight },
        { altoDeseado, ancho, anchoMinimo, alinear },
      ),
    );
  }, [anclaRef, altoDeseado, ancho, anchoMinimo, alinear]);

  // Antes de pintar, para que no aparezca un frame en (0,0).
  useLayoutEffect(() => {
    if (abierto) reubicar();
  }, [abierto, reubicar]);

  // `capture` a propósito: el scroll que importa suele ser el del contenedor
  // interno (ScrollableTable, cuerpo del modal), y ese no burbujea a window.
  useEffect(() => {
    if (!abierto) return;
    window.addEventListener("scroll", reubicar, true);
    window.addEventListener("resize", reubicar);
    return () => {
      window.removeEventListener("scroll", reubicar, true);
      window.removeEventListener("resize", reubicar);
    };
  }, [abierto, reubicar]);

  useEffect(() => {
    if (!abierto || !onCerrar) return;
    function fuera(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      // Las TRES cajas: el panel ya no es hijo del ancla.
      if (panelRef.current?.contains(t)) return;
      if (anclaRef.current?.contains(t)) return;
      if (extraDentroRef?.current?.contains(t)) return;
      onCerrar!();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // La capa de adentro gana: Escape cierra ESTE desplegable, no el modal
      // que lo contiene.
      e.stopPropagation();
      onCerrar!();
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [abierto, onCerrar, anclaRef, extraDentroRef]);

  if (!abierto || !montado || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      data-desplegable={marca ?? ""}
      data-hacia={pos.hacia}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
      }}
      className={`${zIndex} overflow-y-auto overscroll-contain ${className}`}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}

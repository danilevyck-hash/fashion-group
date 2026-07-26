"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Botón de solo ícono con área de toque de 44×44 GARANTIZADA.
 *
 * Por qué existe: el mínimo táctil de la casa (44 px) se venía escribiendo a
 * mano en cada botón, y el que se olvidaba quedaba en 26×26 (`p-1.5` + un ícono
 * de 14) o 36×36 (`p-2.5` + 16). Eso no se ve en code review — se ve en el
 * iPhone, fallando el toque. Acá el tamaño no es opcional: `min-w-[44px]
 * min-h-[44px]` va primero y el `className` del consumidor solo puede sumar
 * color, borde o margen.
 *
 * `label` es OBLIGATORIO: un botón sin texto necesita `aria-label` sí o sí, y
 * pedirlo en el tipo es la única forma de que no se olvide. Se usa también como
 * `title` (tooltip en desktop) salvo que el consumidor pase el suyo.
 *
 * Uso:
 *   <IconButton label="Editar cliente" onClick={editar}>
 *     <LapizIcon size={16} />
 *   </IconButton>
 *
 * Para un ícono dentro de un botón CON texto no hace falta esto: el texto ya da
 * el alto. Esto es para los botones que solo tienen el ícono.
 */
interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Qué hace el botón, en español simple. Va a aria-label (y a title). */
  label: string;
  /** El ícono. */
  children: ReactNode;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, className = "", type = "button", title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md transition active:bg-gray-100 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// UNA SOLA FORMA DE ELEGIR EN TODO EL MÓDULO VENTAS (5-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. En la misma pantalla convivían TRES maneras de elegir
// una vista: el Resumen de escritorio usaba cajas grises pegadas
// (`rounded-full bg-gray-100 p-0.5`), el Resumen del celular su propio
// `SegmentedRow`, y Clientes píldoras sueltas. Tres controles que hacen lo
// mismo y se ven distinto obligan a aprender la pantalla tres veces.
//
// 🔴 NO ES UN COMPONENTE NUEVO: es el `SegmentedRow` que el celular ya tenía —
// medido y con sus 44 px táctiles— sacado a un archivo para que el escritorio
// use EL MISMO. Por eso el celular no cambia ni un píxel.
//
// ⚠️ Sirve para elegir UNA de pocas vistas (2 a 4). Las píldoras de empresa de
// Clientes son SIETE y envuelven en dos líneas: ahí un segmentado apretaría los
// nombres hasta partirlos, así que se quedan como píldoras. No es una excepción
// olvidada; es que no son la misma clase de control.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";

export interface OpcionSegmentada<T extends string> {
  value: T;
  label: string;
}

export function ControlSegmentado<T extends string>({
  options,
  active,
  onChange,
  ariaLabel,
  className,
  /** `true` = cada opción ocupa lo mismo (la tira llena el ancho). El celular
   *  lo quiere así; en escritorio el control va pegado a la derecha y se
   *  encoge a su contenido. */
  ancho = "completo",
}: {
  options: readonly OpcionSegmentada<T>[];
  active: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
  ancho?: "completo" | "contenido";
}) {
  return (
    <div
      data-control-segmentado
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "rounded-lg bg-gray-100 p-0.5",
        ancho === "completo" ? "flex" : "inline-flex",
        className,
      )}
    >
      {options.map((o) => {
        const isActive = active === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(o.value)}
            className={cn(
              // 44 px de alto: la regla táctil de la casa. Iba en el control
              // del celular y ahora también en el de escritorio, donde el
              // iPad horizontal (1194) cae de este lado y se toca con el dedo.
              "min-h-[44px] rounded-md px-3.5 py-2.5 text-xs font-medium transition",
              ancho === "completo" && "flex-1",
              isActive
                ? "bg-white text-gray-950 shadow-sm"
                : "text-gray-500 hover:text-gray-700 active:text-gray-700",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

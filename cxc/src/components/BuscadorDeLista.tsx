"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
 * EL BUSCADOR DE UNA LISTA — uno solo para todas (11-sep-2026).
 *
 * Daniel: *«pon buscador en módulos o tabs que lo ameriten, como colaboradores
 * por ejemplo»*.
 *
 * 44 px de alto para el dedo, `text-base` en el celular (por debajo de 16 px el
 * iPhone hace zoom solo al tocarlo) y `sm:text-sm` en el escritorio, y su
 * `aria-label` — el `placeholder` desaparece apenas se teclea y un lector de
 * pantalla se queda sin saber qué campo es.
 *
 * 🔴 UN SOLO BUSCADOR QUE SE VE (nov-2026, `CampoBuscar`): caja blanca, borde
 * `campo` (#8e8e93, 3.3:1 sobre blanco; el gris-200 de antes daba 1.2:1 y
 * no se veía), esquinas `rounded-md` y la lupa adentro. Antes había una raya
 * abajo (Préstamos, Caja, Asistencia), un relleno gris sin borde (Ventas ›
 * Productos) y un borde casi invisible (Clientes).
 *
 * 🔴 Lo que filtra y con qué regla vive en `lib/buscar-en-lista.ts`; acá solo se
 * dibuja. Y el conteo «12 de 42 colaboradores» sale de ahí mismo, para que la
 * pantalla no pueda decir un número distinto del que la lista muestra.
 * ────────────────────────────────────────────────────────────────────────── */

export default function BuscadorDeLista({
  valor,
  onCambiar,
  placeholder,
  etiqueta,
  conteo = "",
  className = "",
}: {
  valor: string;
  onCambiar: (v: string) => void;
  placeholder: string;
  /** El `aria-label`. Por defecto, el mismo texto del placeholder. */
  etiqueta?: string;
  /** «12 de 42 colaboradores». Vacío = no se dibuja. */
  conteo?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <CampoBuscar
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta ?? placeholder}
        envoltorio="w-full max-w-xs sm:w-64"
      />
      {conteo !== "" && (
        <span data-testid="conteo-busqueda" className="text-sm tabular-nums text-gray-500">
          {conteo}
        </span>
      )}
    </div>
  );
}

/**
 * Lo que se dibuja en lugar de la lista cuando la búsqueda no encontró a nadie.
 * Siempre con la salida al lado: quedarse con una lista vacía y sin botón es
 * cómo se llega a recargar la página a mano.
 */
export function VacioDeBusqueda({ texto, onLimpiar, rotulo }: {
  texto: string;
  onLimpiar: () => void;
  rotulo: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
      {texto}
      <button
        type="button"
        onClick={onLimpiar}
        className="ml-2 min-h-[44px] font-medium text-gray-700 underline underline-offset-2 transition hover:text-black"
      >
        {rotulo}
      </button>
    </div>
  );
}

/** La caja del buscador: blanca, borde visible (≥3:1), `rounded-md`, lugar para la lupa. */
export const CLASE_CAMPO_BUSCAR =
  "h-11 min-h-[44px] w-full rounded-md border border-campo bg-white pl-9 pr-3 text-base text-gray-900 outline-none transition placeholder:text-gray-500 focus:border-gray-900 sm:text-sm";

/** El buscador de la casa: la caja de `CLASE_CAMPO_BUSCAR` con la lupa adentro. */
export const CampoBuscar = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { envoltorio?: string }
>(function CampoBuscar({ envoltorio = "w-full", className = "", type = "search", ...props }, ref) {
  return (
    <div className={`relative min-w-0 ${envoltorio}`}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input ref={ref} type={type} {...props} className={`${CLASE_CAMPO_BUSCAR} ${className}`} />
    </div>
  );
});

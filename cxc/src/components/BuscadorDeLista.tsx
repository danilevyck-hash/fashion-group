"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * EL BUSCADOR DE UNA LISTA — uno solo para todas (11-sep-2026).
 *
 * Daniel: *«pon buscador en módulos o tabs que lo ameriten, como colaboradores
 * por ejemplo»*.
 *
 * Es el mismo campo que ya tienen Guías, Cuentas por Cobrar y Reclamos: 44 px de
 * alto para el dedo, `text-base` en el celular (por debajo de 16 px el iPhone
 * hace zoom solo al tocarlo) y `sm:text-sm` en el escritorio, una línea abajo
 * que se pone negra al escribir, y su `aria-label` — el `placeholder` desaparece
 * apenas se teclea y un lector de pantalla se queda sin saber qué campo es.
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
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta ?? placeholder}
        className="min-h-[44px] w-full max-w-xs border-b border-gray-200 text-base outline-none transition focus:border-black sm:w-64 sm:text-sm"
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

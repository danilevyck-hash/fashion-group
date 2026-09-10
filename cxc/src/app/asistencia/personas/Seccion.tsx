"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * EL MARCO DE UNA SECCIÓN DE LA PERSONA.
 *
 * Las cuatro —Préstamos, Justificaciones, Vacaciones y Asistencia del período—
 * se dibujan IGUAL: título a la izquierda, su resumen debajo, y su botón a la
 * derecha. Un solo marco para las cuatro es lo que hace que la página se lea
 * como una sola cosa y no como cuatro pantallas apiladas.
 * ────────────────────────────────────────────────────────────────────────── */

export default function Seccion({
  titulo, resumen, boton, onBoton, children,
}: {
  titulo: string;
  /** La línea de abajo del título: «Debe $120.00», «12 días». */
  resumen?: React.ReactNode;
  /** El rótulo del botón. `null` = esta sección no agrega nada. */
  boton?: string | null;
  onBoton?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-gray-900">{titulo}</h2>
          {resumen && <div className="mt-0.5 text-[13px] text-gray-600">{resumen}</div>}
        </div>
        {boton && (
          <button type="button" onClick={onBoton}
            className="min-h-[44px] shrink-0 rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
            {boton}
          </button>
        )}
      </div>
      {children && <div className="px-4 py-3">{children}</div>}
    </section>
  );
}

/** Lo que dice una sección cuando no hay nada. NUNCA un cero grande. */
export function Vacio({ texto }: { texto: string }) {
  return <p className="text-[13px] text-gray-400">{texto}</p>;
}

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <ComisionesCriterios /> — ⓘ con "de dónde salen estos números".
//
// Antes era un acordeón de ancho completo apoyado bajo la barra de controles:
// cerrado ya gastaba 44px de alto en una pantalla donde el encabezado se comía
// el 57% del iPhone. Ahora es un botón ⓘ dentro de la fila de pestañas y el
// texto sale en un popover: cerrado ocupa CERO alto propio.
//
// El texto de los criterios dice de dónde sale cada número (es la explicación
// de un cálculo de plata) y cambia SOLO cuando cambia la regla. Lo que sí se sumó es la frescura del dato — la fecha de "Sincronizado
// …" vive acá adentro (llega como children) porque en 390px no entra en la
// barra sin robarle una línea entera a la tabla. Si alguna empresa está sin
// actualizar, el ⓘ lleva un punto ámbar para que se note sin abrirlo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

interface Props {
  /** Frescura del sync (SyncStatus) — se muestra dentro del popover. */
  children?: ReactNode;
  /** Punto ámbar en el ⓘ cuando alguna empresa está sin actualizar. */
  aviso?: boolean;
  className?: string;
}

export function ComisionesCriterios({ children, aviso, className }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Cómo se calcula y cuándo se actualizó"
        title="Cómo se calcula y cuándo se actualizó"
        /* min-w-[44px]: con solo el ícono medía 40px de ancho — bajo el mínimo
           táctil de la casa. */
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-3 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 active:scale-[0.97]"
      >
        <Info className="h-4 w-4 shrink-0" />
        <span className="hidden md:inline">Criterios</span>
        {aviso && (
          <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
        )}
      </button>

      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />}

      {/* El panel se OCULTA con `hidden`, no se desmonta: adentro vive el
          SyncStatus, que tiene que consultar la frescura al cargar la página
          para poder encender el punto ámbar. Si se montara recién al abrir, el
          aviso solo aparecería después de abrirlo — o sea, nunca. Al estar
          posicionado absoluto no ocupa alto ni abierto ni cerrado. */}
      <div
        role="dialog"
        aria-label="Criterios de la comisión"
        aria-hidden={!open}
        className={`absolute right-0 top-full z-20 mt-1 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg ${open ? "" : "hidden"}`}
      >
        <p className="mb-1.5 text-sm font-medium text-gray-900">Criterios</p>
        {/* Dos personas distintas a propósito. Daniel, 3-sep-2026: «el que
            vende a veces no es el que cobra. Edwin puede vender 50k a City Mall
            y Daniel o DEFAULT cobrar esa plata». Hasta esa fecha decía «se
            asignan al vendedor dueño del cliente», que ya no era cierto ni
            para la venta (v5, jul-2026) ni para el cobro (v6). */}
        <p>
          <b>Venta:</b> facturas con utilidad &gt;20% menos notas de crédito, y
          se paga al vendedor de la factura.{" "}
          <b>Cobro:</b> recibos del mes, excluyendo retenciones de ITBMS, y se
          paga a quien registró el recibo en Switch (si lo registró la oficina,
          queda en «Oficina (DEFAULT)»). Ambas excluyen intercompañía y clientes
          internos. Fuente: reportes de Switch.
        </p>
        {children && <div className="mt-2.5 border-t border-gray-100 pt-2.5">{children}</div>}
      </div>
    </div>
  );
}

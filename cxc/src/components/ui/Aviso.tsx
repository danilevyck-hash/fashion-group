"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * <Aviso> — EL aviso en línea del sistema (2-oct-2026, `AVISOS_2026_10`).
 *
 *   [ícono] Texto corto ⓘ                                   Acción
 *
 * · UNA fila: ícono a la izquierda, texto y la acción a la DERECHA. En el
 *   celular, si no cabe, la acción baja a su propia línea, alineada a la derecha.
 * · Tonos de la paleta (docs/diseno.md): aviso ámbar · error rojo · info gris ·
 *   éxito verde. Relleno chico (`px-3 py-2`) y `rounded-lg`.
 * · La acción es texto con color y área de toque de 44 px, sin agrandar la caja.
 * · El texto secundario va en `ayuda`: un ⓘ que se abre al tocarlo (nada de
 *   pasar el mouse: en el iPad no hay mouse).
 * · `legado`: lo que la pantalla dibujaba antes. Con el interruptor en `false`
 *   se dibuja eso, al pie de la letra.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { AVISOS_2026_10 } from "@/lib/ui/avisos-2026-10";

export type TonoAviso = "aviso" | "error" | "info" | "exito";

export interface AccionAviso {
  texto: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** Un ícono antes del texto (el giro de «Sincronizar», por ejemplo). */
  icono?: ReactNode;
}

export const TONOS_AVISO: Record<TonoAviso, { caja: string; icono: string; Icono: typeof Info }> = {
  aviso: { caja: "border-amber-200 bg-amber-50 text-amber-700", icono: "text-amber-600", Icono: AlertTriangle },
  error: { caja: "border-red-200 bg-red-50 text-red-600", icono: "text-red-600", Icono: XCircle },
  info: { caja: "border-gray-200 bg-gray-50 text-gray-700", icono: "text-gray-500", Icono: Info },
  exito: { caja: "border-emerald-200 bg-emerald-50 text-emerald-700", icono: "text-emerald-600", Icono: CheckCircle2 },
};

const CLASE_ACCION =
  "-my-2.5 inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap px-1 text-sm font-medium text-blue-600 transition hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50";

function Accion({ a }: { a: AccionAviso }) {
  const contenido = (
    <>
      {a.icono}
      {a.texto}
    </>
  );
  if (a.href && !a.disabled) {
    return (
      <Link href={a.href} className={CLASE_ACCION} onClick={a.onClick}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" onClick={a.onClick} disabled={a.disabled} className={CLASE_ACCION}>
      {contenido}
    </button>
  );
}

export function Aviso({
  tono = "aviso",
  children,
  accion,
  ayuda,
  legado,
  className = "",
}: {
  tono?: TonoAviso;
  children: ReactNode;
  accion?: AccionAviso | AccionAviso[] | null;
  /** Texto secundario: detrás de un ⓘ que se abre al tocarlo. */
  ayuda?: ReactNode;
  /** Lo que se dibujaba antes. Con `AVISOS_2026_10 = false`, se dibuja esto. */
  legado?: ReactNode;
  /** Solo margen o ancho (`mb-4`, `mt-3`): el aspecto lo pone el componente. */
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  if (!AVISOS_2026_10 && legado !== undefined) return <>{legado}</>;

  const t = TONOS_AVISO[tono];
  const acciones = accion ? (Array.isArray(accion) ? accion : [accion]) : [];
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      data-aviso={tono}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${t.caja} ${className}`}
    >
      <t.Icono aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${t.icono}`} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          {children}
          {ayuda && (
            <button
              type="button"
              onClick={() => setAbierta((v) => !v)}
              aria-expanded={abierta}
              aria-label="Más información"
              className="-my-2.5 ml-1 inline-flex min-h-[44px] min-w-[28px] items-center justify-center align-middle opacity-70 hover:opacity-100"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {ayuda && abierta && <div className="mt-1 text-xs text-gray-600">{ayuda}</div>}
        </div>
        {acciones.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {acciones.map((a, i) => (
              <Accion key={i} a={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

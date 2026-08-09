"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta "HOY" — lo primero que se ve al abrir Multifashion.
//
// Pedido de Daniel: *"quiero ver también venta del día en multifashion"*. Ese
// número existía sólo en el Telegram de las 8pm; acá se ve cuando se abre el
// módulo. El monto es el MISMO (misma función de cálculo — ver
// `@/lib/multifashion/retail-dia`).
//
// Las tres cosas que esta tarjeta no puede hacer mal:
//
// 1. NUNCA mostrar el monto sin decir DE CUÁNDO ES. El sync corre cada ~2 h; a
//    las 11pm el número puede ser el de las 8pm. "$2.619" a secas sería mentira.
//    La hora del último sync va SIEMPRE, y con más de 3 h de rezago cambia de
//    tono (ámbar) y lo dice con todas las letras.
// 2. NUNCA escribir "$0" cuando el día todavía no arrancó. A las 9am no hay
//    ventas porque la tienda recién abre, no porque haya vendido cero. Son
//    cosas distintas y confundirlas asusta al que mira.
// 3. NUNCA dejar que el comparativo se lea como un desplome a media mañana.
//    "Hoy hasta ahora" contra "el viernes pasado completo" no es una caída del
//    negocio: es la hora. Mientras el día no cierre (7pm) se rotula "en curso".
//
// Anchos: probado en 390 (iPhone) · 834 (iPad) · 1440. El monto y el
// comparativo se apilan en celular y van en fila desde `sm`; nada se recorta ni
// se arrastra. Sin controles táctiles adentro (es sólo lectura), así que no hay
// blancos de 44 px que respetar.
// ─────────────────────────────────────────────────────────────────────────────

import useSWR from "swr";
import { Clock, AlertTriangle } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { SIN_COMPARATIVO } from "@/lib/variacion";
import type { VentaHoy } from "@/lib/multifashion/venta-hoy";

const FMT_DIA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
});

const FMT_HORA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: true,
});

const FMT_FECHA_HORA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short",
  hour: "numeric", minute: "2-digit", hour12: true,
});

/** "viernes 8 de agosto" — se lee la fecha como texto UTC al mediodía para que
 *  el navegador del usuario no la corra un día según su zona horaria. */
function tituloDia(fecha: string): string {
  return FMT_DIA.format(new Date(`${fecha}T12:00:00Z`));
}

/** "viernes pasado" / "ayer" — el rótulo del comparativo, en criollo. */
function nombreDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-PA", { timeZone: "UTC", weekday: "long" })
    .format(new Date(`${fecha}T12:00:00Z`));
}

/** "8:10 p. m." si el sync fue hoy; "7 ago, 8:10 p. m." si es de otro día — un
 *  dato de ayer disfrazado de hora suelta se lee como si fuera de hoy. */
function horaSync(iso: string, fecha: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diaDelSync = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(d);
  return diaDelSync === fecha ? FMT_HORA.format(d) : FMT_FECHA_HORA.format(d);
}

function fmtPctVariacion(pct: number | null): string {
  if (pct == null) return SIN_COMPARATIVO;
  const v = Math.round(pct * 100);
  if (v === 0) return "igual";
  return `${v > 0 ? "▲ +" : "▼ "}${v}%`;
}

function colorPct(pct: number | null): string {
  if (pct == null) return "text-gray-500";
  const v = Math.round(pct * 100);
  if (v > 0) return "text-emerald-700";
  if (v < 0) return "text-rose-700";
  return "text-gray-600";
}

const fetcher = async (url: string): Promise<VentaHoy> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as VentaHoy;
};

interface VentaHoyCardProps {
  /** Sube +1 tras un "Actualizar ahora" con éxito → se vuelve a pedir el día. */
  syncTick?: number;
  /** El shell no dibuja nada hasta que la sesión está verificada. */
  habilitado?: boolean;
}

export function VentaHoyCard({ syncTick = 0, habilitado = true }: VentaHoyCardProps) {
  const { data, error, isLoading } = useSWR<VentaHoy>(
    habilitado ? ["multifashion-venta-hoy", syncTick] : null,
    () => fetcher("/api/multifashion/venta-hoy"),
    { revalidateOnFocus: true, dedupingInterval: 60_000, keepPreviousData: true },
  );

  if (!habilitado) return null;

  if (isLoading && !data) {
    return (
      <div className="mb-5 h-[104px] w-full animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
    );
  }

  if (error && !data) {
    return (
      <div className="mb-5 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <p className="text-xs text-gray-500">No se pudo cargar la venta de hoy. Intenta recargar.</p>
      </div>
    );
  }

  if (!data) return null;

  const rezagado = data.sync.estado === "rezagado";
  const sinFrescura = data.sync.estado === "sin_dato";
  const alerta = rezagado || sinFrescura;

  return (
    <section
      aria-label="Venta de hoy"
      className={`mb-5 w-full overflow-hidden rounded-lg border px-4 py-3.5 md:px-5 ${
        alerta ? "border-amber-300 bg-amber-50" : "border-teal-200 bg-teal-50/60"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">Hoy</span>
        <span className="text-xs text-gray-600">· {tituloDia(data.fecha)}</span>
        {data.enCurso && (
          <span className="text-xs text-gray-500">· el día todavía no cierra</span>
        )}
      </div>

      {/* Monto + documentos. En 390 px se apilan; desde sm van en una fila. */}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {data.hayVentas ? (
          <>
            <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-gray-950 md:text-4xl">
              {fmtMoney(data.ventas)}
            </span>
            <span className="font-mono text-sm tabular-nums text-gray-600">
              {data.documentos} {data.documentos === 1 ? "tiquete" : "tiquetes"}
            </span>
          </>
        ) : (
          // 🩸 "$0" y "todavía no hay ventas" NO son lo mismo.
          <span className="text-lg font-medium text-gray-700 md:text-xl">
            Todavía no hay ventas hoy
          </span>
        )}
      </div>

      {/* Comparativos + frescura. El titular es HACE 7 DÍAS (mismo día de la
          semana); "ayer" va detrás, en chico, porque un lunes contra un domingo
          no dice nada del negocio. Ver la cabecera de venta-hoy.ts. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {data.hayVentas && data.semanaPasada && (
          <span className={`font-medium ${colorPct(data.semanaPasada.pct)}`}>
            {fmtPctVariacion(data.semanaPasada.pct)}{" "}
            <span className="font-normal text-gray-600">
              vs el {nombreDia(data.semanaPasada.fecha)} pasado ({fmtMoney(data.semanaPasada.ventas)})
            </span>
          </span>
        )}
        {data.hayVentas && data.ayer && (
          <span className="text-gray-500">
            <span className={colorPct(data.ayer.pct)}>{fmtPctVariacion(data.ayer.pct)}</span> vs ayer
          </span>
        )}

        {/* La frescura va SIEMPRE — el monto sin ella es una media verdad. */}
        <span
          className={`inline-flex items-center gap-1 ${alerta ? "font-medium text-amber-800" : "text-gray-500"}`}
        >
          {alerta ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Clock className="h-3.5 w-3.5 shrink-0" />}
          {sinFrescura
            ? "no pudimos confirmar cuándo se actualizó"
            : rezagado
              ? `sin actualizar desde las ${horaSync(data.sync.ultimo as string, data.fecha)}`
              : `actualizado ${horaSync(data.sync.ultimo as string, data.fecha)}`}
        </span>
      </div>
    </section>
  );
}

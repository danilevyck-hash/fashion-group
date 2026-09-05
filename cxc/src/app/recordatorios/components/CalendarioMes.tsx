"use client";

/**
 * EL CALENDARIO — el otro MODO de ver lo mismo, no una pestaña.
 *
 * Lista y Calendario son dos formas de mirar la misma agenda, y se cambian con
 * el control segmentado de siempre. Pinta cheques y recordatorios juntos, que es
 * como estaba y como Daniel lo pidió desde el principio: *"quisiera poner ahí en
 * el calendario «recordar cobrar» y pongo la fecha así telegram me recuerda"*.
 *
 * Se extrajo de `ChequesClient.tsx` (1.693 líneas) el 5-sep-2026, sin cambiarle
 * el comportamiento: los dos layouts (grilla de escritorio y lista de celular),
 * el globo flotante de cada cheque y las píldoras siguen igual. Los 🩸 de cada
 * arreglo viajaron con su código.
 */

import { useRef, useState } from "react";
import { StatusBadge } from "@/components/ui";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import { fmt, fmtDate } from "@/lib/format";
import { getCompanyDisplay } from "@/lib/companies";
import {
  ETIQUETA_REPETICION,
  ocurrenciasPorDiaDelMes,
  type Recordatorio,
} from "@/lib/recordatorios/recordatorio";
import { estadoVisible, type ChequeAgenda } from "@/lib/recordatorios/agenda";

/** Color de la píldora del calendario. */
export function pillColor(estado: string) {
  if (estado === "pendiente") return "bg-emerald-100 text-emerald-700";
  if (estado === "vencido") return "bg-red-100 text-red-700";
  if (estado === "rebotado") return "bg-red-50 text-red-400";
  return "bg-gray-100 text-gray-500";
}

/** Píldora del calendario para un RECORDATORIO. Azul y con campanita: en una
 *  casilla llena de cheques verdes/rojos, el color es lo que lo distingue a
 *  simple vista sin tener que leerlo. */
function RecordatorioCalendarioPill({
  rec,
  onAbrir,
}: {
  rec: Recordatorio;
  onAbrir: () => void;
}) {
  return (
    // `min-h-[44px]` medido, no elegido a ojo: en una línea la píldora daba 22 px
    // y el dedo no le acierta. La casilla crece hacia ABAJO, que es lo único que
    // un calendario puede regalar sin ensanchar nada.
    <button
      onClick={onAbrir}
      data-recordatorio-pill={rec.id}
      title={`Recordatorio: ${rec.texto}${rec.cliente ? ` · ${rec.cliente}` : ""}`}
      className="w-full text-left text-xs px-1.5 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition min-h-[44px] flex items-center"
    >
      <span className="flex items-center gap-1 min-w-0 w-full">
        <span aria-hidden className="flex-shrink-0">
          🔔
        </span>
        {/* `min-w-0 break-words`: sin eso el texto no envuelve DENTRO de su
            caja y `line-clamp` lo recorta de costado — 6 a 17 px que no se
            pueden alcanzar de ninguna manera. Medido a 834 px. */}
        <span className="line-clamp-2 min-w-0 break-words">{rec.texto}</span>
      </span>
    </button>
  );
}

/**
 * Píldora de un cheque dentro de una casilla del calendario, con su globo.
 *
 * 🩸 El globo FLOTA (portal a <body> + fixed) desde el 30-jul-2026. Era
 * `absolute top-full` dentro de una casilla de `min-h-[80px]`, y en las últimas
 * semanas del mes eso lo dejaba FUERA DE LA PANTALLA: medido a 1440×900,
 * **138 px por debajo del borde de abajo** — o sea que "Confirmar depósito" y
 * "Rebotado" quedaban donde nadie los podía tocar. Ahora, si abajo no alcanza,
 * se abre hacia arriba. Cada píldora necesita SU ancla (un `ref` por celda).
 */
function ChequeCalendarioPill({
  cheque,
  ve,
  abierto,
  onAbrir,
  onCerrar,
  onDepositar,
  onRebotado,
}: {
  cheque: ChequeAgenda;
  ve: string;
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  onDepositar: () => void;
  onRebotado: () => void;
}) {
  const pillRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      {/* 🩸 El nombre y el MONTO iban en la misma línea con `truncate`, y en una
          casilla de calendario (7 columnas: ~80 px en un iPad de 834) el monto
          quedaba fuera del recorte: "Jerusalem De… $29,476.28" perdía 121 px a
          834 y 113 a 1440 — el número no se podía leer y encima parecía
          completo. Ahora el monto tiene su propio renglón y siempre entra. */}
      <button
        ref={pillRef}
        onClick={onAbrir}
        title={`N° ${cheque.numero_cheque} · $${fmt(cheque.monto)} · ${cheque.cliente}`}
        className={`flex min-h-[44px] w-full flex-col justify-center text-left text-xs px-1.5 py-0.5 rounded ${pillColor(ve)}`}
      >
        <span className="flex items-center gap-1 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ve === "depositado" ? "bg-gray-400" : ve === "pendiente" ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span className="truncate">{cheque.cliente}</span>
        </span>
        <span className="block tabular-nums font-medium">${fmt(cheque.monto)}</span>
      </button>
      <DesplegableFlotante
        abierto={abierto}
        anclaRef={pillRef}
        onCerrar={onCerrar}
        marca="cheque-calendario"
        ancho={224}
        className="bg-white border border-gray-200 rounded-lg shadow-lg p-3"
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="text-xs font-medium mb-1">{cheque.cliente}</div>
          <div className="text-xs text-gray-500 mb-0.5">N° {cheque.numero_cheque}</div>
          <div className="text-sm font-semibold mb-2">${fmt(cheque.monto)}</div>
          <StatusBadge estado={ve} />
          {(ve === "pendiente" || ve === "vencido") && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
              <button
                onClick={onDepositar}
                className="text-xs text-emerald-600 hover:underline min-h-[44px] inline-flex items-center"
              >
                Confirmar depósito
              </button>
              <button
                onClick={onRebotado}
                title="Cheque devuelto por el banco"
                className="text-xs text-red-500 hover:underline min-h-[44px] inline-flex items-center"
              >
                Rebotado
              </button>
            </div>
          )}
        </div>
      </DesplegableFlotante>
    </div>
  );
}

interface Props {
  cheques: ChequeAgenda[];
  recordatorios: Recordatorio[];
  /** HOY en fecha de Panamá, del servidor. */
  hoy: string;
  onDepositar: (id: string) => void;
  onRebotado: (id: string) => void;
  onEditarRecordatorio: (id: string) => void;
  onEditarCheque: (id: string) => void;
  onVerDia: (fecha: string) => void;
}

export default function CalendarioMes({
  cheques,
  recordatorios,
  hoy,
  onDepositar,
  onRebotado,
  onEditarRecordatorio,
  onEditarCheque,
  onVerDia,
}: Props) {
  // El mes que se está mirando arranca en el de HOY, y HOY viene de Panamá.
  const [mes, setMes] = useState(() => ({
    year: Number(hoy.slice(0, 4)),
    month: Number(hoy.slice(5, 7)) - 1,
  }));
  const [popover, setPopover] = useState<string | null>(null);

  const { year, month } = mes;
  const firstDay = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startDow = (firstDay.getUTCDay() + 6) % 7; // Monday = 0
  const monthLabel = firstDay.toLocaleDateString("es-PA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthCheques = cheques.filter((c) => c.fecha_deposito.startsWith(monthPrefix));
  const byDay: Record<number, ChequeAgenda[]> = {};
  for (const c of monthCheques) {
    const d = parseInt(c.fecha_deposito.slice(8, 10));
    (byDay[d] ??= []).push(c);
  }

  // Día del mes → recordatorios que TOCAN ese día. Lo calcula el módulo puro,
  // que es el mismo que decide qué manda el aviso de Telegram: si el calendario
  // tuviera su propia cuenta, la pantalla y el aviso podrían decir días
  // distintos del mismo recordatorio.
  const recPorDia = ocurrenciasPorDiaDelMes(recordatorios, year, month + 1);
  const totalRecMes = Object.values(recPorDia).reduce((n, l) => n + l.length, 0);

  const goToday = () =>
    setMes({ year: Number(hoy.slice(0, 4)), month: Number(hoy.slice(5, 7)) - 1 });
  const goPrev = () =>
    setMes((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 }));
  const goNext = () =>
    setMes((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 }));

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const fechaDe = (d: number) => `${monthPrefix}-${String(d).padStart(2, "0")}`;

  return (
    <div>
      {/* `flex-wrap`: a 390 px el contador del mes no entra al lado de las
          flechas y empujaba la fila. Al envolver, el arrastre queda en 0. */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            aria-label="Mes anterior"
            className="w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500"
          >
            ‹
          </button>
          <h2 className="text-sm font-medium first-letter:uppercase w-40 text-center">
            {monthLabel}
          </h2>
          <button
            onClick={goNext}
            aria-label="Mes siguiente"
            className="w-8 h-8 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-gray-200 hover:border-gray-400 transition text-gray-500"
          >
            ›
          </button>
          {/* Medía 24.5×18 — el target más chico del calendario. */}
          <button
            onClick={goToday}
            className="text-xs text-gray-400 hover:text-black transition ml-2 min-h-[44px] min-w-[44px] -my-1 inline-flex items-center justify-center"
          >
            Hoy
          </button>
        </div>
        {/* 🔴 CUÁNTOS, nunca CUÁNTO: en este módulo no se muestra ningún total
            sumado. Acá había "$X" del mes y se fue con las tres tarjetas. */}
        <span className="text-xs text-gray-400">
          {monthCheques.length} cheque{monthCheques.length === 1 ? "" : "s"}
          {totalRecMes > 0 ? ` · ${totalRecMes} recordatorio${totalRecMes > 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {/* Desktop grid.
          `data-vista` FIJO: los candados buscan el layout por acá y no por su
          clase de breakpoint — una clase se mueve y el chequeo compara CERO, o
          sea que pasa en verde sin haber mirado nada. */}
      <div className="hidden sm:block" data-vista="calendario-grid">
        <div className="grid grid-cols-7 text-center text-xs text-gray-500 uppercase tracking-wide mb-1">
          {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-l border-gray-200">
          {cells.map((day, i) => {
            if (day === null)
              return (
                <div
                  key={`e${i}`}
                  className="border-r border-b border-gray-200 bg-gray-50/50 min-h-[80px]"
                />
              );
            const dateStr = fechaDe(day);
            const isToday = dateStr === hoy;
            const dayCheques = byDay[day] || [];
            return (
              <div
                key={day}
                className={`border-r border-b border-gray-200 min-h-[80px] p-1 ${isToday ? "bg-blue-50/60" : ""}`}
              >
                <div className={`text-xs mb-0.5 ${isToday ? "font-bold text-blue-600" : "text-gray-400"}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {/* Los recordatorios van PRIMERO en la casilla: son pocos
                      (0-2 en un día normal) y son lo que Daniel viene a poner
                      acá. Los cheques quedan debajo, con su "+N más". */}
                  {(recPorDia[day] ?? []).map((rec) => (
                    <RecordatorioCalendarioPill
                      key={rec.id}
                      rec={rec}
                      onAbrir={() => {
                        setPopover(null);
                        onEditarRecordatorio(rec.id);
                      }}
                    />
                  ))}
                  {dayCheques.slice(0, 3).map((c) => (
                    <ChequeCalendarioPill
                      key={c.id}
                      cheque={c}
                      ve={estadoVisible(c, hoy)}
                      abierto={popover === c.id}
                      onAbrir={() => setPopover(popover === c.id ? null : c.id)}
                      onCerrar={() => setPopover(null)}
                      onDepositar={() => {
                        onDepositar(c.id);
                        setPopover(null);
                      }}
                      onRebotado={() => {
                        onRebotado(c.id);
                        setPopover(null);
                      }}
                    />
                  ))}
                  {dayCheques.length > 3 && (
                    <button
                      onClick={() => {
                        setPopover(null);
                        onVerDia(dateStr);
                      }}
                      className="text-xs text-gray-500 hover:text-black px-1 w-full text-left transition"
                    >
                      +{dayCheques.length - 3} más
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Celular: agrupado por día */}
      <div className="sm:hidden space-y-2" data-vista="calendario-lista">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1)
          .filter((d) => byDay[d]?.length || recPorDia[d]?.length)
          .map((day) => {
            const dateStr = fechaDe(day);
            const isToday = dateStr === hoy;
            return (
              <div
                key={day}
                className={`rounded-lg border p-3 ${isToday ? "border-blue-200 bg-blue-50/50" : "border-gray-200"}`}
              >
                <div className={`text-xs mb-2 ${isToday ? "font-bold text-blue-600" : "text-gray-400"}`}>
                  {fmtDate(dateStr)}
                  {isToday ? " — Hoy" : ""}
                </div>
                <div className="space-y-1.5">
                  {(recPorDia[day] ?? []).map((rec) => (
                    <button
                      key={rec.id}
                      data-recordatorio-pill={rec.id}
                      onClick={() => onEditarRecordatorio(rec.id)}
                      className="w-full text-left flex items-start gap-2 rounded bg-blue-50 border border-blue-200 px-2 py-2 min-h-[44px]"
                    >
                      <span aria-hidden className="flex-shrink-0 mt-0.5">
                        🔔
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm text-blue-900 break-words">{rec.texto}</span>
                        {(rec.cliente || rec.repeticion !== "una_vez") && (
                          <span className="block text-xs text-blue-700/70">
                            {[
                              rec.cliente,
                              rec.repeticion !== "una_vez" ? ETIQUETA_REPETICION[rec.repeticion] : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                  {(byDay[day] ?? []).map((c) => {
                    const ve = estadoVisible(c, hoy);
                    return (
                      <div key={c.id}>
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => onEditarCheque(c.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${pillColor(ve)}`}>{ve}</span>
                            <span className="text-sm truncate">{c.cliente}</span>
                          </div>
                          <span className="text-sm font-medium tabular-nums ml-2">${fmt(c.monto)}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 ml-1">
                          N° {c.numero_cheque} · {getCompanyDisplay(c.empresa)}
                        </div>
                        {/* `-my-1.5` para que crecer a 44 px no estire la fila. */}
                        {(ve === "pendiente" || ve === "vencido") && (
                          <div className="flex gap-3 mt-1 ml-1 -my-1.5">
                            <button
                              onClick={() => onDepositar(c.id)}
                              className="text-xs text-emerald-600 hover:underline min-h-[44px] inline-flex items-center"
                            >
                              Confirmar depósito
                            </button>
                            <button
                              onClick={() => onRebotado(c.id)}
                              title="Cheque devuelto por el banco"
                              className="text-xs text-red-500 hover:underline min-h-[44px] inline-flex items-center"
                            >
                              Rebotado
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {/* 🩸 `flex-wrap`: con la cuarta entrada (el recordatorio) la leyenda no
          entra en una línea a 390 px y arrastraba la página. Envuelve. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-3 px-1">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Pendiente
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Vencido / Rebotado
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-300" /> Depositado
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden>🔔</span> Recordatorio
        </span>
      </div>
    </div>
  );
}

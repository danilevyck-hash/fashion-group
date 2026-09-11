"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA VISTA «POR DÍA» (10-sep-2026).
 *
 * Daniel: *«y si quiero poder ver por día y por persona? con un tab arriba que
 * diga colaborador / día»*. Es lo MISMO agrupado al revés: día → su gente, como
 * era hasta hoy, con los mismos botones Sí/No en el día y en cada persona. Solo
 * trae lo pendiente: lo decidido vive en «Ya decididas», igual que en la otra.
 * ────────────────────────────────────────────────────────────────────────── */

import type { MutableRefObject } from "react";
import type { DiaAprobacion, PersonaEnDia } from "@/lib/asistencia/aprobaciones";
import { claveDia } from "@/lib/asistencia/aprobaciones";
import { hm, toquesDeDia } from "@/lib/asistencia/aprobaciones-vistas";
import { BotonesSiNo, ChipTipo, Flecha } from "./BotonesSiNo";
import type { PropsVista } from "./PorColaborador";

export default function PorDia({
  dias, onDecidir, enVuelo, bloqueado, abiertos, onAbrir, personaResaltada, refResaltada,
}: Omit<PropsVista, "refResaltada"> & {
  dias: readonly DiaAprobacion[];
  /** La fila de la persona resaltada, en el primer día abierto donde esté. */
  refResaltada?: MutableRefObject<HTMLDivElement | null>;
}) {
  const viaja = (d: DiaAprobacion, g?: PersonaEnDia) =>
    g ? enVuelo.has(claveDia(g.codigo, d.fecha)) : d.gente.some((x) => enVuelo.has(claveDia(x.codigo, d.fecha)));
  let yaResaltada = false;
  return (
    <div data-testid="vista-dia">
      {dias.map((d) => {
        const abierta = abiertos.has(d.fecha);
        return (
          <div key={d.fecha} className="mb-1.5 overflow-hidden rounded-[10px] border border-gray-200 bg-white">
            <div className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-1 tabular-nums">
              <button
                type="button"
                onClick={() => onAbrir(d.fecha)}
                aria-expanded={abierta}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="text-sm text-gray-600">
                  <b className="font-semibold text-gray-900">{d.etiqueta.slice(0, d.etiqueta.lastIndexOf(" "))}</b>
                  {d.etiqueta.slice(d.etiqueta.lastIndexOf(" "))}
                </span>
                <Flecha abierta={abierta} />
              </button>
              <span className="text-sm text-gray-600">
                {d.gente.length} · {hm(d.minutos)} h
              </span>
              <BotonesSiNo
                decision={null}
                etiqueta={d.etiqueta}
                disabled={bloqueado || viaja(d)}
                onDecidir={(dec) => onDecidir(toquesDeDia(d), dec)}
              />
            </div>
            {abierta && (
              <div className="border-t border-gray-100">
                {d.gente.map((g, i) => {
                  const esLaBuscada = personaResaltada !== "" && g.codigo === personaResaltada;
                  const conRef = esLaBuscada && !yaResaltada;
                  if (conRef) yaResaltada = true;
                  return (
                    <div
                      key={g.codigo}
                      ref={conRef ? refResaltada : undefined}
                      aria-current={esLaBuscada ? "true" : undefined}
                      className={`flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 px-3.5 py-1 tabular-nums last:border-b-0 ${
                        esLaBuscada ? "bg-amber-100" : i % 2 === 0 ? "bg-gray-50/60" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{g.etiqueta}</span>
                      <span className="hidden shrink-0 text-xs text-gray-500 sm:block">{g.empresaEtiqueta ?? ""}</span>
                      <ChipTipo tipo={g.tipo} />
                      {g.salida && <span className="shrink-0 text-xs text-gray-500">{g.salida}</span>}
                      <span className="shrink-0 text-sm font-semibold">{hm(g.minutos)} h</span>
                      <BotonesSiNo
                        decision={null}
                        etiqueta={`${g.etiqueta} el ${d.etiqueta}`}
                        disabled={bloqueado || viaja(d, g)}
                        onDecidir={(dec) => onDecidir([{ codigo: g.codigo, fecha: d.fecha, minutos: g.minutos }], dec)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

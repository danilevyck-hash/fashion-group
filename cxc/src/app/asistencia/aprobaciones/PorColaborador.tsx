"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA VISTA «POR COLABORADOR» — la que abre por defecto (10-sep-2026).
 *
 * Daniel: *«Cada renglón es una persona en la quincena, con sus horas extra
 * sumadas. Dos botones: Sí y No. Se decide, y el renglón se va»*.
 *
 * Un renglón: nombre · «N días · H:MM h» · Sí · No. Los botones del renglón
 * deciden TODOS los días pendientes de esa persona. El ⌄ abre sus días, cada
 * uno con su Sí/No, para decidir uno distinto. Un domingo o feriado sale como
 * un día más, marcado.
 * ────────────────────────────────────────────────────────────────────────── */

import type { MutableRefObject } from "react";
import type { Decision, ToqueAprobacion } from "@/lib/asistencia/aprobaciones";
import { claveDia, horasBonitas } from "@/lib/asistencia/aprobaciones";
import {
  textoDiasYHoras,
  textoFirma,
  hm,
  toquesDePersona,
  type DiaDePersona,
  type PersonaAprobacion,
} from "@/lib/asistencia/aprobaciones-vistas";
import { BotonesSiNo, ChipTipo, Flecha } from "./BotonesSiNo";

export interface PropsVista {
  /** Decide sobre esos días (el POST va detrás, optimista). */
  onDecidir: (items: ToqueAprobacion[], decision: Decision) => void;
  /** `codigo|fecha` de lo que está viajando: solo eso se apaga. */
  enVuelo: ReadonlySet<string>;
  bloqueado: boolean;
  /** Qué renglones están abiertos (por código). */
  abiertos: ReadonlySet<string>;
  onAbrir: (codigo: string) => void;
  /** La persona que trajo la URL (`?persona=`): su renglón se resalta. */
  personaResaltada: string;
  refResaltada?: MutableRefObject<HTMLDivElement | null>;
}

/** Los días de una persona, desplegados. Se reusa en «Ya decididas». */
export function DiasDePersona({
  p, onDecidir, enVuelo, bloqueado,
}: Pick<PropsVista, "onDecidir" | "enVuelo" | "bloqueado"> & { p: PersonaAprobacion }) {
  const viaja = (d: DiaDePersona) => enVuelo.has(claveDia(p.codigo, d.fecha));
  const conCambio = p.dias.filter((d) => d.cambio);
  const firmado = p.dias.find((d) => d.decision !== null && d.por);
  return (
    <div className="border-t border-gray-100" data-testid={`dias-de-${p.codigo}`}>
      {p.dias.map((d, i) => (
        <div
          key={d.fecha}
          className={`flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 px-3.5 py-1 tabular-nums last:border-b-0 ${
            d.decision === null ? (i % 2 === 0 ? "bg-gray-50/60" : "") : "bg-emerald-50/30"
          }`}
        >
          <span className="text-sm text-gray-800">{d.etiqueta}</span>
          <ChipTipo tipo={d.tipo} />
          {d.salida && <span className="text-xs text-gray-500">{d.salida}</span>}
          <span className="ml-auto text-sm font-semibold">{hm(d.minutos)} h</span>
          <BotonesSiNo
            decision={d.decision}
            etiqueta={`${p.etiqueta} el ${d.etiqueta}`}
            disabled={bloqueado || viaja(d)}
            onDecidir={(dec) => onDecidir([{ codigo: p.codigo, fecha: d.fecha, minutos: d.minutos }], dec)}
          />
        </div>
      ))}
      {conCambio.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-800">
          {conCambio
            .map((d) => `${d.etiqueta}: se aprobaron ${horasBonitas(d.minutosVistos ?? 0)} y hoy son ${horasBonitas(d.minutos)}`)
            .join(" · ")}
        </div>
      )}
      {firmado && (
        <div className="border-t border-gray-100 px-3.5 py-2 text-xs text-gray-500">
          {textoFirma(firmado.por, firmado.cuando)}
        </div>
      )}
    </div>
  );
}

export default function PorColaborador({
  personas, onDecidir, enVuelo, bloqueado, abiertos, onAbrir, personaResaltada, refResaltada,
}: PropsVista & { personas: readonly PersonaAprobacion[] }) {
  return (
    <div data-testid="vista-colaborador">
      {personas.map((p) => {
        const abierta = abiertos.has(p.codigo);
        const esLaBuscada = personaResaltada !== "" && p.codigo === personaResaltada;
        const viajaAlguno = p.dias.some((d) => enVuelo.has(claveDia(p.codigo, d.fecha)));
        return (
          <div
            key={p.codigo}
            ref={esLaBuscada ? refResaltada : undefined}
            aria-current={esLaBuscada ? "true" : undefined}
            className={`mb-1.5 overflow-hidden rounded-[10px] border ${
              esLaBuscada ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-1 tabular-nums">
              <button
                type="button"
                onClick={() => onAbrir(p.codigo)}
                aria-expanded={abierta}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{p.etiqueta}</span>
                <Flecha abierta={abierta} />
              </button>
              <span className="hidden text-xs text-gray-500 sm:block">{p.empresaEtiqueta ?? ""}</span>
              <span className="text-sm text-gray-600">{textoDiasYHoras(p.diasPendientes, p.minutosPendientes)}</span>
              {/* 🔴 El Sí/No del renglón decide SOLO lo pendiente de esa persona:
                  lo que ya tiene decisión se cambia día por día, abriendo el ⌄. */}
              <BotonesSiNo
                decision={null}
                etiqueta={p.etiqueta}
                disabled={bloqueado || viajaAlguno}
                onDecidir={(dec) => onDecidir(toquesDePersona(p, true), dec)}
              />
            </div>
            {abierta && <DiasDePersona p={p} onDecidir={onDecidir} enVuelo={enVuelo} bloqueado={bloqueado} />}
          </div>
        );
      })}
    </div>
  );
}

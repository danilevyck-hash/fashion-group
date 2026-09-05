"use client";

/**
 * LA LISTA — una sola, sin pestañas, con cheques y recordatorios juntos.
 *
 * Las OCHO pestañas del módulo viejo (`pendiente · depositado · vencido ·
 * rebotado · vencen_hoy · vencen_manana · vencen_semana · recordatorios`) se
 * fueron el 5-sep-2026. La razón está escrita entera en `lib/recordatorios/
 * agenda.ts`, que es donde vive la decisión: **cuatro de esas pestañas no eran
 * estados, eran CUÁNDO**, y una fecha ya lo dice.
 *
 * Acá queda solo el dibujo. Lo que este componente NO hace, y es a propósito:
 *
 * 🔴 **No suma nada.** No hay tarjetas de totales arriba, ni un total al pie de
 * un grupo, ni un total de la lista. Daniel eligió explícitamente que el módulo
 * no muestre ningún total sumado. Los montos POR FILA se quedan; el encabezado
 * de grupo dice CUÁNTOS son, nunca cuánto suman.
 *
 * 🔴 **No decide qué se ve.** Eso lo hace `agruparAgenda` (módulo puro): lo
 * abierto en la lista, lo depositado solo por el buscador.
 */

import { Fragment } from "react";
import { StatusBadge } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { getCompanyDisplay } from "@/lib/companies";
import { ETIQUETA_REPETICION } from "@/lib/recordatorios/recordatorio";
import type { GrupoDeAgenda, ItemAgenda } from "@/lib/recordatorios/agenda";

interface Props {
  grupos: GrupoDeAgenda[];
  /** Resultados del buscador. Cuando hay término, reemplazan a los grupos. */
  buscando: boolean;
  resultados: ItemAgenda[];
  termino: string;
  onAbrirCheque: (id: string) => void;
  onAbrirRecordatorio: (id: string) => void;
  onDepositar: (id: string) => void;
  onRebotado: (id: string) => void;
  onRedepositar: (id: string) => void;
}

/** El borde izquierdo de color. Vencido y rebotado en rojo; el resto, neutro. */
function bordeCheque(ve: string): string {
  if (ve === "vencido" || ve === "rebotado") return "border-l-4 border-l-red-600";
  if (ve === "depositado") return "border-l-4 border-l-emerald-400";
  return "border-l-4 border-l-gray-200";
}

function FilaCheque({
  item,
  onAbrir,
  onDepositar,
  onRebotado,
  onRedepositar,
}: {
  item: Extract<ItemAgenda, { tipo: "cheque" }>;
  onAbrir: (id: string) => void;
  onDepositar: (id: string) => void;
  onRebotado: (id: string) => void;
  onRedepositar: (id: string) => void;
}) {
  const c = item.cheque;
  const ve = item.ve;
  const abierto = ve === "pendiente" || ve === "vencido";
  return (
    <div
      data-cheque-fila={c.id}
      className={`border border-gray-200 rounded-lg ${bordeCheque(ve)} ${ve === "depositado" ? "opacity-60" : ""}`}
    >
      <div className="px-4 py-3 cursor-pointer" onClick={() => onAbrir(c.id)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate" data-cheque-campo="cliente">
            {c.cliente}
          </span>
          <span className="text-sm font-semibold tabular-nums shrink-0" data-cheque-campo="monto">
            ${fmt(c.monto)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
          <span data-cheque-campo="estado">
            <StatusBadge estado={ve} />
          </span>
          <span className="text-xs text-gray-400">N° {c.numero_cheque}</span>
          <span className="text-xs text-gray-400">· {getCompanyDisplay(c.empresa)}</span>
          <span className="text-xs text-gray-400 ml-auto">{fmtDate(c.fecha_deposito)}</span>
        </div>
        {/* 🔴 Un cheque REBOTADO se queda en la lista, con su marca roja, hasta
            que se redeposite o se borre. Dejó de ser pestaña: era una pestaña
            con cero filas en toda la historia del módulo. */}
        {ve === "rebotado" && (
          <div className="text-xs text-red-600 mt-1">
            Este cheque rebotó{c.motivo_rebote ? ` — ${c.motivo_rebote}` : ""}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-2 -mt-1" onClick={(e) => e.stopPropagation()}>
        {abierto && (
          <button
            onClick={() => onDepositar(c.id)}
            className="text-xs text-emerald-600 hover:underline min-h-[44px] inline-flex items-center"
          >
            Confirmar depósito
          </button>
        )}
        {abierto && (
          <button
            onClick={() => onRebotado(c.id)}
            title="Cheque devuelto por el banco"
            className="text-xs text-red-500 hover:underline min-h-[44px] inline-flex items-center"
          >
            Rebotado
          </button>
        )}
        {ve === "rebotado" && (
          <button
            onClick={() => onRedepositar(c.id)}
            className="text-xs text-emerald-600 hover:underline min-h-[44px] inline-flex items-center"
          >
            Re-depositar
          </button>
        )}
      </div>
    </div>
  );
}

function FilaRecordatorio({
  item,
  onAbrir,
}: {
  item: Extract<ItemAgenda, { tipo: "recordatorio" }>;
  onAbrir: (id: string) => void;
}) {
  const r = item.rec;
  return (
    <button
      data-recordatorio-fila={r.id}
      onClick={() => onAbrir(r.id)}
      className="w-full text-left border border-gray-200 rounded-lg border-l-4 border-l-blue-400 px-4 py-3 hover:bg-gray-50 transition"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-start gap-2 min-w-0">
          <span aria-hidden className="shrink-0 mt-0.5">
            🔔
          </span>
          <span className="text-sm font-medium break-words" data-recordatorio-campo="texto">
            {r.texto}
          </span>
        </span>
        {r.destino === "privado" && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            Solo a mí
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 ml-6">
        {/* 🔴 UNA sola fila por recordatorio que se repite: dice cada cuánto y
            hasta cuándo, nunca una fila por ocurrencia. Con «Cada día» sin
            fecha de fin, una fila por ocurrencia sería una lista infinita. */}
        <span className="text-xs text-gray-400" data-recordatorio-campo="fecha">
          {r.repeticion === "una_vez"
            ? fmtDate(r.fecha)
            : `${ETIQUETA_REPETICION[r.repeticion]}${r.hasta ? ` · hasta el ${fmtDate(r.hasta)}` : ""}`}
        </span>
        {r.cliente && <span className="text-xs text-gray-500">· {r.cliente}</span>}
      </div>
    </button>
  );
}

function Fila({
  item,
  onAbrirCheque,
  onAbrirRecordatorio,
  onDepositar,
  onRebotado,
  onRedepositar,
}: {
  item: ItemAgenda;
} & Omit<Props, "grupos" | "buscando" | "resultados" | "termino">) {
  return item.tipo === "cheque" ? (
    <FilaCheque
      item={item}
      onAbrir={onAbrirCheque}
      onDepositar={onDepositar}
      onRebotado={onRebotado}
      onRedepositar={onRedepositar}
    />
  ) : (
    <FilaRecordatorio item={item} onAbrir={onAbrirRecordatorio} />
  );
}

export default function AgendaLista({
  grupos,
  buscando,
  resultados,
  termino,
  ...acciones
}: Props) {
  if (buscando) {
    return (
      <div data-agenda="busqueda" className="space-y-1.5">
        {resultados.length === 0 ? (
          <p className="text-sm text-gray-500 py-16 text-center">
            No encontramos nada para “{termino}”
          </p>
        ) : (
          resultados.map((item) => (
            <Fila key={`${item.tipo}-${item.id}`} item={item} {...acciones} />
          ))
        )}
      </div>
    );
  }

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <span aria-hidden className="text-3xl mb-3">
          🔔
        </span>
        <p className="text-sm text-gray-500">Todo al día</p>
      </div>
    );
  }

  return (
    <div data-agenda="lista" className="space-y-6">
      {grupos.map((g) => (
        <Fragment key={g.key}>
          <section data-agenda-grupo={g.key}>
            {/* El encabezado de grupo del sistema: rótulo + cuántos son.
                🔴 NUNCA un total sumado — ver el encabezado del archivo. */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className={`text-sm font-semibold ${g.color}`}>{g.label}</span>
              <span className="text-xs text-gray-400 tabular-nums">({g.items.length})</span>
            </div>
            <div className="space-y-1.5">
              {g.items.map((item) => (
                <Fila key={`${item.tipo}-${item.id}`} item={item} {...acciones} />
              ))}
            </div>
          </section>
        </Fragment>
      ))}
    </div>
  );
}

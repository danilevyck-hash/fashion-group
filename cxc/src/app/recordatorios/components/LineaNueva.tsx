"use client";

/**
 * ESCRIBIR UN RECORDATORIO = UN RENGLÓN (5-sep-2026).
 *
 * ── LO QUE ERA ───────────────────────────────────────────────────────────────
 * Abrir el menú → «Nuevo recordatorio» → una ventana con CUATRO campos (Qué hay
 * que recordar · Fecha · Cliente · ¿Se repite?) → Guardar. Cuatro toques antes
 * de poder escribir una línea.
 *
 * ── LO QUE ES ────────────────────────────────────────────────────────────────
 * Una línea SIEMPRE VISIBLE arriba de la lista:
 *
 *   ¿Qué te recuerdo?   [ Cuándo ▾ ]  [ A quién ▾ ]  [ + Cliente ]  [ Guardar ]
 *
 * 🔴 **«Hoy» no está entre las opciones.** Todo sale a las 9:00 de la mañana en
 * un solo mensaje; si ya pasó, «hoy» no serviría. El primero disponible es
 * mañana, y si igual se elige un día pasado en «Elegir fecha», **no se deja
 * guardar y se dice por qué** — acá, pegado al campo, no en un toast después de
 * tocar el botón.
 *
 * 🔴 **No hay selector de hora.** No existe la hora: existe el mensaje de las
 * 9:00.
 *
 * 🔴 **El CLIENTE es opcional y NO se muestra por defecto.** Daniel ya había
 * dicho que no debía ser obligatorio; mostrarlo siempre lo hacía parecer un
 * campo que hay que llenar. Se abre con un toque y sigue guardándose igual
 * (`cliente` + `cliente_codigo`).
 *
 * 🔴 **«A quién» solo lo ven los admin.** Lo que escribe una secretaria va
 * siempre al equipo, y eso lo fuerza el SERVIDOR — acá solo se esconde el
 * control. ⚠️ Hay UN solo chat privado (el de Daniel) y DOS admin: si Alberto
 * marca «solo a mí», le llega a Daniel. Aprobado así.
 */

import { useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import {
  ETIQUETA_DESTINO,
  DESTINOS,
  FALTA_FECHA_PASADA,
  faltaParaGuardar,
  mensajeDeFalta,
  type Destino,
} from "@/lib/recordatorios/recordatorio";
import {
  ETIQUETA_CUANDO,
  OPCIONES_CUANDO,
  aceptaHasta,
  resolverCuando,
  type OpcionCuando,
} from "@/lib/recordatorios/cuando";

export interface RecordatorioRapido {
  texto: string;
  fecha: string;
  repeticion: "una_vez" | "cada_dia" | "semanal" | "mensual";
  hasta: string | null;
  destino: Destino;
  cliente: string;
  cliente_codigo: string;
}

interface Props {
  /** La fecha de HOY en Panamá, calculada en el servidor. Nunca `new Date()`. */
  hoy: string;
  /** Solo los admin eligen a quién le llega. */
  puedeElegirDestino: boolean;
  guardando: boolean;
  isOnline: boolean;
  onGuardar: (v: RecordatorioRapido) => void;
}

const PASTILLA =
  "text-sm px-3 min-h-[44px] inline-flex items-center rounded-full border transition whitespace-nowrap";
const PASTILLA_ON = "border-blue-500 bg-blue-50 text-blue-700 font-medium";
const PASTILLA_OFF = "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black";

export default function LineaNueva({
  hoy,
  puedeElegirDestino,
  guardando,
  isOnline,
  onGuardar,
}: Props) {
  const [texto, setTexto] = useState("");
  const [cuando, setCuando] = useState<OpcionCuando>("manana");
  const [fechaElegida, setFechaElegida] = useState("");
  const [hasta, setHasta] = useState("");
  const [destino, setDestino] = useState<Destino>("equipo");
  const [conCliente, setConCliente] = useState(false);
  const [cliente, setCliente] = useState("");
  const [clienteCodigo, setClienteCodigo] = useState("");

  const resuelto = resolverCuando(cuando, hoy, fechaElegida);
  const puedeHasta = aceptaHasta(cuando);
  const falta = faltaParaGuardar(
    { fecha: resuelto.fecha, texto, hasta: puedeHasta && hasta ? hasta : null },
    hoy,
  );
  const puedeGuardar = falta.length === 0 && !guardando && isOnline;

  function limpiar() {
    setTexto("");
    setCuando("manana");
    setFechaElegida("");
    setHasta("");
    setDestino("equipo");
    setConCliente(false);
    setCliente("");
    setClienteCodigo("");
  }

  function guardar() {
    if (!puedeGuardar) return;
    onGuardar({
      texto: texto.trim(),
      fecha: resuelto.fecha,
      repeticion: resuelto.repeticion,
      hasta: puedeHasta && hasta ? hasta : null,
      destino,
      cliente: conCliente ? cliente : "",
      cliente_codigo: conCliente ? clienteCodigo : "",
    });
    limpiar();
  }

  return (
    <section
      data-linea-nueva
      aria-label="Escribir un recordatorio"
      className="border border-gray-200 rounded-lg px-3 py-3 mb-5 bg-white"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* No es un <form>: sin submit implícito, un Enter perdido no guarda
            solo. El Enter SÍ guarda, pero solo cuando el botón está encendido —
            es lo mismo que tocar el botón, no un atajo escondido. */}
        <input
          type="text"
          aria-label="¿Qué te recuerdo?"
          placeholder="¿Qué te recuerdo?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && puedeGuardar) guardar();
          }}
          // text-base en celular: con text-sm (14px) Safari hace zoom al enfocar.
          className="flex-1 min-w-0 text-base sm:text-sm border-b border-gray-200 px-1 min-h-[44px] outline-none focus:border-black transition"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={!puedeGuardar}
          title={!isOnline ? "Sin conexión" : undefined}
          className="bg-black text-white px-5 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {!isOnline ? "Sin conexión" : guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {/* ── Cuándo ─────────────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 mt-2"
        role="group"
        aria-label="Cuándo"
      >
        {OPCIONES_CUANDO.map((op) => (
          <button
            key={op}
            type="button"
            aria-pressed={cuando === op}
            onClick={() => setCuando(op)}
            className={`${PASTILLA} ${cuando === op ? PASTILLA_ON : PASTILLA_OFF}`}
          >
            {ETIQUETA_CUANDO[op]}
          </button>
        ))}

        {cuando === "elegir" && (
          <input
            type="date"
            aria-label="Fecha"
            value={fechaElegida}
            min={hoy}
            onChange={(e) => setFechaElegida(e.target.value)}
            className="text-base sm:text-sm border border-gray-200 rounded-md px-2 min-h-[44px] outline-none focus:border-black transition"
          />
        )}

        {/* El «Hasta…» solo aparece con una repetición: sin ella no significa
            nada, y el servidor lo descartaría igual. */}
        {puedeHasta && (
          <label className="inline-flex items-center gap-2 text-sm text-gray-500">
            Hasta
            <input
              type="date"
              aria-label="Hasta"
              value={hasta}
              min={resuelto.fecha || hoy}
              onChange={(e) => setHasta(e.target.value)}
              className="text-base sm:text-sm border border-gray-200 rounded-md px-2 min-h-[44px] outline-none focus:border-black transition"
            />
          </label>
        )}
      </div>

      {/* ── A quién · Cliente ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {puedeElegirDestino && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="A quién">
            {DESTINOS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={destino === d}
                onClick={() => setDestino(d)}
                className={`${PASTILLA} ${destino === d ? PASTILLA_ON : PASTILLA_OFF}`}
              >
                {ETIQUETA_DESTINO[d]}
              </button>
            ))}
          </div>
        )}

        {!conCliente ? (
          <button
            type="button"
            onClick={() => setConCliente(true)}
            className={`${PASTILLA} ${PASTILLA_OFF}`}
          >
            + Cliente
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <ClientePicker
                id="recordatorio-rapido-cliente"
                value={cliente}
                codigo={clienteCodigo}
                onChange={(nombre, codigo) => {
                  setCliente(nombre);
                  setClienteCodigo(codigo);
                }}
                inputClassName="w-full border-b border-gray-200 py-2 text-base sm:text-sm outline-none bg-transparent focus:border-black transition min-h-[44px]"
              />
            </div>
            <button
              type="button"
              aria-label="Quitar cliente"
              onClick={() => {
                setConCliente(false);
                setCliente("");
                setClienteCodigo("");
              }}
              className="text-sm text-gray-400 hover:text-black min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Lo que falta va DEBAJO del botón apagado, no en un toast: enterarse
          después de tocar es exactamente lo que este patrón evita. Y cuando lo
          que falta es la fecha, se dice POR QUÉ (el aviso sale a las 9:00). */}
      {texto.trim() !== "" && falta.length > 0 && (
        <p
          data-linea-nueva-falta
          className={`mt-2 text-xs ${falta.includes(FALTA_FECHA_PASADA) ? "text-red-600" : "text-amber-700"}`}
        >
          {mensajeDeFalta(falta)}
        </p>
      )}
    </section>
  );
}

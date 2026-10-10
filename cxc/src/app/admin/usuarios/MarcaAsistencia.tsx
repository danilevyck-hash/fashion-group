"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * «MARCA ASISTENCIA» — el interruptor de Usuarios › Nuevo / Editar usuario
 * (9-oct-2026). Daniel: «debe de ser en Usuarios». Crear a una persona —marque
 * o no— se hace aquí. Prendido, se selecciona su colaborador si ya tiene ficha
 * o se llenan ahí mismo los datos mínimos de una ficha nueva; al guardar se
 * crean el usuario, la ficha, el horario y el vínculo, todo junto.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import CampoFecha from "@/components/ui/CampoFecha";
import { EMPRESAS_ASISTENCIA, etiquetaEmpresa } from "@/lib/asistencia/config";
import { DIAS_ELEGIBLES, DIAS_SEMANA_CORTO, ROTULO_DIAS } from "@/lib/asistencia/horario-configurable";
import { leerHora24 } from "@/lib/asistencia/hora-24";
import { ROTULO_MARCA_ASISTENCIA, type ValoresPorOmision } from "@/lib/asistencia/alta-colaborador";

export interface EstadoMarca {
  prendido: boolean;
  /** El código de una ficha que ya existe; vacío = colaborador nuevo. */
  colaborador: string;
  codigo: string;
  nombre: string;
  empresa: string;
  posicion: string;
  cedula: string;
  salario: string;
  fechaIngreso: string;
  entrada: string;
  salida: string;
  dias: number[];
  jornada: number;
}

export const MARCA_APAGADA: EstadoMarca = {
  prendido: false, colaborador: "", codigo: "", nombre: "", empresa: "", posicion: "", cedula: "",
  salario: "", fechaIngreso: "", entrada: "08:00", salida: "17:00", dias: [1, 2, 3, 4, 5], jornada: 40,
};

/** Lo que falta para poder guardar, en palabras. Vacío = completo. */
export function faltaEnMarca(m: EstadoMarca): string[] {
  if (!m.prendido || m.colaborador) return [];
  return [
    m.empresa === "" ? "la empresa" : null,
    m.codigo.trim() === "" ? "el código" : null,
    leerHora24(m.entrada) ? null : "la hora de entrada",
    leerHora24(m.salida) ? null : "la hora de salida",
  ].filter(Boolean) as string[];
}

/** El cuerpo `colaborador` del POST/PUT de usuarios, para una ficha nueva. */
export function cuerpoDeColaborador(m: EstadoMarca) {
  return {
    codigo: m.codigo.trim(), nombre: m.nombre.trim(), empresa: m.empresa, posicion: m.posicion.trim(),
    cedula: m.cedula.trim(), salarioMensual: m.salario.trim() === "" ? null : Number(m.salario),
    jornadaSemanal: m.jornada, fechaIngreso: m.fechaIngreso || null,
    horario: { entrada: leerHora24(m.entrada), salida: leerHora24(m.salida), diasLaborables: m.dias, entradaAfuera: null, salidaAfuera: null },
  };
}

const ROTULO = "text-xs font-medium text-gray-700 uppercase tracking-[0.08em] block mb-1.5";
const CAMPO = "w-full bg-white border border-gray-200 rounded-md px-3 py-3 text-base sm:text-sm placeholder:text-gray-400 focus:outline-none focus:border-gray-900 transition";

export default function MarcaAsistencia({ valor: m, onCambio, fichasLibres, nombreDelUsuario }: {
  valor: EstadoMarca;
  onCambio: (m: EstadoMarca) => void;
  /** Fichas activas sin usuario (más la de este usuario, si tiene). */
  fichasLibres: { codigo: string; nombre: string | null }[];
  nombreDelUsuario: string;
}) {
  const set = (c: Partial<EstadoMarca>) => onCambio({ ...m, ...c });
  const actual = useRef(m);
  actual.current = m;

  // Al seleccionar la empresa: el siguiente código libre de su serie y el
  // horario y la jornada más usados ahí. Todo queda visible y editable.
  const nueva = m.prendido && !m.colaborador;
  useEffect(() => {
    if (!nueva || !m.empresa) return;
    let vivo = true;
    fetch(`/api/asistencia/configuracion/siguiente-codigo?empresa=${encodeURIComponent(m.empresa)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { codigo?: string | null; porOmision?: ValoresPorOmision } | null) => {
        if (!vivo || !d) return;
        const p = d.porOmision;
        onCambio({
          ...actual.current,
          codigo: d.codigo ?? "",
          ...(p ? { entrada: p.entrada, salida: p.salida, dias: p.diasLaborables, jornada: p.jornadaSemanal } : {}),
        });
      })
      .catch(() => undefined);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nueva, m.empresa]);

  return (
    <div data-testid="usuario-marca-asistencia" className="rounded-lg border border-gray-200">
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-3">
        <span className="text-sm text-gray-900">{ROTULO_MARCA_ASISTENCIA}</span>
        <button type="button" role="switch" aria-checked={m.prendido} aria-label={ROTULO_MARCA_ASISTENCIA}
          onClick={() => set({ prendido: !m.prendido })}
          className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition ${m.prendido ? "bg-emerald-600" : "bg-gray-300"}`}>
          <span className={`inline-block h-[27px] w-[27px] rounded-full bg-white shadow transition ${m.prendido ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
        </button>
      </div>

      {m.prendido && (
        <div className="space-y-4 border-t border-gray-100 px-3 py-4">
          <div>
            <label htmlFor="usuario-colaborador-campo" className={ROTULO}>Colaborador</label>
            <select id="usuario-colaborador-campo" value={m.colaborador} className={CAMPO}
              onChange={(e) => set({ colaborador: e.target.value })}>
              <option value="">Nuevo colaborador</option>
              {m.colaborador && !fichasLibres.some((c) => c.codigo === m.colaborador) && (
                <option value={m.colaborador}>Código {m.colaborador}</option>
              )}
              {fichasLibres.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre || "Sin nombre"} · {c.codigo}</option>)}
            </select>
          </div>

          {nueva && (
            <>
              <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                <div>
                  <label htmlFor="marca-empresa" className={ROTULO}>Empresa</label>
                  <select id="marca-empresa" value={m.empresa} className={CAMPO} onChange={(e) => set({ empresa: e.target.value })}>
                    <option value="">Seleccionar</option>
                    {EMPRESAS_ASISTENCIA.map((e) => <option key={e} value={e}>{etiquetaEmpresa(e)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="marca-codigo" className={ROTULO}>Código</label>
                  <input id="marca-codigo" value={m.codigo} inputMode="numeric" className={`${CAMPO} tabular-nums`}
                    onChange={(e) => set({ codigo: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="marca-nombre" className={ROTULO}>Nombre completo</label>
                <input id="marca-nombre" value={m.nombre} placeholder={nombreDelUsuario} className={CAMPO}
                  onChange={(e) => set({ nombre: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="marca-cargo" className={ROTULO}>Cargo</label>
                  <input id="marca-cargo" value={m.posicion} className={CAMPO} onChange={(e) => set({ posicion: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="marca-cedula" className={ROTULO}>Cédula</label>
                  <input id="marca-cedula" value={m.cedula} className={CAMPO} onChange={(e) => set({ cedula: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="marca-salario" className={ROTULO}>Salario mensual</label>
                  <input id="marca-salario" value={m.salario} inputMode="decimal" className={`${CAMPO} tabular-nums`}
                    onChange={(e) => set({ salario: e.target.value })} />
                </div>
                <div>
                  <span className={ROTULO}>Fecha de ingreso</span>
                  <CampoFecha className={CAMPO} value={m.fechaIngreso} onChange={(e) => set({ fechaIngreso: e.target.value })} />
                </div>
              </div>
              <div role="group" aria-label="Horario">
                <span className={ROTULO}>Horario</span>
                <div className="flex items-center gap-1.5">
                  <input aria-label="Entrada" value={m.entrada} inputMode="numeric" placeholder="--:--"
                    className={`${CAMPO} w-[5.5rem] text-center tabular-nums`}
                    onChange={(e) => set({ entrada: e.target.value })}
                    onBlur={() => { const h = leerHora24(m.entrada); if (h) set({ entrada: h }); }} />
                  <span className="text-gray-400">→</span>
                  <input aria-label="Salida" value={m.salida} inputMode="numeric" placeholder="--:--"
                    className={`${CAMPO} w-[5.5rem] text-center tabular-nums`}
                    onChange={(e) => set({ salida: e.target.value })}
                    onBlur={() => { const h = leerHora24(m.salida); if (h) set({ salida: h }); }} />
                </div>
                <div role="group" aria-label={ROTULO_DIAS} className="mt-2 flex flex-wrap gap-1">
                  {DIAS_ELEGIBLES.map((d) => {
                    const on = m.dias.includes(d);
                    return (
                      <button key={d} type="button" aria-pressed={on}
                        onClick={() => {
                          if (on && m.dias.length === 1) return; // nunca se queda sin días
                          set({ dias: on ? m.dias.filter((x) => x !== d) : [...m.dias, d].sort((a, b) => a - b) });
                        }}
                        className={`min-h-[44px] min-w-[40px] rounded-md border px-2 text-[13px] transition active:scale-[0.97] ${
                          on ? "border-black bg-black text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"
                        }`}>
                        {DIAS_SEMANA_CORTO[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

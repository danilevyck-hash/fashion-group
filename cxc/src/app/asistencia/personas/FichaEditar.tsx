"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * EL FORMULARIO CORTO — Datos · Pago · Excepciones (plegado) · Guardar.
 *
 * 🔴 Daniel: *«para editar una info como seguros, que sea con Editar»*. Se abre
 * con un botón y se cierra con Guardar o Cancelar: no se guarda solo.
 *
 * 🩸 POR QUÉ ACÁ SÍ HAY BOTÓN DE GUARDAR, SI EL RESTO DEL SISTEMA GUARDA SOLO.
 * Guardar-al-tocar está bien cuando lo que se toca es UN dato suelto (el
 * horario, una casilla). Acá se abre a propósito para cambiar algo y hay once
 * campos delante: sin un cierre explícito, «se le quitan los seguros» y «me
 * equivoqué de fila» son el mismo gesto y no hay forma de arrepentirse. Por eso
 * también hay Cancelar, que es la mitad que de verdad faltaba.
 *
 * 🔴 LAS EXCEPCIONES VAN PLEGADAS. Son cinco preguntas que casi nunca se
 * contestan (36 de 37 fichas no tienen ninguna): abiertas, pesan lo mismo que
 * el nombre y el salario. Se abren solas cuando la persona YA tiene alguna —
 * esconder algo que está prendido sería esconder justo lo que hay que revisar.
 *
 * 🔴 EL CUERPO QUE SE MANDA ES EL DE SIEMPRE. Este formulario no estrena ningún
 * endpoint: `PUT /api/asistencia/configuracion`, con los mismos nombres de
 * campo que la pantalla de hoy. El validador del servidor sigue siendo el único
 * que decide qué es válido.
 * ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

import { EMPRESAS_ASISTENCIA, etiquetaEmpresa, JORNADAS } from "@/lib/asistencia/config";
import {
  ETIQUETA_EN_PLANILLA,
  ETIQUETA_SERVICIO_PROFESIONAL,
  PREGUNTA_PARTICIPACION,
} from "@/lib/asistencia/participacion";
import {
  ETIQUETA_PAGA_SEGUROS,
  ETIQUETA_SIN_SEGUROS,
  PREGUNTA_SEGUROS,
} from "@/lib/asistencia/seguros";
import {
  AYUDA_BASE_SEGUROS,
  PLACEHOLDER_BASE_SEGUROS,
  PREGUNTA_BASE_SEGUROS,
} from "@/lib/asistencia/seguros-base";
import {
  ETIQUETA_MARCA_RELOJ,
  ETIQUETA_NO_MARCA_RELOJ,
  PREGUNTA_MARCA_RELOJ,
} from "@/lib/asistencia/sueldo-fijo";
import { ETIQUETA_SALDO_INICIAL } from "@/lib/asistencia/saldo-vacaciones";
import { MOTIVOS_SALIDA, OPCION_MOTIVO } from "@/lib/asistencia/vigencia";
import CedulaFoto from "./CedulaFoto";
import type { PermisosDeLaPagina, PersonaDeLaPagina } from "./tipos";

export interface BorradorFicha {
  codigo: string;
  nombre: string;
  posicion: string;
  cedula: string;
  empresa: string;
  fechaIngreso: string;
  salario: string;
  jornada: number;
  saldoVacaciones: string;
  servicioProfesional: boolean;
  pagaSeguros: boolean;
  baseSeguros: string;
  noMarcaReloj: boolean;
  fechaSalida: string;
  motivoSalida: string;
}

/** El borrador que sale de una ficha. Una ficha nueva arranca en los defaults
 *  de siempre: paga seguros, marca el reloj, va en planilla. */
export function borradorDe(p: PersonaDeLaPagina | null, codigo: string): BorradorFicha {
  return {
    codigo: p?.codigo ?? codigo,
    nombre: p?.nombre ?? "",
    posicion: p?.posicion ?? "",
    cedula: p?.cedula ?? "",
    empresa: p?.empresa ?? "",
    fechaIngreso: p?.fechaIngreso ?? "",
    salario: p?.salarioMensual === null || p?.salarioMensual === undefined ? "" : String(p.salarioMensual),
    jornada: p?.jornadaSemanal ?? 40,
    saldoVacaciones: p?.saldoVacacionesDias === null || p?.saldoVacacionesDias === undefined
      ? "" : String(p.saldoVacacionesDias),
    servicioProfesional: p?.servicioProfesional ?? false,
    pagaSeguros: p?.pagaSeguros ?? true,
    baseSeguros: p?.baseSeguros === null || p?.baseSeguros === undefined ? "" : String(p.baseSeguros),
    noMarcaReloj: p?.noMarcaReloj ?? false,
    fechaSalida: p?.fechaSalida ?? "",
    motivoSalida: p?.motivoSalida ?? "",
  };
}

/** ¿Esta ficha tiene alguna excepción prendida? Decide si el bloque abre solo. */
function tieneExcepciones(b: BorradorFicha): boolean {
  return b.servicioProfesional || !b.pagaSeguros || b.baseSeguros.trim() !== "" || b.noMarcaReloj;
}

const CAMPO =
  "min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm";

export default function FichaEditar({
  borrador: b, onCambio, onGuardar, onCancelar, guardando, nueva, permisos, puedeEditar, onCambioFoto,
}: {
  borrador: BorradorFicha;
  onCambio: (b: BorradorFicha) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  guardando: boolean;
  nueva: boolean;
  permisos: PermisosDeLaPagina | null;
  puedeEditar: boolean;
  onCambioFoto: () => void;
}) {
  const [verExcepciones, setVerExcepciones] = useState(() => tieneExcepciones(b));
  const [verBaja, setVerBaja] = useState(false);
  const set = (cambio: Partial<BorradorFicha>) => onCambio({ ...b, ...cambio });

  // 🔑 Se dice QUÉ FALTA en vez de apagar el botón sin explicación. El servidor
  // exige nombre y empresa; el salario hace falta para que salga en planilla.
  const faltan = [
    b.codigo.trim() === "" ? "el código" : null,
    b.nombre.trim() === "" ? "el nombre" : null,
    b.empresa === "" ? "la empresa" : null,
  ].filter(Boolean) as string[];
  const puedeGuardar = faltan.length === 0 && !guardando && puedeEditar;

  if (!puedeEditar) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Las fichas las editan Daniel y contabilidad.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <p className="border-b border-gray-100 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {nueva ? "Persona nueva" : "Editando su información"}
      </p>

      {/* ── DATOS ───────────────────────────────────────────────────────── */}
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        {nueva && (
          <Campo etiqueta="Código del reloj" ayuda="El número con el que marca. No se puede cambiar después.">
            <input className={CAMPO} value={b.codigo} inputMode="numeric"
              onChange={(e) => set({ codigo: e.target.value })} />
          </Campo>
        )}
        <Campo etiqueta="Nombre">
          <input className={CAMPO} value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="Cargo" ayuda="Sale impreso en el comprobante de pago. No toca el cálculo.">
          <input className={CAMPO} value={b.posicion} onChange={(e) => set({ posicion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Cédula" ayuda="Va en el pie del comprobante.">
          <input className={CAMPO} value={b.cedula} onChange={(e) => set({ cedula: e.target.value })} />
        </Campo>
        <Campo etiqueta="Empresa">
          <select className={CAMPO} value={b.empresa} onChange={(e) => set({ empresa: e.target.value })}>
            <option value="">Elige la empresa</option>
            {EMPRESAS_ASISTENCIA.map((e) => (
              <option key={e} value={e}>{etiquetaEmpresa(e)}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Empezó" ayuda="Su primer día. Sirve para el saldo de vacaciones.">
          <input type="date" className={CAMPO} value={b.fechaIngreso}
            onChange={(e) => set({ fechaIngreso: e.target.value })} />
        </Campo>
      </div>

      {/* La foto de la cédula se sube acá mismo, sin salir del formulario, y se
          guarda sola: es un archivo, no un campo del PUT. */}
      {!nueva && (
        <div className="border-t border-gray-100 px-4 py-3">
          <CedulaFoto codigo={b.codigo} puedeCambiar onCambio={onCambioFoto} />
        </div>
      )}

      {/* ── PAGO ────────────────────────────────────────────────────────── */}
      <p className="border-t border-gray-100 px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        Pago
      </p>
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <Campo etiqueta="Salario mensual">
          <input className={CAMPO} value={b.salario} inputMode="decimal"
            onChange={(e) => set({ salario: e.target.value })} />
        </Campo>
        <Campo etiqueta="Jornada">
          <select className={CAMPO} value={b.jornada}
            onChange={(e) => set({ jornada: Number(e.target.value) })}>
            {JORNADAS.map((j) => (
              <option key={j} value={j}>{j} h/semana</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={ETIQUETA_SALDO_INICIAL}
          ayuda={permisos && !permisos.puedeCargarSaldoVacaciones
            ? "Todavía no se puede cargar: falta correr el archivo de la base."
            : "Los días que le quedan HOY. La fecha de corte la pone el sistema."}>
          <input className={CAMPO} value={b.saldoVacaciones} inputMode="decimal"
            disabled={!!permisos && !permisos.puedeCargarSaldoVacaciones}
            onChange={(e) => set({ saldoVacaciones: e.target.value })} />
        </Campo>
      </div>

      {/* ── EXCEPCIONES (plegadas) ──────────────────────────────────────── */}
      <div className="border-t border-gray-100">
        <button type="button" onClick={() => setVerExcepciones((v) => !v)}
          aria-expanded={verExcepciones}
          className="flex min-h-[44px] w-full items-center justify-between px-4 text-left text-sm text-gray-700 transition hover:bg-gray-50">
          <span>Excepciones</span>
          <span className="text-gray-400">{verExcepciones ? "−" : "+"}</span>
        </button>

        {verExcepciones && (
          <div className="grid gap-3 border-t border-gray-100 px-4 py-3 sm:grid-cols-2">
            <Campo etiqueta={PREGUNTA_PARTICIPACION}>
              <select className={CAMPO} value={b.servicioProfesional ? "servicio" : "planilla"}
                disabled={!!permisos && !permisos.puedeMarcarServicioProfesional}
                onChange={(e) => set({ servicioProfesional: e.target.value === "servicio" })}>
                <option value="planilla">{ETIQUETA_EN_PLANILLA}</option>
                <option value="servicio">{ETIQUETA_SERVICIO_PROFESIONAL}</option>
              </select>
            </Campo>
            <Campo etiqueta={PREGUNTA_SEGUROS}>
              <select className={CAMPO} value={b.pagaSeguros ? "si" : "no"}
                disabled={!!permisos && !permisos.puedeQuitarSeguros}
                onChange={(e) => set({ pagaSeguros: e.target.value === "si" })}>
                <option value="si">{ETIQUETA_PAGA_SEGUROS}</option>
                <option value="no">{ETIQUETA_SIN_SEGUROS}</option>
              </select>
            </Campo>
            <Campo etiqueta={PREGUNTA_BASE_SEGUROS} ayuda={AYUDA_BASE_SEGUROS}>
              <input className={CAMPO} value={b.baseSeguros} inputMode="decimal"
                placeholder={PLACEHOLDER_BASE_SEGUROS}
                disabled={!!permisos && !permisos.puedeCargarBaseSeguros}
                onChange={(e) => set({ baseSeguros: e.target.value })} />
            </Campo>
            <Campo etiqueta={PREGUNTA_MARCA_RELOJ}>
              <select className={CAMPO} value={b.noMarcaReloj ? "no" : "si"}
                disabled={!!permisos && !permisos.puedeMarcarSueldoFijo}
                onChange={(e) => set({ noMarcaReloj: e.target.value === "no" })}>
                <option value="si">{ETIQUETA_MARCA_RELOJ}</option>
                <option value="no">{ETIQUETA_NO_MARCA_RELOJ}</option>
              </select>
            </Campo>
            {/* ⚠️ LO DE TERCEROS NO ESTÁ ACÁ A PROPÓSITO. El monto y la cuota
                de un descuento a terceros viven en la ficha de PRÉSTAMOS, que
                tiene su propia tabla y sus propias reglas — se cargan en la
                sección Préstamos de esta misma página. Tenerlos en los dos
                lados sería el mismo dato guardado dos veces, que es cómo se
                llega a dos números que no cuadran. */}
          </div>
        )}
      </div>

      {/* ── GUARDAR / CANCELAR ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3">
        <button type="button" disabled={!puedeGuardar} onClick={onGuardar}
          className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-40">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onCancelar}
          className="min-h-[44px] rounded-md border border-gray-300 px-4 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
          Cancelar
        </button>
        {faltan.length > 0 && (
          <span className="text-[13px] text-amber-800">
            Falta {faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(", ")} y ${faltan.at(-1)}`}.
          </span>
        )}
      </div>

      {/* ── DAR DE BAJA (plegado, y chico) ──────────────────────────────── */}
      {!nueva && (
        <div className="border-t border-gray-100 px-4 py-2.5">
          <button type="button" onClick={() => setVerBaja((v) => !v)} aria-expanded={verBaja}
            className="min-h-[44px] text-[13px] text-gray-400 underline-offset-2 transition hover:text-gray-700 hover:underline">
            Dar de baja…
          </button>
          {verBaja && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Su último día">
                <input type="date" className={CAMPO} value={b.fechaSalida}
                  disabled={!!permisos && !permisos.puedeDarDeBaja}
                  onChange={(e) => set({ fechaSalida: e.target.value })} />
              </Campo>
              <Campo etiqueta="Qué pasó">
                <select className={CAMPO} value={b.motivoSalida}
                  disabled={!!permisos && !permisos.puedeDarDeBaja}
                  onChange={(e) => set({ motivoSalida: e.target.value })}>
                  <option value="">Elige el motivo</option>
                  {MOTIVOS_SALIDA.map((m) => (
                    <option key={m} value={m}>{OPCION_MOTIVO[m]}</option>
                  ))}
                </select>
              </Campo>
              <p className="text-[12px] text-gray-500 sm:col-span-2">
                {/* 🔴 NO HAY BOTÓN DE BORRAR, y nunca lo va a haber: borrar la
                    ficha se lleva el nombre, el salario y la empresa, o sea
                    todo lo que hace falta para volver a armar una quincena
                    vieja. Se da de baja con fecha y motivo, y se guarda con el
                    mismo botón Guardar de arriba. */}
                Los dos juntos, o ninguno. Sus quincenas viejas no se tocan: deja
                de salir en las que vienen.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }: {
  etiqueta: string; ayuda?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {etiqueta}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-[11.5px] text-gray-400">{ayuda}</span>}
    </label>
  );
}

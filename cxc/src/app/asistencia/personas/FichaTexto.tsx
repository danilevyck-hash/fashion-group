"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA FICHA, COMO TEXTO — y un botón «Editar» que se ve.
 *
 * 🔴 Daniel, textual: *«para editar una info como seguros, que sea con
 * Editar»*. No es tocar-para-editar: es un botón, a la vista, con su rótulo.
 *
 * 🩸 POR QUÉ NO ES UN FORMULARIO PERMANENTE. La pantalla de hoy despliega once
 * campos editables y guarda solo al cambiarlos. Eso está bien para LLENAR una
 * ficha —que es lo que se estaba haciendo cuando se construyó— y mal para
 * MIRARLA, que es lo que se hace el otro 99% de las veces: once cajas de texto
 * pesan todas lo mismo, y diez de ellas no se tocan nunca.
 *
 * 🔴 LO RARO SE VE; LO NORMAL NO SE DIBUJA. Las etiquetas de excepción las
 * decide `excepcionesDeLaFicha` (módulo puro): una ficha normal no muestra
 * ninguna, y por eso cuando aparece una se mira.
 * ────────────────────────────────────────────────────────────────────────── */

import { fmtDate } from "@/lib/format";
import {
  datosDeLaFicha,
  excepcionesDeLaFicha,
  SIN_DATO,
} from "@/lib/asistencia/ficha-persona";
import CedulaFoto from "./CedulaFoto";
import type { PersonaDeLaPagina } from "./tipos";

export default function FichaTexto({
  persona, codigo, puedeEditar, onEditar, onIgnorar,
}: {
  persona: PersonaDeLaPagina | null;
  codigo: string;
  puedeEditar: boolean;
  onEditar: () => void;
  onIgnorar: () => void;
}) {
  if (!persona) {
    // 🔑 Un código que marca en el reloj y NO tiene ficha es un caso real y
    // frecuente (6 de 38 el día que esto se escribió). Se dice qué es y qué
    // hacer, nunca «no encontrado».
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-900">Este código todavía no tiene ficha.</p>
        <p className="mt-1 text-[13px] text-gray-500">
          Marca en el reloj, pero no sale en la planilla hasta que se le carguen
          el nombre, la empresa y el salario.
        </p>
        {puedeEditar && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onEditar}
              className="min-h-[44px] rounded-md bg-black px-3 text-sm text-white transition active:scale-[0.97]">
              Llenar la ficha
            </button>
            <button type="button" onClick={onIgnorar}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
              Ignorar este código
            </button>
          </div>
        )}
      </div>
    );
  }

  const datos = datosDeLaFicha(persona, fmtDate);
  const excepciones = excepcionesDeLaFicha(persona);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Su información
        </p>
        <div className="flex flex-wrap gap-2">
          {puedeEditar && (
            <button type="button" onClick={onEditar}
              className="min-h-[44px] rounded-md bg-black px-3 text-sm text-white transition active:scale-[0.97]">
              Editar
            </button>
          )}
          {puedeEditar && (
            <button type="button" onClick={onIgnorar} title="Deja de salir en las listas. No borra nada."
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-600 transition hover:border-black hover:text-black active:scale-[0.97]">
              Ignorar este código
            </button>
          )}
        </div>
      </div>

      {/* Las etiquetas de excepción, arriba de todo: es lo que hay que ver
          antes de leer un número. Sin excepciones, esta fila no existe. */}
      {excepciones.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-4 py-2.5">
          {excepciones.map((e) => (
            <span key={e.clave} title={e.ayuda}
              className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                e.ojo ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-600"
              }`}>
              {e.texto}
            </span>
          ))}
        </div>
      )}

      {/* Texto, no cajas. Dos columnas en el celular y tres de sm para arriba:
          son datos cortos y en una sola columna la ficha se vuelve una lista
          larga que hay que recorrer con el dedo. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-3">
        {datos.map((d) => (
          <div key={d.clave}>
            <dt className="text-[10.5px] uppercase tracking-wide text-gray-400">{d.etiqueta}</dt>
            <dd className={`text-sm ${d.valor === SIN_DATO ? "text-gray-300" : "text-gray-900"} ${
              d.numero ? "tabular-nums" : ""
            }`}>
              {d.valor}
            </dd>
          </div>
        ))}
      </dl>

      {/* La foto de la cédula: ver y descargar. Cambiarla es de quien edita. */}
      <div className="border-t border-gray-100 px-4 py-3">
        <CedulaFoto codigo={codigo} puedeCambiar={puedeEditar} />
      </div>
    </div>
  );
}

"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * «ANTES DE CERRAR» — cómo se dibuja la lista (11-sep-2026, mockup aprobado).
 *
 * La regla (qué líneas, con qué número, a dónde llevan) vive en
 * `lib/asistencia/antes-de-cerrar.ts`, que es puro. Acá solo se pinta: un
 * cuadro con encabezado, las líneas ámbar arriba (lo que hay que arreglar) y
 * las grises abajo (lo informativo). «Ver quiénes» abre los nombres de las horas
 * extra, cada uno con su enlace a su día en Aprobaciones.
 * ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import Link from "next/link";
import { TODO_LISTO, type AntesDeCerrar as Datos, type LineaAntesDeCerrar } from "@/lib/asistencia/antes-de-cerrar";

function Linea({ l }: { l: LineaAntesDeCerrar }) {
  const [verQuienes, setVerQuienes] = useState(false);
  const info = l.tono === "info";
  return (
    <li
      data-testid={l.clave === "extras" ? "aviso-extra-sin-aprobar" : undefined}
      className={`px-3 py-2 text-[13px] ${info ? "text-gray-500" : "text-gray-900"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0">
          <span aria-hidden className={`mr-2 inline-block h-[7px] w-[7px] rounded-full ${info ? "bg-gray-400" : "bg-amber-500"}`} />
          {l.numero !== null && <b className="tabular-nums">{l.numero}</b>}
          {l.numero !== null ? " " : ""}
          {l.texto}
          {l.personas && l.personas.length > 0 && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setVerQuienes((v) => !v)}
                className="min-h-[44px] text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-900"
              >
                {verQuienes ? "ocultar" : "ver quiénes"}
              </button>
            </>
          )}
        </span>
        {l.enlace && (
          <Link
            href={l.enlace.href}
            replace
            scroll={false}
            className="inline-flex min-h-[44px] shrink-0 items-center text-[12px] text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            {l.enlace.rotulo}
          </Link>
        )}
      </div>
      {verQuienes && l.personas && (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-4">
          {l.personas.map((p) => (
            <li key={p.codigo}>
              <Link
                href={p.href}
                replace
                scroll={false}
                className="inline-flex min-h-[44px] items-center gap-1 font-medium tabular-nums underline underline-offset-2 hover:text-amber-950"
              >
                {p.etiqueta} · {p.detalle}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AntesDeCerrar({ datos }: { datos: Datos }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-testid="antes-de-cerrar">
      <p className="border-b border-gray-200 px-3 py-2 text-sm font-medium text-gray-800">{datos.encabezado}</p>
      <ul className="divide-y divide-gray-100">
        {datos.todoListo && (
          <li className="px-3 py-2 text-[13px] text-emerald-800">
            <span aria-hidden className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-emerald-500" />
            {TODO_LISTO}
          </li>
        )}
        {datos.arreglar.map((l) => <Linea key={l.clave} l={l} />)}
        {datos.info.map((l) => <Linea key={l.clave} l={l} />)}
      </ul>
    </div>
  );
}

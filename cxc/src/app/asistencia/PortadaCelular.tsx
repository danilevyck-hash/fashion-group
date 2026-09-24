"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 1b — LA PORTADA DEL MÓDULO EN EL CELULAR (24-sep-2026).
 *
 * Daniel: *«debería ir como al home del módulo, ¿no? así en todos»*. Al entrar a
 * Asistencia desde el teléfono, las cinco pestañas se ven como una lista iOS,
 * una debajo de otra y con su número al lado. Tocar una fila ABRE esa pantalla.
 *
 * 🩸 Hasta hoy la barra de pestañas se arrastraba de lado en 356 px y la empresa
 * competía con ella por el mismo renglón; encima, al entrar se disparaba la
 * lectura de la primera pestaña sin que nadie hubiera elegido nada.
 *
 * 🔴 NINGUNA PANTALLA NUEVA: son las MISMAS cinco pestañas, con las mismas
 * claves. `?tab=` es una clave de PANTALLA (`useUrlState`), así que en el
 * celular empuja historial: el Atrás del navegador devuelve esta portada.
 *
 * 🔴 LOS NÚMEROS SON LOS DE VERDAD, o no hay número. Cada conteo sale de la
 * MISMA ruta que usa su pestaña; mientras viaja, la fila no dice nada. Nunca un
 * cero inventado.
 *
 * ⚠️ Lo que ESTO CUESTA, dicho: son tres o cuatro lecturas al abrir el módulo, y
 * la pestaña que se toque después vuelve a pedir lo suyo. Son lecturas: no
 * escriben nada y no cambian un centavo.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { hoyPanama } from "@/lib/fecha-panama";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import { resumenPendientes, type DiaAprobacion } from "@/lib/asistencia/aprobaciones";
import { hm } from "@/lib/asistencia/aprobaciones-vistas";
import {
  PORTADA_EMPRESA, PORTADA_PANTALLAS, filasDeLaPortada, type ConteosPortada,
} from "@/lib/asistencia/celular-asistencia";
import { rotuloDelPeriodo } from "@/lib/asistencia/pantalla-2026-09";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortadaCelular({
  pestanas, empresa, opciones, onEmpresa, desde, hasta, onAbrir,
}: {
  pestanas: readonly (readonly [string, string])[];
  empresa: string;
  opciones: readonly { clave: string; etiqueta: string }[];
  onEmpresa: (e: string) => void;
  desde: string;
  hasta: string;
  onAbrir: (tab: string) => void;
}) {
  const [conteos, setConteos] = useState<ConteosPortada>({
    colaboradores: null, sinFicha: null, personasDelReporte: null, ausencias: null,
    porDecidir: null, horasPorDecidir: null, quincenaCerrada: null,
    conDeuda: null, deudaTotal: null,
  });

  useEffect(() => {
    let vivo = true;
    const emp = empresaParaPedir(empresa);
    const q = new URLSearchParams({ desde, hasta });
    if (emp) q.set("empresa", emp);

    /** Los colaboradores y cuántos no tienen ficha. La MISMA ruta de la pestaña. */
    void (async () => {
      try {
        const r = await fetch("/api/asistencia/configuracion", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { resumen?: { total?: number; sinConfigurar?: number } };
        if (!vivo) return;
        setConteos((c) => ({
          ...c,
          colaboradores: j.resumen?.total ?? null,
          sinFicha: j.resumen?.sinConfigurar ?? null,
        }));
      } catch { /* sin número, la fila no dice nada */ }
    })();

    /** Las horas extra por decidir. La MISMA lectura de Aprobaciones. */
    void (async () => {
      try {
        const p = new URLSearchParams(q);
        p.set("aprobaciones", "1");
        const r = await fetch(`/api/asistencia/planilla?${p}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { aprobaciones?: DiaAprobacion[] };
        if (!vivo) return;
        const { pendientes, minutos } = resumenPendientes(j.aprobaciones ?? []);
        setConteos((c) => ({
          ...c,
          porDecidir: pendientes,
          horasPorDecidir: pendientes > 0 ? `${hm(minutos)} h` : null,
        }));
      } catch { /* sin número, la fila no dice nada */ }
    })();

    /** Quién debe. La MISMA lectura de Préstamos. */
    void (async () => {
      try {
        const r = await fetch(`/api/asistencia/prestamos-deuda?${new URLSearchParams({ desde, hasta })}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { fichas?: { empresa?: string | null; saldo?: number }[] };
        if (!vivo) return;
        // 🔑 El MISMO filtro por empresa que la pestaña, y el MISMO campo de
        // saldo. Acá no se recalcula nada: se suman los saldos que ya vienen.
        const fichas = (j.fichas ?? []).filter((f) => !emp || f.empresa === emp);
        const total = fichas.reduce((a, f) => a + (f.saldo ?? 0), 0);
        setConteos((c) => ({
          ...c,
          conDeuda: fichas.length,
          deudaTotal: fichas.length > 0 ? money(total) : null,
        }));
      } catch { /* sin número, la fila no dice nada */ }
    })();

    /** ¿Esta quincena ya está cerrada? Solo con UNA empresa elegida. */
    if (emp) {
      void (async () => {
        try {
          const r = await fetch(`/api/asistencia/planilla-guardada?${q}`, { cache: "no-store" });
          if (!r.ok) return;
          const j = (await r.json()) as { cerrada?: { estado?: string } | null };
          if (!vivo) return;
          setConteos((c) => ({ ...c, quincenaCerrada: j.cerrada?.estado === "cerrada" }));
        } catch { /* sin dato, la fila no dice nada */ }
      })();
    }

    return () => { vivo = false; };
  }, [empresa, desde, hasta]);

  const filas = filasDeLaPortada(pestanas, conteos);

  return (
    <div className="space-y-5 pb-8">
      <header>
        <h2 className="text-[28px] font-semibold tracking-tight text-gray-900">Asistencia</h2>
        <p className="text-[15px] text-gray-500">{rotuloDelPeriodo(desde, hasta) || hoyPanama()}</p>
      </header>

      <section>
        <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {PORTADA_EMPRESA}
        </p>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <label className="flex min-h-[52px] items-center justify-between gap-3 px-3">
            <span className="sr-only">Empresa</span>
            <select
              aria-label="Empresa"
              value={empresa}
              onChange={(e) => onEmpresa(e.target.value)}
              className="min-h-[44px] w-full bg-transparent text-[15px] text-gray-900 outline-none"
            >
              {opciones.map((o) => (
                <option key={o.clave} value={o.clave}>{o.etiqueta}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {PORTADA_PANTALLAS}
        </p>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {filas.map((f) => (
            <button
              key={f.clave}
              type="button"
              onClick={() => onAbrir(f.clave)}
              className="flex min-h-[56px] w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition last:border-0 active:bg-gray-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-gray-900">{f.rotulo}</span>
                {f.detalle && (
                  <span className={`block text-[13px] ${f.urgente ? "text-amber-700" : "text-gray-500"}`}>
                    {f.detalle}
                  </span>
                )}
              </span>
              {f.cuenta && (
                <span className={`shrink-0 text-[15px] tabular-nums ${f.urgente ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                  {f.cuenta}
                </span>
              )}
              <span aria-hidden className="shrink-0 text-gray-300">›</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

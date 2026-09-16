"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * «OTROS SERVICIOS» — lo que se le suma al neto, con su porqué (15-sep-2026).
 *
 * Daniel, textual: *«debería de haber un campo en la ficha que diga "otros
 * servicios", y a qué quincena se le aplica ese extra»* · *«que sea como está,
 * el total, ya el detalle debería estar en el perfil»*.
 *
 * 🔴 CADA RENGLÓN: MONTO · CONCEPTO. Y nada más (más quién lo anotó).
 *
 * 🔴 NO SE ELIGE FECHA NI QUINCENA. Daniel: *«se anota el día que se hace la
 * gestión y entra en esa quincena, sin elegir fecha»*. La fecha la pone el
 * SERVIDOR con el día de Panamá, así que siempre cae en la quincena abierta.
 * Acá no hay ni un campo de fecha, a propósito.
 *
 * ⚠️ Con la quincena YA CERRADA un renglón no se quita: el servidor lo rechaza
 * con 409 y el texto lo dice. Acá no se esconde el botón — que un guard rechace
 * se DICE en pantalla.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastSystem";
import { fmtDate } from "@/lib/format";
import {
  faltaParaGuardar,
  resumenSeccion,
  type OtroServicio,
} from "@/lib/asistencia/otros-servicios";
import Seccion, { Vacio } from "./Seccion";

export default function SeccionOtrosServicios({ codigo, refresco }: {
  codigo: string; refresco: number;
}) {
  const { toast } = useToast();
  const [lista, setLista] = useState<OtroServicio[]>([]);
  const [faltaMigracion, setFaltaMigracion] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const leer = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/asistencia/otros-servicios?codigo=${encodeURIComponent(codigo)}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      setLista((d.renglones ?? []) as OtroServicio[]);
      setFaltaMigracion(d.faltaMigracion ?? null);
    } catch {
      setLista([]);
    }
  }, [codigo]);

  useEffect(() => { void leer(); }, [leer, refresco]);

  // 🔴 Lo que falta para poder guardar, DICHO. Misma idea que «Falta: la cuota»
  // en Préstamos: un botón apagado sin explicación es un botón roto.
  const falta = faltaParaGuardar(monto, concepto);

  async function guardar() {
    if (falta || guardando) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/asistencia/otros-servicios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, monto: Number(monto), concepto }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      toast("Listo, guardado", "success");
      setMonto(""); setConcepto(""); setAbierto(false);
      await leer();
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "No se pudo guardar. Intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: string) {
    if (!window.confirm("¿Quitar este renglón?")) return;
    try {
      const r = await fetch(`/api/asistencia/otros-servicios?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "");
      toast("Listo, quitado", "success");
      await leer();
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "No se pudo quitar. Intenta de nuevo.", "error");
    }
  }

  return (
    <Seccion
      titulo="Otros servicios"
      resumen={resumenSeccion(lista)}
      boton={faltaMigracion ? null : abierto ? "Cerrar" : "+ Otro servicio"}
      onBoton={() => setAbierto((v) => !v)}
    >
      {/* ⚠️ Sin la migración corrida no se esconde la sección: se dice qué falta
          y con qué archivo se arregla. Nadie deduce un DDL de una sección que
          no está. */}
      {faltaMigracion && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {faltaMigracion}
        </p>
      )}

      {abierto && !faltaMigracion && (
        <div className="mb-3 rounded-md border border-gray-200 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">Monto</span>
              <input
                type="text" inputMode="decimal" value={monto}
                onChange={(e) => setMonto(e.target.value)}
                aria-label="Monto"
                placeholder="0.00"
                className="min-h-[44px] w-28 rounded-lg border border-gray-200 px-3 text-right text-base tabular-nums outline-none transition focus:border-black sm:text-sm"
              />
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-[11px] text-gray-500">Concepto</span>
              <input
                type="text" value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                aria-label="Concepto"
                placeholder="Mensajería y flete"
                className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
              />
            </label>
            <button
              type="button" onClick={() => void guardar()}
              disabled={!!falta || guardando}
              title={falta ?? undefined}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {/* 🔴 Se DICE qué falta, visible y no solo en el `title`: en el iPad
              no hay mouse. */}
          {falta && (
            <p data-testid="falta-otro-servicio" className="mt-1.5 text-[12px] text-gray-500">{falta}</p>
          )}
          {/* 🔑 Y se dice a qué quincena va, porque no se elige. */}
          <p className="mt-1.5 text-[12px] text-gray-500">
            Se anota con la fecha de hoy y entra en la quincena que está abierta.
          </p>
        </div>
      )}

      {lista.length === 0 ? (
        <Vacio texto="Todavía no tiene nada esta quincena." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {lista.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-gray-900">
                  <span className="tabular-nums">${s.monto.toFixed(2)}</span> · {s.concepto}
                </span>
                <span className="block text-[12px] text-gray-500">
                  {fmtDate(s.fecha)}{s.anotadoPor ? ` · lo anotó ${s.anotadoPor}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => void quitar(s.id)}
                className="min-h-[44px] shrink-0 px-2 text-[13px] text-gray-400 transition hover:text-gray-900">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

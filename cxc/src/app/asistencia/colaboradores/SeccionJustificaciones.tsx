"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * SUS JUSTIFICACIONES — y «+ Justificar» con ella ya puesta.
 *
 * 🔴 EL MISMO FORMULARIO Y EL MISMO ENDPOINT DE SIEMPRE
 * (`POST /api/asistencia/justificaciones`), con UN campo menos: el selector de
 * persona. Acá la persona es el contexto, así que elegirla sería pedir dos
 * veces lo mismo — y es el campo donde se equivoca quien justifica de apuro.
 *
 * ⚠️ La lista de TODAS las justificaciones del período no desaparece: vive en
 * Reporte, que es donde explican las ausencias que ahí se ven.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastSystem";
import RangoFechas from "@/components/ui/RangoFechas";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import Seccion, { Vacio } from "./Seccion";

interface Justificacion {
  id: string;
  empleado_codigo: string;
  desde: string;
  hasta: string;
  motivo: string;
  nota: string | null;
}

export default function SeccionJustificaciones({ codigo, refresco }: {
  codigo: string; refresco: number;
}) {
  const { toast } = useToast();
  const [lista, setLista] = useState<Justificacion[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyPanama();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");

  const leer = useCallback(async () => {
    try {
      const r = await fetch("/api/asistencia/justificaciones", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      const todas = (d.justificaciones ?? []) as Justificacion[];
      // 🔑 Se filtra por CÓDIGO, nunca por nombre.
      setLista(todas.filter((j) => String(j.empleado_codigo) === String(codigo)));
      setMotivos((d.motivos ?? []) as string[]);
      setMotivo((m) => m || ((d.motivos ?? [])[0] ?? ""));
    } catch {
      setLista([]);
    }
  }, [codigo]);

  useEffect(() => { void leer(); }, [leer, refresco]);

  async function agregar() {
    setGuardando(true);
    try {
      const r = await fetch("/api/asistencia/justificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, desde, hasta, motivo, nota }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      setAbierto(false);
      setNota("");
      await leer();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: string) {
    if (!window.confirm("¿Quitar esta justificación?")) return;
    try {
      const r = await fetch(`/api/asistencia/justificaciones?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("");
      toast("Listo, quitada", "success");
      await leer();
    } catch {
      toast("No se pudo quitar. Intenta de nuevo.", "error");
    }
  }

  return (
    <Seccion
      titulo="Justificaciones"
      resumen={lista.length === 0 ? "Ninguna cargada" : `${lista.length} cargada${lista.length === 1 ? "" : "s"}`}
      boton={abierto ? "Cerrar" : "+ Justificar"}
      onBoton={() => setAbierto((v) => !v)}
    >
      {abierto && (
        <div className="mb-3 grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Motivo</span>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-black sm:text-sm">
              {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <div>
            <RangoFechas desde={desde} hasta={hasta} label="Días"
              onChange={(d, h) => { setDesde(d); setHasta(h); }} />
          </div>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Nota (opcional)
            </span>
            <input value={nota} onChange={(e) => setNota(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-black sm:text-sm" />
          </label>
          <div className="sm:col-span-2">
            <button type="button" disabled={guardando || !motivo} onClick={() => void agregar()}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-40">
              {guardando ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <Vacio texto="Todavía no tiene justificaciones cargadas." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {lista.map((j) => (
            <li key={j.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-gray-900">{j.motivo}</span>
                <span className="block text-[12px] text-gray-500">
                  {fmtDate(j.desde)}{j.hasta !== j.desde ? ` al ${fmtDate(j.hasta)}` : ""}
                  {j.nota ? ` · ${j.nota}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => void quitar(j.id)}
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

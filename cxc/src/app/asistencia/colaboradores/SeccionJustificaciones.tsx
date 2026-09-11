"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * SUS JUSTIFICACIONES — y «+ Justificar» con ella ya puesta.
 *
 * 🔴 EL MISMO FORMULARIO Y EL MISMO ENDPOINT DE SIEMPRE
 * (`POST /api/asistencia/justificaciones`), con UN campo menos: el selector de
 * persona. Acá la persona es el contexto, así que elegirla sería pedir dos
 * veces lo mismo — y es el campo donde se equivoca quien justifica de apuro.
 *
 * 🔴 El formulario vive en `JustificarForm.tsx` desde el 11-sep-2026, porque
 * también lo abre «Justificar» en la fila del día de la pestaña Asistencia
 * (`JustificarDiaModal`). Acá arranca con HOY; allá, con ese día. Es UNO.
 *
 * ⚠️ La lista de TODAS las justificaciones del período no desaparece: vive en
 * Reporte, que es donde explican las ausencias que ahí se ven.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastSystem";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import Seccion, { Vacio } from "./Seccion";
import JustificarForm from "../JustificarForm";

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
  const [abierto, setAbierto] = useState(false);
  const hoy = hoyPanama();

  const leer = useCallback(async () => {
    try {
      const r = await fetch("/api/asistencia/justificaciones", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "");
      const todas = (d.justificaciones ?? []) as Justificacion[];
      // 🔑 Se filtra por CÓDIGO, nunca por nombre.
      setLista(todas.filter((j) => String(j.empleado_codigo) === String(codigo)));
    } catch {
      setLista([]);
    }
  }, [codigo]);

  useEffect(() => { void leer(); }, [leer, refresco]);

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
        <div className="mb-3">
          <JustificarForm
            codigo={codigo}
            desdeInicial={hoy}
            hastaInicial={hoy}
            onGuardado={() => { setAbierto(false); void leer(); }}
          />
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

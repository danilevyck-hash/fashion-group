"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * EL FORMULARIO DE JUSTIFICAR — uno solo, para la ficha y para la fila del día.
 *
 * 🔴 EL MISMO FORMULARIO Y EL MISMO ENDPOINT (`POST /api/asistencia/
 * justificaciones`) desde los DOS lugares: la sección «Justificaciones» de la
 * página del colaborador y el enlace «Justificar» de la fila del día en la
 * pestaña Asistencia (11-sep-2026). Salió de `SeccionJustificaciones` tal
 * cual —motivo, días, nota, «Agregar»—; lo único que cambia entre los dos es
 * con qué fechas ARRANCA: la ficha con hoy, la fila con ESE día.
 *
 * Sin selector de persona: acá la persona es el contexto, y ese es el campo
 * donde se equivoca quien justifica de apuro.
 * ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

import { useToast } from "@/components/ToastSystem";
import RangoFechas from "@/components/ui/RangoFechas";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";

export default function JustificarForm({
  codigo, desdeInicial, hastaInicial, onGuardado,
}: {
  codigo: string;
  /** Con qué días abre. La ficha pasa hoy; la fila del día pasa ese día. */
  desdeInicial: string;
  hastaInicial: string;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial);
  // 🔴 Los motivos salen de la MISMA lista que la ruta ofrece y acepta.
  const [motivo, setMotivo] = useState<string>(MOTIVOS_JUSTIFICACION[0] ?? "");
  const [nota, setNota] = useState("");

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
      setNota("");
      onGuardado();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Motivo</span>
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-black sm:text-sm">
          {MOTIVOS_JUSTIFICACION.map((m) => <option key={m} value={m}>{m}</option>)}
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
  );
}

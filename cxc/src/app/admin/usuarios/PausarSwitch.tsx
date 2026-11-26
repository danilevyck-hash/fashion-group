"use client";

// «Pausar Switch» (26-nov-2026, solo admin). Daniel escribe cuántas horas
// (máximo 24) y el sistema deja de entrar a Switch con su usuario mientras
// tanto. «Reanudar ahora» lo devuelve en el acto. Reglas: lib/switch-api/pausa.ts.

import { useState } from "react";
import { HORAS_MAX, HORAS_MIN, HORAS_SUGERIDAS, validarHoras } from "@/lib/switch-api/pausa";
import { avisarCambioPausa, usePausaSwitch, type EstadoPausa } from "@/components/shared/usePausaSwitch";

async function enviar(body: object): Promise<{ ok: true; estado: EstadoPausa } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/switch-pausa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, estado: j as EstadoPausa } : { ok: false, error: j?.error ?? "No se pudo guardar." };
  } catch {
    return { ok: false, error: "Sin conexión — intenta de nuevo." };
  }
}

export default function PausarSwitch() {
  const pausa = usePausaSwitch();
  const [horas, setHoras] = useState(String(HORAS_SUGERIDAS));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async (body: object) => {
    setGuardando(true);
    setError(null);
    const r = await enviar(body);
    setGuardando(false);
    if (r.ok) avisarCambioPausa(r.estado);
    else setError(r.error);
  };

  const pausar = () => {
    const v = validarHoras(horas);
    if (!v.ok) return setError(v.error);
    void ejecutar({ horas: v.horas });
  };

  return (
    <section aria-labelledby="pausar-switch" className="mb-6 rounded-lg border border-gray-200 p-3">
      <h2 id="pausar-switch" className="text-sm font-semibold text-gray-900">Acceso a Switch</h2>
      {pausa?.activa ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-800" role="status">{pausa.texto}</p>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void ejecutar({ accion: "reanudar" })}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white active:scale-[0.97] disabled:opacity-50"
          >
            {guardando ? "Reanudando…" : "Reanudar ahora"}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-600">
            Mientras dure la pausa, el sistema no entra a Switch ni cierra la sesión del panel. Al terminar, todo se actualiza solo.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-sm text-gray-700">
              Horas
              <input
                type="number"
                inputMode="decimal"
                min={HORAS_MIN}
                max={HORAS_MAX}
                step="0.5"
                value={horas}
                onChange={(e) => { setHoras(e.target.value); setError(null); }}
                className="ml-2 w-20 rounded-md border border-gray-300 px-2 py-2 text-sm tabular-nums"
              />
            </label>
            <button
              type="button"
              disabled={guardando}
              onClick={pausar}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white active:scale-[0.97] disabled:opacity-50"
            >
              {guardando ? "Pausando…" : "Pausar Switch"}
            </button>
            <span className="text-xs text-gray-500">Máximo {HORAS_MAX} horas.</span>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

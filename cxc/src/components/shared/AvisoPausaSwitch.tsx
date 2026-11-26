"use client";

// La línea que ve el admin en todas las pantallas mientras Switch está en
// pausa (26-nov-2026): «Switch en pausa hasta las 3:00 p. m. · Reanudar».
// Va en el encabezado (lo único que todas comparten). Sin pausa, no ocupa nada.

import { useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { avisarCambioPausa, usePausaSwitch, type EstadoPausa } from "./usePausaSwitch";

export default function AvisoPausaSwitch() {
  const pausa = usePausaSwitch();
  const [reanudando, setReanudando] = useState(false);
  if (!pausa?.activa) return null;

  const reanudar = async () => {
    setReanudando(true);
    try {
      const r = await fetch("/api/switch-pausa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reanudar" }),
      });
      if (r.ok) avisarCambioPausa((await r.json()) as EstadoPausa);
    } finally {
      setReanudando(false);
    }
  };

  return (
    <div data-switch-pausa className="px-4 py-2 sm:px-6">
      <Aviso tono="aviso" accion={{ texto: reanudando ? "Reanudando…" : "Reanudar", onClick: () => void reanudar(), disabled: reanudando }}>
        {pausa.texto}
      </Aviso>
    </div>
  );
}

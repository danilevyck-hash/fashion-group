"use client";

// ¿Switch está en pausa? (26-nov-2026). Una sola pregunta a /api/switch-pausa
// por pestaña cada minuto, compartida por todos los «Actualizar» de la
// pantalla. Pausar o reanudar desde Usuarios avisa con `avisarCambioPausa()`.

import { useEffect, useState } from "react";

export interface EstadoPausa {
  activa: boolean;
  hasta?: string;
  texto?: string;
}

const VIGENCIA_MS = 60_000;
const EVENTO = "fg-switch-pausa";
let ultimo: { valor: EstadoPausa; en: number } | null = null;
let enVuelo: Promise<EstadoPausa> | null = null;

async function preguntar(forzar = false): Promise<EstadoPausa> {
  if (!forzar && ultimo && Date.now() - ultimo.en < VIGENCIA_MS) return ultimo.valor;
  // En las pruebas no se pregunta a la red (cientos de pruebas cuentan los
  // fetch de su pantalla): vale lo que la prueba fije con `avisarCambioPausa`.
  if (process.env.NODE_ENV === "test") return ultimo?.valor ?? { activa: false };
  if (enVuelo) return enVuelo;
  enVuelo = fetch("/api/switch-pausa", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { activa: false }))
    .catch(() => ({ activa: false }))
    .then((v: EstadoPausa) => {
      ultimo = { valor: v, en: Date.now() };
      return v;
    })
    .finally(() => {
      enVuelo = null;
    });
  return enVuelo;
}

/** Tras pausar o reanudar: todas las piezas de la pestaña vuelven a preguntar. */
export function avisarCambioPausa(valor?: EstadoPausa): void {
  ultimo = valor ? { valor, en: Date.now() } : null;
  window.dispatchEvent(new Event(EVENTO));
}

/** `null` mientras no se sabe (se trata como «sin pausa»). */
export function usePausaSwitch(): EstadoPausa | null {
  const [estado, setEstado] = useState<EstadoPausa | null>(ultimo?.valor ?? null);
  useEffect(() => {
    let vivo = true;
    const leer = () => void preguntar().then((v) => vivo && setEstado(v));
    leer();
    const t = setInterval(leer, VIGENCIA_MS);
    window.addEventListener(EVENTO, leer);
    window.addEventListener("focus", leer);
    return () => {
      vivo = false;
      clearInterval(t);
      window.removeEventListener(EVENTO, leer);
      window.removeEventListener("focus", leer);
    };
  }, []);
  // Si el plazo ya pasó, no se espera a la próxima pregunta.
  if (estado?.activa && estado.hasta && Date.parse(estado.hasta) <= Date.now()) return { activa: false };
  return estado;
}

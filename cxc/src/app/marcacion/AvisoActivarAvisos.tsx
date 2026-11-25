"use client";

// «Activa los avisos» (19-nov-2026): arriba de la pantalla de marcar, mientras
// ESTE aparato no tenga la suscripción push activa. Sale cada vez que se abre
// la pantalla hasta que quede activo. El permiso se pide DENTRO del toque del
// botón (iOS lo exige): por eso la llave pública se trae antes, al montar.

import { useEffect, useState } from "react";
import { TEXTO_INSTALAR_EN_IPHONE } from "@/lib/marcacion/recordatorios";
import { leerEstadoDelAviso, suscribirEsteAparato, type EstadoDelAviso } from "@/lib/marcacion/push-cliente";

export const TEXTO_AVISOS_BLOQUEADOS = "Los avisos están bloqueados. Actívalos en Ajustes › Notificaciones";
export const TEXTO_ABRE_DESDE_EL_ICONO = "Abre la app desde el ícono de tu pantalla de inicio para activar los avisos";

/** Solo dibuja: los tres estados que se ven (`activo` no muestra nada). */
export function AvisoDeAvisos({
  estado,
  ocupado,
  error,
  onActivar,
}: {
  estado: EstadoDelAviso | null;
  ocupado?: boolean;
  error?: string | null;
  onActivar: () => void;
}) {
  if (!estado || estado === "activo") return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      {estado === "falta" && (
        <>
          <p className="text-[15px] text-gray-900">Avisos de marcación desactivados</p>
          <button
            type="button"
            disabled={ocupado}
            onClick={onActivar}
            className="mt-3 min-h-[44px] w-full rounded-xl bg-black text-[16px] font-medium text-white active:scale-[0.97] disabled:opacity-50"
          >
            {ocupado ? "Activando…" : "Activa los avisos"}
          </button>
        </>
      )}
      {estado === "bloqueado" && <p className="text-[15px] text-gray-900">{TEXTO_AVISOS_BLOQUEADOS}</p>}
      {estado === "no-puede" && <p className="text-[15px] text-gray-900">{TEXTO_ABRE_DESDE_EL_ICONO}</p>}
      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}

export default function AvisoActivarAvisos() {
  const [estado, setEstado] = useState<EstadoDelAviso | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const e = await leerEstadoDelAviso().catch(() => null);
      if (!vivo || !e) return;
      setEstado(e);
      if (e !== "falta") return;
      const j = await fetch("/api/marcacion/recordatorios", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (vivo) setClave(j?.clavePublica ?? null);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function activar() {
    setError(null);
    setOcupado(true);
    try {
      // Primera línea con await = el permiso se pide dentro del toque.
      const sub = await suscribirEsteAparato(clave);
      if (typeof sub === "string") {
        if (typeof Notification !== "undefined" && Notification.permission === "denied") return setEstado("bloqueado");
        return setError(sub === TEXTO_INSTALAR_EN_IPHONE ? TEXTO_ABRE_DESDE_EL_ICONO : sub);
      }
      const res = await fetch("/api/marcacion/recordatorios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suscripcion: sub }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudieron activar los avisos. Intenta de nuevo.");
      setEstado("activo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron activar los avisos. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return <AvisoDeAvisos estado={estado} ocupado={ocupado || (estado === "falta" && !clave)} error={error} onActivar={activar} />;
}

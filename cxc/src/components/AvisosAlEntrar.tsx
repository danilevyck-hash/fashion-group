"use client";

// «Activa los avisos» al entrar a la app, para TODOS (25-nov-2026,
// `AVISOS_AL_ENTRAR_2026_11`). Lo que se muestra lo decide `queOfrecer`
// (`lib/avisos/al-entrar.ts`). El permiso se pide DENTRO del toque del botón
// (iOS lo exige): por eso la llave pública se trae antes, al abrir la ventana.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import VentanaCentrada from "@/components/ui/VentanaCentrada";
import { esIphoneSinInstalar, leerEstadoDelAviso, suscribirEsteAparato } from "@/lib/marcacion/push-cliente";
import { TEXTO_INSTALAR_EN_IPHONE } from "@/lib/marcacion/recordatorios";
import { aparatoDeQuienMira } from "@/lib/aparato";
import { LLAVE_AVISOS_DECIDIDO, decididoReciente, queOfrecer, rutaSinAviso, AVISOS_AL_ENTRAR_2026_11 } from "@/lib/avisos/al-entrar";

const RUTA = "/api/avisos";

function leer(k: string): string | null {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function leerDecidido(): string | null {
  try { return localStorage.getItem(LLAVE_AVISOS_DECIDIDO); } catch { return null; }
}
function decidir() {
  try { localStorage.setItem(LLAVE_AVISOS_DECIDIDO, String(Date.now())); } catch { /* sin storage: vuelve a ofrecer */ }
}
/** Computadora o iPad (el iPad moderno se anuncia como Mac con pantalla táctil). */
function esComputadora(): boolean {
  if (aparatoDeQuienMira() === "computadora") return true;
  const ua = navigator.userAgent;
  return /iPad/.test(ua) || (/Mac/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

async function guardar(sub: PushSubscriptionJSON): Promise<void> {
  const r = await fetch(RUTA, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suscripcion: sub }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudieron activar los avisos. Intenta de nuevo.");
}

/** Solo dibuja: la ventana de «pedir» o la de «instalar». */
export function VentanaAvisos({
  modo,
  ocupado,
  error,
  onActivar,
  onAhoraNo,
}: {
  modo: "pedir" | "instalar";
  ocupado?: boolean;
  error?: string | null;
  onActivar: () => void;
  onAhoraNo: () => void;
}) {
  return (
    <VentanaCentrada
      open
      onClose={onAhoraNo}
      title="Activa los avisos"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onAhoraNo} className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 active:scale-[0.97]">
            {modo === "pedir" ? "Ahora no" : "Entendido"}
          </button>
          {modo === "pedir" && (
            <button type="button" disabled={ocupado} onClick={onActivar} className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white active:scale-[0.97] disabled:opacity-50">
              {ocupado ? "Activando…" : "Activar avisos"}
            </button>
          )}
        </div>
      }
    >
      <div className="px-5 py-4 text-[15px] text-gray-900">
        {modo === "pedir" ? (
          <p>Recibe en este teléfono los avisos de muestras pedidas, recordatorios de marcación y otros.</p>
        ) : (
          <>
            <p>Para recibir avisos en el iPhone, abre Fashion Group desde el ícono de la pantalla de inicio.</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-gray-700">
              <li>En Safari, toca <span className="font-medium">Compartir</span>.</li>
              <li>Toca <span className="font-medium">Agregar a pantalla de inicio</span>.</li>
              <li>Abre la app desde ese ícono y activa los avisos.</li>
            </ol>
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    </VentanaCentrada>
  );
}

export default function AvisosAlEntrar() {
  const pathname = usePathname();
  const [modo, setModo] = useState<"pedir" | "instalar" | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!AVISOS_AL_ENTRAR_2026_11 || modo || rutaSinAviso(pathname)) return;
    // Sin sesión (páginas públicas del catálogo) no hay a quién guardarle el aparato.
    if (!leer("cxc_role")) return;
    let vivo = true;
    (async () => {
      const estado = await leerEstadoDelAviso().catch(() => null);
      if (!vivo || !estado) return;
      const que = queOfrecer({ estado, iphoneSinInstalar: esIphoneSinInstalar(), yaDecidido: decididoReciente(leerDecidido(), Date.now()), esComputadora: esComputadora() });
      if (que === "sincronizar") {
        // Una vez por sesión: el aparato queda a nombre de este usuario.
        if (leer("fg_avisos_guardado") === "1") return;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub || !vivo) return;
        await guardar(sub.toJSON()).then(() => { try { sessionStorage.setItem("fg_avisos_guardado", "1"); } catch { /* nada */ } }).catch(() => undefined);
        return;
      }
      if (que === "nada") return;
      if (que === "pedir") {
        const j = await fetch(RUTA, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!vivo || !j?.clavePublica) return;
        setClave(j.clavePublica);
      }
      if (vivo) setModo(que);
    })();
    return () => { vivo = false; };
  }, [pathname, modo]);

  if (!modo) return null;

  const cerrar = () => { decidir(); setModo(null); };
  async function activar() {
    setError(null);
    setOcupado(true);
    try {
      // Primera línea con await = el permiso se pide dentro del toque.
      const sub = await suscribirEsteAparato(clave);
      if (typeof sub === "string") {
        if (sub === TEXTO_INSTALAR_EN_IPHONE) return setModo("instalar");
        if (typeof Notification !== "undefined" && Notification.permission === "denied") return cerrar();
        return setError(sub);
      }
      await guardar(sub);
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron activar los avisos. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return <VentanaAvisos modo={modo} ocupado={ocupado} error={error} onActivar={() => void activar()} onAhoraNo={cerrar} />;
}

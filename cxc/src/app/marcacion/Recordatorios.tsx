"use client";

// «Recordatorios» (16-nov-2026): cuatro renglones con su interruptor (apagado
// por defecto) y su hora. Se guarda solo, sin botón. Al encender el primero se
// pide permiso de avisos y se suscribe ESTE aparato (web push, VAPID).
// «Probar aviso» (17-nov-2026) manda uno al instante a ESTE teléfono; quien no
// tiene ficha de colaborador (Daniel, admin) ve solo esa parte.

import { useEffect, useState } from "react";
import {
  ROTULOS_RECORDATORIO,
  TEXTO_SELECCIONA_TU_HORA,
  TEXTO_PRUEBA_ENVIADA,
  TEXTO_INSTALAR_EN_IPHONE,
  TEXTO_PIE_RECORDATORIOS,
  type Recordatorio,
} from "@/lib/marcacion/recordatorios";
import { enDoceHoras } from "@/lib/marcacion/marcacion";

function esIphoneSinInstalar(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalada =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !instalada;
}

function llaveEnBytes(base64: string): ArrayBuffer {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}

/** La suscripción de este aparato, o un texto que dice por qué no se pudo. */
async function suscribirEsteAparato(clavePublica: string | null, renovar = false): Promise<PushSubscriptionJSON | string> {
  if (esIphoneSinInstalar()) return TEXTO_INSTALAR_EN_IPHONE;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return esIphoneSinInstalar() ? TEXTO_INSTALAR_EN_IPHONE : "Este navegador no recibe avisos.";
  }
  if (!clavePublica) return "Los avisos todavía no están disponibles.";
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return "Los avisos están bloqueados en este teléfono. Actívalos en Ajustes.";
  const reg = await navigator.serviceWorker.ready;
  if (renovar) await (await reg.pushManager.getSubscription())?.unsubscribe();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveEnBytes(clavePublica) }));
  return sub.toJSON();
}

/** Manda el aviso de prueba; si la suscripción vieja ya no sirve, la renueva una vez. */
async function probarAviso(clavePublica: string | null): Promise<void> {
  for (const renovar of [false, true]) {
    const sub = await suscribirEsteAparato(clavePublica, renovar);
    if (typeof sub === "string") throw new Error(sub);
    const res = await fetch("/api/marcacion/recordatorios/probar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suscripcion: sub }),
    });
    if (res.ok) return;
    const j = await res.json().catch(() => ({}));
    if (res.status !== 410 || renovar) throw new Error(j.error || "No se pudo mandar el aviso.");
  }
}

export default function Recordatorios({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lista, setLista] = useState<Recordatorio[] | null>(null);
  const [sinFicha, setSinFicha] = useState(false);
  const [prueba, setPrueba] = useState<"enviando" | "enviada" | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [iphoneSinInstalar, setIphoneSinInstalar] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIphoneSinInstalar(esIphoneSinInstalar());
    setError(null);
    setPrueba(null);
    fetch("/api/marcacion/recordatorios", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return setError(j.error || "No se pudieron leer tus recordatorios.");
        setLista(j.recordatorios ?? null);
        setSinFicha(j.recordatorios == null);
        setClave(j.clavePublica ?? null);
      })
      .catch(() => setError("Sin conexión. Intenta de nuevo cuando tengas señal."));
  }, [open]);

  async function guardar(nueva: Recordatorio[], conSuscripcion: boolean) {
    const antes = lista;
    setLista(nueva);
    setError(null);
    setOcupado(true);
    try {
      let suscripcion: PushSubscriptionJSON | undefined;
      if (conSuscripcion) {
        const r = await suscribirEsteAparato(clave);
        if (typeof r === "string") throw new Error(r);
        suscripcion = r;
      }
      const res = await fetch("/api/marcacion/recordatorios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordatorios: nueva, suscripcion }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "No se pudieron guardar tus recordatorios.");
      setLista(j.recordatorios);
    } catch (e) {
      setLista(antes);
      setError(e instanceof Error ? e.message : "No se pudieron guardar tus recordatorios.");
    } finally {
      setOcupado(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        <button type="button" onClick={onClose} className="-ml-1 min-h-[44px] px-1 text-[16px] text-blue-600">
          ‹ Marcación
        </button>
        <h1 className="mt-1 text-[28px] font-bold">Recordatorios</h1>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</p>}

        {lista && (
          <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
            {lista.map((r, i) => (
              <li key={r.marca} className="flex min-h-[56px] items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1 text-[16px]">
                  {ROTULOS_RECORDATORIO[r.marca]}
                  {!r.hora && <span className="block text-[13px] text-gray-500">{TEXTO_SELECCIONA_TU_HORA}</span>}
                </div>
                <label className="relative min-h-[44px] w-[100px] flex-none rounded-lg bg-gray-100 text-center text-[15px] tabular-nums leading-[44px]">
                  <span className={r.hora ? "text-gray-900" : "text-blue-600"}>{r.hora ? enDoceHoras(r.hora) : "Seleccionar"}</span>
                  <input
                    type="time"
                    aria-label={`Hora de ${ROTULOS_RECORDATORIO[r.marca]}`}
                    value={r.hora ?? ""}
                    disabled={ocupado}
                    onChange={(e) => {
                      const hora = e.target.value.slice(0, 5) || null;
                      const nueva = lista.map((x, j) => (j === i ? { ...x, hora, activo: hora ? x.activo : false } : x));
                      void guardar(nueva, false);
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.activo}
                  aria-label={`Recordatorio de ${ROTULOS_RECORDATORIO[r.marca]}`}
                  disabled={ocupado || !r.hora}
                  onClick={() => {
                    const nueva = lista.map((x, j) => (j === i ? { ...x, activo: !x.activo } : x));
                    void guardar(nueva, !r.activo);
                  }}
                  className="flex min-h-[44px] flex-none items-center disabled:opacity-40"
                >
                  <span className={`relative h-[31px] w-[51px] rounded-full transition-colors ${r.activo ? "bg-emerald-600" : "bg-gray-300"}`}>
                    <span
                      className={`absolute left-0 top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform ${r.activo ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {(lista || sinFicha) && (
          <div className="mt-4">
            <button
              type="button"
              disabled={prueba === "enviando"}
              onClick={async () => {
                setError(null);
                setPrueba("enviando");
                try {
                  await probarAviso(clave);
                  setPrueba("enviada");
                } catch (e) {
                  setPrueba(null);
                  setError(e instanceof Error ? e.message : "No se pudo mandar el aviso.");
                }
              }}
              className="min-h-[44px] w-full rounded-xl border border-gray-200 text-[16px] text-blue-600 active:bg-gray-50 disabled:opacity-50"
            >
              {prueba === "enviando" ? "Enviando…" : "Probar aviso"}
            </button>
            {prueba === "enviada" && <p className="mt-2 text-[13px] text-emerald-700">{TEXTO_PRUEBA_ENVIADA}</p>}
          </div>
        )}

        {!sinFicha && <p className="mt-3 text-[13px] text-gray-500">{TEXTO_PIE_RECORDATORIOS}</p>}
        {iphoneSinInstalar && <p className="mt-2 text-[13px] text-gray-500">{TEXTO_INSTALAR_EN_IPHONE}</p>}
      </div>
    </div>
  );
}

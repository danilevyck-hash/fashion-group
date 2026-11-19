// La suscripción push de ESTE aparato (web push, VAPID). La usan «Recordatorios»
// y el aviso «Activa los avisos» de la pantalla de marcar: UNA sola.
import { TEXTO_INSTALAR_EN_IPHONE } from "./recordatorios";

export function esIphoneSinInstalar(): boolean {
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
export async function suscribirEsteAparato(clavePublica: string | null, renovar = false): Promise<PushSubscriptionJSON | string> {
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

export type EstadoDelAviso = "activo" | "falta" | "bloqueado" | "no-puede";

/** Qué se le dice a la persona: ver `AvisoActivarAvisos`. */
export function estadoDelAviso(e: { puede: boolean; permiso: NotificationPermission | "default"; suscrito: boolean }): EstadoDelAviso {
  if (!e.puede) return "no-puede";
  if (e.permiso === "denied") return "bloqueado";
  return e.permiso === "granted" && e.suscrito ? "activo" : "falta";
}

/** Lee el estado de ESTE aparato, sin pedir nada. */
export async function leerEstadoDelAviso(): Promise<EstadoDelAviso> {
  const puede =
    !esIphoneSinInstalar() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!puede) return "no-puede";
  const permiso = Notification.permission;
  const reg = permiso === "granted" ? await navigator.serviceWorker.getRegistration() : undefined;
  const suscrito = Boolean(reg && (await reg.pushManager.getSubscription()));
  return estadoDelAviso({ puede, permiso, suscrito });
}

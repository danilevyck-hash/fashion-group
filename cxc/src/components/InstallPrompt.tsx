"use client";

// Install prompt de la PWA.
// - Chromium/Android: captura `beforeinstallprompt`, lo difiere y ofrece un
//   botón "Instalar app".
// - iOS Safari (no tiene beforeinstallprompt): hint manual "Compartir →
//   Agregar a inicio", solo fuera de standalone.
// Se oculta en páginas públicas, en login, en standalone (ya instalada) y una
// vez descartado. (El copy de Modo Viaje / offline se eliminó — la app es
// siempre online.)

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// OJO: key legacy (nació con el Modo Viaje). Se conserva el MISMO valor para
// no volver a mostrar el prompt a quien ya lo descartó.
const DISMISS_KEY = "fg_modoviaje_install_dismissed";
const PUBLIC_PREFIXES = ["/catalogo-publico", "/pedido-reebok"];

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  // Excluir navegadores in-app (Chrome/Firefox/Edge/Opera en iOS) — esos no
  // tienen el menú Compartir → Agregar a inicio nativo de Safari.
  const inAppBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
  return iOS && webkit && !inAppBrowser;
}

export default function InstallPrompt() {
  const pathname = usePathname() || "";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ready, setReady] = useState(false); // ya evaluamos el entorno
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) {
        setDismissed(true);
        return;
      }
    } catch {
      /* localStorage no disponible — seguimos */
    }
    setStandalone(isStandalone());
    if (isIosSafari()) setIosHint(true);
    setReady(true);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIosHint(false);
      dismiss();
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    dismiss();
  }

  // Gating
  if (dismissed || !ready) return null;
  if (pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // Qué mostrar:
  //  - instalable (Chromium) → botón Instalar
  //  - iOS Safari no-standalone → hint A2HS
  //  - ya instalada (standalone) o desktop sin soporte → nada
  const installable = !standalone && !!deferred;
  const showIosHint = !standalone && iosHint;
  if (!installable && !showIosHint) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-xl border border-gray-200 bg-white shadow-lg p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Instala Fashion Group</p>

            {showIosHint && (
              <p className="text-xs text-gray-500 mt-0.5">
                Toca <span className="font-medium text-gray-700">Compartir</span> y luego{" "}
                <span className="font-medium text-gray-700">&ldquo;Agregar a inicio&rdquo;</span> para
                abrirla como una app.
              </p>
            )}
          </div>

          <button
            onClick={dismiss}
            aria-label="Cerrar"
            className="shrink-0 -mt-1 -mr-1 p-2 text-gray-400 hover:text-gray-700 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {installable && (
          <button
            onClick={install}
            className="mt-3 w-full bg-black text-white text-sm font-medium rounded-lg min-h-[44px] active:scale-[0.98] transition"
          >
            Instalar app
          </button>
        )}
      </div>
    </div>
  );
}

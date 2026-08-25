"use client";

// Install prompt de la PWA — SOLO donde de verdad se puede instalar.
//
// Chromium (Android y escritorio): el navegador dispara `beforeinstallprompt`,
// lo diferimos y ofrecemos el botón "Instalar app". Un toque y queda instalada.
// Se oculta en páginas públicas, en login, en standalone (ya instalada) y una
// vez descartado. (El copy de Modo Viaje / offline se eliminó — la app es
// siempre online.)
//
// 🔴 EN iOS LA BARRA SE FUE, Y NO VUELVE (25-ago-2026). Safari NO dispara
// `beforeinstallprompt`, así que ahí la barra nunca pudo instalar nada: lo
// único que hacía era un párrafo explicando cómo hacerlo A MANO ("Toca
// Compartir y luego Agregar a inicio"). O sea una barra fija, tapando el borde
// de abajo de la pantalla, para decir algo que el sistema operativo ya ofrece
// y que quien la necesitó ya hizo una vez. Daniel tiene la app en su inicio y
// aprobó sacarla.
//
// ⚠️ Lo que se fue es SOLO el camino de iOS. Donde SÍ hay botón de instalar
// —Android y escritorio— la barra sigue viva y con su botón; hay candado.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MARCA_THEME, MARCAS_UI } from "@/lib/catalogo/marcas-ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// OJO: key legacy (nació con el Modo Viaje). Se conserva el MISMO valor para
// no volver a mostrar el prompt a quien ya lo descartó.
const DISMISS_KEY = "fg_modoviaje_install_dismissed";

// Rutas donde está el CLIENTE de Daniel, no un empleado: ahí nunca se le
// ofrece instalar el ERP interno.
//
// Las bases de los pedidos se DERIVAN del tema de cada marca en vez de
// escribirse a mano. Hasta jul-2026 la lista decía `["/catalogo-publico",
// "/pedido-reebok"]` —de cuando Reebok era la única marca con página pública—
// así que al cliente de Joybees y al de Tommy les salía "Instala Fashion
// Group · Toca Compartir y luego Agregar a inicio" tapando, desde abajo de la
// pantalla, los botones de WhatsApp de su propio pedido. Derivándolo, una
// marca nueva queda cubierta sola.
const PUBLIC_PREFIXES = [
  "/catalogo-publico",
  ...MARCAS_UI.map((m) => MARCA_THEME[m].pedidoPublicoBase),
];

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// 🔴 `isIosSafari()` SE BORRÓ el 25-ago-2026, junto con el hint manual que era
// su único consumidor. No se deja "por si acaso": una función que detecta iOS
// viviendo al lado de un prompt de instalación es el hint esperando a que
// alguien la vuelva a montar.

export default function InstallPrompt() {
  const pathname = usePathname() || "";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
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
    setReady(true);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
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

  // Qué mostrar: SOLO si el navegador ofreció instalar de verdad
  // (`beforeinstallprompt`) y la app no está ya instalada. Sin eso, no se
  // dibuja nada — ni una barra que solo explique.
  const installable = !standalone && !!deferred;
  if (!installable) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-xl border border-gray-200 bg-white shadow-lg p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Instala Fashion Group</p>
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

        <button
          onClick={install}
          className="mt-3 w-full bg-black text-white text-sm font-medium rounded-lg min-h-[44px] active:scale-[0.98] transition"
        >
          Instalar app
        </button>
      </div>
    </div>
  );
}

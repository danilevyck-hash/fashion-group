"use client";

// Pantalla de CONFIRMACIÓN post-checkout (Reebok y Joybees): estado real del
// pedido y su envío a Switch leído del server. MÁXIMO 3 acciones (decisión de
// Daniel 5-jul): Enviar/Reintentar solo si aplica, Ver PDF directo en pestaña
// nueva (el share nativo del visor cubre WhatsApp/mail), y Volver al catálogo.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

interface Envio {
  estado: string;
  pedido_switch_id: number | null;
  numero_interno: string | null;
  error_detalle: string | null;
}
interface Order { id: string; order_number: string; client_name: string; total: number }

export default function ConfirmacionClient({ marca, orderId }: { marca: MarcaUiKey; orderId: string }) {
  // Config por marca vía MARCA_THEME (PR-2).
  const theme = getMarcaTheme(marca)!;
  const cfg = { catalogHref: theme.catalogoHref, api: theme.api };
  const [order, setOrder] = useState<Order | null>(null);
  const [envio, setEnvio] = useState<Envio | null | undefined>(undefined);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [oRes, eRes] = await Promise.all([
      fetch(`${cfg.api}/orders/${orderId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${cfg.api}/orders/${orderId}/enviar-switch`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setOrder(oRes);
    setEnvio(eRes?.envio ?? null);
  }, [cfg.api, orderId]);

  useEffect(() => { load(); }, [load]);

  async function reintentar() {
    setRetrying(true);
    setRetryMsg(null);
    try {
      const res = await fetch(`${cfg.api}/orders/${orderId}/enviar-switch`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        setRetryMsg(data?.error || "El reintento falló. Intenta de nuevo en unos minutos.");
        if (Array.isArray(data?.errores)) setRetryMsg(`${data.error}: ${data.errores.join(" · ")}`);
      }
      await load();
    } catch {
      setRetryMsg("Sin conexión — intenta de nuevo.");
    } finally {
      setRetrying(false);
    }
  }

  const ambiguo = envio?.estado === "enviado" && (envio.error_detalle || "").startsWith("AMBIGUO");
  const switchOk = envio && (envio.estado === "verificado" || (envio.estado === "enviado" && !ambiguo));
  // Distinguir "nunca se intentó" (envio null — ej. pedido legacy) de "falló"
  // (estado error): decir "no se completó" sin intento previo confunde
  // (diagnóstico del piloto 4-jul).
  const sinIntento = envio === null;
  const puedeReintentar = sinIntento || envio?.estado === "error";


  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      {order === null && envio === undefined ? (
        <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <div className="space-y-4">
          {/* Estado principal */}
          <div className={`rounded-lg border-2 p-6 text-center ${switchOk ? "border-emerald-300 bg-emerald-50" : ambiguo ? "border-amber-300 bg-amber-50" : sinIntento ? "border-gray-300 bg-gray-50" : "border-red-200 bg-red-50"}`}>
            <div className="text-3xl">{switchOk ? "✓" : ambiguo ? "⚠️" : sinIntento ? "→" : "!"}</div>
            <h1 className="mt-2 text-lg font-semibold">
              {order ? `Pedido ${order.order_number} guardado` : "Pedido guardado"}
            </h1>
            {switchOk ? (
              <p className="mt-1 text-sm text-emerald-800">
                Enviado a Switch — N° <span className="font-semibold tabular-nums">{envio?.numero_interno}</span>
                {envio?.estado === "verificado" ? " · verificado ✓" : ""}
              </p>
            ) : ambiguo ? (
              <p className="mt-1 text-sm text-amber-800">
                Switch no respondió al enviar — el pedido pudo o no haberse creado allá.
                Revisa el panel de Switch antes de reintentar.
              </p>
            ) : sinIntento ? (
              <p className="mt-1 text-sm text-gray-600">
                Este pedido aún no se ha enviado a Switch. Puedes enviarlo con el botón de abajo.
              </p>
            ) : (
              <div className="mt-1 text-sm text-red-800">
                <p>El envío a Switch falló — el pedido está guardado en el sistema y no se pierde.</p>
                {envio?.error_detalle && <p className="mt-1 text-xs">{envio.error_detalle}</p>}
              </div>
            )}
            {order && (
              <p className="mt-2 text-xs text-gray-500 tabular-nums">
                {order.client_name} · Total ${fmt(Number(order.total) || 0)}
              </p>
            )}
          </div>

          {retryMsg && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{retryMsg}</p>}

          {/* Acciones — máximo 3: enviar/reintentar (si aplica), Ver PDF
              directo (share nativo del visor), volver. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {puedeReintentar && (
              <button
                onClick={reintentar}
                disabled={retrying}
                className="rounded-md bg-black px-4 min-h-[48px] text-sm font-medium text-white hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-40 sm:col-span-2"
              >
                {retrying ? "Enviando…" : sinIntento ? "Enviar a Switch" : "Reintentar envío a Switch"}
              </button>
            )}
            <a
              href={`${cfg.api}/orders/${orderId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-200 px-4 min-h-[48px] text-sm font-medium text-gray-700 hover:border-gray-300 transition flex items-center justify-center"
            >
              Ver PDF
            </a>
            <Link href={cfg.catalogHref} className="rounded-md border border-gray-200 px-4 min-h-[48px] text-sm text-gray-500 hover:border-gray-300 transition flex items-center justify-center">
              Volver al catálogo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

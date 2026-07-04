"use client";

// Pantalla de CONFIRMACIÓN post-checkout (Reebok y Joybees): estado real del
// pedido y su envío a Switch leído del server (no confía en estado de
// navegación). Si Switch falló: el pedido está guardado, aviso claro y botón
// Reintentar. Nunca hay carrito que perder aquí — se limpió al guardar en DB.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "@/lib/format";

const BRANDS = {
  reebok: {
    label: "REEBOK",
    catalogHref: "/catalogo/reebok/productos",
    pedidoHref: (id: string) => `/catalogo/reebok/pedido/${id}`,
    publicHref: null as ((id: string) => string) | null,
    api: "/api/catalogo/reebok",
  },
  joybees: {
    label: "JOYBEES",
    catalogHref: "/catalogo/joybees",
    pedidoHref: (id: string) => `/catalogo/joybees/pedido/${id}`,
    publicHref: (id: string) => `/pedido-joybees/${id}`,
    api: "/api/catalogo/joybees",
  },
};

interface Envio {
  estado: string;
  pedido_switch_id: number | null;
  numero_interno: string | null;
  error_detalle: string | null;
}
interface Order { id: string; order_number: string; client_name: string; total: number }

export default function ConfirmacionClient({ marca, orderId }: { marca: "reebok" | "joybees"; orderId: string }) {
  const cfg = BRANDS[marca];
  const [order, setOrder] = useState<Order | null>(null);
  const [envio, setEnvio] = useState<Envio | null | undefined>(undefined);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
  const puedeReintentar = envio === null || envio?.estado === "error";

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      {order === null && envio === undefined ? (
        <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <div className="space-y-4">
          {/* Estado principal */}
          <div className={`rounded-lg border-2 p-6 text-center ${switchOk ? "border-emerald-300 bg-emerald-50" : ambiguo ? "border-amber-300 bg-amber-50" : "border-red-200 bg-red-50"}`}>
            <div className="text-3xl">{switchOk ? "✓" : ambiguo ? "⚠️" : "!"}</div>
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
            ) : (
              <div className="mt-1 text-sm text-red-800">
                <p>El envío a Switch no se completó — el pedido está guardado en el sistema y no se pierde.</p>
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

          {/* Acciones */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {puedeReintentar && (
              <button
                onClick={reintentar}
                disabled={retrying}
                className="rounded-md bg-black px-4 min-h-[48px] text-sm font-medium text-white hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-40 sm:col-span-2"
              >
                {retrying ? "Reintentando…" : "Reintentar envío a Switch"}
              </button>
            )}
            <Link href={cfg.pedidoHref(orderId)} className="rounded-md border border-gray-200 px-4 min-h-[48px] text-sm font-medium text-gray-700 hover:border-gray-300 transition flex items-center justify-center">
              Ver pedido (PDF · email)
            </Link>
            {cfg.publicHref && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}${cfg.publicHref!(orderId)}`)
                    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
                    .catch(() => { /* */ });
                }}
                className="rounded-md border border-gray-200 px-4 min-h-[48px] text-sm font-medium text-gray-700 hover:border-gray-300 transition"
              >
                {copied ? "Link copiado ✓" : "Copiar link para el cliente"}
              </button>
            )}
            <Link href={cfg.catalogHref} className={`rounded-md border border-gray-200 px-4 min-h-[48px] text-sm text-gray-500 hover:border-gray-300 transition flex items-center justify-center ${cfg.publicHref ? "" : ""}`}>
              Volver al catálogo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

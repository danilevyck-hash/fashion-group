"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <CatalogoSyncNow /> — botón discreto "hace X min" + refresh para la vista de
// CATÁLOGO DE VENDEDORES (Reebok /catalogo/reebok/productos y Joybees
// /catalogo/joybees). Al tocarlo dispara POST /api/admin/sync-now con
// {modulo: catalogo-reebok | catalogo-joybees} y al terminar refresca los
// productos de la vista (onSuccess) y el "hace X min" (sync-status).
//
// Gate por SESIÓN REAL, en dos capas (el catálogo PÚBLICO jamás lo ve):
//   1) sessionStorage cxc_role ∈ admin|secretaria|vendedor, leído tras montar
//      (nunca en el primer render — SSR). Un visitante del catálogo público no
//      tiene rol → null.
//   2) el fetch inicial a /api/catalogo/<marca>/sync-status valida la cookie
//      HMAC en el server (requireRole admin+secretaria+vendedor): 401/403 →
//      el botón se oculta. sessionStorage manipulado no alcanza.
// Además este componente NO se importa desde /catalogo-publico ni /pedido-*.
//
// 409 del candado: "running" (sync corriendo YA) NO se muestra — el botón se
// engancha al sync en curso (syncConEnganche, ver syncNowClient.ts) y refresca
// al terminar. El cooldown directo sí muestra su detalle tal cual.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncConEnganche } from "./syncNowClient";

const ROLES_PERMITIDOS = ["admin", "secretaria", "vendedor"];

interface CatalogoSyncNowProps {
  catalogo: "reebok" | "joybees" | "tommy" | "calvin";
  /** Reload de los productos de la vista tras un sync exitoso. */
  onSuccess?: () => void | Promise<void>;
  className?: string;
}

const MODULO_POR_CATALOGO = {
  reebok: "catalogo-reebok",
  joybees: "catalogo-joybees",
  tommy: "catalogo-tommy",
  calvin: "catalogo-calvin",
} as const;

function relativo(iso: string | null): string {
  if (!iso) return "sin datos";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

export default function CatalogoSyncNow({ catalogo, onSuccess, className }: CatalogoSyncNowProps) {
  const modulo = MODULO_POR_CATALOGO[catalogo];
  const [visible, setVisible] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  // Tick por minuto para que el "hace X min" no se congele.
  const [, setTick] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/catalogo/${catalogo}/sync-status`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        // Sin sesión válida en el server → el botón no existe para este usuario.
        setVisible(false);
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as { lastSync?: string | null };
      setLastSync(json?.lastSync ?? null);
    } catch {
      /* red caída — se queda el último valor */
    }
  }, [catalogo]);

  // Capa 1 del gate: rol en sessionStorage tras montar (browser-only, jamás en
  // useState inicial — SSR). Solo si pasa, se consulta el sync-status (capa 2).
  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role") || "";
    if (!ROLES_PERMITIDOS.includes(role)) return;
    setVisible(true);
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  if (!visible) return null;

  const showToast = (msg: string, error: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, error });
    // UX del repo: éxitos 3s, errores 8s.
    toastTimer.current = setTimeout(() => setToast(null), error ? 8000 : 3000);
  };

  const disparar = async () => {
    if (running) return;
    setRunning(true);
    try {
      // syncConEnganche absorbe el 409 running (sync corriendo YA): el botón
      // queda en "Actualizando…" y se resuelve solo cuando el sync terminó.
      const r = await syncConEnganche({ modulo });
      if (r.tipo === "ok") {
        showToast(r.resumen ? `Listo, actualizado. ${r.resumen}` : "Listo, actualizado", false);
        await fetchStatus();
        await onSuccess?.();
      } else if (r.tipo === "fresco") {
        showToast(r.detalle, true);
        await fetchStatus();
      } else {
        showToast(r.mensaje, true);
      }
    } finally {
      setRunning(false);
    }
  };

  // Reebok es el sync más pesado (~3 min) — se avisa en el tooltip y mientras corre.
  const esReebok = catalogo === "reebok";
  const tooltip = esReebok
    ? "Actualizar catálogo desde Switch (tarda ~3 min)"
    : "Actualizar catálogo desde Switch";

  return (
    <div className={`inline-flex flex-col ${className ?? ""}`}>
      <button
        type="button"
        title={tooltip}
        disabled={running}
        onClick={disparar}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-xs text-black/50 transition hover:border-black/25 hover:text-black/70 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
        {running ? (esReebok ? "Actualizando… (~3 min)" : "Actualizando…") : relativo(lastSync)}
      </button>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[9999] max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm text-white shadow-lg ${
            toast.error ? "bg-red-600" : "bg-black"
          }`}
        >
          {toast.msg}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setToast(null)}
            className="ml-3 font-semibold opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

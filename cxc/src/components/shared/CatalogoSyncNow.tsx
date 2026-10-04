"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <CatalogoSyncNow /> — la línea de frescura (`LineaDeFrescura`, 4-oct-2026:
// «Actualizado hace 3 h · Actualizar») para la vista de
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
import { CajaAviso, CLASE_AVISO_EN_PILA, EnLaPilaDeAvisos } from "@/components/CajaAviso";
import LineaDeFrescura from "./LineaDeFrescura";
import { syncConEnganche } from "./syncNowClient";

const ROLES_PERMITIDOS = ["admin", "secretaria", "vendedor"];

interface CatalogoSyncNowProps {
  catalogo: "reebok" | "joybees" | "tommy" | "calvin";
  /** Reload de los productos de la vista tras un sync exitoso. */
  onSuccess?: () => void | Promise<void>;
  className?: string;
  /** Omitida = celular hasta `md` y computadora desde `md`. */
  forma?: "celular" | "computadora";
}

const MODULO_POR_CATALOGO = {
  reebok: "catalogo-reebok",
  joybees: "catalogo-joybees",
  tommy: "catalogo-tommy",
  calvin: "catalogo-calvin",
} as const;

export default function CatalogoSyncNow({ catalogo, onSuccess, className, forma }: CatalogoSyncNowProps) {
  const modulo = MODULO_POR_CATALOGO[catalogo];
  const [visible, setVisible] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
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
        showToast(r.resumen ? `Catálogo actualizado. ${r.resumen}` : "Catálogo actualizado", false);
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

  return (
    <>
      <LineaDeFrescura
        forma={forma}
        className={className}
        actualizado={lastSync}
        onActualizar={disparar}
        actualizando={running}
        // Reebok es el sync más pesado (~3 min): se dice mientras corre.
        ocupado={catalogo === "reebok" ? "Actualizando… (~3 min)" : undefined}
      />

      {toast && (
        <EnLaPilaDeAvisos>
          <CajaAviso
            message={toast.msg}
            type={toast.error ? "error" : "success"}
            onDismiss={() => setToast(null)}
            className={CLASE_AVISO_EN_PILA}
          />
        </EnLaPilaDeAvisos>
      )}
    </>
  );
}

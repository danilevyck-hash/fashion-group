"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <SyncNowButton /> — botón "Actualizar ahora" (sync manual on-demand).
//
// Dispara POST /api/admin/sync-now con {modulo, empresa?}. Visible SOLO para
// admin y secretaria (lee el rol de sessionStorage tras montar, igual que
// useAuth — nunca en el primer render para no romper la hidratación).
//
//   - 1 opción  → botón directo.
//   - 2+ opciones → botón que abre un menú (elige empresa / módulo).
//   - disabledReason → deshabilitado con tooltip (ej. "Elige una empresa").
//
// Mientras corre: spinner + disabled. Tras éxito: toast "Listo, actualizado",
// se dispara un evento focus (SyncStatus y los fetchers SWR revalidan solos en
// focus) y se llama onSuccess (reload de datos de la página, si lo expone).
// Un 409 del endpoint trae el detalle legible en español → se muestra tal cual.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

export interface SyncNowOpcion {
  /** Módulo del endpoint: estadocuenta | facturas | recibos | clientes-master |
   *  catalogo-reebok | catalogo-joybees. */
  modulo: string;
  empresa?: string;
  /** Label del item en el menú (solo aplica con 2+ opciones). */
  label?: string;
}

interface SyncNowButtonProps {
  opciones: SyncNowOpcion[];
  /** Si viene, el botón queda deshabilitado con este tooltip. */
  disabledReason?: string | null;
  /** Sub-texto bajo el label (ej. "tarda ~3 min" en Reebok). */
  subtext?: string;
  /** Reload de los datos de la vista tras un sync exitoso. */
  onSuccess?: () => void | Promise<void>;
  className?: string;
}

const ROLES_PERMITIDOS = ["admin", "secretaria"];

export default function SyncNowButton({
  opciones,
  disabledReason,
  subtext,
  onSuccess,
  className,
}: SyncNowButtonProps) {
  const [visible, setVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gate por rol tras montar (browser-only; nunca en useState inicial — SSR).
  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role") || "";
    setVisible(ROLES_PERMITIDOS.includes(role));
  }, []);

  // Cerrar el menú al hacer click afuera / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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

  const disparar = async (opcion: SyncNowOpcion) => {
    setMenuOpen(false);
    setRunning(true);
    try {
      const res = await fetch("/api/admin/sync-now", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: opcion.modulo, empresa: opcion.empresa }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; resumen?: string; detalle?: string; error?: string }
        | null;
      if (res.ok && json?.ok) {
        showToast(json.resumen ? `Listo, actualizado. ${json.resumen}` : "Listo, actualizado", false);
        // SyncStatus y los fetchers SWR revalidan en focus → un solo disparo
        // refresca el "actualizado hace X" en toda la página.
        window.dispatchEvent(new Event("focus"));
        await onSuccess?.();
      } else if (res.status === 409 && json?.detalle) {
        showToast(json.detalle, true);
      } else {
        showToast(json?.error || "No se pudo actualizar. Intenta de nuevo en unos segundos.", true);
      }
    } catch {
      showToast("No se pudo actualizar. Revisa tu conexión e intenta de nuevo.", true);
    } finally {
      setRunning(false);
    }
  };

  const disabled = running || !!disabledReason || opciones.length === 0;
  const esMenu = opciones.length > 1;

  return (
    <div className={`relative inline-flex flex-col ${className ?? ""}`} ref={menuRef}>
      <button
        type="button"
        title={disabledReason ?? undefined}
        disabled={disabled}
        onClick={() => {
          if (esMenu) setMenuOpen((o) => !o);
          else disparar(opciones[0]);
        }}
        aria-haspopup={esMenu ? "menu" : undefined}
        aria-expanded={esMenu ? menuOpen : undefined}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
        {running ? "Actualizando…" : "Actualizar ahora"}
      </button>
      {subtext && <span className="mt-0.5 text-[11px] text-gray-400">{subtext}</span>}

      {esMenu && menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {opciones.map((op) => (
            <button
              key={`${op.modulo}-${op.empresa ?? ""}`}
              type="button"
              role="menuitem"
              onClick={() => disparar(op)}
              className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              {op.label ?? op.empresa ?? op.modulo}
            </button>
          ))}
        </div>
      )}

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

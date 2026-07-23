"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <SyncNowButton /> — botón "Actualizar ahora" (sync manual on-demand).
//
// Dispara POST /api/admin/sync-now con {modulo, empresa?}. Visible según el
// gate de UI por uso (prop `roles`, default admin+secretaria — lee el rol de
// sessionStorage tras montar, igual que useAuth — nunca en el primer render
// para no romper la hidratación). El permiso real lo valida el server.
//
//   - 1 opción  → botón directo.
//   - 2+ opciones → botón que abre un menú (elige empresa / módulo).
//   - 2+ opciones + secuencial → SIN menú: un clic dispara TODAS las opciones
//     EN SECUENCIA (nunca 2 a la vez — sesión única Switch), con progreso
//     "Actualizando… (N/8)" y UN toast resumen al final. Los 409 individuales
//     (running/cooldown) no abortan: esa empresa se salta y se acumula como
//     omitida.
//   - disabledReason → deshabilitado con tooltip (ej. "Elige una empresa").
//
// Mientras corre: spinner + disabled. Tras éxito: toast "Listo, actualizado",
// se dispara un evento focus (SyncStatus y los fetchers SWR revalidan solos en
// focus) y se llama onSuccess (reload de datos de la página, si lo expone).
//
// 409 motivo "running" (sync de esa empresa corriendo YA — manual o cron): NO
// se muestra nada. El botón queda en "Actualizando…" y SE ENGANCHA al sync en
// curso re-intentando el POST cada ~5s:
//   - si el running termina en success → el re-intento cae en cooldown → se
//     trata como éxito (la data quedó fresca) y se refresca la vista;
//   - si el running termina en error → el re-intento adquiere el lock y corre
//     el sync manual (reintento automático único) antes de mostrar error.
// Cero mensajes tipo "espera al sync de las HH:MM" en todo el sistema.
// El 409 cooldown DIRECTO (primer intento) sí muestra su detalle tal cual.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { postSyncNow, syncConEnganche } from "./syncNowClient";

export interface SyncNowOpcion {
  /** Módulo del endpoint: estadocuenta | facturas | recibos | clientes-master |
   *  catalogo-reebok | catalogo-joybees | proveedores | refresh-vistas. */
  modulo: string;
  empresa?: string;
  /** Label del item en el menú (solo aplica con 2+ opciones). */
  label?: string;
}

interface SyncNowButtonProps {
  opciones: SyncNowOpcion[];
  /** Con 2+ opciones: true = un clic las dispara TODAS en secuencia (sin
   *  menú). false/omitido = menú para elegir una (comportamiento clásico). */
  secuencial?: boolean;
  /** Gate de UI POR USO (default admin+secretaria). Cada vista decide quién VE
   *  su botón (ej. /proveedores agrega contabilidad; la ficha de cliente,
   *  vendedor) sin abrir los demás botones. El permiso real por módulo lo
   *  valida el server igual (rolesSyncNow → 403). */
  roles?: string[];
  /** Si viene, el botón queda deshabilitado con este tooltip. */
  disabledReason?: string | null;
  /** Sub-texto bajo el label (ej. "tarda ~3 min" en Reebok). */
  subtext?: string;
  /** Reload de los datos de la vista tras un sync exitoso. */
  onSuccess?: () => void | Promise<void>;
  className?: string;
}

const ROLES_DEFAULT = ["admin", "secretaria"];

export default function SyncNowButton({
  opciones,
  secuencial,
  roles,
  disabledReason,
  subtext,
  onSuccess,
  className,
}: SyncNowButtonProps) {
  const [visible, setVisible] = useState(false);
  const [running, setRunning] = useState(false);
  const [progreso, setProgreso] = useState<{ actual: number; total: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gate por rol tras montar (browser-only; nunca en useState inicial — SSR).
  // rolesKey (string) como dep: el array `roles` suele venir inline y cambiaría
  // de identidad en cada render.
  const rolesKey = (roles ?? ROLES_DEFAULT).join(",");
  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role") || "";
    setVisible(rolesKey.split(",").includes(role));
  }, [rolesKey]);

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

  // Refresca "hace X min" (SyncStatus + fetchers SWR revalidan en focus) y los
  // datos de la vista (onSuccess) — un solo lugar para ambos disparos.
  const refrescarVista = async () => {
    window.dispatchEvent(new Event("focus"));
    await onSuccess?.();
  };

  const disparar = async (opcion: SyncNowOpcion) => {
    setMenuOpen(false);
    setRunning(true);
    try {
      // syncConEnganche absorbe el 409 running: el botón queda en
      // "Actualizando…" y se resuelve solo cuando el sync (propio o ajeno)
      // terminó — sin toasts de "espera".
      const r = await syncConEnganche(opcion);
      if (r.tipo === "ok") {
        showToast(r.resumen ? `Listo, actualizado. ${r.resumen}` : "Listo, actualizado", false);
        await refrescarVista();
      } else if (r.tipo === "fresco") {
        showToast(r.detalle, true);
      } else {
        showToast(r.mensaje, true);
      }
    } finally {
      setRunning(false);
    }
  };

  // Modo secuencial (Ventas): un clic recorre TODAS las opciones, una por una
  // (sesión única Switch — nunca 2 a la vez). Un 409 (running/cooldown) NO
  // aborta: esa empresa se salta (quedará fresca por el sync que ya corre o
  // recién corrió) y se acumula como omitida. Al final, UN toast resumen.
  //
  // Los pasos SIN empresa (finales técnicos como refresh-vistas o
  // clientes-master) no entran al conteo de "empresas actualizadas": su 409
  // (cooldown = ya está fresco) es silencioso; solo un ERROR suma a fallidas.
  const dispararSecuencia = async () => {
    setRunning(true);
    let actualizadas = 0;
    let omitidas = 0;
    let fallidas = 0;
    try {
      for (let i = 0; i < opciones.length; i++) {
        setProgreso({ actual: i + 1, total: opciones.length });
        const esEmpresa = !!opciones[i].empresa;
        try {
          const { status, json } = await postSyncNow(opciones[i]);
          if (status === 200 && json?.ok) {
            if (esEmpresa) actualizadas++;
          } else if (status === 409) {
            if (esEmpresa) omitidas++;
          } else fallidas++;
        } catch {
          fallidas++;
        }
      }
      const partes: string[] = [];
      if (omitidas === 0 && fallidas === 0) {
        partes.push(
          actualizadas === 1
            ? "Listo, 1 empresa actualizada"
            : actualizadas === 0
              ? "Listo, actualizado"
              : `Listo, ${actualizadas} empresas actualizadas`,
        );
      } else {
        partes.push(`${actualizadas} actualizadas`);
        if (omitidas > 0) partes.push(`${omitidas} omitidas (en espera o recién actualizadas)`);
        if (fallidas > 0) partes.push(`${fallidas} con error`);
      }
      showToast(partes.join(" · "), fallidas > 0);
      await refrescarVista();
    } finally {
      setProgreso(null);
      setRunning(false);
    }
  };

  const disabled = running || !!disabledReason || opciones.length === 0;
  const esSecuencia = !!secuencial && opciones.length > 1;
  const esMenu = !esSecuencia && opciones.length > 1;

  return (
    <div className={`relative inline-flex flex-col ${className ?? ""}`} ref={menuRef}>
      <button
        type="button"
        title={disabledReason ?? undefined}
        disabled={disabled}
        onClick={() => {
          if (esSecuencia) dispararSecuencia();
          else if (esMenu) setMenuOpen((o) => !o);
          else disparar(opciones[0]);
        }}
        aria-haspopup={esMenu ? "menu" : undefined}
        aria-expanded={esMenu ? menuOpen : undefined}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
        {running
          ? progreso
            ? `Actualizando… (${progreso.actual}/${progreso.total})`
            : "Actualizando…"
          : "Actualizar ahora"}
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

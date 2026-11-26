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
//     "Actualizando… (N/8)" y UN toast resumen al final.
//   - disabledReason → deshabilitado con tooltip (ej. "Elige una empresa").
//
// Mientras corre: spinner + disabled. Tras éxito: aviso con lo que quedó al día,
// se dispara un evento focus (SyncStatus y los fetchers SWR revalidan solos en
// focus) y se llama onSuccess (reload de datos de la página, si lo expone).
//
// 🔴 EN VIVO (26-nov-2026, Daniel: «si pongo Actualizar, lo quiero en vivo»):
// cada toque lee de Switch en ese momento — ya no hay freno de 10 min ni
// empresas «omitidas». Si una empresa ya se está actualizando (cron u otro
// toque), el servidor espera a esa corrida y se une a ella; el botón solo
// queda en «Actualizando…» (deshabilitado: el único anti-doble-toque).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CajaAviso, CLASE_AVISO_EN_PILA, EnLaPilaDeAvisos } from "@/components/CajaAviso";
import { RefreshCw } from "lucide-react";
import { syncConEnganche } from "./syncNowClient";
// 🔴 Los DOS textos del botón salen de un solo lugar desde el 18-sep-2026:
// «Actualizar ahora» es la palabra de la casa y Guías tenía otras dos. Ver
// `lib/ui/actualizar-ahora.ts`.
import { TEXTO_ACTUALIZANDO, TEXTO_ACTUALIZAR_AHORA } from "@/lib/ui/actualizar-ahora";
import { vidrioSobre } from "@/lib/ui/vidrio";

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
  /** Con `secuencial`: las opciones A LA VEZ. Solo si cada una es una empresa DISTINTA. */
  paralelo?: boolean;
  /** Gate de UI POR USO (default admin+secretaria). Cada vista decide quién VE
   *  su botón (ej. /proveedores agrega contabilidad; la ficha de cliente,
   *  vendedor) sin abrir los demás botones. El permiso real por módulo lo
   *  valida el server igual (rolesSyncNow → 403). */
  roles?: string[];
  /** Aviso de éxito TOTAL de la secuencia, en vez del conteo de empresas (ej.
   *  «Cliente actualizado»). Como función recibe la suma de `cantidad` de las
   *  respuestas (Pedidos: «42 pedidos al día»). */
  resumenExito?: string | ((cantidad: number) => string);
  /** Si viene, el botón queda deshabilitado con este tooltip. */
  disabledReason?: string | null;
  /** Sub-texto bajo el label (ej. "tarda ~3 min" en Reebok). */
  subtext?: string;
  /** Reload de los datos de la vista tras un sync exitoso. */
  /**
   * Recarga los datos de la vista. **OBLIGATORIO.**
   *
   * 🩸 Era opcional y 8 de los 12 usos no lo pasaban: el botón sincronizaba y
   * la pantalla se quedaba mostrando lo viejo. Daniel arregló el vendedor de
   * unos clientes en Switch, tocó "Actualizar ahora" en Comisiones, la base
   * quedó correcta ($35.511,65 a REINALDO) y la tabla siguió diciendo DEFAULT.
   * Que sea obligatorio hace que el compilador encuentre al que falte, en vez
   * de que lo encuentre alguien mirando una cifra que no cambia.
   */
  onSuccess: () => void | Promise<void>;
  className?: string;
  /**
   * «linea» (4-oct-2026, `FRESCURA_VISIBLE_2026_10`): el botón es TEXTO, como
   * en Mail —«Actualizado 9:41 ↻» o «Actualizar»—, sin borde. Mismos permisos,
   * acelerador y avisos. Omitido = el botón de siempre.
   */
  variante?: "boton" | "linea";
  /** Lo que dice la «linea»: en reposo y mientras corre (con «(N/8)»). */
  rotulo?: (corriendo: boolean, progreso: string) => ReactNode;
  /** Lo que se ve en lugar del botón para quien no puede actualizar. */
  sinPermiso?: ReactNode;
}

const ROLES_DEFAULT = ["admin", "secretaria"];

/** El aviso al terminar una secuencia. Nunca «omitidas»: o se actualizó, o se
 *  dice cuál falló y qué hacer. */
export function avisoDeSecuencia({
  actualizadas,
  cantidad,
  fallidas,
  resumenExito,
}: {
  actualizadas: number;
  cantidad: number;
  fallidas: readonly string[];
  resumenExito?: string | ((cantidad: number) => string);
}): string {
  if (fallidas.length === 0) {
    if (typeof resumenExito === "function") return resumenExito(cantidad);
    if (resumenExito) return resumenExito;
    if (actualizadas === 0) return "Datos al día";
    return actualizadas === 1 ? "1 empresa al día" : `${actualizadas} empresas al día`;
  }
  const al = actualizadas > 0
    ? `${actualizadas === 1 ? "1 empresa" : `${actualizadas} empresas`} al día · `
    : "";
  return `${al}No se pudo leer de Switch: ${fallidas.join(", ")}. Toca Actualizar para intentarlo de nuevo.`;
}

/** El botón-texto de `LineaDeFrescura`: el mismo con `SyncNowButton` y con una
 *  acción propia. 44 px con el dedo; en la computadora, del alto del texto. */
export const CLASE_BOTON_LINEA =
  "inline-flex min-h-[44px] items-center gap-1 text-left text-blue-600 transition hover:text-blue-800 active:opacity-60 disabled:cursor-not-allowed disabled:opacity-50 md:[@media(pointer:fine)]:min-h-0";

export default function SyncNowButton({
  opciones,
  secuencial,
  paralelo,
  roles,
  resumenExito,
  disabledReason,
  subtext,
  onSuccess,
  className,
  variante = "boton",
  rotulo,
  sinPermiso = null,
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

  if (!visible) return <>{sinPermiso}</>;

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
    await onSuccess();
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
        showToast(r.resumen ?? "Datos al día", false);
        await refrescarVista();
      } else {
        showToast(r.mensaje, true);
      }
    } finally {
      setRunning(false);
    }
  };

  // Modo secuencial (Ventas, Pedidos, CXC…): un clic recorre TODAS las
  // opciones (en serie, o a la vez con `paralelo` si cada una es otra
  // empresa). Cada paso usa syncConEnganche: una empresa que ya se está
  // actualizando se espera, nunca se omite. Al final, UN aviso.
  //
  // Los pasos SIN empresa (finales técnicos como refresh-vistas o
  // clientes-master) no entran al conteo de empresas; su error sí se dice.
  const dispararSecuencia = async () => {
    setRunning(true);
    let actualizadas = 0;
    let cantidad = 0;
    const fallidas: string[] = [];
    let hechos = 0;
    // Un paso = una opción. Cuenta en las variables de arriba; nunca lanza.
    const paso = async (i: number) => {
      const o = opciones[i];
      try {
        const r = await syncConEnganche(o);
        if (r.tipo === "ok") {
          if (o.empresa) actualizadas++;
          cantidad += r.cantidad ?? 0;
          return;
        }
      } catch {
        /* cae abajo como error */
      }
      fallidas.push(o.label ?? o.empresa ?? o.modulo);
    };
    try {
      if (paralelo) {
        // Cada opción es OTRA empresa = otro Switch con su propio usuario: la
        // sesión única no se cruza entre ellas (velocidad-2026-11). El
        // progreso cuenta las que ya terminaron.
        setProgreso({ actual: 0, total: opciones.length });
        await Promise.all(opciones.map(async (_o, i) => {
          await paso(i);
          hechos++;
          setProgreso({ actual: hechos, total: opciones.length });
        }));
      } else {
        for (let i = 0; i < opciones.length; i++) {
          setProgreso({ actual: i + 1, total: opciones.length });
          await paso(i);
        }
      }
      showToast(avisoDeSecuencia({ actualizadas, cantidad, fallidas, resumenExito }), fallidas.length > 0);
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
        // min-h-[44px]: aparece en 4 pantallas y medía 32px de alto — bajo el
        // mínimo táctil de la casa.
        className={
          variante === "linea"
            ? CLASE_BOTON_LINEA
            : "inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {variante !== "linea" && <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />}
        {variante === "linea" && rotulo
          ? rotulo(running, progreso ? ` (${progreso.actual}/${progreso.total})` : "")
          : running
            ? progreso
              ? `${TEXTO_ACTUALIZANDO} (${progreso.actual}/${progreso.total})`
              : TEXTO_ACTUALIZANDO
            : TEXTO_ACTUALIZAR_AHORA}
      </button>
      {subtext && <span className="mt-0.5 text-[12px] text-gray-400">{subtext}</span>}

      {esMenu && menuOpen && (
        <div
          role="menu"
          className={vidrioSobre("absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg")}
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
        <EnLaPilaDeAvisos>
          <CajaAviso
            message={toast.msg}
            type={toast.error ? "error" : "success"}
            onDismiss={() => setToast(null)}
            className={CLASE_AVISO_EN_PILA}
          />
        </EnLaPilaDeAvisos>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback, ReactNode, createContext, useContext } from "react";

// ── ESTÉTICA 5: Skeleton Loaders ──
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-3 px-4 border-b border-gray-50">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className={`h-3 bg-gray-100 rounded animate-pulse ${j === 0 ? "w-1/3" : "w-1/5"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonKPI({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${count} gap-4 mb-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="h-2.5 bg-gray-100 rounded animate-pulse w-20" />
          <div className="h-6 bg-gray-100 rounded animate-pulse w-24" />
        </div>
      ))}
    </div>
  );
}

// ── ESTÉTICA 2: Empty States ──
export function EmptyState({
  icon,
  title = "Nada por aquí aún",
  subtitle,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="min-w-[48px] min-h-[48px] flex items-center justify-center mb-4">
        {icon || (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-200">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mb-4 max-w-xs">{subtitle}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all min-h-[44px]">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ── ESTÉTICA 6: Toast Component ──
export function Toast({ message, type = "success", onDismiss }: { message: string | null; type?: "success" | "error"; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-md text-sm border border-gray-200 z-50 flex items-center gap-2 ${
      type === "error" ? "bg-red-900 text-white" : "bg-black text-white"
    }`}>
      {type === "error" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      )}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 p-1 rounded hover:bg-white/20 transition flex-shrink-0" aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  );
}

// ── ESTÉTICA 7: Modal Component ──
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    // Focus first input
    setTimeout(() => {
      const input = ref.current?.querySelector("input, textarea, select") as HTMLElement;
      input?.focus();
    }, 100);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div ref={ref} className={`bg-white sm:rounded-lg rounded-t-2xl p-6 ${maxWidth} w-full mx-0 sm:mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto`}>
        {title && <h2 className="text-base font-medium mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

// ── ESTÉTICA 7b: Confirm Modal ──
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "¿Estás seguro?",
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-medium mb-1">{title}</h3>
        {message && <p className="text-sm text-gray-500 mb-6">{message}</p>}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all disabled:opacity-50 min-h-[44px] ${
              destructive
                ? "bg-red-600 text-white hover:bg-red-700 active:scale-[0.97]"
                : "bg-black text-white hover:bg-gray-800 active:scale-[0.97]"
            }`}
          >
            {loading ? "Procesando..." : confirmLabel}
          </button>
          <button onClick={onClose} disabled={loading} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-50 min-h-[44px]">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ESTÉTICA 7c: Confirm Delete Modal (Apple-style) ──
export function ConfirmDeleteModal({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  loading = false,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (open) {
      setEnabled(false);
      const t = setTimeout(() => setEnabled(true), 1000);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!enabled || loading}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-40 min-h-[44px]"
          >
            {loading ? "Eliminando..." : !enabled ? "Eliminar..." : "Eliminar"}
          </button>
          <button onClick={onCancel} disabled={loading} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-50 min-h-[44px]">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ESTÉTICA 7d: Foto Lightbox ──
export function FotoLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <img src={src} alt="" className="relative max-w-3xl max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// ── ESTÉTICA 8: Badge Component ──
const BADGE_COLORS: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700",
  yellow: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-gray-100 text-gray-500",
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
  orange: "bg-orange-50 text-orange-700",
};

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: keyof typeof BADGE_COLORS | string }) {
  const cls = BADGE_COLORS[color] || BADGE_COLORS.gray;
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium inline-flex items-center ${cls}`}>{children}</span>;
}

// ── ESTÉTICA 9: Status Badge (unified estado → color mapping) ──
const STATUS_COLORS: Record<string, string> = {
  // Yellow: pending/draft
  pendiente: "yellow", borrador: "yellow", "Borrador": "yellow", "pendiente_aprobacion": "yellow",
  // Green: active/open
  activo: "green", abierto: "green", "Enviado": "blue",
  // Green: completed/resolved/deposited — cerrado is gray (inactive)
  depositado: "green", aprobado: "green", "Aplicado": "green", cerrado: "gray", "Aplicada": "green", "Entregado": "green", despachada: "green",
  // Red: rejected/expired/bounced
  rechazado: "red", "Rechazado": "red", vencido: "red", rebotado: "red", archivado: "red",
  // Purple: in review / confirmed
  "Confirmado": "purple", "En revisión": "purple",
  // Orange: in progress
  "Preparando": "orange", "En camino": "orange", "Pendiente Bodega": "orange",
};

const STATUS_LABELS: Record<string, string> = {};

export function StatusBadge({ estado }: { estado: string }) {
  const color = STATUS_COLORS[estado] || "gray";
  const label = STATUS_LABELS[estado] || estado;
  const [animate, setAnimate] = useState(false);
  const prevEstado = useRef(estado);

  useEffect(() => {
    if (prevEstado.current !== estado) {
      setAnimate(true);
      prevEstado.current = estado;
      const t = setTimeout(() => setAnimate(false), 220);
      return () => clearTimeout(t);
    }
  }, [estado]);

  return <span className={animate ? "badge-enter inline-flex" : "inline-flex"}><Badge color={color}>{label}</Badge></span>;
}

// ── ESTÉTICA 10: Money Formatter ──
export function fmtMoney(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MoneyCell({ value, className = "" }: { value: number; className?: string }) {
  const v = Number(value) || 0;
  const color = v < 0 ? "text-red-500" : v === 0 ? "text-gray-400" : "";
  return <span className={`tabular-nums ${color} ${className}`}>{fmtMoney(v)}</span>;
}

// ── Scrollable Table Wrapper ──
// Provides mobile-friendly horizontal scrolling for wide tables.
// Uses negative margins on mobile to let the table go edge-to-edge, with inner padding to restore alignment.
export function ScrollableTable({
  children,
  minWidth = 700,
  className = "",
}: {
  children: ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto -mx-4 sm:mx-0 ${className}`}>
      <div className={`px-4 sm:px-0`} style={{ minWidth: `${minWidth}px` }}>
        {children}
      </div>
    </div>
  );
}


// ── AnimatedNumber: count-up from 0 to target ──
export function AnimatedNumber({
  value,
  duration = 300,
  formatter,
  className = "",
}: {
  value: number;
  duration?: number;
  formatter?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    if (start === end) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(end);
        prevValue.current = end;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const text = formatter ? formatter(display) : display.toFixed(0);
  return <span className={className}>{text}</span>;
}

// ── Animated Accordion Content ──
// Uses CSS grid trick: grid-rows-[0fr] → grid-rows-[1fr] for smooth height animation.
// Usage: <AccordionContent open={isExpanded}><div>...content...</div></AccordionContent>
export function AccordionContent({
  open,
  children,
  className = "",
  duration = 250,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  duration?: number;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows] ease-out ${className}`}
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        transitionDuration: `${duration}ms`,
      }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// ── Context Menu (right-click) ──────────────────────────────
// Reusable right-click context menu for desktop power users.
// Only shows on non-touch devices. Uses fixed positioning.

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onClick: () => void;
  destructive?: boolean;
  hidden?: boolean;
  dividerAfter?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

const ContextMenuCtx = createContext<{
  show: (e: React.MouseEvent, items: ContextMenuItem[]) => void;
  hide: () => void;
} | null>(null);

export function useContextMenu() {
  const ctx = useContext(ContextMenuCtx);
  if (!ctx) throw new Error("useContextMenu must be used inside <ContextMenuProvider>");
  return ctx;
}

// ── Pull to Refresh (mobile touch only) ──
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pullDistance = useRef(0);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);
  const threshold = 60;

  const isAtTop = useCallback(() => {
    return window.scrollY <= 0;
  }, []);

  useEffect(() => {
    let isTouchDevice = false;
    const checkTouch = () => { isTouchDevice = true; };
    window.addEventListener("touchstart", checkTouch, { once: true, passive: true });

    const onTouchStart = (e: TouchEvent) => {
      if (!isTouchDevice || refreshing) return;
      if (isAtTop()) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      if (!isAtTop()) {
        pulling.current = false;
        pullDistance.current = 0;
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        const resisted = Math.min(dy * 0.4, 120);
        pullDistance.current = resisted;
        setPull(resisted);
      } else {
        pullDistance.current = 0;
        setPull(0);
      }
    };

    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullDistance.current >= threshold && !refreshing) {
        setPull(threshold);
        setRefreshing(true);
        try {
          await onRefresh();
        } catch {
          // silently handle
        }
        setRefreshing(false);
      }
      pullDistance.current = 0;
      setPull(0);
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchmove", onTouchMove, { passive: true });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
    }

    return () => {
      window.removeEventListener("touchstart", checkTouch);
      if (el) {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
      }
    };
  }, [onRefresh, refreshing, isAtTop]);

  const showIndicator = pull > 10 || refreshing;
  const rotation = Math.min((pull / threshold) * 360, 360);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: showIndicator ? `${Math.max(pull, refreshing ? threshold : 0)}px` : "0px" }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={refreshing ? "animate-spin" : "transition-transform"}
          style={!refreshing ? { transform: `rotate(${rotation}deg)` } : undefined}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          {!refreshing && <polyline points="21 3 21 9 15 9" />}
        </svg>
      </div>
      {children}
    </div>
  );
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isTouchDevice = useRef(false);

  useEffect(() => {
    const onTouch = () => { isTouchDevice.current = true; };
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);

  const hide = useCallback(() => setMenu(null), []);

  const show = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    if (isTouchDevice.current) return;
    e.preventDefault();
    e.stopPropagation();

    const visible = items.filter((i) => !i.hidden);
    if (visible.length === 0) return;

    const menuWidth = 220;
    const menuHeight = visible.length * 36 + 8;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    if (x < 4) x = 4;
    if (y < 4) y = 4;

    setMenu({ x, y, items: visible });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) hide();
    };
    document.addEventListener("mousedown", onClick, true);
    return () => document.removeEventListener("mousedown", onClick, true);
  }, [menu, hide]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu, hide]);

  useEffect(() => {
    if (!menu) return;
    const onScroll = () => hide();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [menu, hide]);

  const normal = menu ? menu.items.filter((i) => !i.destructive) : [];
  const destructive = menu ? menu.items.filter((i) => i.destructive) : [];

  return (
    <ContextMenuCtx.Provider value={{ show, hide }}>
      {children}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px] max-w-[280px]"
          style={{ left: menu.x, top: menu.y }}
        >
          {normal.map((item, idx) => (
            <div key={idx}>
              <button
                onClick={() => { item.onClick(); hide(); }}
                className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition group/item"
              >
                {item.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center text-gray-400 group-hover/item:text-gray-600">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && <span className="text-[11px] text-gray-300 ml-3 font-mono">{item.shortcut}</span>}
              </button>
              {item.dividerAfter && <div className="border-t border-gray-100 my-1" />}
            </div>
          ))}
          {destructive.length > 0 && normal.length > 0 && (
            <div className="border-t border-gray-100 my-1" />
          )}
          {destructive.map((item, idx) => (
            <button
              key={`d-${idx}`}
              onClick={() => { item.onClick(); hide(); }}
              className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition group/item"
            >
              {item.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <span className="text-[11px] text-red-300 ml-3 font-mono">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </ContextMenuCtx.Provider>
  );
}

// ── BottomSheet: Apple-style slide-up sheet for mobile detail views ──
export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);
  const sheetHeight = useRef(0);
  const [translateY, setTranslateY] = useState(0);
  const [dragging, setDragging] = useState(false);
  // "half" = ~50vh, "full" = ~5vh from top
  const [mode, setMode] = useState<"half" | "full">("half");
  const [visible, setVisible] = useState(false);

  // Animate in on open
  useEffect(() => {
    if (open) {
      setMode("half");
      setTranslateY(0);
      // Small delay so the initial render happens off-screen, then animate in
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only initiate drag from the handle area (first 40px) or if scrolled to top
    const target = e.target as HTMLElement;
    const handleArea = target.closest("[data-bottomsheet-handle]");
    const scrollContainer = sheetRef.current?.querySelector("[data-bottomsheet-scroll]") as HTMLElement | null;
    const isScrolledToTop = !scrollContainer || scrollContainer.scrollTop <= 0;

    if (!handleArea && !isScrolledToTop) return;

    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
    sheetHeight.current = sheetRef.current?.offsetHeight || 0;
    setDragging(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    dragCurrentY.current = dy;

    // Allow downward drag freely; upward drag limited
    if (dy > 0) {
      setTranslateY(dy);
    } else {
      // Dragging up: allow expanding from half to full with resistance
      if (mode === "half") {
        setTranslateY(dy * 0.4); // resistance
      } else {
        setTranslateY(0); // already full, don't go further
      }
    }
  }, [mode]);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setDragging(false);
    const dy = dragCurrentY.current;

    // Dismiss threshold: 100px down
    if (dy > 100) {
      onClose();
      setTranslateY(0);
      return;
    }

    // Expand to full: drag up > 60px from half mode
    if (dy < -60 && mode === "half") {
      setMode("full");
      setTranslateY(0);
      return;
    }

    // Collapse to half: drag down > 60px from full mode
    if (dy > 60 && mode === "full") {
      setMode("half");
      setTranslateY(0);
      return;
    }

    // Snap back
    setTranslateY(0);
  }, [mode, onClose]);

  if (!open) return null;

  const sheetTop = mode === "half" ? "45vh" : "5vh";

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-xl flex flex-col ${
          dragging ? "" : "transition-all duration-300 ease-out"
        }`}
        style={{
          top: sheetTop,
          transform: visible
            ? `translateY(${translateY}px)`
            : "translateY(100%)",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div data-bottomsheet-handle="" className="flex justify-center pt-3 pb-2 cursor-grab">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        {/* Content */}
        <div data-bottomsheet-scroll="" className="flex-1 overflow-y-auto px-5 pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── SwipeableRow: iOS Mail-style swipe-to-action on mobile ──
export interface SwipeAction {
  label: string;
  icon?: ReactNode;
  color: string; // Tailwind bg class e.g. "bg-emerald-500"
  textColor?: string; // defaults to "text-white"
  onAction: () => void;
}

export function SwipeableRow({
  children,
  leftAction,
  rightAction,
  className = "",
  threshold = 60,
  executeThreshold = 150,
}: {
  children: ReactNode;
  leftAction?: SwipeAction;   // revealed when swiping RIGHT
  rightAction?: SwipeAction;  // revealed when swiping LEFT
  className?: string;
  threshold?: number;
  executeThreshold?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [executed, setExecuted] = useState(false);

  const reset = useCallback(() => {
    setTransitioning(true);
    setOffset(0);
    setExecuted(false);
    setTimeout(() => setTransitioning(false), 300);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't interfere with inputs, buttons, etc.
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
    setTransitioning(false);
    setExecuted(false);
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    isDragging.current = true;
    isHorizontal.current = null;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine direction on first significant move
    if (isHorizontal.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
        if (!isHorizontal.current) {
          isDragging.current = false;
          return;
        }
      } else {
        return;
      }
    }

    // Limit swipe direction based on available actions
    let clampedDx = dx;
    if (!leftAction && clampedDx > 0) clampedDx = 0;
    if (!rightAction && clampedDx < 0) clampedDx = 0;

    // Apply resistance past executeThreshold
    const max = executeThreshold + 40;
    if (Math.abs(clampedDx) > max) {
      clampedDx = clampedDx > 0 ? max : -max;
    }

    currentX.current = clampedDx;
    setOffset(clampedDx);
  }, [leftAction, rightAction, executeThreshold]);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dx = currentX.current;
    const absDx = Math.abs(dx);

    // Auto-execute if past executeThreshold
    if (absDx >= executeThreshold) {
      setExecuted(true);
      setTransitioning(true);
      // Slide fully off before executing
      setOffset(dx > 0 ? 300 : -300);
      const action = dx > 0 ? leftAction : rightAction;
      setTimeout(() => {
        action?.onAction();
        // Reset after action
        setTimeout(() => {
          setOffset(0);
          setExecuted(false);
          setTimeout(() => setTransitioning(false), 50);
        }, 150);
      }, 200);
      return;
    }

    // Snap open if past threshold
    if (absDx >= threshold) {
      setTransitioning(true);
      const snapTo = dx > 0 ? threshold + 20 : -(threshold + 20);
      setOffset(snapTo);
      setTimeout(() => setTransitioning(false), 300);
      return;
    }

    // Spring back
    reset();
  }, [threshold, executeThreshold, leftAction, rightAction, reset]);

  // Close on outside tap
  useEffect(() => {
    if (offset === 0) return;
    const handler = (e: TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        reset();
      }
    };
    document.addEventListener("touchstart", handler, { passive: true });
    return () => document.removeEventListener("touchstart", handler);
  }, [offset, reset]);

  const actionWidth = Math.max(Math.abs(offset), threshold);
  const showRight = offset < -10;
  const showLeft = offset > 10;

  return (
    <div ref={containerRef} className={`swipeable-row relative overflow-hidden ${className}`}>
      {/* Right action (revealed on swipe left) */}
      {rightAction && (
        <div
          className={`absolute inset-y-0 right-0 flex items-center justify-center ${rightAction.color} ${rightAction.textColor || "text-white"}`}
          style={{
            width: `${actionWidth}px`,
            opacity: showRight ? 1 : 0,
            transition: transitioning ? "opacity 0.15s" : "none",
          }}
        >
          <div className="flex flex-col items-center gap-0.5 px-3">
            {rightAction.icon}
            <span className="text-[11px] font-medium whitespace-nowrap">{rightAction.label}</span>
          </div>
        </div>
      )}

      {/* Left action (revealed on swipe right) */}
      {leftAction && (
        <div
          className={`absolute inset-y-0 left-0 flex items-center justify-center ${leftAction.color} ${leftAction.textColor || "text-white"}`}
          style={{
            width: `${actionWidth}px`,
            opacity: showLeft ? 1 : 0,
            transition: transitioning ? "opacity 0.15s" : "none",
          }}
        >
          <div className="flex flex-col items-center gap-0.5 px-3">
            {leftAction.icon}
            <span className="text-[11px] font-medium whitespace-nowrap">{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative bg-white"
        style={{
          transform: `translateX(${offset}px)`,
          transition: transitioning ? "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)" : "none",
          willChange: isDragging.current ? "transform" : "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

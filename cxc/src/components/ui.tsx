"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

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
      {icon || (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-200 mb-4">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 8v4m0 4h.01" />
        </svg>
      )}
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
export function Toast({ message, type = "success" }: { message: string | null; type?: "success" | "error" }) {
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
      {message}
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
  // Blue: active/open/sent
  activo: "blue", abierto: "blue", "Enviado": "blue",
  // Green: completed/resolved/deposited
  depositado: "green", aprobado: "green", "Resuelto con NC": "green", cerrado: "green", "Aplicada": "green", "Entregado": "green", despachada: "green",
  // Orange/amber: pending but overdue
  pendiente_vencido: "orange",
  // Red: rejected/expired/bounced
  rechazado: "red", "Rechazado": "red", vencido: "red", rebotado: "red", archivado: "red",
  // Purple: in review
  "En revisión": "purple",
  // Orange: in progress
  "Preparando": "orange", "En camino": "orange", "Pendiente Bodega": "orange",
};

const STATUS_LABELS: Record<string, string> = {
  pendiente_vencido: "Pendiente (vencido)",
};

export function StatusBadge({ estado }: { estado: string }) {
  const color = STATUS_COLORS[estado] || "gray";
  const label = STATUS_LABELS[estado] || estado;
  return <Badge color={color}>{label}</Badge>;
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

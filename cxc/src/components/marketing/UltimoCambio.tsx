"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <UltimoCambio /> — una línea discreta en la ficha del gasto: quién lo tocó
// por última vez y cuándo («Modificado por Ángela · 7 oct 10:29»). Tocarla
// abre el historial completo (BottomSheet, el mismo de siempre).
//
// Lee `/api/marketing/historial`, que a su vez lee `activity_logs` — el
// mecanismo que ya existe (ver `src/lib/marketing/audit.ts`). Sin cambios
// registrados todavía, no dibuja nada: no hay nada que decir.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui";
import type { AuditEntityType } from "@/lib/marketing/audit";

interface Cambio {
  id: string;
  action: string;
  userRole: string;
  userName: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

const FECHA_HORA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtFechaHora(iso: string): string {
  try {
    return FECHA_HORA.format(new Date(iso)).replace(/\./g, "");
  } catch {
    return "";
  }
}

function verboDeAccion(action: string): string {
  if (action === "create") return "Creado";
  if (action === "delete" || action === "delete_definitivo") return "Anulado";
  return "Modificado";
}

function nombreDeQuien(c: Cambio): string {
  return c.userName || c.userRole;
}

interface UltimoCambioProps {
  entityType: AuditEntityType;
  entityId: string;
  className?: string;
}

export function UltimoCambio({ entityType, entityId, className }: UltimoCambioProps) {
  const [cambios, setCambios] = useState<Cambio[] | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCambios(null);
    fetch(
      `/api/marketing/historial?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (vivo) setCambios(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (vivo) setCambios([]);
      });
    return () => {
      vivo = false;
    };
  }, [entityType, entityId]);

  if (!cambios || cambios.length === 0) return null;
  const ultimo = cambios[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`text-xs text-gray-400 hover:text-gray-600 text-left ${className ?? ""}`}
      >
        {verboDeAccion(ultimo.action)} por {nombreDeQuien(ultimo)} · {fmtFechaHora(ultimo.createdAt)}
      </button>

      <BottomSheet open={abierto} onClose={() => setAbierto(false)}>
        <div className="p-4 space-y-3" data-bottomsheet-scroll>
          <div data-bottomsheet-handle className="h-1 w-10 rounded-full bg-gray-300 mx-auto mb-1" />
          <h4 className="text-sm font-semibold text-gray-900">Historial de cambios</h4>
          <div className="space-y-2.5">
            {cambios.map((c) => (
              <div key={c.id} className="text-xs text-gray-600 border-b border-gray-100 pb-2 last:border-0">
                <span className="font-medium text-gray-900">{verboDeAccion(c.action)}</span>
                {" por "}
                {nombreDeQuien(c)}
                {" · "}
                {fmtFechaHora(c.createdAt)}
              </div>
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

export default UltimoCambio;

"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtDate } from "@/lib/format";

export interface EstadoDocumento {
  numero: string;
  fecha: string | null;
  tipo: string;
  monto: number;
  saldo: number; // con signo (crédito negativo)
  dias: number | null;
}
export interface EstadoEmpresa {
  empresa_key: string;
  empresa_nombre: string;
  documentos: EstadoDocumento[];
  subtotal: number;
}
export interface EstadoCuenta {
  codigo: string;
  empresas: EstadoEmpresa[];
  total: number;
  generadoEn: string;
}

/** El código Switch (D-XXX) es el mismo en todas las empresas del cliente. */
function codigoDe(client: ConsolidatedClient): string | null {
  return Object.values(client.companies).find((c) => c?.codigo)?.codigo ?? null;
}
function nombreDe(client: ConsolidatedClient): string {
  return Object.values(client.companies).find((c) => c?.nombre)?.nombre ?? client.nombre_normalized;
}

/** Dinero con signo legible: crédito → "-$1,234.00". */
export function money(n: number): string {
  return n < 0 ? `-$${fmt(Math.abs(n))}` : `$${fmt(n)}`;
}

function diasColor(dias: number | null): string {
  if (dias == null) return "text-gray-400";
  if (dias <= 90) return "text-emerald-600";
  if (dias <= 120) return "text-amber-600";
  return "text-red-600";
}

interface Props {
  client: ConsolidatedClient | null;
  companyFilter: string;
  onClose: () => void;
}

export default function EstadoCuentaDrawer({ client, companyFilter, onClose }: Props) {
  const [data, setData] = useState<EstadoCuenta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const open = !!client;
  const codigo = client ? codigoDe(client) : null;
  const nombre = client ? nombreDe(client) : "";
  const empresaScope = companyFilter === "all" ? "todas" : companyFilter;

  useEffect(() => {
    if (!open || !codigo) return;
    let cancel = false;
    setLoading(true);
    setError(false);
    setData(null);
    fetch(`/api/cxc/estado-cuenta/${encodeURIComponent(codigo)}?empresa=${encodeURIComponent(empresaScope)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: EstadoCuenta) => { if (!cancel) setData(d); })
      .catch(() => { if (!cancel) setError(true); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [open, codigo, empresaScope]);

  const totalDocs = data ? data.empresas.reduce((n, e) => n + e.documentos.length, 0) : 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Estado de cuenta"
      footer={
        data && totalDocs > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{totalDocs} documento{totalDocs === 1 ? "" : "s"} con saldo</span>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p>
              <p className="text-lg font-semibold tabular-nums leading-tight">{money(data.total)}</p>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="mb-4">
        <p className="text-base font-medium text-gray-900">{nombre}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {codigo ?? "—"}
          {data && ` · al ${fmtDate(data.generadoEn.slice(0, 10))}`}
        </p>
      </div>

      {loading && <SkeletonDocs />}

      {error && (
        <p className="text-sm text-red-600">No se pudo cargar el estado de cuenta. Intenta de nuevo en unos segundos.</p>
      )}

      {data && !loading && totalDocs === 0 && (
        <p className="text-sm text-gray-500">Este cliente no tiene documentos con saldo pendiente.</p>
      )}

      {data && !loading && data.empresas.map((emp) => (
        <section key={emp.empresa_key} className="mb-5 last:mb-0">
          {data.empresas.length > 1 && (
            <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{emp.empresa_nombre}</span>
              <span className="text-sm font-medium tabular-nums">{money(emp.subtotal)}</span>
            </div>
          )}
          <ul className="divide-y divide-gray-100">
            {emp.documentos.map((doc, i) => (
              <li key={`${emp.empresa_key}-${doc.numero}-${i}`} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{doc.numero}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {doc.tipo}
                    {doc.fecha && <> · {fmtDate(doc.fecha)}</>}
                    {doc.dias != null && <> · <span className={diasColor(doc.dias)}>{doc.dias}d</span></>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-medium tabular-nums ${doc.saldo < 0 ? "text-emerald-600" : "text-gray-900"}`}>{money(doc.saldo)}</p>
                  {doc.monto !== Math.abs(doc.saldo) && (
                    <p className="text-xs text-gray-400 tabular-nums">de ${fmt(doc.monto)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Drawer>
  );
}

function SkeletonDocs() {
  return (
    <div className="space-y-3 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between py-2">
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-40 bg-gray-100 rounded" />
          </div>
          <div className="h-3.5 w-16 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

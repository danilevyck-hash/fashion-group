"use client";

import { useEffect, useState } from "react";
import type { MkMarca } from "@/lib/marketing/types";
import { MarcaBadge } from "@/components/marketing";
import { formatearMonto } from "@/lib/marketing/normalizar";

interface MarcaStats {
  activos: number;
  porCobrar: number;
}

interface Props {
  marcas: MkMarca[];
  loading: boolean;
  onSelect: (m: MkMarca) => void;
  refreshKey: number;
}

function esMarcaConocida(c: string): c is "TH" | "CK" | "RBK" {
  return c === "TH" || c === "CK" || c === "RBK";
}

export default function MarcaSelector({ marcas, loading, onSelect, refreshKey }: Props) {
  const [stats, setStats] = useState<Record<string, MarcaStats>>({});

  useEffect(() => {
    if (marcas.length === 0) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/resumen-marcas", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Array<{
          marcaId: string;
          activos: number;
          porCobrar: number;
        }>;
        if (cancelado) return;
        const acc: Record<string, MarcaStats> = {};
        for (const r of data) {
          acc[r.marcaId] = { activos: r.activos, porCobrar: r.porCobrar };
        }
        setStats(acc);
      } catch {
        if (!cancelado) setStats({});
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [marcas, refreshKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (marcas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <div className="text-sm text-gray-600">No hay marcas configuradas.</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {marcas.map((m) => {
        const s = stats[m.id];
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            className="text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-fuchsia-400 hover:shadow-sm active:scale-[0.99] transition"
          >
            <div className="flex items-center justify-between mb-3">
              {esMarcaConocida(m.codigo) ? (
                <MarcaBadge codigo={m.codigo} />
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {m.nombre}
                </span>
              )}
              <span className="text-xs text-gray-400">→</span>
            </div>
            <div className="text-base font-semibold text-gray-900 mb-3">
              {m.nombre}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">
                  Activos
                </div>
                <div className="text-sm font-semibold tabular-nums text-gray-900">
                  {s ? s.activos : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">
                  Por cobrar
                </div>
                <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                  {s ? formatearMonto(s.porCobrar) : "—"}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

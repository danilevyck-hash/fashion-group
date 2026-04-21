"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal } from "@/components/ui";
import { EstadoBadge, MarcaBadge } from "@/components/marketing";
import { formatearMonto } from "@/lib/marketing/normalizar";
import type {
  CobranzaConPagos,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import DescargarZipButton from "./DescargarZipButton";
import PagosSection from "./PagosSection";

type CobranzaDetail = CobranzaConPagos;

interface Props {
  proyecto: ProyectoConMarcas;
  onChange: () => void;
}

function esMarcaConocida(c: string): c is "TH" | "CK" | "RBK" {
  return c === "TH" || c === "CK" || c === "RBK";
}

export default function CobrarTab({ proyecto, onChange }: Props) {
  const { toast } = useToast();
  const [cobranzas, setCobranzas] = useState<CobranzaDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [confirmEnviar, setConfirmEnviar] = useState<CobranzaDetail | null>(
    null,
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/cobranzas?proyecto_id=${proyecto.id}`,
      );
      if (!res.ok) throw new Error("No se pudieron cargar las cobranzas");
      const raw = (await res.json()) as unknown;
      const items: CobranzaDetail[] = Array.isArray(raw)
        ? (raw as CobranzaDetail[])
        : Array.isArray((raw as { items?: unknown[] })?.items)
          ? ((raw as { items: CobranzaDetail[] }).items)
          : [];
      const detallados = await Promise.all(
        items.map(async (c) => {
          try {
            const dRes = await fetch(`/api/marketing/cobranzas/${c.id}`);
            if (!dRes.ok) return c;
            return (await dRes.json()) as CobranzaDetail;
          } catch {
            return c;
          }
        }),
      );
      setCobranzas(detallados);
      if (detallados.length === 1) setExpanded(detallados[0].id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [proyecto.id, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleEnviar = async () => {
    if (!confirmEnviar) return;
    const id = confirmEnviar.id;
    setEnviando(id);
    try {
      const res = await fetch(`/api/marketing/cobranzas/${id}/enviar`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo marcar como enviada");
      }
      toast("Cobranza enviada", "success");
      setConfirmEnviar(null);
      await cargar();
      onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setEnviando(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (cobranzas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <div className="text-sm text-gray-600">
          Este proyecto no tiene cobranzas todavía.
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {cobranzas.map((c) => {
        const marca = proyecto.marcas.find((m) => m.marca.id === c.marca_id);
        const isExpanded = expanded === c.id;
        return (
          <div
            key={c.id}
            className="rounded-lg border border-gray-200 bg-white"
          >
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : c.id)}
              className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex items-center gap-3">
                {marca && esMarcaConocida(marca.marca.codigo) ? (
                  <MarcaBadge codigo={marca.marca.codigo} />
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                    {marca?.marca.nombre ?? "—"}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {c.numero}
                  </div>
                  <div className="text-xs text-gray-500">
                    Monto: {formatearMonto(c.monto)} · Pagado:{" "}
                    {formatearMonto(c.total_pagado)} · Saldo:{" "}
                    {formatearMonto(c.saldo)}
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <EstadoBadge tipo="cobranza" estado={c.estado} />
                <span className="text-gray-400 text-xs">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DescargarZipButton cobranzaId={c.id} />
                  {c.estado === "borrador" && (
                    <button
                      type="button"
                      onClick={() => setConfirmEnviar(c)}
                      disabled={enviando === c.id}
                      className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] disabled:opacity-50 transition"
                    >
                      {enviando === c.id
                        ? "Enviando…"
                        : "Marcar como enviada"}
                    </button>
                  )}
                </div>
                <PagosSection
                  cobranza={c}
                  onRefrescar={async () => {
                    await cargar();
                    onChange();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      <ConfirmModal
        open={!!confirmEnviar}
        onClose={() => !enviando && setConfirmEnviar(null)}
        onConfirm={handleEnviar}
        title="Marcar como enviada"
        message="Confirma que ya enviaste el paquete a la marca. El proyecto pasará a estado 'Enviado'."
        confirmLabel="Marcar enviada"
        loading={!!enviando}
      />
    </section>
  );
}

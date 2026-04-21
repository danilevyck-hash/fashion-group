"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal } from "@/components/ui";
import { EstadoBadge, MarcaBadge } from "@/components/marketing";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import type {
  MkCobranza,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import DescargarZipButton from "./DescargarZipButton";

interface Props {
  proyecto: ProyectoConMarcas;
  onChange: () => void;
}

function esMarcaConocida(c: string): c is "TH" | "CK" | "RBK" {
  return c === "TH" || c === "CK" || c === "RBK";
}

export default function CobrarTab({ proyecto, onChange }: Props) {
  const { toast } = useToast();
  const [cobranzas, setCobranzas] = useState<MkCobranza[]>([]);
  const [loading, setLoading] = useState(true);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [confirmEnviar, setConfirmEnviar] = useState<MkCobranza | null>(null);
  const [confirmCobrar, setConfirmCobrar] = useState<MkCobranza | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/cobranzas?proyecto_id=${proyecto.id}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("No se pudieron cargar las cobranzas");
      const data = (await res.json()) as MkCobranza[];
      setCobranzas(Array.isArray(data) ? data : []);
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
    setAccionando(id);
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
      setAccionando(null);
    }
  };

  const handleCobrar = async () => {
    if (!confirmCobrar) return;
    const id = confirmCobrar.id;
    setAccionando(id);
    try {
      const res = await fetch(`/api/marketing/cobranzas/${id}/cobrar`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo marcar como cobrada");
      }
      toast("Cobranza marcada como cobrada", "success");
      setConfirmCobrar(null);
      await cargar();
      onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setAccionando(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 rounded-lg bg-gray-100 animate-pulse" />
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
        const cobrada = c.estado === "cobrada";
        return (
          <div
            key={c.id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {marca && esMarcaConocida(marca.marca.codigo) ? (
                    <MarcaBadge codigo={marca.marca.codigo} />
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                      {marca?.marca.nombre ?? "—"}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {c.numero}
                  </span>
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {marca?.marca.nombre} · {proyecto.tienda}
                </div>
              </div>
              <EstadoBadge tipo="cobranza" estado={c.estado} />
            </div>

            <div className="space-y-0.5 text-sm mb-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Monto</span>
                <span className="font-mono tabular-nums text-gray-900 font-semibold">
                  {formatearMonto(c.monto)}
                </span>
              </div>
              {c.fecha_envio && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Enviada el</span>
                  <span className="text-gray-700">
                    {formatearFecha(c.fecha_envio)}
                  </span>
                </div>
              )}
              {c.fecha_cobro && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Cobrada el</span>
                  <span className="text-emerald-700">
                    {formatearFecha(c.fecha_cobro)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DescargarZipButton cobranzaId={c.id} variant="secondary" />
              {c.estado === "borrador" && (
                <button
                  type="button"
                  onClick={() => setConfirmEnviar(c)}
                  disabled={accionando === c.id}
                  className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] disabled:opacity-50 transition"
                >
                  Marcar como enviada
                </button>
              )}
              {c.estado === "enviada" && (
                <button
                  type="button"
                  onClick={() => setConfirmCobrar(c)}
                  disabled={accionando === c.id}
                  className="rounded-md bg-emerald-600 text-white px-3 py-2 text-sm hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50 transition"
                >
                  Marcar como cobrada
                </button>
              )}
              {cobrada && (
                <div className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1 ml-auto">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Cobrada con NC
                </div>
              )}
            </div>
          </div>
        );
      })}

      <ConfirmModal
        open={!!confirmEnviar}
        onClose={() => !accionando && setConfirmEnviar(null)}
        onConfirm={handleEnviar}
        title="Marcar como enviada"
        message="Confirma que ya enviaste el paquete a la marca. El proyecto pasará a estado 'Enviado'."
        confirmLabel="Marcar enviada"
        loading={!!accionando}
      />

      <ConfirmModal
        open={!!confirmCobrar}
        onClose={() => !accionando && setConfirmCobrar(null)}
        onConfirm={handleCobrar}
        title="Marcar como cobrada"
        message="¿Confirmas que esta cobranza ya fue cobrada (Nota de Crédito aplicada)?"
        confirmLabel="Marcar cobrada"
        loading={!!accionando}
      />
    </section>
  );
}

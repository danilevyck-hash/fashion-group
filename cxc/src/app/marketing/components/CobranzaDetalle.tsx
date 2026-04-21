"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal } from "@/components/ui";
import { EstadoBadge } from "@/components/marketing";
import { formatearMonto, formatearFecha } from "@/lib/marketing/normalizar";
import type { CobranzaConPagos } from "@/lib/marketing/types";
import { DescargarZipButton } from "./DescargarZipButton";
import { PagosSection } from "./PagosSection";

interface CobranzaDetalleProps {
  cobranzaId: string;
}

export function CobranzaDetalle({ cobranzaId }: CobranzaDetalleProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [cobranza, setCobranza] = useState<CobranzaConPagos | null>(null);
  const [loading, setLoading] = useState(true);
  const [proyectoNombre, setProyectoNombre] = useState<string>("");
  const [marcaNombre, setMarcaNombre] = useState<string>("");

  // Modales
  const [confirmEnviar, setConfirmEnviar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmDisputar, setConfirmDisputar] = useState(false);
  const [disputando, setDisputando] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [motivoAnular, setMotivoAnular] = useState("");
  const [anulando, setAnulando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/cobranzas/${cobranzaId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 404) {
          toast("Cobranza no encontrada", "error");
          router.push("/marketing/cobranzas");
          return;
        }
        throw new Error("Error cargando cobranza");
      }
      const data = (await res.json()) as CobranzaConPagos;
      setCobranza(data);

      // Cargar nombres (proyecto + marca) para header — con fallback silencioso
      void fetch(`/api/marketing/proyectos/${data.proyecto_id}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((p: { nombre?: string; tienda?: string } | null) => {
          if (p) setProyectoNombre(p.nombre || p.tienda || "");
        })
        .catch(() => {});
      void fetch(`/api/marketing/marcas`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((marcas: Array<{ id: string; nombre: string }>) => {
          const m = marcas.find((x) => x.id === data.marca_id);
          if (m) setMarcaNombre(m.nombre);
        })
        .catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [cobranzaId, router, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const esBorrador = cobranza?.estado === "borrador";
  const esAnulada = Boolean(cobranza?.anulado_en);

  const estadoLabel = useMemo(() => {
    if (!cobranza) return "";
    if (esAnulada) return "anulada";
    return cobranza.estado;
  }, [cobranza, esAnulada]);

  const handleEnviar = async () => {
    if (!cobranza) return;
    setEnviando(true);
    try {
      const res = await fetch(
        `/api/marketing/cobranzas/${cobranza.id}/enviar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
        throw new Error(b.error || "No se pudo marcar como enviada");
      }
      toast("Cobranza marcada como enviada", "success");
      setConfirmEnviar(false);
      await cargar();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setEnviando(false);
    }
  };

  const handleDisputar = async () => {
    if (!cobranza) return;
    setDisputando(true);
    try {
      const res = await fetch(
        `/api/marketing/cobranzas/${cobranza.id}/disputar`,
        { method: "POST" }
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
        throw new Error(b.error || "No se pudo marcar como disputada");
      }
      toast("Cobranza marcada como disputada", "success");
      setConfirmDisputar(false);
      await cargar();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setDisputando(false);
    }
  };

  const handleAnular = async () => {
    if (!cobranza) return;
    if (motivoAnular.trim().length === 0) {
      toast("Escribe un motivo de anulación", "error");
      return;
    }
    setAnulando(true);
    try {
      const res = await fetch(
        `/api/marketing/cobranzas/${cobranza.id}/anular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivoAnular.trim() }),
        }
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
        throw new Error(b.error || "No se pudo anular");
      }
      toast("Cobranza anulada", "success");
      setConfirmAnular(false);
      router.push("/marketing/cobranzas");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setAnulando(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
        Cargando cobranza…
      </div>
    );
  }

  if (!cobranza) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center">
        <div className="text-sm text-gray-700 font-medium">
          Cobranza no encontrada
        </div>
        <Link
          href="/marketing/cobranzas"
          className="text-sm text-fuchsia-700 hover:underline mt-2 inline-block"
        >
          ← Volver a cobranzas
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="border border-gray-200 rounded-lg bg-white p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              Cobranza
            </div>
            <div className="text-2xl font-semibold font-mono mt-0.5">
              {cobranza.numero}
            </div>
            <div className="text-sm text-gray-600 mt-2 flex items-center gap-2 flex-wrap">
              <EstadoBadge tipo="cobranza" estado={estadoLabel} />
              {marcaNombre && <span className="text-gray-700">{marcaNombre}</span>}
              {proyectoNombre && (
                <span className="text-gray-500">· {proyectoNombre}</span>
              )}
              {cobranza.fecha_envio && (
                <span className="text-gray-500">
                  · Enviada {formatearFecha(cobranza.fecha_envio)}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              Monto
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatearMonto(cobranza.monto)}
            </div>
            <div className="text-xs text-gray-500 mt-1 tabular-nums">
              Pagado:{" "}
              <span className="text-emerald-700">
                {formatearMonto(cobranza.total_pagado)}
              </span>
              {" · "}
              Saldo:{" "}
              <span
                className={
                  cobranza.saldo > 0 ? "text-amber-700" : "text-gray-500"
                }
              >
                {formatearMonto(cobranza.saldo)}
              </span>
            </div>
          </div>
        </div>

        {/* Acciones */}
        {!esAnulada && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {esBorrador && (
              <button
                type="button"
                onClick={() => setConfirmEnviar(true)}
                className="rounded-md bg-fuchsia-600 text-white px-3 py-2 text-sm hover:bg-fuchsia-700 active:scale-[0.97] transition"
              >
                Marcar enviada
              </button>
            )}
            {cobranza.estado !== "disputada" &&
              cobranza.estado !== "pagada" && (
                <button
                  type="button"
                  onClick={() => setConfirmDisputar(true)}
                  className="rounded-md bg-white border border-gray-300 text-gray-900 px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.97] transition"
                >
                  Marcar disputada
                </button>
              )}
            <button
              type="button"
              onClick={() => setConfirmAnular(true)}
              className="rounded-md bg-white border border-red-200 text-red-700 px-3 py-2 text-sm hover:bg-red-50 active:scale-[0.97] transition"
            >
              Anular
            </button>
          </div>
        )}
      </header>

      {/* Contenido del paquete */}
      <section className="border border-gray-200 rounded-lg bg-white">
        <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">
              Contenido del paquete
            </div>
            <div className="text-xs text-gray-500">
              PDF consolidado + Excel de respaldo + adjuntos + fotos del
              proyecto. Se genera en tu navegador al descargar.
            </div>
          </div>
          <DescargarZipButton cobranzaId={cobranza.id} />
        </header>

        {/* Preview del email */}
        <div className="p-4 space-y-2">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="text-gray-500 shrink-0 w-16">Para:</span>
            <span className="text-gray-900 font-mono truncate">
              {cobranza.email_destino || "—"}
            </span>
          </div>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="text-gray-500 shrink-0 w-16">Asunto:</span>
            <span className="text-gray-900 truncate">
              {cobranza.asunto || "—"}
            </span>
          </div>
          {cobranza.cuerpo && (
            <div className="text-sm">
              <div className="text-gray-500 mb-1">Cuerpo:</div>
              <pre className="whitespace-pre-wrap text-xs font-mono text-gray-800 bg-gray-50 rounded-md border border-gray-200 p-3 max-h-60 overflow-auto">
                {cobranza.cuerpo}
              </pre>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(cobranza.cuerpo ?? "");
                  toast("Cuerpo copiado al portapapeles", "success");
                }}
                className="text-xs text-fuchsia-700 hover:underline mt-2"
              >
                Copiar cuerpo
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Pagos */}
      <PagosSection cobranza={cobranza} onRefrescar={cargar} />

      {/* Anulación info */}
      {esAnulada && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-sm text-red-700">
          Esta cobranza fue anulada el{" "}
          {formatearFecha(cobranza.anulado_en ?? "")}.
          {cobranza.anulado_motivo && (
            <div className="mt-1 text-red-600">
              Motivo: {cobranza.anulado_motivo}
            </div>
          )}
        </div>
      )}

      {/* Modales */}
      <ConfirmDeleteModal
        open={confirmEnviar}
        title="Marcar como enviada"
        description="Confirma que ya enviaste el ZIP por email. La fecha de envío será hoy."
        onConfirm={handleEnviar}
        onCancel={() => setConfirmEnviar(false)}
        loading={enviando}
      />

      <ConfirmDeleteModal
        open={confirmDisputar}
        title="Marcar como disputada"
        description="Usa esto si la marca está objetando el cobro. Podrás reactivarla después."
        onConfirm={handleDisputar}
        onCancel={() => setConfirmDisputar(false)}
        loading={disputando}
      />

      {confirmAnular && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5">
            <div className="text-base font-semibold text-gray-900">
              Anular cobranza
            </div>
            <div className="text-sm text-gray-600 mt-1">
              La cobranza quedará en la papelera. Escribe un motivo breve.
            </div>
            <textarea
              rows={3}
              value={motivoAnular}
              onChange={(e) => setMotivoAnular(e.target.value)}
              placeholder="Ej: se creó por error, monto incorrecto…"
              className="w-full mt-3 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setConfirmAnular(false);
                  setMotivoAnular("");
                }}
                disabled={anulando}
                className="rounded-md border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAnular}
                disabled={anulando || motivoAnular.trim().length === 0}
                className="rounded-md bg-red-600 text-white px-3 py-2 text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {anulando ? "Anulando…" : "Anular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CobranzaDetalle;

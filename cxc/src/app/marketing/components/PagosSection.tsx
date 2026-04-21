"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { PagoForm } from "@/components/marketing";
import { ConfirmDeleteModal } from "@/components/ui";
import { formatearMonto, formatearFecha } from "@/lib/marketing/normalizar";
import type { CobranzaConPagos } from "@/lib/marketing/types";

interface PagosSectionProps {
  cobranza: CobranzaConPagos;
  onRefrescar: () => Promise<void>;
}

export function PagosSection({ cobranza, onRefrescar }: PagosSectionProps) {
  const { toast } = useToast();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [pagoAnular, setPagoAnular] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  const saldo = cobranza.saldo;
  const sinSaldo = saldo <= 0.001;

  const handleCrearPago = async (
    values: { fechaPago: string; monto: number; referencia: string }
  ) => {
    const res = await fetch("/api/marketing/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cobranzaId: cobranza.id,
        fechaPago: values.fechaPago,
        monto: values.monto,
        referencia: values.referencia || undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ error: "" }))) as {
        error?: string;
      };
      throw new Error(body.error || "No se pudo guardar el pago");
    }
    toast("Pago registrado", "success");
    setMostrarForm(false);
    await onRefrescar();
  };

  const handleAnular = async () => {
    if (!pagoAnular) return;
    setAnulando(true);
    try {
      const res = await fetch(
        `/api/marketing/pagos/${pagoAnular}/anular`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
        throw new Error(body.error || "No se pudo anular el pago");
      }
      toast("Pago anulado", "success");
      setPagoAnular(null);
      await onRefrescar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setAnulando(false);
    }
  };

  return (
    <section className="border border-gray-200 rounded-lg bg-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <div className="text-sm font-medium text-gray-900">Pagos</div>
          <div className="text-xs text-gray-500">
            {cobranza.pagos.length} pagos · pagado{" "}
            <span className="tabular-nums">
              {formatearMonto(cobranza.total_pagado)}
            </span>{" "}
            · saldo{" "}
            <span className="tabular-nums">{formatearMonto(saldo)}</span>
          </div>
        </div>
        {!mostrarForm && !sinSaldo && (
          <button
            type="button"
            onClick={() => setMostrarForm(true)}
            className="rounded-md bg-black text-white px-3 py-2 text-sm hover:bg-gray-800 active:scale-[0.97] transition"
          >
            Registrar pago
          </button>
        )}
      </header>

      <div className="p-4 space-y-4">
        {mostrarForm && (
          <div className="border border-fuchsia-200 bg-fuchsia-50/30 rounded-lg p-4">
            <PagoForm
              cobranza={cobranza}
              saldoPendiente={saldo}
              onSubmit={handleCrearPago}
              onCancel={() => setMostrarForm(false)}
            />
          </div>
        )}

        {cobranza.pagos.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            Sin pagos registrados todavía.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {cobranza.pagos.map((p) => (
              <li
                key={p.id}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-gray-900">
                    {formatearFecha(p.fecha_pago)} —{" "}
                    <span className="font-semibold tabular-nums">
                      {formatearMonto(p.monto)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {p.referencia || "Sin referencia"}
                    {p.notas ? ` · ${p.notas}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.comprobante_url && (
                    <a
                      href={p.comprobante_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-fuchsia-700 hover:underline"
                    >
                      Comprobante
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPagoAnular(p.id)}
                    className="text-xs text-red-600 hover:underline"
                    aria-label="Anular pago"
                  >
                    Anular
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDeleteModal
        open={Boolean(pagoAnular)}
        title="Anular este pago"
        description="El pago dejará de contar en el saldo. Puede revertirse desde la base de datos, pero no desde esta pantalla."
        onConfirm={handleAnular}
        onCancel={() => setPagoAnular(null)}
        loading={anulando}
      />
    </section>
  );
}

export default PagosSection;

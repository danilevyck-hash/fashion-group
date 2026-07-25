"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import type { MkMarca } from "@/lib/marketing/types";

interface Props {
  marcas: MkMarca[];
  onClose: () => void;
  onCreated: () => void;
}

const ORDEN_MARCA = ["TH", "CK", "RBK", "FC", "J", "OTR"];

export default function NuevaImpulsadoraModal({ marcas, onClose, onCreated }: Props) {
  const { toast } = useToast();
  useBodyScrollLock(true);
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("800");
  // marca_id → porcentaje (string para input controlado).
  const [split, setSplit] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const marcasOrdenadas = useMemo(
    () =>
      [...marcas].sort((a, b) => {
        const ia = ORDEN_MARCA.indexOf(a.codigo);
        const ib = ORDEN_MARCA.indexOf(b.codigo);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }),
    [marcas],
  );

  const seleccionadas = Object.keys(split);

  const toggleMarca = (id: string) => {
    setSplit((prev) => {
      const next = { ...prev };
      if (id in next) {
        delete next[id];
      } else {
        next[id] = "";
      }
      // Si queda solo una marca, autollenar 100.
      const ids = Object.keys(next);
      if (ids.length === 1) next[ids[0]] = "100";
      return next;
    });
  };

  const repartirIgual = () => {
    const ids = Object.keys(split);
    if (ids.length === 0) return;
    const base = Math.floor((100 / ids.length) * 100) / 100;
    const next: Record<string, string> = {};
    ids.forEach((id, i) => {
      next[id] = i === ids.length - 1
        ? String(Number((100 - base * (ids.length - 1)).toFixed(2)))
        : String(base);
    });
    setSplit(next);
  };

  const sumaPct = seleccionadas.reduce((s, id) => s + (Number(split[id]) || 0), 0);
  const montoNum = Number(monto) || 0;
  const sumaOk = Math.abs(sumaPct - 100) < 0.01;
  const puedeGuardar =
    nombre.trim().length > 0 && montoNum > 0 && seleccionadas.length >= 1 && sumaOk && !guardando;

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/marketing/impulsadoras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          montoMensual: montoNum,
          marcas: seleccionadas.map((id) => ({ marcaId: id, porcentaje: Number(split[id]) })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo crear la impulsadora");
      }
      toast("Impulsadora creada", "success");
      onCreated();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al crear", "error");
    } finally {
      setGuardando(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Clic fuera + Escape. Si ya escribió algo, no cierra (se sale con Cancelar).
  // El hook va ANTES del return condicional (reglas de hooks).
  const { panelRef, backdrop } = useFormModalDismiss(mounted, onClose, !guardando);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-[fadeIn_150ms_ease-out]">
      <div className="absolute inset-0 bg-black/40" {...backdrop} />
      <div
        ref={panelRef}
        className="relative bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Nueva impulsadora</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="text-gray-500 hover:text-black text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María González"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              autoCapitalize="words"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pago mensual *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Marca(s) *</label>
              {seleccionadas.length > 1 && (
                <button
                  type="button"
                  onClick={repartirIgual}
                  className="text-xs text-gray-500 hover:text-black transition"
                >
                  Repartir igual
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {marcasOrdenadas.map((m) => {
                const activa = m.id in split;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMarca(m.id)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      activa
                        ? "border-black bg-black text-white"
                        : "border-gray-300 text-gray-700 hover:border-gray-500"
                    }`}
                  >
                    {m.nombre}
                  </button>
                );
              })}
            </div>

            {seleccionadas.length > 0 && (
              <div className="mt-3 space-y-2">
                {seleccionadas.map((id) => {
                  const m = marcas.find((x) => x.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700">{m?.nombre ?? "Marca"}</span>
                      <div className="relative w-24">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step="0.01"
                          value={split[id]}
                          onChange={(e) =>
                            setSplit((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                          className="w-full rounded-md border border-gray-300 pr-7 pl-2 py-1.5 text-sm text-right tabular-nums focus:border-black focus:outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                      </div>
                    </div>
                  );
                })}
                <div
                  className={`text-xs text-right ${sumaOk ? "text-gray-500" : "text-red-600"}`}
                >
                  Suma: {sumaPct.toFixed(2)}% {sumaOk ? "✓" : "(debe ser 100%)"}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="text-sm text-gray-600 hover:text-black transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className="rounded-md bg-black text-white px-4 py-2 text-sm active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? "Guardando…" : "Guardar impulsadora"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

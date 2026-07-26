"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { etiquetaMes } from "@/lib/marketing/meses";
import type { ImpulsadoraConEstado, MkMarca } from "@/lib/marketing/types";
import NuevaImpulsadoraModal from "./NuevaImpulsadoraModal";
import RegistrarPagoModal from "./RegistrarPagoModal";

interface Props {
  marcas: MkMarca[];
}

// Iniciales del nombre (hasta 2 palabras).
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// Chip de estado de un mes: pagado ✓ (verde) / pendiente ⏳ (ámbar).
function ChipMes({ label, pagado }: { label: string; pagado: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        pagado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {pagado ? "✓" : "⏳"} {label}
    </span>
  );
}

export default function ImpulsadorasView({ marcas }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ImpulsadoraConEstado[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNueva, setShowNueva] = useState(false);
  const [pagando, setPagando] = useState<ImpulsadoraConEstado | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/impulsadoras", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ImpulsadoraConEstado[];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
      toast("No se pudieron cargar las impulsadoras.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const pendientes = (items ?? []).filter((i) => i.activa && !i.mesActual.pagado).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Impulsadoras</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pago mensual fijo por marca · con comprobante
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNueva(true)}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
        >
          + Nueva impulsadora
        </button>
      </div>

      {!loading && (items?.length ?? 0) > 0 && (
        <div className="text-sm text-gray-600">
          {pendientes === 0 ? (
            <span className="text-emerald-700">Todo al día este mes ✓</span>
          ) : (
            <span>
              <span className="font-semibold text-amber-700">{pendientes}</span> pendiente
              {pendientes === 1 ? "" : "s"} de pago este mes
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (items?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">
            Aún no hay impulsadoras. Agrega la primera con “+ Nueva impulsadora”.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items!.map((imp) => (
            <div
              key={imp.id}
              className="rounded-xl border border-gray-200 bg-white p-4 flex items-start gap-4"
            >
              <div className="shrink-0 h-11 w-11 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
                {iniciales(imp.nombre)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{imp.nombre}</span>
                  {!imp.activa && (
                    <span className="rounded bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5">
                      Inactiva
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5 truncate">
                  {imp.marcas.length > 0
                    ? imp.marcas.map((m) => `${m.marca.nombre} ${m.porcentaje}%`).join(" · ")
                    : "Sin marcas"}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <ChipMes label={etiquetaMes(imp.mesAnterior.mes)} pagado={imp.mesAnterior.pagado} />
                  <ChipMes label={etiquetaMes(imp.mesActual.mes)} pagado={imp.mesActual.pagado} />
                </div>
              </div>

              <div className="shrink-0 text-right flex flex-col items-end gap-2">
                <div>
                  <div className="font-semibold text-gray-900 tabular-nums">
                    {formatearMonto(imp.monto_mensual)}
                  </div>
                  <div className="text-xs text-gray-400">/ mes</div>
                </div>
                {!imp.mesActual.pagado && (
                  <button
                    type="button"
                    onClick={() => setPagando(imp)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-black hover:text-black transition"
                  >
                    Registrar pago
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNueva && (
        <NuevaImpulsadoraModal
          marcas={marcas}
          onClose={() => setShowNueva(false)}
          onCreated={() => {
            setShowNueva(false);
            cargar();
          }}
        />
      )}

      {pagando && (
        <RegistrarPagoModal
          impulsadora={pagando}
          mesInicial={pagando.mesActual.mes}
          onClose={() => setPagando(null)}
          onSaved={() => {
            setPagando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

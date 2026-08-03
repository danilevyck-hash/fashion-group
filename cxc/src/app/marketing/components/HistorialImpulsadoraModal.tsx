"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Historial de una impulsadora + edición de su ficha.
//
// 🩸 POR QUÉ. Daniel, 3-ago-2026: *"en impulsadoras, no puedo ver el historial
// ni nada, solo me deja ingresar gastos… quiero ver y editar el historial"*.
// El módulo era de SOLO ESCRITURA: la tarjeta enseñaba los últimos 3 períodos
// como texto y nada más, aunque en la base había pagos guardados desde
// abril-2024. Y la ficha no se podía editar: subirle el sueldo a alguien
// obligaba a borrarla y crearla de nuevo, partiendo su historial en dos.
//
// ⚠️ Los pagos se ANULAN, no se borran: alimentan el reporte por marca, la card
// de marca y el Excel de gastos, y los tres filtran por anulado. Anular los
// saca de todos los totales y deja el rastro de por qué.
// ─────────────────────────────────────────────────────────────────────────────

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { formatearMonto } from "@/lib/marketing/normalizar";
import type { ImpulsadoraConEstado } from "@/lib/marketing/types";

interface PagoMarcaUI {
  marcaId: string;
  marca: string;
  monto: number;
}

interface PagoUI {
  ref: string;
  periodoDesde: string | null;
  periodoHasta: string | null;
  mes: string | null;
  concepto: string;
  fechaRegistro: string | null;
  total: number;
  marcas: PagoMarcaUI[];
  anulado: boolean;
  anuladoMotivo: string | null;
  comprobanteUrl: string | null;
}

interface Props {
  impulsadora: ImpulsadoraConEstado;
  onClose: () => void;
  /** Se llama cuando algo cambió y la lista de afuera debe recargarse. */
  onChanged: () => void;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-06-01" → "junio 2026". Se parte el string: `new Date` lo correría un
 *  día por zona horaria y un pago de día 1 se vería como el mes anterior. */
function etiquetaMesISO(iso: string | null): string {
  if (!iso) return "—";
  const [a, m] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MESES[mi]} ${a}` : iso;
}

function etiquetaPeriodoUI(p: PagoUI): string {
  if (p.periodoDesde && p.periodoHasta) {
    const d = p.periodoDesde.slice(8, 10);
    const h = p.periodoHasta.slice(8, 10);
    return `${d}–${h} ${etiquetaMesISO(p.periodoDesde)}`;
  }
  return etiquetaMesISO(p.mes);
}

export default function HistorialImpulsadoraModal({ impulsadora, onClose, onChanged }: Props) {
  const { toast } = useToast();
  useBodyScrollLock(true);

  const [pagos, setPagos] = useState<PagoUI[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(impulsadora.nombre);
  const [monto, setMonto] = useState(String(impulsadora.monto_mensual));
  const [guardando, setGuardando] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/marketing/impulsadoras/${impulsadora.id}/pagos`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { pagos?: PagoUI[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el historial");
      setPagos(data.pagos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el historial");
      setPagos([]);
    }
  }, [impulsadora.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarFicha() {
    const m = Number(monto);
    if (!nombre.trim()) return toast("Escribe el nombre", "error");
    if (!Number.isFinite(m) || m < 0) return toast("Monto mensual inválido", "error");
    setGuardando(true);
    try {
      const res = await fetch(`/api/marketing/impulsadoras/${impulsadora.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), montoMensual: m }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      toast("Listo, guardado", "success");
      setEditando(false);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function anular(p: PagoUI) {
    const motivo = window.prompt(
      `¿Por qué se anula el pago de ${etiquetaPeriodoUI(p)}?\n\nEl gasto deja de contar en los reportes, pero queda el registro.`,
    );
    if (motivo === null) return;
    if (!motivo.trim()) return toast("Escribe el motivo para poder anularlo", "error");
    setAnulando(p.ref);
    try {
      const url =
        `/api/marketing/impulsadoras/${impulsadora.id}/pagos` +
        `?ref=${encodeURIComponent(p.ref)}&motivo=${encodeURIComponent(motivo.trim())}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo anular");
      toast("Pago anulado", "success");
      await cargar();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo anular", "error");
    } finally {
      setAnulando(null);
    }
  }

  const vigentes = (pagos ?? []).filter((p) => !p.anulado);
  const totalPagado = vigentes.reduce((s, p) => s + p.total, 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-[fadeIn_150ms_ease-out]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white w-full sm:max-w-2xl sm:rounded-lg rounded-t-2xl max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-gray-900">{impulsadora.nombre}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-500 hover:text-black text-xl leading-none min-h-[44px] min-w-[44px]"
          >
            ×
          </button>
        </div>

        {/* ── Ficha ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-gray-100">
          {!editando ? (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-gray-900 font-medium">
                  {formatearMonto(impulsadora.monto_mensual)}{" "}
                  <span className="text-gray-400 font-normal">/ mes</span>
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5">
                  {impulsadora.marcas.length > 0
                    ? impulsadora.marcas.map((m) => `${m.marca.nombre} ${m.porcentaje}%`).join(" · ")
                    : "Sin marcas"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="shrink-0 min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:border-black hover:text-black transition"
              >
                Editar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">
                  Nombre
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">
                  Pago mensual
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"
                />
                {/* Que nadie espere que esto corrija lo ya pagado. */}
                <p className="text-[12px] text-gray-500 mt-1">
                  Aplica del próximo pago en adelante. Los pagos ya registrados no cambian.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={guardarFicha}
                  disabled={guardando}
                  className="min-h-[44px] rounded-md bg-black text-white px-4 text-sm active:scale-[0.97] transition disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditando(false);
                    setNombre(impulsadora.nombre);
                    setMonto(String(impulsadora.monto_mensual));
                  }}
                  disabled={guardando}
                  className="min-h-[44px] rounded-md px-4 text-sm text-gray-600 hover:text-black transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Historial ─────────────────────────────────────────────────── */}
        <div className="px-6 py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Pagos</h3>
            {vigentes.length > 0 && (
              <span className="text-[12px] text-gray-500 tabular-nums">
                {vigentes.length} · {formatearMonto(totalPagado)} en total
              </span>
            )}
          </div>

          {pagos === null && <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>}
          {error && <p className="text-sm text-red-600 py-4">{error}</p>}
          {pagos !== null && pagos.length === 0 && !error && (
            <p className="text-sm text-gray-500 py-6 text-center">
              Todavía no tiene pagos registrados.
            </p>
          )}

          <div className="space-y-2">
            {(pagos ?? []).map((p) => (
              <div
                key={p.ref}
                className={`rounded-lg border p-3 ${
                  p.anulado ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium ${
                          p.anulado ? "text-gray-400 line-through" : "text-gray-900"
                        }`}
                      >
                        {etiquetaPeriodoUI(p)}
                      </span>
                      {p.anulado && (
                        <span className="rounded bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5">
                          Anulado
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-gray-500 mt-0.5">
                      {p.marcas.length > 0
                        ? p.marcas.map((m) => `${m.marca} ${formatearMonto(m.monto)}`).join(" · ")
                        : "Sin marca"}
                    </div>
                    {p.anulado && p.anuladoMotivo && (
                      <div className="text-[12px] text-gray-500 mt-1">Motivo: {p.anuladoMotivo}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={`font-semibold tabular-nums ${
                        p.anulado ? "text-gray-400 line-through" : "text-gray-900"
                      }`}
                    >
                      {formatearMonto(p.total)}
                    </div>
                    {p.fechaRegistro && (
                      <div className="text-[12px] text-gray-400 mt-0.5">
                        registrado {p.fechaRegistro}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  {p.comprobanteUrl ? (
                    <a
                      href={p.comprobanteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-gray-600 hover:text-black underline underline-offset-2 min-h-[44px] inline-flex items-center"
                    >
                      Ver comprobante
                    </a>
                  ) : (
                    <span className="text-[13px] text-gray-400 min-h-[44px] inline-flex items-center">
                      Sin comprobante
                    </span>
                  )}
                  {!p.anulado && (
                    <button
                      type="button"
                      onClick={() => void anular(p)}
                      disabled={anulando === p.ref}
                      className="ml-auto text-[13px] text-gray-500 hover:text-red-600 min-h-[44px] px-2 rounded-md hover:bg-red-50 active:scale-[0.97] transition disabled:opacity-50"
                    >
                      {anulando === p.ref ? "Anulando…" : "Anular"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

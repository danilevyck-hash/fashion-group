"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { EstadoBadge, MarcaBadge } from "@/components/marketing";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import type {
  FacturaConAdjuntos,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import FacturasSection from "./FacturasSection";
import FotosSection from "./FotosSection";
import CobrarTab from "./CobrarTab";

type Tab = "facturas" | "fotos" | "cobrar";

function esMarcaConocida(c: string): c is "TH" | "CK" | "RBK" {
  return c === "TH" || c === "CK" || c === "RBK";
}

interface Props {
  proyectoId: string;
  marca: MkMarca;
  onClose: () => void;
  onChange: () => void;
  onNombreProyecto?: (nombre: string) => void;
}

export default function ProyectoOverlay({
  proyectoId,
  marca,
  onClose,
  onChange,
  onNombreProyecto,
}: Props) {
  const { toast } = useToast();
  const [proyecto, setProyecto] = useState<ProyectoConMarcas | null>(null);
  const [facturas, setFacturas] = useState<FacturaConAdjuntos[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("facturas");
  const [cerrando, setCerrando] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [showReabrir, setShowReabrir] = useState(false);
  const [puedeReabrir, setPuedeReabrir] = useState<{
    puede: boolean;
    razon?: string;
  } | null>(null);
  const [showAnular, setShowAnular] = useState(false);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  // Refs estables para callbacks del parent — evitan que el useEffect se
  // re-dispare por cambios de referencia del parent (causaba race conditions
  // donde fetchs se pisaban y el overlay terminaba con facturas vacías).
  const onCloseRef = useRef(onClose);
  const onNombreProyectoRef = useRef(onNombreProyecto);
  useEffect(() => {
    onCloseRef.current = onClose;
    onNombreProyectoRef.current = onNombreProyecto;
  }, [onClose, onNombreProyecto]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const pRes = await fetch(`/api/marketing/proyectos/${proyectoId}`, {
        cache: "no-store",
      });
      if (!pRes.ok) {
        const err = await pRes.json().catch(() => null);
        throw new Error(err?.error ?? "Proyecto no encontrado");
      }
      const body = (await pRes.json()) as ProyectoConMarcas & {
        facturas?: FacturaConAdjuntos[];
      };
      setProyecto(body);
      onNombreProyectoRef.current?.(body.nombre || body.tienda);
      setFacturas(Array.isArray(body.facturas) ? body.facturas : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar";
      toast(msg, "error");
      onCloseRef.current();
    } finally {
      setLoading(false);
    }
  }, [proyectoId, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!proyecto || proyecto.estado === "abierto") {
      setPuedeReabrir(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/marketing/proyectos/${proyectoId}/reabrir`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { puede: boolean; razon?: string };
        if (!cancelado) setPuedeReabrir(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [proyecto, proyectoId]);

  const totales = useMemo(() => {
    const vigentes = facturas.filter((f) => !f.anulado_en);
    const subtotal = vigentes.reduce((acc, f) => acc + f.subtotal, 0);
    const total = vigentes.reduce((acc, f) => acc + f.total, 0);
    return {
      subtotal: Number(subtotal.toFixed(2)),
      total: Number(total.toFixed(2)),
      conteo: vigentes.length,
    };
  }, [facturas]);

  // Cobrable por marca = SUM(facturas.total) × porcentaje.
  // Regla de negocio: la cobranza siempre es sobre el total (subtotal + ITBMS).
  const cobrablePorMarca = useMemo(() => {
    if (!proyecto) return [];
    return proyecto.marcas.map((m) => {
      const monto = (totales.total * m.porcentaje) / 100;
      return {
        marca: m.marca,
        porcentaje: m.porcentaje,
        monto: Number(monto.toFixed(2)),
      };
    });
  }, [proyecto, totales.total]);

  const handleCerrar = async () => {
    if (!proyecto) return;
    setCerrando(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/cerrar`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo cerrar");
      }
      const data = (await res.json()) as { cobranzasCreadas?: number };
      toast(
        `Proyecto cerrado${
          data.cobranzasCreadas
            ? `. ${data.cobranzasCreadas} cobranza(s) borrador creada(s).`
            : ""
        }`,
        "success",
      );
      setShowCerrar(false);
      setTab("cobrar");
      await cargar();
      onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setCerrando(false);
    }
  };

  const handleReabrir = async () => {
    if (!proyecto) return;
    setReabriendo(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/reabrir`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo reabrir");
      }
      toast("Proyecto reabierto", "success");
      setShowReabrir(false);
      setTab("facturas");
      await cargar();
      onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setReabriendo(false);
    }
  };

  const handleAnular = async () => {
    if (!proyecto || !anularMotivo.trim()) return;
    setAnulando(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/anular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: anularMotivo.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo anular");
      }
      toast("Proyecto anulado", "success");
      onChange();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setAnulando(false);
    }
  };

  const mensajeReabrir = proyecto
    ? proyecto.estado === "cobrado"
      ? "La cobranza volverá a estado Enviada. ¿Seguro que quieres reabrir?"
      : puedeReabrir?.razon ??
        "El proyecto volverá a estado Abierto. Las cobranzas borrador se eliminarán."
    : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center sm:justify-center">
      <div
        className="relative w-full bg-white sm:max-w-4xl lg:max-w-5xl sm:rounded-lg rounded-t-2xl max-h-[95vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-600 hover:text-black transition"
            >
              ← Volver
            </button>
            {proyecto && !proyecto.anulado_en && (
              <div className="flex items-center gap-2">
                {proyecto.estado === "abierto" ? (
                  <button
                    type="button"
                    onClick={() => setShowCerrar(true)}
                    className="rounded-md bg-black text-white px-3 py-1.5 text-xs active:scale-[0.97] transition"
                  >
                    Cerrar proyecto
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowReabrir(true)}
                    disabled={reabriendo}
                    className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50 transition"
                  >
                    {reabriendo ? "Reabriendo…" : "Reabrir"}
                  </button>
                )}
                {/* Anular solo visible desde 'por_cobrar' en adelante: evita
                    mostrar acción destructiva durante la creación. */}
                {proyecto.estado !== "abierto" && (
                  <OverflowMenu
                    items={[
                      {
                        label: "Anular proyecto",
                        onClick: () => setShowAnular(true),
                        destructive: true,
                      },
                    ]}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {loading || !proyecto ? (
          <div className="p-6 space-y-4">
            <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Datos del proyecto */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-gray-900 truncate">
                    {proyecto.tienda}
                  </div>
                  {proyecto.nombre && (
                    <div className="text-sm text-gray-500 truncate">
                      {proyecto.nombre}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    Inicio: {formatearFecha(proyecto.fecha_inicio)}
                    {proyecto.fecha_cierre
                      ? ` · Cerrado: ${formatearFecha(proyecto.fecha_cierre)}`
                      : ""}
                  </div>
                  {cobrablePorMarca.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                      {cobrablePorMarca.map((c) => (
                        <div key={c.marca.id} className="flex items-center gap-1.5">
                          <span className="text-gray-500">
                            Cobrable a {c.marca.nombre}:
                          </span>
                          <span className="font-mono tabular-nums font-semibold text-gray-900">
                            {formatearMonto(c.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <EstadoBadge
                    tipo="proyecto"
                    estado={proyecto.estado}
                    size="md"
                  />
                  {proyecto.anulado_en && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                      Anulado
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
                {proyecto.marcas.map((m) => (
                  <div
                    key={m.marca.id}
                    className="inline-flex items-center gap-1.5"
                  >
                    {esMarcaConocida(m.marca.codigo) ? (
                      <MarcaBadge codigo={m.marca.codigo} />
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {m.marca.nombre}
                      </span>
                    )}
                    <span className="text-xs text-gray-600 tabular-nums font-medium">
                      {m.porcentaje}%
                    </span>
                  </div>
                ))}
              </div>

              {proyecto.notas && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-400 mb-0.5">Notas</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {proyecto.notas}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-100">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">
                    Facturas
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-gray-900">
                    {totales.conteo}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">
                    Subtotal
                  </div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                    {formatearMonto(totales.subtotal)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">
                    Total
                  </div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                    {formatearMonto(totales.total)}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-200">
              {(
                [
                  { k: "facturas" as const, label: "Facturas" },
                  { k: "fotos" as const, label: "Fotos" },
                  ...(proyecto.estado !== "abierto"
                    ? [{ k: "cobrar" as const, label: "Cobrar" }]
                    : []),
                ]
              ).map(({ k, label }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`px-3 py-2 text-sm transition relative ${
                    tab === k
                      ? "text-gray-900 font-semibold"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                  {tab === k && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-fuchsia-500" />
                  )}
                </button>
              ))}
            </div>

            {tab === "facturas" && (
              <FacturasSection
                proyecto={proyecto}
                facturasIniciales={facturas}
                onChange={() => {
                  cargar();
                  onChange();
                }}
                readonly={proyecto.estado === "cobrado"}
              />
            )}
            {tab === "fotos" && (
              <FotosSection
                proyectoId={proyecto.id}
                readonly={proyecto.estado === "cobrado"}
              />
            )}
            {tab === "cobrar" && proyecto.estado !== "abierto" && (
              <CobrarTab
                proyecto={proyecto}
                onChange={() => {
                  cargar();
                  onChange();
                }}
              />
            )}
          </div>
        )}

        <ConfirmModal
          open={showCerrar}
          onClose={() => !cerrando && setShowCerrar(false)}
          onConfirm={handleCerrar}
          title="Cerrar proyecto"
          message="El proyecto pasa a 'Por cobrar' y se creará una cobranza borrador por cada marca del proyecto. Podrás editarlas antes de enviarlas."
          confirmLabel="Cerrar proyecto"
          loading={cerrando}
        />

        <ConfirmModal
          open={showReabrir}
          onClose={() => !reabriendo && setShowReabrir(false)}
          onConfirm={handleReabrir}
          title="Reabrir proyecto"
          message={mensajeReabrir}
          confirmLabel="Reabrir"
          loading={reabriendo}
        />

        {showAnular && (
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
            onClick={() => !anulando && setShowAnular(false)}
          >
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold mb-1">Anular proyecto</h3>
              <p className="text-sm text-gray-500 mb-4">
                Podrás restaurarlo desde Papelera.
              </p>
              <label
                htmlFor="mk-motivo-anular-proy"
                className="block text-sm text-gray-600 mb-1"
              >
                Motivo<span className="text-red-500 ml-0.5">*</span>
              </label>
              <textarea
                id="mk-motivo-anular-proy"
                rows={3}
                value={anularMotivo}
                onChange={(e) => setAnularMotivo(e.target.value)}
                placeholder="Explica por qué se anula"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none mb-4"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAnular}
                  disabled={anulando || anularMotivo.trim().length === 0}
                  className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
                >
                  {anulando ? "Anulando…" : "Anular proyecto"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAnular(false)}
                  disabled={anulando}
                  className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

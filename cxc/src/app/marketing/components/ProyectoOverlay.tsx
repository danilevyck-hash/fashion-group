"use client";

// Fase 4: overlay simplificado con workflow abierto → enviado → cobrado.
// Tabs: Facturas, Fotos. Sin "Cobrar" tab ni cobranzas como entidad.
// El modal solo edita datos del proyecto. TODAS las acciones de workflow
// (marcar enviado/cobrado, reabrir, descargar ZIP, anular) viven en las
// cards del listado.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmTypeNameModal } from "@/components/ui";
import { useDescargarZip } from "@/lib/marketing/useDescargarZip";
import {
  formatearFecha,
  formatearMonto,
} from "@/lib/marketing/normalizar";
import {
  PORCENTAJE_IMPORTACION_ZONA_LIBRE,
  calcularImportacion,
} from "@/lib/marketing-calc";
import type {
  FacturaConAdjuntos,
  MarcaConPorcentaje,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

interface FacturaConAdjuntosYMarcas extends FacturaConAdjuntos {
  marcas?: MarcaConPorcentaje[];
}
import FacturasSection from "./FacturasSection";
import FotosSection from "./FotosSection";
import EntregasSection from "./EntregasSection";
import EditarProyectoModal from "./EditarProyectoModal";
import type { EntregaConItems } from "@/lib/marketing/types";

type Tab = "facturas" | "fotos";

interface Props {
  proyectoId: string;
  marca?: MkMarca; // compat opcional
  onClose: () => void;
  onChange: () => void;
  onNombreProyecto?: (nombre: string) => void;
}

export default function ProyectoOverlay({
  proyectoId,
  onClose,
  onChange,
  onNombreProyecto,
}: Props) {
  const { toast } = useToast();
  const [proyecto, setProyecto] = useState<ProyectoConMarcas | null>(null);
  const [facturas, setFacturas] = useState<FacturaConAdjuntosYMarcas[]>([]);
  const [entregas, setEntregas] = useState<EntregaConItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("facturas");
  const [marcasCatalogo, setMarcasCatalogo] = useState<MkMarca[]>([]);
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [eliminandoLoading, setEliminandoLoading] = useState(false);
  const [role, setRole] = useState<string>("");
  const { estados: zipEstados, descargar: descargarZip } = useDescargarZip();

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") ?? "");
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/marcas", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as MkMarca[];
        if (!cancelado) setMarcasCatalogo(Array.isArray(data) ? data : []);
      } catch { /* */ }
    })();
    return () => { cancelado = true; };
  }, []);

  // Refs estables para callbacks del parent
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
        facturas?: FacturaConAdjuntosYMarcas[];
      };
      setProyecto(body);
      onNombreProyectoRef.current?.(body.nombre || body.tienda);
      setFacturas(Array.isArray(body.facturas) ? body.facturas : []);

      // Cargar entregas en paralelo (no bloquea si falla)
      try {
        const eRes = await fetch(
          `/api/marketing/inventario/entregas?proyecto_id=${proyectoId}`,
          { cache: "no-store" },
        );
        if (eRes.ok) {
          const eData = (await eRes.json()) as EntregaConItems[];
          setEntregas(Array.isArray(eData) ? eData : []);
        }
      } catch {
        /* no bloquear el overlay si entregas no carga */
      }
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

  const totales = useMemo(() => {
    const vigentes = facturas.filter((f) => !f.anulado_en);
    const subtotalFact = vigentes.reduce((acc, f) => acc + f.subtotal, 0);
    const totalFact = vigentes.reduce((acc, f) => acc + f.total, 0);
    // Importación 15%: sumar solo facturas con tiene_importacion = true.
    const importacion = vigentes.reduce(
      (acc, f) =>
        acc + calcularImportacion(f.subtotal, Boolean(f.tiene_importacion)),
      0,
    );
    const tieneAlgunaZonaLibre = vigentes.some((f) => f.tiene_importacion);
    // Suma de entregas — se acumula al total del proyecto sin línea separada.
    const totalEntregas = entregas.reduce(
      (acc, e) => acc + Number(e.total ?? 0),
      0,
    );
    return {
      subtotal: Number(subtotalFact.toFixed(2)),
      importacion: Number(importacion.toFixed(2)),
      // total del proyecto = facturas + entregas
      total: Number((totalFact + totalEntregas).toFixed(2)),
      totalEntregas: Number(totalEntregas.toFixed(2)),
      conteo: vigentes.length,
      conteoEntregas: entregas.length,
      tieneAlgunaZonaLibre,
    };
  }, [facturas, entregas]);

  if (loading || !proyecto) {
    return (
      <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center sm:justify-center">
        <div className="relative w-full bg-white sm:max-w-4xl lg:max-w-5xl sm:rounded-lg rounded-t-2xl max-h-[95vh] overflow-y-auto border border-gray-200 p-6">
          <div className="space-y-4">
            <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const esAdmin = role === "admin";

  const handleEliminar = async () => {
    setEliminandoLoading(true);
    try {
      const res = await fetch(`/api/marketing/proyectos/${proyecto.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Proyecto eliminado", "success");
      setEliminando(false);
      onChange();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al eliminar";
      toast(msg, "error");
    } finally {
      setEliminandoLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center sm:justify-center">
      <div
        className="relative w-full bg-white sm:max-w-4xl lg:max-w-5xl sm:rounded-lg rounded-t-2xl max-h-[95vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky — solo navegación + título + estado.
            Las acciones de workflow viven en las cards del listado. */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-600 hover:text-black transition shrink-0"
            >
              ← Listo
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 truncate">
                {proyecto.nombre || proyecto.tienda}
              </span>
              {proyecto.anulado_en && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium shrink-0">
                  Anulado
                </span>
              )}
            </div>
            {!proyecto.anulado_en && (
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  descargarZip(proyecto.id);
                }}
                disabled={
                  zipEstados[proyecto.id]?.tipo === "trabajando" ||
                  zipEstados[proyecto.id]?.tipo === "exito"
                }
                className="text-xs rounded-md bg-black text-white px-3 py-1.5 active:scale-[0.97] transition disabled:opacity-60 shrink-0"
                title="Descargar ZIP del proyecto (Excel + PDFs + fotos)"
              >
                {zipEstados[proyecto.id]?.tipo === "trabajando"
                  ? "Generando…"
                  : zipEstados[proyecto.id]?.tipo === "exito"
                    ? "Listo ✓"
                    : "Descargar ZIP"}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Datos del proyecto */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="text-[11px] text-gray-400 mb-0.5 inline-flex items-center gap-1">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Guardado automáticamente
                </div>
                <div className="text-lg font-semibold text-gray-900 truncate">
                  {proyecto.nombre || proyecto.tienda}
                </div>
                {proyecto.nombre && proyecto.tienda && (
                  <div className="text-sm text-gray-500 truncate">
                    Tienda: {proyecto.tienda}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  <span>Inicio: {formatearFecha(proyecto.fecha_inicio)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {proyecto.anulado_en && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                    Anulado
                  </span>
                )}
                <div className="flex gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                  >
                    Editar
                  </button>
                  {esAdmin && (
                    <button
                      type="button"
                      onClick={() => setEliminando(true)}
                      className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {proyecto.notas && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-0.5">Notas</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {proyecto.notas}
                </div>
              </div>
            )}

            <div
              className={`grid ${
                totales.tieneAlgunaZonaLibre ? "grid-cols-4" : "grid-cols-3"
              } gap-3 mt-4 pt-3 border-t border-gray-100`}
            >
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
              {totales.tieneAlgunaZonaLibre && (
                <div>
                  <div
                    className="text-[10px] uppercase tracking-wider text-amber-700"
                    title="Sumatoria del 15% de importación de las facturas marcadas como zona libre"
                  >
                    Importación {PORCENTAJE_IMPORTACION_ZONA_LIBRE}%
                  </div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-amber-800">
                    +{formatearMonto(totales.importacion)}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">
                  Costo total
                </div>
                <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                  {formatearMonto(totales.total)}
                </div>
              </div>
            </div>

          </div>

          {/* Tabs: solo Facturas y Fotos */}
          <div className="flex items-center gap-1 border-b border-gray-200">
            {(
              [
                { k: "facturas" as const, label: "Facturas" },
                { k: "fotos" as const, label: "Fotos" },
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
            <div className="space-y-6">
              <FacturasSection
                proyecto={proyecto}
                facturasIniciales={facturas}
                onChange={() => {
                  cargar();
                  onChange();
                }}
                readonly={false}
              />
              <EntregasSection
                proyecto={proyecto}
                marcasParaEntrega={proyecto.marcas}
                onChange={() => {
                  cargar();
                  onChange();
                }}
              />
            </div>
          )}
          {tab === "fotos" && (
            <FotosSection
              proyectoId={proyecto.id}
              readonly={false}
            />
          )}
        </div>
      </div>

      <EditarProyectoModal
        open={editando}
        proyecto={proyecto}
        marcasCatalogo={marcasCatalogo}
        onClose={() => setEditando(false)}
        onSaved={() => {
          cargar();
          onChange();
        }}
      />

      <ConfirmTypeNameModal
        open={eliminando}
        title="Eliminar proyecto definitivamente"
        description="Se borrarán el proyecto, sus facturas, fotos y archivos en Storage. Esta acción NO se puede deshacer."
        expectedName={proyecto.nombre || proyecto.tienda}
        onCancel={() => setEliminando(false)}
        onConfirm={handleEliminar}
        loading={eliminandoLoading}
      />
    </div>
  );
}

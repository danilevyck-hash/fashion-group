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
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useToast } from "@/components/ToastSystem";
import { ConfirmTypeNameModal, ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
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
import {
  lineaContextoMarca,
  totalesPorMarcaDeProyecto,
} from "@/lib/marketing/contexto-marca";
import FacturasSection from "./FacturasSection";
import FotosSection from "./FotosSection";
import EntregasSection from "./EntregasSection";
import EditarProyectoModal from "./EditarProyectoModal";
import type { EntregaConItems } from "@/lib/marketing/types";

type Tab = "facturas" | "fotos";

// Columnas de la cabecera de totales según cuántas celdas haya (3 base +
// Entregas + Importación). Literales completos — el purge de Tailwind no ve
// clases armadas por concatenación. Con 5 celdas, a 390 px van 3+2 en dos
// filas (cinco montos en una sola línea no entran sin recortar).
const GRID_TOTALES: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-3 sm:grid-cols-5",
};

interface Props {
  proyectoId: string;
  /**
   * La marca desde cuyo período se abrió el overlay. Con ella (y el período)
   * se dibuja la línea de contexto: "En Calvin Klein · Período 2026: $2,600 —
   * este proyecto también tiene $2,470 de Tommy Hilfiger". Daniel quiere
   * seguir viendo AMBAS marcas en el proyecto — el contexto explica el salto
   * de número entre la tarjeta tocada y el total del overlay, no lo esconde.
   */
  marca?: MkMarca;
  /** Nombre del período desde el que se abrió (ej. "Período 2026"). */
  periodoNombre?: string | null;
  /** Monto del proyecto en esa marca/período — el del agregador (la tarjeta). */
  montoEnPeriodo?: number | null;
  onClose: () => void;
  onChange: () => void;
  onNombreProyecto?: (nombre: string) => void;
}

export default function ProyectoOverlay({
  proyectoId,
  marca,
  periodoNombre,
  montoEnPeriodo,
  onClose,
  onChange,
  onNombreProyecto,
}: Props) {
  const { toast } = useToast();
  const [proyecto, setProyecto] = useState<ProyectoConMarcas | null>(null);
  const [facturas, setFacturas] = useState<FacturaConAdjuntosYMarcas[]>([]);
  const [entregas, setEntregas] = useState<EntregaConItems[]>([]);
  const [loading, setLoading] = useState(true);
  // Tab del overlay (Facturas/Fotos) en la URL (?pt=fotos). Key "pt" para no
  // chocar con proyecto/vista del page. Sobrevive refresh con ?proyecto=<id>.
  const [tab, setTab] = useUrlState<Tab>("pt", "facturas");
  const [marcasCatalogo, setMarcasCatalogo] = useState<MkMarca[]>([]);
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [eliminandoLoading, setEliminandoLoading] = useState(false);
  const [role, setRole] = useState<string>("");
  const { estados: zipEstados, descargar: descargarZip } = useDescargarZip();

  // Escape cierra el overlay del proyecto, pero NO cuando hay un modal encima
  // (editar / eliminar): ahí el Escape le toca al de arriba, si no se cerrarían
  // los dos de un golpe. El clic fuera se pasa como onBackdropClick abajo.
  useEscapeClose(true, onClose, !editando && !eliminando);

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

  // Marcas REALES del proyecto. Un proyecto es del CLIENTE y su marca vive en
  // los DOCUMENTOS: una factura por marca y una entrega de muebles por marca.
  //
  // 🩸 `mk_proyecto_marcas` NO sirve para esto: medido el 11-ago-2026, solo 3
  // de 22 proyectos vivos tienen filas ahí (Nova Lux, ninguna). Mostrar esa
  // tabla habría dejado el bloque vacío justo en el proyecto que originó el
  // arreglo. Se usa la MISMA regla que las tarjetas del inicio — facturas ∪
  // entregas — más lo que traiga mk_proyecto_marcas, por si algún día se usa.
  const marcasDelProyecto = useMemo(() => {
    const nombres = new Map<string, string>(
      marcasCatalogo.map((m) => [String(m.id), m.nombre]),
    );
    const out = new Map<string, string>();
    const anotar = (id: string, nombre?: string) => {
      const key = String(id);
      const n = nombres.get(key) ?? nombre;
      if (n) out.set(key, n);
    };
    for (const pm of proyecto?.marcas ?? []) anotar(pm.marca.id, pm.marca.nombre);
    for (const f of facturas) {
      if (f.anulado_en) continue;
      for (const fm of f.marcas ?? []) anotar(fm.marca.id, fm.marca.nombre);
    }
    for (const e of entregas) {
      for (const [mid, monto] of Object.entries(e.total_por_marca ?? {})) {
        if (Number(monto) > 0) anotar(mid);
      }
    }
    return [...out.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [proyecto, facturas, entregas, marcasCatalogo]);

  // Contexto de marca: solo cuando el overlay se abrió desde el período de
  // una marca Y el proyecto tiene plata de OTRAS marcas. Los montos ya están
  // acá (facturas con su reparto + total_por_marca de las entregas) — no se
  // recalcula nada contra la base. Ver lib/marketing/contexto-marca.ts.
  const lineaContexto = useMemo(() => {
    if (!marca) return null;
    const nombres = new Map<string, string>(
      marcasCatalogo.map((m) => [String(m.id), m.nombre]),
    );
    for (const m of marcasDelProyecto) {
      if (!nombres.has(m.id)) nombres.set(m.id, m.nombre);
    }
    return lineaContextoMarca({
      marcaId: String(marca.id),
      marcaNombre: marca.nombre,
      periodoNombre,
      montoEnPeriodo,
      totales: totalesPorMarcaDeProyecto(facturas, entregas),
      nombres,
    });
  }, [
    marca,
    periodoNombre,
    montoEnPeriodo,
    facturas,
    entregas,
    marcasCatalogo,
    marcasDelProyecto,
  ]);

  if (loading || !proyecto) {
    return (
      <ModalOverlay backdropClassName="bg-black/30" onBackdropClick={onClose}>
        <div className="relative w-full bg-white sm:max-w-4xl lg:max-w-5xl sm:rounded-lg rounded-t-2xl max-h-[95vh] overflow-y-auto border border-gray-200 p-6">
          <div className="space-y-4">
            <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </div>
      </ModalOverlay>
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
    <ModalOverlay backdropClassName="bg-black/30" onBackdropClick={onClose}>
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
                <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium shrink-0">
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
          {/* Contexto de la marca desde la que se abrió: explica por qué el
              total del proyecto (ambas marcas) no coincide con la tarjeta
              tocada (una sola marca en un período). */}
          {lineaContexto && (
            <div
              data-contexto-marca
              className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-[13px] text-gray-800"
            >
              {lineaContexto}
            </div>
          )}

          {/* Datos del proyecto */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
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
                  <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                    Anulado
                  </span>
                )}
                {/* 🩸 Hay DOS formas de borrar el mismo proyecto y se leían
                    igual de graves:
                      · desde la lista del período, "Registrado por error —
                        eliminar" ESCONDE el proyecto (anular) y se puede
                        deshacer enseguida;
                      · este botón BORRA de verdad — proyecto, facturas, fotos
                        y archivos en Storage — y no hay vuelta atrás.
                    El de acá decía sólo "Eliminar", medía ~24 px y estaba
                    pegado a "Editar". Ahora dice lo que hace, mide 44 px y va
                    en su propia línea, lejos del dedo que iba a "Editar".
                    (La confirmación pide escribir el nombre del proyecto:
                    ConfirmTypeNameModal, más abajo. No se aflojó.) */}
                <div className="flex flex-col items-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="text-xs px-3 min-h-[44px] inline-flex items-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                  >
                    Editar
                  </button>
                  {esAdmin && (
                    <button
                      type="button"
                      onClick={() => setEliminando(true)}
                      title="Borra el proyecto, sus facturas, sus fotos y sus archivos. No se puede deshacer."
                      className="text-xs px-3 min-h-[44px] inline-flex items-center rounded-md border border-red-300 text-red-700 font-medium hover:bg-red-600 hover:text-white transition"
                    >
                      Eliminar definitivamente
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Marcas del proyecto. Un proyecto es del CLIENTE y puede
                trabajar varias marcas a la vez (medido 11-ago-2026: 14 de 16
                proyectos con facturas tienen más de una). En el inicio eso
                hace que aparezca en VARIAS tarjetas de marca — correcto, pero
                se lee raro si la ficha no lo dice. Acá se dice. */}
            {marcasDelProyecto.length > 0 && (
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                  Marcas
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {marcasDelProyecto.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700"
                    >
                      {m.nombre}
                    </span>
                  ))}
                </div>
                <p className="text-[12px] text-gray-500 mt-1.5">
                  {marcasDelProyecto.length > 1
                    ? `Este proyecto trabaja ${marcasDelProyecto.length} marcas, así que en el inicio aparece en la tarjeta de cada una. Es el mismo proyecto, no está duplicado.`
                    : "En el inicio, este proyecto aparece en la tarjeta de esa marca."}
                </p>
              </div>
            )}

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
                GRID_TOTALES[
                  3 +
                    (totales.conteoEntregas > 0 ? 1 : 0) +
                    (totales.tieneAlgunaZonaLibre ? 1 : 0)
                ]
              } gap-3 mt-4 pt-3 border-t border-gray-100`}
            >
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">
                  Facturas
                </div>
                <div className="text-sm font-semibold tabular-nums text-gray-900">
                  {totales.conteo}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">
                  Subtotal
                </div>
                <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                  {formatearMonto(totales.subtotal)}
                </div>
              </div>
              {/* Entregas de muebles: sin esta celda, COSTO TOTAL no cierra a
                  la vista (total = facturas + entregas). Solo aparece cuando
                  hay entregas — con 0 sería ruido. */}
              {totales.conteoEntregas > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">
                    Entregas
                  </div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                    {totales.conteoEntregas} ·{" "}
                    {formatearMonto(totales.totalEntregas)}
                  </div>
                </div>
              )}
              {totales.tieneAlgunaZonaLibre && (
                <div>
                  <div
                    className="text-xs uppercase tracking-wide text-amber-700"
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
                <div className="text-xs uppercase tracking-wide text-gray-400">
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
                marcasCatalogo={marcasCatalogo}
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
    </ModalOverlay>
  );
}

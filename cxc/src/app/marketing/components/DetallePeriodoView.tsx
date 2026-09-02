"use client";

// ============================================================================
// NIVEL 3 — el detalle de UN período de una marca (12-ago-2026).
//
//   ‹ Calvin Klein   [ABIERTO] Período 2026    [Cerrar] [Bajar ZIP]
//   $5,840.00 · 2 grupos · 7 gastos
//   Nova Lux, S.a. · 1 entrega          $1,040.00  ›
//   General · 6 pagos de impulsadora    $4,800.00  ›
//
// El cerrado se ve igual, con [ZIP] [Excel] arriba y sus clientes abajo, cada
// uno con el monto QUE REPORTÓ EN ESE PERÍODO — no el histórico del proyecto.
//
// 🩸 NINGÚN NÚMERO SE CALCULA ACÁ. El total, los documentos y el monto de
// cada fila vienen de `agregarPorBloques` vía la sección (`SeccionPeriodo`):
// la misma pasada que arma las tarjetas del inicio. La búsqueda filtra qué
// filas se ven, nunca cambia los totales del encabezado.
//
// Esta MISMA vista dibuja los buckets sin período (Multifashion / sin marca):
// la página de la marca les sintetiza una sección con su gasto histórico
// (`esBucket`), sin chip de estado, sin Cerrar y sin Excel.
//
// 🔴 LA VUELTA ATRÁS DE ELIMINAR SE QUEDA. "Registrado por error — eliminar"
// (anular + aviso con Deshacer) es el ÚNICO camino de restauración que le
// queda al usuario — la pantalla "Anulados" se retiró. No quitar el menú ···
// sin darle otra puerta a `papelera/restaurar`.
// ============================================================================

import { useCallback, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import OverflowMenu from "@/components/ui/OverflowMenu";
import {
  contadoresDeProyecto,
  formatearFecha,
  formatearMonto,
} from "@/lib/marketing/normalizar";
import {
  descripcionGeneral,
  type SeccionPeriodo,
} from "@/lib/marketing/lista-por-periodo";
import { MULTIFASHION_KEY } from "@/lib/marketing/bloques";
import { useDescargarZip } from "@/lib/marketing/useDescargarZip";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { useDescargasPeriodo } from "./useDescargasPeriodo";
import CerrarPeriodoModal from "./CerrarPeriodoModal";
import LoQueFalta from "./LoQueFalta";
import { ChipEstado, FilaNivel } from "./FilaNivel";
import type { BloqueResumen } from "./InicioMarketing";
import type { ProyectoListItem } from "./useMarcaPeriodos";

interface Props {
  marca: { key: string; nombre: string; slug: string };
  /** La sección REAL del período — o la sintetizada de un bucket sin período. */
  seccion: SeccionPeriodo;
  /** true = Multifashion / sin marca: sin chip, sin Cerrar, sin Excel. */
  esBucket: boolean;
  /** El bloque del agregador (modal de cierre + avisos de lo que falta). */
  bloqueResumen: BloqueResumen | null;
  /** La lista plana (ya filtrada por la búsqueda en el servidor). */
  proyectos: ProyectoListItem[];
  loading: boolean;
  busqueda: string;
  onBusqueda: (v: string) => void;
  /** La búsqueda YA aplicada (debounced) — decide si se esconde General. */
  buscando: boolean;
  volverLabel: string;
  onVolver: () => void;
  onAbrirProyecto: (id: string) => void;
  onRegistrarGasto: () => void;
  /** Recargar tras cerrar el período / eliminar / deshacer. */
  recargar: () => void;
}

export default function DetallePeriodoView({
  marca,
  seccion,
  esBucket,
  bloqueResumen,
  proyectos,
  loading,
  busqueda,
  onBusqueda,
  buscando,
  volverLabel,
  onVolver,
  onAbrirProyecto,
  onRegistrarGasto,
  recargar,
}: Props) {
  const { toast } = useToast();
  const { bajando, descargarReporte, bajarZipMarca } = useDescargasPeriodo();
  const { estados: zipEstados, descargar: descargarZipProyecto } = useDescargarZip();
  const [verGeneral, setVerGeneral] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [anularPendiente, setAnularPendiente] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  // 🩸 ELIMINAR ERA UNA PUERTA DE UNA SOLA MANO. La pantalla "Anulados" era el
  // ÚNICO lugar desde donde se podía restaurar un proyecto, y se retiró: sin
  // esto, eliminar por error dejaría el proyecto fuera de Marketing para
  // siempre (la API `papelera/restaurar` sigue viva). El aviso se queda hasta
  // que la persona lo cierre — el error se descubre al mirar la lista.
  const [deshacerAnular, setDeshacerAnular] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [deshaciendo, setDeshaciendo] = useState(false);

  const cerrarAnular = useCallback(() => setAnularPendiente(null), []);
  const anularDismiss = useFormModalDismiss(
    anularPendiente !== null,
    cerrarAnular,
    !anulando,
  );
  const cerrarGeneral = useCallback(() => setVerGeneral(false), []);
  const generalDismiss = useFormModalDismiss(verGeneral, cerrarGeneral, true);

  const ejecutarAnular = async () => {
    if (!anularPendiente || !anularMotivo.trim()) return;
    setAnulando(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${anularPendiente.id}/anular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: anularMotivo.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Proyecto eliminado", "success");
      setDeshacerAnular({ id: anularPendiente.id, nombre: anularPendiente.nombre });
      setAnularPendiente(null);
      setAnularMotivo("");
      recargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    } finally {
      setAnulando(false);
    }
  };

  const ejecutarDeshacerAnular = async () => {
    if (!deshacerAnular) return;
    setDeshaciendo(true);
    try {
      const res = await fetch("/api/marketing/papelera/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "proyecto", id: deshacerAnular.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo devolver el proyecto");
      }
      toast("Listo, el proyecto volvió", "success");
      setDeshacerAnular(null);
      recargar();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "No se pudo devolver el proyecto",
        "error",
      );
    } finally {
      setDeshaciendo(false);
    }
  };

  // Las filas: los proyectos DE ESTA SECCIÓN (con el monto de este período),
  // intersectados con la lista plana — que ya viene filtrada por la búsqueda.
  const porId = new Map(proyectos.map((p) => [String(p.id), p]));
  const filas = seccion.proyectos
    .map((sp) => ({ sp, item: porId.get(sp.id) }))
    .filter((x): x is { sp: (typeof seccion.proyectos)[number]; item: ProyectoListItem } => !!x.item);

  const abierto = seccion.estado === "abierto";
  const hayGasto = seccion.docs.facturas > 0 || seccion.docs.muebles > 0;
  const mostrarGeneral = !buscando && (seccion.general?.count ?? 0) > 0;
  const grupos = seccion.proyectos.length + (seccion.general ? 1 : 0);
  const gastos = seccion.docs.facturas + seccion.docs.muebles;
  const etiqueta = `${marca.nombre} · ${seccion.nombre} · ${formatearMonto(seccion.total)}`;
  const zipClave = `${marca.key}:${abierto || !seccion.id ? "abierto" : seccion.id}`;
  // Multifashion también baja su ZIP — Daniel: *"descargas por marca te basta
  // y multifashion es una marca"*. "Sin marca asignada" no: no hay a quién.
  const conZip = hayGasto && (!esBucket || marca.key === MULTIFASHION_KEY);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onVolver}
        className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
      >
        ‹ {volverLabel}
      </button>

      {/* Cabecera: chip + nombre del período + las acciones DE este período. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {!esBucket && <ChipEstado estado={seccion.estado} />}
          <h1 className="text-xl font-semibold text-gray-900 break-words">
            {esBucket ? marca.nombre : seccion.nombre}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {abierto && (
            <button
              type="button"
              onClick={onRegistrarGasto}
              className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition"
            >
              + Registrar gasto
            </button>
          )}
          {seccion.puedeCerrar && bloqueResumen && (
            <button
              type="button"
              onClick={() => setCerrando(true)}
              className="rounded-md border border-teal-600 bg-teal-50 px-3 min-h-[44px] inline-flex items-center justify-center text-sm font-semibold text-teal-800 hover:bg-teal-100 active:scale-[0.97] transition"
            >
              Cerrar
            </button>
          )}
          {conZip && (
            <button
              type="button"
              onClick={() =>
                bajarZipMarca(
                  marca.key,
                  etiqueta,
                  abierto || esBucket ? undefined : seccion.id,
                )
              }
              disabled={bajando === zipClave}
              className="rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm text-gray-800 hover:border-gray-500 active:scale-[0.97] transition disabled:opacity-40"
            >
              {bajando === zipClave
                ? "Armando…"
                : abierto || esBucket
                  ? "Bajar ZIP"
                  : "ZIP"}
            </button>
          )}
          {!esBucket && !abierto && seccion.id && (
            <button
              type="button"
              onClick={() => descargarReporte(seccion.id as string, etiqueta, marca.key)}
              title="Bajar el Excel de este período"
              className="rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm text-gray-800 hover:border-gray-500 active:scale-[0.97] transition"
            >
              Excel
            </button>
          )}
        </div>
      </div>

      {/* El total del período — EL DEL AGREGADOR, el mismo del inicio. */}
      {hayGasto && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-semibold text-gray-900 tabular-nums leading-none">
            {formatearMonto(seccion.total)}
          </span>
          <span className="text-sm text-gray-500">
            {grupos} {grupos === 1 ? "grupo" : "grupos"} · {gastos}{" "}
            {gastos === 1 ? "gasto" : "gastos"}
          </span>
          {/* Facturas y mobiliario no se funden en un solo monto: cuando hay
              de los dos, el desglose se dice. */}
          {seccion.docs.facturas > 0 && seccion.docs.muebles > 0 && (
            <span className="text-sm text-gray-500">
              Facturas {formatearMonto(seccion.montos.facturas)} · Mobiliario{" "}
              {formatearMonto(seccion.montos.muebles)}
            </span>
          )}
        </div>
      )}

      {abierto && bloqueResumen && (
        <LoQueFalta
          sinComprobante={bloqueResumen.sinComprobante ?? 0}
          sinFoto={bloqueResumen.sinFoto ?? 0}
        />
      )}

      {/* La vuelta atrás de anular. Ver el comentario del state. */}
      {deshacerAnular && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-amber-900">
            Eliminaste &ldquo;{deshacerAnular.nombre}&rdquo;. Ya no aparece en Marketing.
          </span>
          <button
            type="button"
            onClick={ejecutarDeshacerAnular}
            disabled={deshaciendo}
            className="text-sm font-semibold text-amber-900 underline min-h-[44px] inline-flex items-center disabled:opacity-50"
          >
            {deshaciendo ? "Devolviendo…" : "Deshacer"}
          </button>
          <button
            type="button"
            onClick={() => setDeshacerAnular(null)}
            className="text-sm text-amber-800 min-h-[44px] min-w-[44px] inline-flex items-center justify-center ml-auto"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {/* Búsqueda — filtra DENTRO del período; los totales de arriba no
          cambian. text-base en mobile: con 14px Safari hace zoom al enfocar. */}
      <input
        type="search"
        value={busqueda}
        onChange={(e) => onBusqueda(e.target.value)}
        placeholder="Buscar por proyecto, tienda o N° de factura…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none"
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filas.length === 0 && !mostrarGeneral ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <div className="text-sm text-gray-600 mb-1">
            {buscando
              ? "No hay proyectos que coincidan con el filtro."
              : abierto
                ? "Todavía no hay gasto en este período."
                : "Este período no tiene gastos con cliente."}
          </div>
          {!buscando && abierto && (
            <button
              type="button"
              onClick={onRegistrarGasto}
              className="text-sm text-fuchsia-600 hover:text-fuchsia-800 min-h-[44px] inline-flex items-center mt-2"
            >
              Registrar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
          {mostrarGeneral && seccion.general && (
            <FilaNivel
              titulo="General"
              subtitulo={descripcionGeneral(seccion.general)}
              monto={formatearMonto(seccion.general.total)}
              onClick={() => setVerGeneral(true)}
              ariaLabel="Ver los gastos sin cliente de este período"
            />
          )}
          {filas.map(({ sp, item }) => {
            // Cliente (tienda) es el ancla visual; el nombre queda de respaldo.
            const titulo = item.tienda || item.nombre || "";
            return (
              <FilaNivel
                key={sp.id}
                titulo={titulo}
                subtitulo={contadoresDeProyecto({
                  facturas: sp.facturas,
                  entregas: sp.entregas,
                  fotos: esBucket ? item.fotos_count : 0,
                })}
                monto={
                  sp.monto === 0 ? (
                    <span className="text-gray-300 text-sm">—</span>
                  ) : (
                    formatearMonto(sp.monto)
                  )
                }
                onClick={() => onAbrirProyecto(sp.id)}
                ariaLabel={`Abrir ${titulo}`}
                acciones={
                  !item.anulado_en && (
                    <OverflowMenu
                      items={[
                        {
                          label: "Editar",
                          onClick: () => onAbrirProyecto(sp.id),
                        },
                        {
                          label: "Descargar ZIP",
                          onClick: () => descargarZipProyecto(sp.id),
                          disabled:
                            zipEstados[sp.id]?.tipo === "trabajando" ||
                            zipEstados[sp.id]?.tipo === "exito",
                        },
                        {
                          label: "Registrado por error — eliminar",
                          onClick: () => {
                            setAnularPendiente({ id: sp.id, nombre: titulo });
                            setAnularMotivo("");
                          },
                          destructive: true,
                        },
                      ]}
                    />
                  )
                }
              />
            );
          })}
        </div>
      )}

      {cerrando && bloqueResumen && seccion.id && (
        <CerrarPeriodoModal
          bloque={bloqueResumen}
          periodoId={seccion.id}
          onClose={() => setCerrando(false)}
          onCerrado={async (periodoId, etiquetaCierre) => {
            setCerrando(false);
            // El recién cerrado se baja con SU marca — el mismo camino que el
            // botón Excel de un período cerrado.
            await descargarReporte(periodoId, etiquetaCierre, marca.key);
            recargar();
          }}
        />
      )}

      {anularPendiente && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" {...anularDismiss.backdrop} />
          <div
            ref={anularDismiss.panelRef}
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">
              Registrado por error — eliminar
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Vas a eliminar &ldquo;{anularPendiente.nombre}&rdquo;. Deja de
              aparecer en Marketing y su gasto no se le reporta a nadie. Si te
              equivocas, puedes devolverlo enseguida desde el aviso que queda en
              la lista.
            </p>
            <label
              htmlFor="mk-motivo-anular-card"
              className="block text-sm text-gray-600 mb-1"
            >
              Motivo<span className="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              id="mk-motivo-anular-card"
              rows={3}
              value={anularMotivo}
              onChange={(e) => setAnularMotivo(e.target.value)}
              placeholder="Explica qué pasó"
              /* text-base en mobile para que Safari no haga zoom al enfocar. */
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm focus:border-black focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={ejecutarAnular}
                disabled={anulando || anularMotivo.trim().length === 0}
                className="flex-1 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {anulando ? "Eliminando…" : "Eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setAnularPendiente(null)}
                disabled={anulando}
                className="flex-1 border border-gray-200 text-gray-600 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detalle de "General": los gastos sin cliente de este período, de a
          uno. Solo lectura — editar un pago se sigue haciendo desde la
          herramienta Impulsadoras del inicio. */}
      {verGeneral && seccion.general && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" {...generalDismiss.backdrop} />
          <div
            ref={generalDismiss.panelRef}
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-0.5">
              General · {marca.nombre}
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              Impulsadoras y gastos sin cliente de {seccion.nombre} —{" "}
              {seccion.general.count}{" "}
              {seccion.general.count === 1 ? "gasto" : "gastos"}.
            </p>
            <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
              <ul className="divide-y divide-gray-100">
                {seccion.general.items.map((it) => (
                  <li
                    key={it.id}
                    className="py-2.5 flex items-start justify-between gap-3"
                  >
                    {/* La descripción ENVUELVE, no se trunca: un modal puede
                        crecer hacia abajo, y "Impulsadora Cindy — Diciembre"
                        cortado a la mitad no le dice a nadie qué mes es. */}
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900 break-words">
                        {it.descripcion}
                      </div>
                      <div className="text-[12px] text-gray-500">
                        {it.fecha ? formatearFecha(it.fecha) : "Sin fecha"}
                      </div>
                    </div>
                    <div className="text-sm font-medium tabular-nums text-gray-900 shrink-0">
                      {formatearMonto(it.monto)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 mt-2">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-sm font-semibold tabular-nums text-gray-900">
                {formatearMonto(seccion.general.total)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setVerGeneral(false)}
              className="mt-4 w-full border border-gray-200 text-gray-700 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm hover:bg-gray-50 transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

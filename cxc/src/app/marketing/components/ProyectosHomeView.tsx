"use client";

// Lista de proyectos de UNA MARCA (el bloque que se tocó en el inicio).
// La MARCA es la unidad del módulo desde el rediseño de ago-2026: período,
// cierre y ZIP van por marca, y el proyecto es solo la agrupación por cliente
// (se autocrea al registrar un gasto).
//
// 🔴 EL PROYECTO YA NO TIENE ESTADO VISIBLE. "Cerrar proyecto" se retiró el
// 11-ago-2026: era un estado cosmético que al lado de "Cerrar período"
// confundía — dos "cerrar" distintos en la misma pantalla. Lo que congela
// plata es el PERÍODO cerrado, nunca el proyecto. No volver a dibujar un
// badge/filtro/acción de estado de proyecto acá.
//
// La única acción destructiva de la fila es "Registrado por error — eliminar"
// (la mecánica de anular de siempre: esconde el proyecto, sus gastos dejan de
// contar, y el aviso con "Deshacer" queda hasta que la persona lo cierre).
//
// 🔴 PODA del 11-ago-2026 (los 7 sobrantes del PR #480, aprobados por Daniel).
// NO vuelven a esta lista:
//   - la columna MARCAS (chips C/T): las marcas del proyecto se ven en su ficha,
//     y acá la lista YA está acotada a una marca — la columna repetía el título.
//   - el subtítulo "Proyectos con gasto de esta marca" (decía lo que el título
//     y el breadcrumb ya dicen).
//   - la etiqueta Apertura/Remodelacion en la fila (p.nombre): queda en
//     Editar/ficha como etiqueta opcional, no como ruido de la lista.
//   - el chip "Muebles": redundante con el contador "N entregas".
//   - los enlaces Mobiliario · Reportes · Impulsadoras de la cabecera: viven en
//     el inicio de Marketing (Reportes ganó su tarjeta ahí en este mismo
//     cambio).
// Los contadores del subtítulo solo dicen los que NO son cero
// (contadoresDeProyecto en lib/marketing/normalizar.ts).
//
// 🔴 PARTIDA POR PERÍODO (12-ago-2026). Daniel: *"esta mezclado en el cierre
// anterior… no quiero friccion, quiero orden simple"*. La lista queda en DOS
// secciones: PERÍODO ACTUAL arriba y YA REPORTADO · <período> abajo (una
// subsección por período cerrado, del más nuevo al más viejo). La sección la
// decide el SERVIDOR con el clasificador único (sello a período CERRADO =
// reportado; sello a un abierto —el fantasma `pvh · abierto` incluido— o sin
// sello = actual). Un proyecto con gasto en los dos lados va en el ACTUAL,
// con la línea "También reportó en …" para no perder la historia.
//
// 🔴 LA FILA "GENERAL" (dentro del período actual) reemplazó a la línea de
// cuadre "Impulsadoras · esta marca": muestra TODOS los gastos sin cliente de
// la marca (impulsadoras incluidas), con total y conteo, y abre su detalle.
// Su marca sale de mk_factura_marcas — NUNCA de la clave del sello.

import { useCallback, useEffect, useState } from "react";
import {
  contadoresDeProyecto,
  formatearFecha,
  formatearMonto,
} from "@/lib/marketing/normalizar";
import {
  ordenarSubsecciones,
  type PeriodoCerradoRef,
} from "@/lib/marketing/lista-por-periodo";
import { useToast } from "@/components/ToastSystem";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { useDescargarZip } from "@/lib/marketing/useDescargarZip";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";

interface ProyectoListItem {
  id: string;
  nombre: string | null;
  tienda: string;
  created_at: string;
  anulado_en: string | null;
  facturas_count: number;
  fotos_count: number;
  entregas_count?: number;
  marcas: Array<{
    id: string;
    nombre: string;
    codigo: string;
    tipo?: "externa" | "interna";
  }>;
  // Gasto bruto real (Σ factura.total con ITBMS + entregas), sin ponderar
  // por co-op. Es el número de la columna "Gastado".
  gasto_real?: number;
  por_cobrar_total: number;
  // Cobrable co-op por marca (alimenta SOLO el tooltip de desglose).
  por_cobrar_por_marca: Array<{
    marca_id: string;
    marca_nombre: string;
    monto: number;
  }>;
  /** Partición por período (la calcula el servidor con el clasificador único). */
  seccion?: "actual" | "cerrado";
  periodo_cerrado?: { id: string | null; nombre: string; cerrado_en: string | null } | null;
  tambien_reporto_en?: string[];
}

interface GastoGeneralItem {
  id: string;
  fecha: string | null;
  descripcion: string;
  monto: number;
  esImpulsadora: boolean;
}

interface GastoGeneral {
  count: number;
  total: number;
  items: GastoGeneralItem[];
}

interface RespuestaLista {
  proyectos: ProyectoListItem[];
  general: GastoGeneral | null;
  particion: boolean;
}

interface Props {
  onOpenProyecto: (id: string) => void;
  onRegistrarGasto: () => void;
  refreshKey: number;
  /**
   * Bloque del inicio del que se entró: el CÓDIGO de la marca (`TH` | `CK` |
   * `KL` | `RBK` | `J`) o `multifashion` | `sin_bloque`. La lista queda acotada
   * a sus proyectos. Esta vista SIEMPRE se abre desde un bloque del inicio —
   * el modo "todas las marcas" con dropdown era del modelo viejo y se retiró.
   */
  bloque: string;
  bucketLabel: string;
  onBack: () => void;
}

export default function ProyectosHomeView({
  onOpenProyecto,
  onRegistrarGasto,
  refreshKey,
  bloque,
  bucketLabel,
  onBack,
}: Props) {
  const { toast } = useToast();
  const [busqueda, setBusqueda] = useState<string>("");
  const [busquedaDebounced, setBusquedaDebounced] = useState<string>("");
  const [proyectos, setProyectos] = useState<ProyectoListItem[]>([]);
  const [general, setGeneral] = useState<GastoGeneral | null>(null);
  const [particion, setParticion] = useState(false);
  const [verGeneral, setVerGeneral] = useState(false);
  const [loading, setLoading] = useState(true);
  const { estados: zipEstados, descargar: descargarZip } = useDescargarZip();
  const [anularPendiente, setAnularPendiente] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  // 🩸 ELIMINAR ERA UNA PUERTA DE UNA SOLA MANO. La pantalla "Anulados" era el
  // ÚNICO lugar desde donde se podía restaurar un proyecto, y se retiró: sin
  // esto, eliminar por error dejaría el proyecto fuera de Marketing para
  // siempre (la API `papelera/restaurar` sigue viva, pero nadie llega a ella
  // desde la app). El aviso se queda hasta que la persona lo cierre — nada de
  // 5 segundos: el error se descubre al mirar la lista y ver que falta.
  const [deshacerAnular, setDeshacerAnular] = useState<
    { id: string; nombre: string } | null
  >(null);
  const [deshaciendo, setDeshaciendo] = useState(false);

  // Clic fuera + Escape para el modal de anular. Como lleva un motivo escrito,
  // si el usuario ya tipeó algo NO cierra (se sale con Cancelar).
  const cerrarAnular = useCallback(() => setAnularPendiente(null), []);
  const anularDismiss = useFormModalDismiss(
    anularPendiente !== null,
    cerrarAnular,
    !anulando,
  );

  // Clic fuera + Escape para el detalle de "General" (solo lectura).
  const cerrarGeneral = useCallback(() => setVerGeneral(false), []);
  const generalDismiss = useFormModalDismiss(verGeneral, cerrarGeneral, true);

  // Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("bloque", bloque);
      if (busquedaDebounced) qs.set("busqueda", busquedaDebounced);
      const res = await fetch(`/api/marketing/proyectos-lista?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as RespuestaLista | ProyectoListItem[];
      // Tolerancia al shape viejo (un array pelado) por si llega una
      // respuesta cacheada de un deploy anterior: se dibuja plano.
      if (Array.isArray(data)) {
        setProyectos(data);
        setGeneral(null);
        setParticion(false);
      } else {
        setProyectos(Array.isArray(data.proyectos) ? data.proyectos : []);
        setGeneral(data.general ?? null);
        setParticion(data.particion === true);
      }
    } catch {
      setProyectos([]);
      setGeneral(null);
      setParticion(false);
    } finally {
      setLoading(false);
    }
  }, [bloque, busquedaDebounced]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

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
      cargar();
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
      cargar();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "No se pudo devolver el proyecto",
        "error",
      );
    } finally {
      setDeshaciendo(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back a las cards de marca */}
      <button
        type="button"
        onClick={onBack}
        /* Volver era texto suelto (~20 px de alto); -my-1 para no separar de la lista. */
        className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
      >
        ← Marketing
      </button>
      {/* Header — el título y la ÚNICA acción. Los enlaces Mobiliario ·
          Reportes · Impulsadoras se retiraron: viven en el inicio (poda del
          11-ago-2026, ver el encabezado del archivo). */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900">
          {bucketLabel || "Marketing"}
        </h1>
        <button
          type="button"
          onClick={onRegistrarGasto}
          className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
        >
          + Registrar gasto
        </button>
      </div>

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

      {/* Búsqueda */}
      <div className="grid grid-cols-1 gap-2">
        {/* text-base en mobile: con text-sm (14px) Safari hace zoom al enfocar
            el campo y descuadra la página. min-h-[44px] para el toque. */}
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proyecto, tienda o N° de factura…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none"
        />
      </div>

      {/* Lista, partida por período (ver el encabezado del archivo). */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        (() => {
          // La fila General no matchea una búsqueda de proyectos: se esconde
          // mientras se filtra, igual que un proyecto que no coincide.
          const mostrarGeneral =
            particion && !busquedaDebounced && (general?.count ?? 0) > 0;
          const actuales = proyectos.filter((p) => p.seccion !== "cerrado");
          const reportados = proyectos.filter((p) => p.seccion === "cerrado");

          if (proyectos.length === 0 && !mostrarGeneral) {
            return (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
                <div className="text-sm text-gray-600 mb-1">
                  {busquedaDebounced
                    ? "No hay proyectos que coincidan con el filtro."
                    : "Todavía no hay gasto de esta marca. Registra el primero."}
                </div>
                {!busquedaDebounced && (
                  <button
                    type="button"
                    onClick={onRegistrarGasto}
                    className="text-sm text-fuchsia-600 hover:text-fuchsia-800 min-h-[44px] inline-flex items-center mt-2"
                  >
                    Registrar el primero
                  </button>
                )}
              </div>
            );
          }

          const filaDe = (p: ProyectoListItem) => {
            // Cliente (tienda) es el ancla visual principal. El tipo de
            // gasto (nombre: "Apertura", "Remodelacion") ya NO se dibuja
            // en la fila — queda en Editar/ficha como etiqueta opcional.
            // nombreVis se sigue usando como etiqueta canónica en
            // confirmaciones, ARIA y menús — refleja lo que el usuario
            // está viendo en la fila.
            const tituloVis = p.tienda || p.nombre || "";
            const nombreVis = tituloVis;
            // Archivo plano: solo fecha de creación, sin label de transición.
            const fechaIso = p.created_at;

            // "Gastado" = lo que se pagó de verdad (Σ factura.total con
            // ITBMS + entregas), SIN ponderar por co-op. El tooltip de
            // abajo sí muestra el cobrable por marca (co-op). Fallback al
            // cálculo viejo por si llega una respuesta cacheada sin gasto_real.
            const totalGastado = p.gasto_real ?? (p.por_cobrar_total || 0);
            const desgloseTooltip =
              p.por_cobrar_por_marca.length > 0
                ? p.por_cobrar_por_marca
                    .map((d) => `${d.marca_nombre}: ${formatearMonto(d.monto)}`)
                    .join("\n")
                : undefined;
            // Proyecto del actual con gasto YA reportado en período(s)
            // cerrado(s): la historia se dice en una línea propia, sin
            // ensuciar el título ni los contadores.
            const tambienEn = p.tambien_reporto_en ?? [];

            return (
              <tr
                key={p.id}
                onClick={() => onOpenProyecto(p.id)}
                className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                {/* Proyecto */}
                <td className="px-[18px] py-3 align-middle">
                  <div className="font-semibold text-gray-900 truncate">
                    {tituloVis}
                  </div>
                  <div className="text-[12px] text-gray-500 truncate">
                    {contadoresDeProyecto({
                      facturas: p.facturas_count,
                      entregas: p.entregas_count ?? 0,
                      fotos: p.fotos_count,
                    })}
                  </div>
                  {tambienEn.length > 0 && (
                    /* Sin `truncate` (ver la fila General): envuelve. */
                    <div className="text-[12px] text-gray-400">
                      También reportó en {tambienEn.join(" y ")}
                    </div>
                  )}
                </td>
                {/* Gastado */}
                <td
                  className="px-[18px] py-3 align-middle text-right tabular-nums"
                  title={desgloseTooltip}
                >
                  {totalGastado === 0 ? (
                    <span className="text-gray-300 text-xs">—</span>
                  ) : (
                    <span className="font-semibold text-gray-900">
                      {formatearMonto(totalGastado)}
                    </span>
                  )}
                </td>
                {/* Fecha */}
                <td className="px-[18px] py-3 align-middle text-[12px] text-gray-500 hidden md:table-cell">
                  {formatearFecha(fechaIso)}
                </td>
                {/* Acciones: Editar (abre overlay), ZIP, y el "anular" de
                    siempre con su nombre nuevo. "Cerrar proyecto" se retiró
                    (ver el encabezado del archivo). */}
                <td
                  className="px-[18px] py-3 align-middle"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    {!p.anulado_en && (
                      <OverflowMenu
                        items={[
                          {
                            label: "Editar",
                            onClick: () => onOpenProyecto(p.id),
                          },
                          {
                            label: "Descargar ZIP",
                            onClick: () => descargarZip(p.id),
                            disabled:
                              zipEstados[p.id]?.tipo === "trabajando" ||
                              zipEstados[p.id]?.tipo === "exito",
                          },
                          {
                            label: "Registrado por error — eliminar",
                            onClick: () => {
                              setAnularPendiente({
                                id: p.id,
                                nombre: nombreVis,
                              });
                              setAnularMotivo("");
                            },
                            destructive: true,
                          },
                        ]}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          };

          /* El div interno es el SCROLLER: sin él, el `overflow-hidden` del
             borde redondeado recorta la tabla sin salida (medido 11-ago-2026:
             176 px a 390 y 147 px a 834, o sea PRE-EXISTENTES). */
          const tablaDe = (contenido: React.ReactNode) => (
            <div className="rounded-[10px] border border-[#e5e5e5] overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="text-left font-medium px-[18px] py-2.5">Proyecto</th>
                      <th className="text-right font-medium px-[18px] py-2.5 w-[140px]">
                        Gastado
                      </th>
                      <th className="text-left font-medium px-[18px] py-2.5 w-[110px] hidden md:table-cell">
                        Fecha
                      </th>
                      <th className="text-right font-medium px-[18px] py-2.5 w-[140px]">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>{contenido}</tbody>
                </table>
              </div>
            </div>
          );

          // La fila "General": impulsadoras y gastos sin cliente de la marca.
          // Antes eran INVISIBLES acá (solo vivían en la herramienta
          // Impulsadoras) — Daniel: *"las impulsadoras… no las veo en tommy
          // ni nada"*. Abre el detalle; sin cliente ≠ invisible.
          const filaGeneral =
            mostrarGeneral && general ? (
              <tr
                key="__general"
                onClick={() => setVerGeneral(true)}
                className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-[18px] py-3 align-middle">
                  <div className="font-semibold text-gray-900">General</div>
                  {/* Sin `truncate`: el nowrap le impone su ancho mínimo a la
                      celda y a 390 px empuja la tabla al scroller. Envuelve. */}
                  <div className="text-[12px] text-gray-500">
                    {general.count} {general.count === 1 ? "gasto" : "gastos"} ·
                    impulsadoras y gastos sin cliente
                  </div>
                </td>
                <td className="px-[18px] py-3 align-middle text-right tabular-nums">
                  <span className="font-semibold text-gray-900">
                    {formatearMonto(general.total)}
                  </span>
                </td>
                <td className="px-[18px] py-3 align-middle text-[12px] text-gray-400 hidden md:table-cell">
                  —
                </td>
                <td className="px-[18px] py-3 align-middle text-right text-gray-400">
                  ›
                </td>
              </tr>
            ) : null;

          // Subsecciones de "Ya reportado", del período más nuevo al más
          // viejo (módulo puro lista-por-periodo).
          const subsecciones = ordenarSubsecciones(
            reportados.map(
              (p): PeriodoCerradoRef => ({
                id: p.periodo_cerrado?.id ?? null,
                nombre: p.periodo_cerrado?.nombre ?? "",
                cerradoEn: p.periodo_cerrado?.cerrado_en ?? null,
              }),
            ),
          );

          // Sin nada reportado y sin fila General, la partición no agrega
          // información: la lista sale plana, como siempre.
          if (!particion || (subsecciones.length === 0 && !filaGeneral)) {
            return tablaDe(proyectos.map(filaDe));
          }

          const claveDe = (x: { id: string | null; nombre: string }) =>
            x.id ?? `legacy::${x.nombre}`;

          return (
            <>
              <div className="text-xs font-semibold text-gray-500 tracking-wider pt-1">
                <span className="uppercase">Período actual</span>
              </div>
              {actuales.length > 0 || filaGeneral ? (
                tablaDe(
                  <>
                    {filaGeneral}
                    {actuales.map(filaDe)}
                  </>,
                )
              ) : (
                <div className="rounded-[10px] border border-[#e5e5e5] bg-white px-[18px] py-4 text-sm text-gray-500 italic">
                  Todavía no hay gasto en este período.
                </div>
              )}
              {subsecciones.map((per) => (
                <div key={claveDe(per)} className="space-y-4">
                  <div className="text-xs font-semibold text-gray-500 tracking-wider pt-1">
                    <span className="uppercase">Ya reportado</span>
                    <span className="text-gray-400"> · {per.nombre}</span>
                  </div>
                  {tablaDe(
                    reportados
                      .filter(
                        (p) =>
                          claveDe({
                            id: p.periodo_cerrado?.id ?? null,
                            nombre: p.periodo_cerrado?.nombre ?? "",
                          }) === claveDe(per),
                      )
                      .map(filaDe),
                  )}
                </div>
              ))}
            </>
          );
        })()
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
              equivocás, podés devolverlo enseguida desde el aviso que queda en
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

      {/* Detalle de "General": los gastos sin cliente de esta marca, de a
          uno. Solo lectura — editar un pago se sigue haciendo desde la
          herramienta Impulsadoras del inicio. */}
      {verGeneral && general && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" {...generalDismiss.backdrop} />
          <div
            ref={generalDismiss.panelRef}
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-0.5">
              General · {bucketLabel}
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              Impulsadoras y gastos sin cliente del período actual —{" "}
              {general.count} {general.count === 1 ? "gasto" : "gastos"}.
            </p>
            <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
              <ul className="divide-y divide-gray-100">
                {general.items.map((it) => (
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
                {formatearMonto(general.total)}
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

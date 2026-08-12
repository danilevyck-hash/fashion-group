"use client";

// ============================================================================
// Inicio de Marketing — UN BLOQUE POR PROVEEDOR.
//
// 🔑 EL MODELO, en palabras de Daniel: *"le reportas ese gasto al proveedor"*,
// *"cada proveedor solo su parte"*, *"calvin y tommy y karl son de la misma
// compañia, asi que esas las cierro juntas. reebok es de otro proveedor, eso lo
// cierro en otro momento"*. La marca dejó de ser la unidad del módulo: lo que
// se mira, se suma y se cierra es el PROVEEDOR.
//
// 🔴 NO HAY TECHO NI PRESUPUESTO. *"simplemente reportas lo que gastaste"*. Acá
// no se dibuja ninguna barra de avance ni "cuánto queda": nada que se parezca a
// un presupuesto, que es una idea que Daniel descartó explícitamente.
//
// 🩸 NO SE HACE NINGUNA CUENTA EN ESTE ARCHIVO. Todos los montos vienen ya
// sumados de `GET /api/marketing/inicio` (que a su vez delega en el módulo puro
// `lib/marketing/resumen-proveedores.ts`). Sumar acá "para redondear la
// pantalla" sería tener dos verdades sobre la misma plata — la forma exacta en
// que este repo ya se quemó dos veces con los signos de las notas de crédito.
//
// ⚠️ SIN LA MIGRACIÓN DE PERÍODOS (`conPeriodos: false`) la pantalla se dibuja
// IGUAL, pero sin la píldora del período y sin el botón de cerrar. NO es un
// error y no se le muestra al usuario como tal: los números son exactamente los
// mismos, solo que todavía no hay a qué período atarlos.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import PorClienteModal from "./PorClienteModal";
import PorMarcaModal from "./PorMarcaModal";
import CerrarPeriodoModal from "./CerrarPeriodoModal";

export interface MontoInicio {
  count: number;
  total: number;
}

export interface BloqueInicio {
  key: string;
  nombre: string;
  marcas: string[];
  periodoAbierto: { id: string | null; nombre: string } | null;
  facturas: MontoInicio;
  muebles: MontoInicio;
  total: number;
  proyectos: number;
}

export interface PeriodoCerradoInicio {
  id: string | null;
  proveedorKey: string;
  proveedorNombre: string;
  nombre: string;
  cerradoEn: string | null;
  facturas: MontoInicio;
  muebles: MontoInicio;
  total: number;
}

export interface FilaClienteInicio {
  cliente: string;
  clienteCodigo: string | null;
  porBloque: Record<string, number>;
  total: number;
}

export interface MarcaInicio {
  id: string;
  nombre: string;
  codigo: string;
}

export interface DatosInicio {
  bloques: BloqueInicio[];
  cerrados: PeriodoCerradoInicio[];
  resumen: { total: number; proyectos: number; clientes: number };
  porCliente: FilaClienteInicio[];
  porMarca: Record<string, number>;
  marcas: MarcaInicio[];
  conPeriodos: boolean;
  mobiliario: { entregas: number; total: number };
  impulsadoras: { count: number | null; montoMensual: number | null };
}

interface Props {
  /** Abre la lista de proyectos de ese bloque ("Ver proyectos"). */
  onSelectProveedor: (key: string) => void;
  onNuevoProyecto: () => void;
  onOpenImpulsadoras: () => void;
  onOpenInventario: () => void;
  refreshKey: number;
}

/** Bloques que NO se le reportan a nadie: sin período y sin botón de cerrar. */
const SIN_REPORTE = new Set(["multifashion", "sin_proveedor"]);

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Nombre de archivo seguro a partir del título del período. */
function nombreArchivo(etiqueta: string): string {
  const limpio = etiqueta.replace(/[^\p{L}\p{N} .-]+/gu, " ").replace(/\s+/g, " ").trim();
  return `${limpio || "Reporte"}.xlsx`;
}

/** Cifra de un bloque: etiqueta chica arriba, número grande abajo. */
function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{etiqueta}</div>
      <div className="text-[15px] font-semibold text-gray-900 tabular-nums">{valor}</div>
    </div>
  );
}

export default function InicioMarketing({
  onSelectProveedor,
  onNuevoProyecto,
  onOpenImpulsadoras,
  onOpenInventario,
  refreshKey,
}: Props) {
  const { toast } = useToast();
  const [datos, setDatos] = useState<DatosInicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [verPorCliente, setVerPorCliente] = useState(false);
  const [verPorMarca, setVerPorMarca] = useState(false);
  const [cerrando, setCerrando] = useState<BloqueInicio | null>(null);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/inicio", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as DatosInicio;
        if (!cancelado) setDatos(data);
      } catch {
        if (!cancelado) setDatos(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refreshKey, recargar]);

  // El reporte de un período cerrado. Se baja por fetch y no por un enlace
  // directo: si el servidor contesta un error, un <a> navegaría fuera de la app
  // y le mostraría a la secretaria un JSON en pantalla.
  const descargarReporte = useCallback(
    async (periodoId: string, etiqueta: string) => {
      try {
        const res = await fetch(`/api/marketing/periodos/${periodoId}/reporte`, {
          cache: "no-store",
        });
        if (!res.ok) {
          toast("No se pudo bajar el reporte. Intenta de nuevo en unos segundos.", "error");
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") ?? "";
        const m = /filename\*?=(?:UTF-8'')?"?([^"';]+)"?/i.exec(cd);
        saveAs(blob, m?.[1] ? decodeURIComponent(m[1]) : nombreArchivo(etiqueta));
        toast("Reporte listo — revisa tu carpeta de descargas.", "success");
      } catch {
        toast("No se pudo bajar el reporte. Verifica tu conexión.", "error");
      }
    },
    [toast],
  );

  const bloques = useMemo(() => datos?.bloques ?? [], [datos]);
  const mobiliario = datos?.mobiliario;
  const impulsadoras = datos?.impulsadoras;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Cabecera: el título y la única acción principal del módulo.         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Marketing</h1>
        <button
          type="button"
          onClick={onNuevoProyecto}
          className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
        >
          + Nuevo proyecto
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : !datos ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            No se pudo cargar el resumen. Revisa tu conexión e intenta de nuevo.
          </p>
          <button
            type="button"
            onClick={() => setRecargar((n) => n + 1)}
            className="mt-3 rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm hover:border-gray-500 active:scale-[0.97] transition"
          >
            Intentar de nuevo
          </button>
        </div>
      ) : (
        <>
          {/* -------------------------------------------------------------- */}
          {/* RESUMEN — lo gastado hoy, y las dos maneras de mirarlo.         */}
          {/* -------------------------------------------------------------- */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Resumen
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <div className="text-2xl sm:text-[28px] font-semibold text-gray-900 tabular-nums leading-none">
                  {formatearMonto(datos.resumen.total)}
                </div>
                <div className="text-xs text-gray-500 mt-1">gastado en total</div>
              </div>
              <div>
                <div className="text-2xl sm:text-[28px] font-semibold text-gray-900 tabular-nums leading-none">
                  {datos.resumen.proyectos}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  proyectos · {plural(datos.resumen.clientes, "cliente", "clientes")}
                </div>
              </div>
              <div className="flex items-center gap-4 sm:ml-auto -my-1">
                <button
                  type="button"
                  onClick={() => setVerPorCliente(true)}
                  className="text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] inline-flex items-center"
                >
                  Por cliente
                </button>
                <button
                  type="button"
                  onClick={() => setVerPorMarca(true)}
                  className="text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] inline-flex items-center"
                >
                  Por marca
                </button>
              </div>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* UN BLOQUE POR PROVEEDOR — cada uno es alguien a quien le rendís */}
          {/* cuentas, o vos mismo en Multifashion.                          */}
          {/* -------------------------------------------------------------- */}
          <section className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-200">
            {bloques.map((b) => {
              const sinReporte = SIN_REPORTE.has(b.key);
              const sinGasto = b.facturas.count === 0 && b.muebles.count === 0;
              const periodo =
                !sinReporte && datos.conPeriodos ? b.periodoAbierto : null;
              const puedeCerrar =
                !sinReporte && datos.conPeriodos && !sinGasto && !!b.periodoAbierto?.id;

              return (
                <div key={b.key} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-gray-900">
                        {b.nombre}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {b.key === "multifashion"
                          ? "Tienda propia · no se le reporta a nadie"
                          : b.key === "sin_proveedor"
                            ? "Falta decidir a qué compañía se le reporta este gasto"
                            : b.marcas.join(" · ") || "Sin marcas asignadas"}
                      </div>
                    </div>
                    {periodo && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 whitespace-nowrap">
                        <span className="uppercase tracking-wider opacity-80">
                          Período
                        </span>
                        {periodo.nombre}
                      </span>
                    )}
                  </div>

                  {sinGasto ? (
                    <p className="text-sm text-gray-500 italic mt-3">
                      Todavía no hay gasto en este período.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                      <Cifra etiqueta="Proyectos" valor={String(b.proyectos)} />
                      {b.facturas.count > 0 && (
                        <Cifra
                          etiqueta="Facturas"
                          valor={formatearMonto(b.facturas.total)}
                        />
                      )}
                      {b.muebles.count > 0 && (
                        <Cifra
                          etiqueta="Mobiliario"
                          valor={formatearMonto(b.muebles.total)}
                        />
                      )}
                      <Cifra
                        etiqueta={sinReporte ? "Gasto" : "Total a reportar"}
                        valor={formatearMonto(b.total)}
                      />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectProveedor(b.key)}
                      className="rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm text-gray-800 hover:border-gray-500 active:scale-[0.97] transition"
                    >
                      Ver proyectos
                    </button>
                    {puedeCerrar && (
                      <button
                        type="button"
                        onClick={() => setCerrando(b)}
                        className="rounded-md border border-teal-600 bg-teal-50 px-3 min-h-[44px] inline-flex items-center justify-center text-sm font-semibold text-teal-800 hover:bg-teal-100 active:scale-[0.97] transition"
                      >
                        Cerrar período y bajar reporte
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {/* -------------------------------------------------------------- */}
          {/* Herramientas — se usan a diario y llevan su dato encima.        */}
          {/* -------------------------------------------------------------- */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onOpenInventario}
              className="text-left rounded-lg border border-gray-200 bg-white p-4 min-h-[72px] hover:border-gray-400 active:scale-[0.99] transition"
            >
              <div className="font-semibold text-gray-900">Mobiliario</div>
              <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                {mobiliario
                  ? `${plural(mobiliario.entregas, "entrega", "entregas")} · ${formatearMonto(mobiliario.total)} entregados`
                  : "Inventario y entregas de muebles"}
              </div>
            </button>
            <button
              type="button"
              onClick={onOpenImpulsadoras}
              className="text-left rounded-lg border border-gray-200 bg-white p-4 min-h-[72px] hover:border-gray-400 active:scale-[0.99] transition"
            >
              <div className="font-semibold text-gray-900">Impulsadoras</div>
              <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                {impulsadoras && impulsadoras.count !== null
                  ? `${plural(impulsadoras.count, "impulsadora", "impulsadoras")}${
                      impulsadoras.montoMensual
                        ? ` · ${formatearMonto(impulsadoras.montoMensual)} al mes`
                        : ""
                    }`
                  : "Pagos mensuales de las impulsadoras"}
              </div>
            </button>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* Períodos cerrados — el archivo, al pie y tenue.                 */}
          {/* -------------------------------------------------------------- */}
          {datos.cerrados.length > 0 && (
            <section className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs text-gray-500">Períodos cerrados</span>
              {datos.cerrados.map((c, i) => {
                const etiqueta = `${c.proveedorNombre} · ${c.nombre} · ${formatearMonto(c.total)}`;
                if (!c.id) {
                  // Fallback sin migración: el período existe como agrupación,
                  // pero todavía no tiene fila propia de la que bajar reporte.
                  return (
                    <span
                      key={`${c.proveedorKey}-${c.nombre}-${i}`}
                      className="rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-500"
                    >
                      {etiqueta}
                    </span>
                  );
                }
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => descargarReporte(c.id as string, etiqueta)}
                    title="Bajar el reporte de este período"
                    className="rounded-md border border-gray-200 px-3 min-h-[44px] inline-flex items-center text-xs text-gray-500 hover:text-gray-900 hover:border-gray-400 active:scale-[0.97] transition"
                  >
                    {etiqueta}
                  </button>
                );
              })}
            </section>
          )}
        </>
      )}

      {datos && verPorCliente && (
        <PorClienteModal
          bloques={datos.bloques}
          filas={datos.porCliente}
          onClose={() => setVerPorCliente(false)}
        />
      )}

      {datos && verPorMarca && (
        <PorMarcaModal
          porMarca={datos.porMarca}
          marcas={datos.marcas}
          onClose={() => setVerPorMarca(false)}
        />
      )}

      {cerrando && cerrando.periodoAbierto?.id && (
        <CerrarPeriodoModal
          bloque={cerrando}
          periodoId={cerrando.periodoAbierto.id}
          onClose={() => setCerrando(null)}
          onCerrado={async (periodoId, etiqueta) => {
            setCerrando(null);
            await descargarReporte(periodoId, etiqueta);
            setRecargar((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

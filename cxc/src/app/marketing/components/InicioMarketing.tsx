"use client";

// ============================================================================
// Inicio de Marketing — UN BLOQUE POR MARCA.
//
// 🔑 EL MODELO, en palabras de Daniel: *"ellos facturan a mi bajo compañia
// diferentes. una por marca. cada marca tiene su encargado"*. El agrupador
// "proveedor" desapareció de la pantalla: no era un rename, era un concepto de
// más que se metía en la pantalla, en el reporte y en el nombre del ZIP.
//
// 🔴 CADA MARCA SE CIERRA SOLA, con su propio botón "Cerrar". El atajo de
// cierre conjunto ("Cerrar las tres") se retiró el 11-ago-2026 — Daniel,
// textual: *"que sea por separado mejor no?"*. No volver a dibujar ninguna
// cabecera de grupo ni ningún camino que cierre varias marcas de un clic.
//
// 🔴 NO HAY TECHO NI PRESUPUESTO. *"simplemente reportas lo que gastaste"*. Acá
// no se dibuja ninguna barra de avance ni "cuánto queda".
//
// 🩸 NO SE HACE NINGUNA CUENTA EN ESTE ARCHIVO. Todos los montos vienen ya
// sumados de `GET /api/marketing/inicio`. Sumar acá "para redondear la
// pantalla" sería tener dos verdades sobre la misma plata — la forma exacta en
// que este repo ya se quemó dos veces con los signos de las notas de crédito.
//
// 🔴 LOS PERÍODOS CERRADOS VIVEN DENTRO DE LA TARJETA DE SU MARCA (12-ago-2026).
// Daniel, textual: *"veo el período cerrado solo como un botón para descargar,
// no debería estar archivado dentro de un card como por ejemplo: tommy —
// periodo 'nombre' (cerrado), periodo 'nombre' (abierto). así puedo descargar
// por periodo"*. El abierto va arriba con todo lo de hoy; los cerrados debajo,
// compactos, del más nuevo al más viejo, cada uno con su Excel y su ZIP. La
// fila suelta "Períodos cerrados" del pie de la pantalla SE FUE — no volver a
// dibujarla. El período conjunto legacy ("mid 2026", compartido por dentro) no
// se duplica: aparece en la tarjeta de cada marca CON SU monto, que es como lo
// parte el API.
//
// ⚠️ DEGRADA LIMPIO. El orden de los bloques se deriva del módulo PURO
// `lib/marketing/bloques.ts`, y los contadores de pendientes ausentes se leen como 0 (que es
// "no sé de ninguno", y se dibuja igual que "no hay ninguno": nada). Sin la
// migración de períodos (`conPeriodos: false`) la pantalla se dibuja IGUAL,
// sin píldora y sin botón de cerrar. NO es un error y no se muestra como tal.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import {
  MARCAS_BLOQUE,
  MULTIFASHION_KEY,
  SIN_BLOQUE,
  nombreDeBloque,
} from "@/lib/marketing/bloques";
import PorClienteModal from "./PorClienteModal";
import PorMarcaModal from "./PorMarcaModal";
import CerrarPeriodoModal from "./CerrarPeriodoModal";

export interface MontoInicio {
  count: number;
  total: number;
}

export interface BloqueResumen {
  key: string;
  nombre: string;
  periodoAbierto: { id: string | null; nombre: string } | null;
  facturas: MontoInicio;
  muebles: MontoInicio;
  total: number;
  proyectos: number;
  /** Gastos sin el papel que respalda la plata. Los lleva TODO gasto. */
  sinComprobante?: number;
  /** Gastos sin foto de instalación. Solo los que tienen cliente. */
  sinFoto?: number;
}

export interface PeriodoCerradoResumen {
  id: string | null;
  bloqueKey: string;
  bloqueNombre: string;
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
  bloques: BloqueResumen[];
  cerrados: PeriodoCerradoResumen[];
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
  onSelectBloque: (key: string) => void;
  /** La única puerta para meter plata: el modal de "Registrar gasto". */
  onRegistrarGasto: () => void;
  onOpenImpulsadoras: () => void;
  onOpenInventario: () => void;
  /**
   * Reportes vive ACÁ desde la poda del 11-ago-2026: su enlace en la lista de
   * marca se retiró y esta tarjeta es su única puerta. No quitarla sin darle
   * otra.
   */
  onOpenReportes: () => void;
  refreshKey: number;
}

/** Bloques que NO se le reportan a nadie: sin período y sin botón de cerrar. */
const SIN_REPORTE = new Set<string>([MULTIFASHION_KEY, SIN_BLOQUE]);

/** Orden canónico de los bloques: el del módulo puro, y lo demás al final. */
const ORDEN_BLOQUE = new Map<string, number>(
  MARCAS_BLOQUE.map((m, i) => [m.key, i] as const),
);

function ordenDe(key: string): number {
  const i = ORDEN_BLOQUE.get(String(key ?? "").trim().toUpperCase());
  if (i !== undefined) return i;
  if (key === MULTIFASHION_KEY) return 90;
  if (key === SIN_BLOQUE) return 91;
  return 80;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Nombre de archivo seguro a partir del título del período. */
function nombreArchivo(etiqueta: string, ext: string): string {
  const limpio = etiqueta
    .replace(/[^\p{L}\p{N} .-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${limpio || "Reporte"}.${ext}`;
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

/**
 * Lo que falta en este bloque, en UNA línea.
 *
 * 🔴 SON DOS PAPELES DISTINTOS y no se mezclan. El COMPROBANTE respalda la
 * plata y lo lleva todo gasto, impulsadoras incluidas — Daniel, textual:
 * *"pero impulsadora tambien necesita comprobante, pero no foto. aunq el
 * comprobante sea una foto"*. La FOTO es la de instalación (el letrero puesto,
 * el mueble armado) y solo tiene sentido en un gasto con cliente.
 *
 * El comprobante va en ámbar porque es lo serio; la foto, en gris. La jerarquía
 * va por color, no por tamaño ni por orden.
 *
 * Con los dos en cero NO se dibuja nada: un aviso que dice "todo bien" es ruido.
 */
export function LoQueFalta({
  sinComprobante,
  sinFoto,
}: {
  sinComprobante: number;
  sinFoto: number;
}) {
  if (sinComprobante <= 0 && sinFoto <= 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {sinComprobante > 0 && (
        <span className="text-amber-800">
          {plural(sinComprobante, "gasto", "gastos")} sin comprobante
        </span>
      )}
      {sinFoto > 0 && (
        <span className="text-gray-500">
          {plural(sinFoto, "gasto", "gastos")} sin foto
        </span>
      )}
    </div>
  );
}

export default function InicioMarketing({
  onSelectBloque,
  onRegistrarGasto,
  onOpenImpulsadoras,
  onOpenInventario,
  onOpenReportes,
  refreshKey,
}: Props) {
  const { toast } = useToast();
  const [datos, setDatos] = useState<DatosInicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [verPorCliente, setVerPorCliente] = useState(false);
  const [verPorMarca, setVerPorMarca] = useState(false);
  const [cerrando, setCerrando] = useState<BloqueResumen | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);
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
  //
  // `marca` acota el período conjunto legacy ('pvh' junta TH+CK+KL): el chip
  // de Calvin · mid 2026 baja SOLO lo de Calvin. Sin marca (el cierre normal,
  // que ya es por marca) el reporte sale entero.
  const descargarReporte = useCallback(
    async (periodoId: string, etiqueta: string, marca?: string) => {
      try {
        const qs = marca ? `?marca=${encodeURIComponent(marca)}` : "";
        const res = await fetch(
          `/api/marketing/periodos/${periodoId}/reporte${qs}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          toast("No se pudo bajar el reporte. Intenta de nuevo en unos segundos.", "error");
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") ?? "";
        const m = /filename\*?=(?:UTF-8'')?"?([^"';]+)"?/i.exec(cd);
        saveAs(blob, m?.[1] ? decodeURIComponent(m[1]) : nombreArchivo(etiqueta, "xlsx"));
        toast("Reporte listo — revisa tu carpeta de descargas.", "success");
      } catch {
        toast("No se pudo bajar el reporte. Verifica tu conexión.", "error");
      }
    },
    [toast],
  );

  /**
   * El ZIP de UNA marca.
   *
   * 🔴 SE BAJA DE A UNO Y A PROPÓSITO. Nada de disparar varias descargas
   * seguidas: Safari en iPhone bloquea la segunda y la tercera, así que un
   * "bajar todos" se vería como que el sistema perdió archivos. Los botones
   * QUEDAN en pantalla para siempre — un período cerrado se puede volver a
   * bajar las veces que haga falta.
   *
   * Sin `periodoId` baja lo que hay abierto hoy, que es el pedido de Daniel:
   * *"si me llegan a pedir que lo quieren por marca? o algun dia me piden solo
   * reporte de una marca?"*.
   */
  const bajarZipMarca = useCallback(
    async (marcaCodigo: string, etiqueta: string, periodoId?: string | null) => {
      const clave = `${marcaCodigo}:${periodoId ?? "abierto"}`;
      setBajando(clave);
      try {
        const res = await fetch("/api/marketing/zip-marca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            periodoId ? { marcaCodigo, periodoId } : { marcaCodigo },
          ),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          toast(
            err?.error ?? "No se pudo armar el ZIP. Intenta de nuevo en unos segundos.",
            "error",
          );
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") ?? "";
        const m = /filename\*?=(?:UTF-8'')?"?([^"';]+)"?/i.exec(cd);
        saveAs(blob, m?.[1] ? decodeURIComponent(m[1]) : nombreArchivo(etiqueta, "zip"));
        toast("ZIP listo — revisa tu carpeta de descargas.", "success");
      } catch {
        toast("No se pudo armar el ZIP. Verifica tu conexión.", "error");
      } finally {
        setBajando(null);
      }
    },
    [toast],
  );

  // Los bloques, en el orden canónico del módulo puro. Que un bloque salte de
  // lugar porque este mes gastó menos hace que la pantalla se lea distinta cada
  // vez, y acá se entra a buscar una marca por su nombre, no por su tamaño.
  const bloques = useMemo(() => {
    const lista = datos?.bloques ?? [];
    return [...lista].sort((a, b) => ordenDe(a.key) - ordenDe(b.key));
  }, [datos]);

  // Los períodos CERRADOS de cada marca, para listarlos dentro de su tarjeta.
  // Vienen del API ya partidos por marca (el conjunto legacy "mid 2026"
  // aparece en Tommy y en Calvin, cada uno con SU monto) y ya ordenados del
  // más nuevo al más viejo. Acá solo se agrupan — no se suma nada.
  const cerradosPorBloque = useMemo(() => {
    const m = new Map<string, PeriodoCerradoResumen[]>();
    for (const c of datos?.cerrados ?? []) {
      const arr = m.get(c.bloqueKey) ?? [];
      arr.push(c);
      m.set(c.bloqueKey, arr);
    }
    return m;
  }, [datos]);

  const mobiliario = datos?.mobiliario;
  const impulsadoras = datos?.impulsadoras;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Cabecera: el título y la ÚNICA acción principal del módulo.         */}
      {/* El proyecto dejó de ser un paso — Daniel: "¿alguna vez creas un     */}
      {/* proyecto antes de tener un gasto?" → "no".                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Marketing</h1>
        <button
          type="button"
          onClick={onRegistrarGasto}
          className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
        >
          + Registrar gasto
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
                <div className="text-xs text-gray-500 mt-1">gastado en el período actual</div>
              </div>
              <div>
                <div className="text-2xl sm:text-[28px] font-semibold text-gray-900 tabular-nums leading-none">
                  {datos.resumen.clientes}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {datos.resumen.clientes === 1 ? "cliente" : "clientes"}
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
          {/* UN BLOQUE POR MARCA — cada marca es una compañía con su         */}
          {/* encargado y su reporte.                                        */}
          {/* -------------------------------------------------------------- */}
          <section className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-200">
            {bloques.map((b) => {
              const sinReporte = SIN_REPORTE.has(b.key);
              const sinGasto = b.facturas.count === 0 && b.muebles.count === 0;
              const periodo =
                !sinReporte && datos.conPeriodos ? b.periodoAbierto : null;
              const puedeCerrar =
                !sinReporte && datos.conPeriodos && !sinGasto && !!b.periodoAbierto?.id;
              const nombre = b.nombre || nombreDeBloque(b.key, datos.marcas);
              const zipClave = `${b.key}:abierto`;
              // Multifashion también baja su ZIP — Daniel: *"descargas por
              // marca te basta y multifashion es una marca"*. Sigue sin
              // período y sin cerrar (tienda propia, no se le reporta a nadie).
              const conZip = (!sinReporte || b.key === MULTIFASHION_KEY) && !sinGasto;
              const cerradosDelBloque = cerradosPorBloque.get(b.key) ?? [];

              return (
                <div key={b.key}>
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">
                          {nombre}
                        </div>
                        {sinReporte && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {b.key === MULTIFASHION_KEY
                              ? "Tienda propia · sin período"
                              : "Falta decidir a qué marca se le reporta este gasto"}
                          </div>
                        )}
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

                    <LoQueFalta
                      sinComprobante={b.sinComprobante ?? 0}
                      sinFoto={b.sinFoto ?? 0}
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectBloque(b.key)}
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
                          Cerrar
                        </button>
                      )}
                      {conZip && (
                        <button
                          type="button"
                          onClick={() =>
                            bajarZipMarca(b.key, `${nombre} · ${periodo?.nombre ?? "actual"}`)
                          }
                          disabled={bajando === zipClave}
                          className="rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm text-gray-800 hover:border-gray-500 active:scale-[0.97] transition disabled:opacity-40"
                        >
                          {bajando === zipClave ? "Armando…" : "Bajar ZIP"}
                        </button>
                      )}
                    </div>

                    {/* ----------------------------------------------------- */}
                    {/* Los períodos CERRADOS de esta marca — compactos, uno  */}
                    {/* por línea, del más nuevo al más viejo, cada uno con   */}
                    {/* su Excel y su ZIP. Quedan acá para siempre: se pueden */}
                    {/* volver a bajar cuando haga falta, de a uno.           */}
                    {/* ----------------------------------------------------- */}
                    {cerradosDelBloque.length > 0 && (
                      <div className="mt-4 border-t border-gray-100 pt-3 space-y-1.5">
                        {cerradosDelBloque.map((c, i) => {
                          const etiqueta = `${c.bloqueNombre} · ${c.nombre} · ${formatearMonto(c.total)}`;
                          const zipClaveCerrado = `${c.bloqueKey}:${c.id ?? "sin-id"}`;
                          return (
                            <div
                              key={c.id ?? `${c.bloqueKey}-${c.nombre}-${i}`}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1"
                            >
                              <div className="min-w-0 text-sm text-gray-700">
                                {c.nombre}{" "}
                                <span className="text-xs text-gray-400">(cerrado)</span>
                              </div>
                              <div className="text-sm font-medium text-gray-900 tabular-nums">
                                {formatearMonto(c.total)}
                              </div>
                              {c.id && (
                                <div className="ml-auto flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      bajarZipMarca(c.bloqueKey, etiqueta, c.id)
                                    }
                                    title={`Bajar el ZIP de ${c.bloqueNombre} · ${c.nombre}`}
                                    disabled={bajando === zipClaveCerrado}
                                    className="rounded-md border border-gray-200 bg-white px-2.5 min-h-[44px] inline-flex items-center justify-center text-xs text-gray-600 hover:text-gray-900 hover:border-gray-400 active:scale-[0.97] transition disabled:opacity-40"
                                  >
                                    {bajando === zipClaveCerrado ? "Armando…" : "ZIP"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      descargarReporte(c.id as string, etiqueta, c.bloqueKey)
                                    }
                                    title="Bajar el Excel de este período"
                                    className="rounded-md border border-gray-200 bg-white px-2.5 min-h-[44px] inline-flex items-center justify-center text-xs text-gray-600 hover:text-gray-900 hover:border-gray-400 active:scale-[0.97] transition"
                                  >
                                    Excel
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {/* -------------------------------------------------------------- */}
          {/* Herramientas — se usan a diario y llevan su dato encima.        */}
          {/* Reportes vive acá desde la poda del 11-ago-2026: es su ÚNICA    */}
          {/* puerta (el enlace de la lista de marca se retiró).              */}
          {/* -------------------------------------------------------------- */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <button
              type="button"
              onClick={onOpenReportes}
              className="text-left rounded-lg border border-gray-200 bg-white p-4 min-h-[72px] hover:border-gray-400 active:scale-[0.99] transition"
            >
              <div className="font-semibold text-gray-900">Reportes</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Por marca, por tienda y por proyecto
              </div>
            </button>
          </section>

          {/* La fila suelta "Períodos cerrados" del pie SE FUE (12-ago-2026):
              cada período cerrado vive dentro de la tarjeta de su marca, con
              su Excel y su ZIP. No volver a dibujar el archivo acá abajo. */}
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
            // El recién cerrado se baja con SU marca — mismo camino que el
            // botón Excel de la lista de cerrados de la tarjeta.
            await descargarReporte(periodoId, etiqueta, cerrando.key);
            setRecargar((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

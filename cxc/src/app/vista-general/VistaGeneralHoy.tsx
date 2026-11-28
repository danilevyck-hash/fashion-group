"use client";

// Vista general «HOY» (27-nov-2026, `VISTA_GENERAL_HOY_2026_11`). Cómo está el
// negocio hoy: sin mes ni período. Las sumas y los enlaces viven en
// `lib/vista-general/hoy.ts`; esta pantalla solo dibuja.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChipSelector } from "@/components/celular/BarraDeControles";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { useMantenerPresionado } from "@/components/shared/GestosIphone";
import { AvisoMesAMes, ERROR_TARJETA, TarjetaMesAMes, useLecturaDeTarjeta } from "@/components/shared/TarjetaMesAMes";
import { VG_MARGEN_COBROS_MES_A_MES_2026_11 } from "@/lib/ui/vista-general-mes-a-mes-2026-11";
import { VG_UTILIDAD_Y_VENDIDO_POR_TIPO_2026_11 } from "@/lib/ui/vista-general-utilidad-tipo-2026-11";
import VendidoPorTipo from "./VendidoPorTipo";
import { VG_VENTAS_CON_UTILIDAD_Y_ANIOS_2026_11 } from "@/lib/ui/vista-general-ventas-anios-2026-11";
import { VG_ORDEN_TARJETAS_2026_11, ordenTarjetas } from "@/lib/ui/vista-general-orden-2026-11";
import { type MesesContraAnioPasado } from "@/lib/mes-contra-anio-pasado";
import { GESTOS_IPHONE_2026_11 } from "@/lib/ui/gestos-iphone-2026-11";
import { DIAS_INVENTARIO_NUEVO, INVENTARIO_90_DIAS_2026_11 } from "@/lib/ui/inventario-90-dias-2026-11";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { hasModuleAccess } from "@/lib/auth-check";
import { ALL_MODULES } from "@/lib/modules";
import { MONTHS } from "@/lib/ventas/format";
import { mesEnCursoDelCorte, mesesDeSeries, notaDelMesEnCurso } from "@/lib/ventas/mes-a-mes";
import {
  BOSTON,
  cambioEnPuntos,
  margenMesAMes,
  DIAS_PEDIDO_ATRASADO,
  MULTIFASHION,
  VALOR_GRUPO,
  empresaValida,
  empresasDe,
  enlaceDe,
  moduloDe,
  montoCorto,
  opcionesEmpresaHoy,
  porDespachar,
  porcentaje,
  resumir,
  type Celda,
  type Comparado,
  type Destino,
  type UtilidadConMargen,
  type VistaGeneralHoyData,
} from "@/lib/vista-general/hoy";

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error("err"); return r.json(); });

const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const CLASE_TARJETA = "block rounded-[14px] border border-gray-200 bg-white p-4";
const CLASE_TOCABLE = "transition hover:border-gray-300 active:scale-[0.99]";
const CLASE_ROTULO = "text-sm font-medium text-gray-500";
const CLASE_CIFRA = "mt-1 text-2xl font-bold tabular-nums text-gray-900";

/** ¿El rol de quien mira tiene el módulo de destino? (después de hidratar). */
function useModulos(): (key: string) => boolean {
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);
  return (key: string) => {
    if (!listo) return false;
    const m = ALL_MODULES.find((x) => x.key === key);
    return !!m && hasModuleAccess(key, m.roles);
  };
}

export default function VistaGeneralHoy() {
  const [empresaUrl, setEmpresaUrl] = useUrlState("empresa", VALOR_GRUPO);
  const empresa = empresaValida(empresaUrl);
  const { data, error, isLoading, mutate } = useSWR<VistaGeneralHoyData>("/api/dashboard/vista-general/hoy", fetcher, {
    dedupingInterval: 60_000,
    revalidateOnFocus: true,
  });
  const puede = useModulos();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 pt-2 md:py-6">
      <h1 className="sr-only">Vista general</h1>
      <div className="mb-3 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
        <ChipSelector rotulo="Empresa" soloValor valor={empresa} opciones={opcionesEmpresaHoy()} onCambiar={setEmpresaUrl} />
        <span className="flex-1" />
        <LineaDeFrescura actualizado={data?.actualizado ?? null} onActualizar={async () => { await mutate(); }} sinSwitch />
      </div>

      {isLoading && !data ? (
        <Esqueleto />
      ) : error || !data ? (
        <div className={`${CLASE_TARJETA} text-center`}>
          <p className="text-sm text-gray-700">No se pudo cargar la vista general. Intenta de nuevo en unos segundos.</p>
          <button type="button" onClick={() => mutate()} className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]">
            Reintentar
          </button>
        </div>
      ) : (
        <Tarjetas data={data} empresa={empresa} puede={puede} onEmpresa={setEmpresaUrl} />
      )}
    </div>
  );
}

function Tarjetas({ data, empresa, puede, onEmpresa }: { data: VistaGeneralHoyData; empresa: string; puede: (k: string) => boolean; onEmpresa: (v: string) => void }) {
  const keys = useMemo(() => empresasDe(empresa), [empresa]);
  const r = useMemo(() => resumir(keys, data), [keys, data]);
  const destino = (d: Destino) => (puede(moduloDe(d, empresa)) ? enlaceDe(d, empresa) : null);
  const [mesAMes, setMesAMes] = useState<"ventas" | "margen" | null>(null);
  const mantener = useMantenerPresionado(() => setMesAMes("ventas"));
  const extras = VG_MARGEN_COBROS_MES_A_MES_2026_11;
  const nuevo = VG_UTILIDAD_Y_VENDIDO_POR_TIPO_2026_11;
  const orden = VG_ORDEN_TARJETAS_2026_11;
  const juntas = VG_VENTAS_CON_UTILIDAD_Y_ANIOS_2026_11;
  const mantenerMargen = useMantenerPresionado(extras ? () => setMesAMes("margen") : null);
  const cobrosMesAMes = useLecturaDeTarjeta<string, MesesContraAnioPasado>((e) => `/api/dashboard/vista-general/cobros-mes-a-mes?empresa=${encodeURIComponent(e)}`);
  const mantenerCobros = useMantenerPresionado(extras ? () => cobrosMesAMes.abrir(empresa) : null);
  const margen = useMemo(() => (extras ? margenMesAMes(keys, data) : null), [extras, keys, data]);
  const nombreEmpresa = opcionesEmpresaHoy().find((o) => o.valor === empresa)?.etiqueta ?? "";

  const noManeja = [
    r.pedidos.estado === "no-maneja" && "Pedidos",
    r.cxc.estado === "no-maneja" && "Por cobrar",
    r.cxp.estado === "no-maneja" && "Por pagar",
    r.inventario.estado === "no-maneja" && "Inventario",
    nuevo && empresa === BOSTON && "Vendido por tipo",
  ].filter(Boolean) as string[];

  const series = useMemo(() => {
    const suma = (f: (k: string) => (number | null)[]) =>
      Array.from({ length: 12 }, (_, i) => {
        const vs = keys.map((k) => f(k)[i]);
        return vs.every((v) => v == null) ? null : vs.reduce<number>((s, v) => s + (v ?? 0), 0);
      });
    const ok = keys.every((k) => data.empresas[k]?.ventas);
    return ok
      ? { actual: suma((k) => data.empresas[k].ventas!.serie), previo: suma((k) => data.empresas[k].ventas!.seriePrev) }
      : null;
  }, [keys, data]);

  return (
    <>
      {GESTOS_IPHONE_2026_11 && <AvisoMesAMes />}
      {mesAMes === "margen" && margen && (
        <TarjetaMesAMes
          titulo={nombreEmpresa}
          subtitulo={`Margen ${data.anio} · vs ${data.anio - 1}`}
          anio={data.anio}
          meses={margen.meses}
          total={margen.total}
          formato={porcentaje}
          cambio={cambioEnPuntos}
          mesEnCurso={mesEnCursoDelCorte(data.anio, data.fechaCorte)}
          nota={notaDelMesEnCurso(data.anio, data.fechaCorte)}
          onCerrar={() => setMesAMes(null)}
        />
      )}
      {cobrosMesAMes.tarjeta && (
        <TarjetaMesAMes
          titulo={nombreEmpresa}
          subtitulo={`Cobros ${data.anio}`}
          anio={data.anio}
          meses={cobrosMesAMes.tarjeta.estado.status === "listo" ? cobrosMesAMes.tarjeta.estado.datos.meses : []}
          total={cobrosMesAMes.tarjeta.estado.status === "listo" ? cobrosMesAMes.tarjeta.estado.datos.total : null}
          cambio={null}
          mesEnCurso={data.mes}
          cargando={cobrosMesAMes.tarjeta.estado.status === "cargando"}
          error={cobrosMesAMes.tarjeta.estado.status === "error" ? ERROR_TARJETA : null}
          onCerrar={cobrosMesAMes.cerrar}
        />
      )}
      {mesAMes === "ventas" && series && r.ventasAnio && (
        <TarjetaMesAMes
          titulo={nombreEmpresa}
          subtitulo={`Ventas ${data.anio} · vs ${data.anio - 1}`}
          anio={data.anio}
          meses={mesesDeSeries(series.actual, series.previo, data.mes)}
          total={{ actual: r.ventasAnio.actual, previo: r.ventasAnio.previo }}
          mesEnCurso={mesEnCursoDelCorte(data.anio, data.fechaCorte)}
          nota={notaDelMesEnCurso(data.anio, data.fechaCorte)}
          onCerrar={() => setMesAMes(null)}
        />
      )}

      {(() => {
        const ventas = (
          <Tarjeta key="ventas" href={destino("ventas")} className="col-span-2" extra={mantener}>
            <p className={CLASE_ROTULO}>Ventas</p>
            {r.ventasMes && r.ventasAnio ? (
              <div className="mt-1 grid grid-cols-2 gap-3">
                <VentaComparada rotulo={MESES_LARGOS[data.mes - 1] ?? MONTHS[data.mes - 1]} c={r.ventasMes}>
                  {juntas && r.utilidadMes && <LineaUtilidad u={r.utilidadMes} mantener={mantenerMargen} />}
                </VentaComparada>
                <VentaComparada rotulo={String(data.anio)} c={r.ventasAnio}>
                  {juntas && r.utilidadAnio && <LineaUtilidad u={r.utilidadAnio} mantener={mantenerMargen} />}
                </VentaComparada>
              </div>
            ) : (
              <SinMedir />
            )}
          </Tarjeta>
        );
        /* «Utilidad»: el mes y el año en $, con su margen debajo. Mantener presionado = margen mes a mes. */
        const utilidad = juntas ? null : nuevo ? (
          <Tarjeta key="utilidad" href={destino("ventas")} className="col-span-2" extra={mantenerMargen}>
            <p className={CLASE_ROTULO}>Utilidad</p>
            {r.utilidadMes && r.utilidadAnio ? (
              <div className="mt-1 grid grid-cols-2 gap-3">
                <UtilidadColumna rotulo={MESES_LARGOS[data.mes - 1] ?? MONTHS[data.mes - 1]} u={r.utilidadMes} />
                <UtilidadColumna rotulo={String(data.anio)} u={r.utilidadAnio} />
              </div>
            ) : (
              <SinMedir />
            )}
          </Tarjeta>
        ) : (
          <Tarjeta key="utilidad" href={destino("ventas")} extra={mantenerMargen}>
            <p className={CLASE_ROTULO}>Margen del mes</p>
            <p className={CLASE_CIFRA}>{r.margenMes == null ? "—" : porcentaje(r.margenMes)}</p>
          </Tarjeta>
        );
        const tipo = nuevo && empresa !== BOSTON ? <VendidoPorTipo key="tipo" empresa={empresa} className="col-span-2" /> : null;
        const cobros =
          !nuevo && r.cobros.estado !== "no-maneja" ? (
            <Tarjeta key="cobros" href={destino("cxc")} extra={mantenerCobros}>
              <p className={CLASE_ROTULO}>Cobros del mes</p>
              <Cifra c={r.cobros} f={montoCorto} />
            </Tarjeta>
          ) : null;
        const urgente = r.pedidos.estado === "ok" && r.pedidos.valor.atrasados > 0;
        const pedidos =
          r.pedidos.estado !== "no-maneja" ? (
            <Tarjeta key="pedidos" href={destino("pedidos")} className="col-span-2">
              <p className={`${CLASE_ROTULO} flex items-center gap-2`}>
                Pedidos por despachar
                {r.pedidos.estado === "ok" && r.pedidos.valor.atrasados > 0 && (
                  <span data-punto-pedidos className="inline-block h-2 w-2 rounded-full bg-amber-500">
                    <span className="sr-only">{`${r.pedidos.valor.atrasados} con más de ${DIAS_PEDIDO_ATRASADO} días`}</span>
                  </span>
                )}
              </p>
              {r.pedidos.estado === "ok" ? (
                <>
                  <p className={CLASE_CIFRA}>{porDespachar(r.pedidos.valor)}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                    <Paso n={r.pedidos.valor.pendiente} rotulo="Pendiente" />
                    <Paso n={r.pedidos.valor.en_preparacion} rotulo="En preparación" />
                    <Paso n={r.pedidos.valor.preparado} rotulo="Preparado" />
                  </div>
                </>
              ) : (
                <SinMedir />
              )}
            </Tarjeta>
          ) : null;
        const cxc =
          r.cxc.estado !== "no-maneja" ? (
            <Tarjeta key="cxc" href={destino("cxc")} className="col-span-2" extra={nuevo ? mantenerCobros : undefined}>
              <p className={CLASE_ROTULO}>Por cobrar</p>
              <CarteraCifras c={r.cxc} rojo />
              {nuevo && r.cobros.estado !== "no-maneja" && <Cobrado mes={r.cobros} anio={r.cobrosAnio} rotuloMes={(MESES_LARGOS[data.mes - 1] ?? "").toLowerCase()} anioNum={data.anio} />}
            </Tarjeta>
          ) : null;
        const cxp =
          r.cxp.estado !== "no-maneja" ? (
            <Tarjeta key="cxp" href={destino("cxp")} className="col-span-2">
              <p className={CLASE_ROTULO}>Por pagar</p>
              <CarteraCifras c={r.cxp} />
            </Tarjeta>
          ) : null;
        const inventario =
          r.inventario.estado !== "no-maneja" ? (
            <Tarjeta key="inventario" href={destino("inventario")} className={orden ? "col-span-2" : ""}>
              <p className={CLASE_ROTULO}>Inventario</p>
              {r.inventario.estado === "ok" ? (
                <>
                  <p className={CLASE_CIFRA}>{montoCorto(r.inventario.valor.costo)}</p>
                  <p className="mt-0.5 text-sm tabular-nums text-gray-500">{Math.round(r.inventario.valor.unidades).toLocaleString("en-US")} unidades</p>
                  {INVENTARIO_90_DIAS_2026_11 && r.inventario.valor.antiguedad && <InventarioPorAntiguedad a={r.inventario.valor.antiguedad} />}
                </>
              ) : (
                <SinMedir />
              )}
            </Tarjeta>
          ) : null;
        // Disponibilidad no tiene dato (no hay saldos de banco al día): con el orden nuevo no se dibuja.
        const disponibilidad = orden ? null : (
          <Tarjeta key="disponibilidad" href={null}>
            <p className={CLASE_ROTULO}>Disponibilidad</p>
            <p className="mt-1 text-base text-gray-500">No disponible por ahora</p>
          </Tarjeta>
        );
        const tarjetas = orden
          ? [...(urgente ? [pedidos] : []), ...ordenTarjetas({ ventas, utilidad, cxc, cxp, inventario, tipo, pedidos: urgente ? null : pedidos })]
          : [ventas, utilidad, tipo, cobros, pedidos, cxc, cxp, inventario, disponibilidad];
        return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tarjetas}</div>;
      })()}

      {noManeja.length > 0 && (
        <p data-no-lo-maneja className="mt-3 text-sm text-gray-500">No lo maneja en el sistema: {noManeja.join(" · ")}</p>
      )}

      {empresa === VALOR_GRUPO && (
        <div className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-[14px] border border-gray-200 bg-white">
          <FilaAparte data={data} k={BOSTON} nombre="Confecciones Boston" onEmpresa={onEmpresa} />
          <FilaAparte data={data} k={MULTIFASHION} nombre="Multifashion" onEmpresa={onEmpresa} />
        </div>
      )}

      <p className="mt-4 text-center text-sm text-gray-500">▲▼ contra los mismos días de {data.anio - 1}</p>
    </>
  );
}

function Tarjeta({ href, className = "", extra, children }: { href: string | null; className?: string; extra?: object; children: ReactNode }) {
  if (!href) return <div className={`${CLASE_TARJETA} ${className}`} {...extra}>{children}</div>;
  return (
    <Link href={href} className={`${CLASE_TARJETA} ${CLASE_TOCABLE} ${className}`} {...extra}>
      {children}
    </Link>
  );
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const sube = pct >= 0;
  return (
    <p className={`mt-0.5 text-sm font-medium tabular-nums ${sube ? "text-green-700" : "text-red-700"}`}>
      {sube ? "▲ +" : "▼ −"}
      {porcentaje(Math.abs(pct))}
    </p>
  );
}

function VentaComparada({ rotulo, c, children }: { rotulo: string; c: Comparado; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-gray-500">{rotulo}</p>
      <p className={CLASE_CIFRA}>{montoCorto(c.actual)}</p>
      <Delta pct={c.pct} />
      {children}
    </div>
  );
}

/**
 * «Utilidad $34k · 28%» bajo la venta. Mantenerla presionada abre el margen mes
 * a mes; el resto de la tarjeta, las ventas mes a mes (el toque que empieza aquí
 * no le llega a la tarjeta).
 */
function LineaUtilidad({ u, mantener }: { u: UtilidadConMargen; mantener: ReturnType<typeof useMantenerPresionado> }) {
  const m = mantener as { onTouchStart?: (e: React.TouchEvent) => void };
  return (
    <p
      data-utilidad
      {...mantener}
      onTouchStart={(e) => {
        if (m.onTouchStart) e.stopPropagation();
        m.onTouchStart?.(e);
      }}
      className="mt-1 truncate text-sm tabular-nums text-gray-600"
    >
      Utilidad {montoCorto(u.utilidad)}
      {u.margen == null ? "" : ` · ${porcentaje(u.margen)}`}
    </p>
  );
}

/** Una columna de «Utilidad»: el monto grande y «N% margen» debajo. */
function UtilidadColumna({ rotulo, u }: { rotulo: string; u: UtilidadConMargen }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-gray-500">{rotulo}</p>
      <p className={CLASE_CIFRA}>{montoCorto(u.utilidad)}</p>
      <p className="mt-0.5 text-sm tabular-nums text-gray-500">{u.margen == null ? "Sin costo cargado" : `${porcentaje(u.margen)} margen`}</p>
    </div>
  );
}

/** La línea «Cobrado» bajo Por cobrar: el mes y el año, con la regla de los cobros. */
function Cobrado({ mes, anio, rotuloMes, anioNum }: { mes: Celda<number>; anio: Celda<number>; rotuloMes: string; anioNum: number }) {
  const celda = (c: Celda<number>, rotulo: string) => (
    <div className="min-w-0">
      <p className="text-lg font-semibold tabular-nums text-gray-900">{c.estado === "ok" ? montoCorto(c.valor) : "—"}</p>
      <p className="text-sm text-gray-500">{rotulo}</p>
    </div>
  );
  return (
    <div data-cobrado className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
      {celda(mes, `Cobrado en ${rotuloMes}`)}
      {celda(anio, `Cobrado en ${anioNum}`)}
    </div>
  );
}

function Cifra({ c, f }: { c: Celda<number>; f: (n: number) => string }) {
  return c.estado === "ok" ? <p className={CLASE_CIFRA}>{f(c.valor)}</p> : <SinMedir />;
}

function CarteraCifras({ c, rojo = false }: { c: Celda<{ total: number; mas120: number }>; rojo?: boolean }) {
  if (c.estado !== "ok") return <SinMedir />;
  const { total, mas120 } = c.valor;
  return (
    <>
      <p className={CLASE_CIFRA}>{montoCorto(total)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold tabular-nums text-gray-900">{montoCorto(total - mas120)}</p>
          <p className="text-sm text-gray-500">Hasta 120 días</p>
        </div>
        <div className="min-w-0">
          <p className={`text-lg font-semibold tabular-nums ${rojo && mas120 > 0 ? "text-red-700" : "text-gray-900"}`}>{montoCorto(mas120)}</p>
          <p className="text-sm text-gray-500">Más de 120 días</p>
        </div>
      </div>
    </>
  );
}

/** El mismo partido de Por cobrar, a 90 días: lo que llegó hace poco y lo de antes. */
function InventarioPorAntiguedad({ a }: { a: { nuevo: number; viejo: number; sinFecha: number } }) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold tabular-nums text-gray-900">{montoCorto(a.nuevo)}</p>
          <p className="text-sm text-gray-500">Hasta {DIAS_INVENTARIO_NUEVO} días</p>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold tabular-nums text-gray-900">{montoCorto(a.viejo)}</p>
          <p className="text-sm text-gray-500">Más de {DIAS_INVENTARIO_NUEVO} días</p>
        </div>
      </div>
      {Math.round(a.sinFecha) > 0 && (
        <p className="mt-2 text-sm tabular-nums text-gray-500">Sin fecha de llegada: {montoCorto(a.sinFecha)}</p>
      )}
    </>
  );
}

function Paso({ n, rotulo }: { n: number; rotulo: string }) {
  return (
    <div className="min-w-0">
      <p className="text-lg font-semibold tabular-nums text-gray-900">{n}</p>
      <p className="text-sm text-gray-500">{rotulo}</p>
    </div>
  );
}

function SinMedir() {
  return <p className="mt-1 text-sm text-gray-500">No se pudo medir</p>;
}

/** Boston y Multifashion, aparte del grupo. Tocar la fila elige esa empresa. */
function FilaAparte({ data, k, nombre, onEmpresa }: { data: VistaGeneralHoyData; k: string; nombre: string; onEmpresa: (v: string) => void }) {
  const r = resumir([k], data);
  const extra =
    k === BOSTON
      ? `Por cobrar ${r.cxc.estado === "ok" ? montoCorto(r.cxc.valor.total) : "—"}`
      : `Inventario ${r.inventario.estado === "ok" ? montoCorto(r.inventario.valor.costo) : "—"}`;
  return (
    <button
      type="button"
      data-fila-aparte={k}
      onClick={() => {
        onEmpresa(k);
        window.scrollTo({ top: 0 });
      }}
      className="flex min-h-[44px] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{nombre}</span>
        <span className="block text-sm tabular-nums text-gray-500">{extra}</span>
      </span>
      <span className="text-right">
        <span className="block text-base font-semibold tabular-nums text-gray-900">{r.ventasMes ? montoCorto(r.ventasMes.actual) : "—"}</span>
        {r.ventasMes?.pct != null && (
          <span className={`block text-sm font-medium tabular-nums ${r.ventasMes.pct >= 0 ? "text-green-700" : "text-red-700"}`}>
            {r.ventasMes.pct >= 0 ? "▲ +" : "▼ −"}
            {porcentaje(Math.abs(r.ventasMes.pct))}
          </span>
        )}
      </span>
    </button>
  );
}

function Esqueleto() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={`${CLASE_TARJETA} ${i === 0 ? "col-span-2" : ""}`}>
          <div className="h-3 w-20 rounded bg-gray-200" />
          <div className="mt-2 h-7 w-24 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

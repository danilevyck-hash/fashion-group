"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
// Módulo PURO (no arrastra supabase al navegador): las etiquetas de "por qué no
// hay número" salen del MISMO lugar que las usa el servidor.
import RentabilidadPorEmpresa, {
  type RentabilidadEmpresaRow,
} from "./RentabilidadPorEmpresa";
import GastosPorEmpresa, { type GastosData } from "./GastosPorEmpresa";
import InventarioPorEmpresa, {
  InventarioKpiValue,
  piezas,
  textoFrescura,
  type InventarioData,
} from "./InventarioPorEmpresa";
import { moneyK, pct } from "./formato";

// ── Tipos del API ─────────────────────────────────────────────────────────────

interface EmpresaVentas { key: string; name: string; ventas: number; utilidad: number }

interface VistaGeneral {
  mes: string;
  ventas: null | { total: number; prevYear: number | null; yoyPct: number | null; parcial: boolean; prevHasta?: string | null; empresasCount: number; byEmpresa: EmpresaVentas[] };
  margen: null | { pct: number | null; utilidad: number };
  // 🔴 NO HAY `gastos.total`, y es a propósito. Daniel, textual (13-ago-2026):
  // "La tarjeta de Gastos de Vista General también por empresa". El número por
  // empresa vive en `porEmpresa`, cada una con SU gasto o SU motivo. Ver
  // `GastosPorEmpresa.tsx`.
  gastos: GastosData;
  // 🔴 NO HAY `rentabilidad` DE GRUPO, y es a propósito. Daniel, textual
  // (13-ago-2026): "no quiero Rentabilidad del grupo, lo quiero por empresa".
  // El número por empresa vive en `semaforo[]`, cada una con SU venta contra SU
  // gasto. Ver `RentabilidadPorEmpresa.tsx`.
  disponibilidad: null | { total: number; fechaMasVieja: string; cuentas: number };
  /** `null` = la lectura se cayó. NUNCA se pinta como $0. */
  inventario: InventarioData | null;
  semaforo: RentabilidadEmpresaRow[];
  cxc: { total: number; corriente: number; vigilancia: number; vencido: number; empresasCount: number; topClientes: { nombre: string; codigo: string | null; empresa: string; saldo: number }[] };
  cxp: { total: number; corriente: number; vigilancia: number; vencido: number; empresasCount: number; topProveedores: { nombre: string; empresa: string; saldo: number }[] };
  reclamos: { antiguos: { id: string; nro: string; empresa: string; estado: string; dias: number }[]; total: number };
}

// ── Helpers de meses (locales a esta página) ─────────────────────────────────

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesValido(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

function sumarMeses(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** "2026-07" → "Julio 2026" */
function mesLabel(ym: string): string {
  if (!mesValido(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

/** "2026-07" → "julio 2026" (para texto corrido) */
function mesLabelMin(ym: string): string {
  return mesLabel(ym).toLowerCase();
}

/** "2026-07-15" → "15 jul" */
function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1] ?? ""}`;
}

// ── Helpers de formato ───────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error("err"); return r.json(); });

// ── Página ───────────────────────────────────────────────────────────────────

export default function VistaGeneralPage() {
  return (
    <Suspense>
      <VistaGeneralInner />
    </Suspense>
  );
}

function VistaGeneralInner() {
  const { authChecked } = useAuth({ moduleKey: "vista-general", allowedRoles: ["admin"] });
  const hoy = mesActual();
  const [mesUrl, setMesUrl] = useUrlState("mes", hoy);
  // Sanea el param: inválido o futuro → mes actual
  const mes = mesValido(mesUrl) && mesUrl <= hoy ? mesUrl : hoy;
  const esMesActual = mes >= hoy;

  const { data, isLoading, error, mutate } = useSWR<VistaGeneral>(
    authChecked ? `/api/dashboard/vista-general?mes=${mes}` : null,
    fetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: true },
  );

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader module="Vista General" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Encabezado + navegación de mes */}
        <div className="mb-8">
          {/* Sin título grande: "Vista General" ya lo dicen la barra sticky
              (celular) y el breadcrumb (escritorio). Queda sr-only para no
              dejar la página sin encabezado. El `mt-3` de la fila de mes se fue
              con él: sin título arriba, era un hueco suelto bajo el `py-8`. */}
          <h1 className="sr-only">Vista General</h1>
          <div className="flex items-center gap-1 -ml-3">
            <button
              type="button"
              onClick={() => setMesUrl(sumarMeses(mes, -1))}
              aria-label="Mes anterior"
              className="w-11 h-11 inline-flex items-center justify-center rounded-full text-stone-500 hover:text-teal-700 hover:bg-stone-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-base font-medium text-stone-900 tabular-nums min-w-[130px] text-center">{mesLabel(mes)}</span>
            <button
              type="button"
              onClick={() => { if (!esMesActual) setMesUrl(sumarMeses(mes, 1)); }}
              disabled={esMesActual}
              aria-label="Mes siguiente"
              className={`w-11 h-11 inline-flex items-center justify-center rounded-full transition ${esMesActual ? "text-stone-300 cursor-not-allowed" : "text-stone-500 hover:text-teal-700 hover:bg-stone-100"}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {isLoading && !data ? (
          <PageSkeleton />
        ) : error ? (
          <div className="rounded-[14px] border border-stone-200 bg-white p-6 text-center">
            <p className="text-sm text-stone-700">No se pudo cargar la vista general. Intenta de nuevo en unos segundos.</p>
            <button
              type="button"
              onClick={() => mutate()}
              className="mt-4 rounded-md bg-stone-900 text-white text-sm font-medium px-4 py-2 active:scale-[0.97] transition"
            >
              Reintentar
            </button>
          </div>
        ) : data ? (
          <>
            <KpiGrid data={data} mes={mes} />
            {/* Los dos paneles que reemplazan a una tarjeta con un total: el
                inventario abierto por empresa (con lo que NO se midió dicho en
                palabras) y el gasto de cada empresa contra lo suyo. */}
            <div className="grid grid-cols-1 gap-3 mb-8 lg:grid-cols-2">
              <InventarioPorEmpresa inv={data.inventario} />
              <GastosPorEmpresa gastos={data.gastos} mes={mes} />
            </div>
            <RentabilidadPorEmpresa rows={data.semaforo} mes={mes} />
            <Atencion data={data} />
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function KpiGrid({ data, mes }: { data: VistaGeneral; mes: string }) {
  const { ventas, margen, disponibilidad, inventario, cxc, cxp } = data;
  const mesPrevAnio = mesLabelMin(sumarMeses(mes, -12));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
      {/* Ventas */}
      <KpiCard
        href="/ventas"
        label="Ventas"
        hoverLabel="Ir a Ventas"
        value={ventas ? moneyK(ventas.total) : "—"}
        tags={ventas?.parcial ? ["mes en curso"] : []}
        sub={
          !ventas ? (
            <span className="text-stone-400">Sin datos de ventas</span>
          ) : ventas.yoyPct == null ? (
            <span className="text-stone-400">sin dato del año pasado</span>
          ) : (
            <span className={ventas.parcial ? "text-stone-400" : ventas.yoyPct >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
              {/* Mes en curso: el año pasado va recortado a los MISMOS DÍAS
                  ("vs 1–3 sep 2025"), no el mes entero (3-sep-2026). */}
              {ventas.yoyPct >= 0 ? "▲" : "▼"} {pct(Math.abs(ventas.yoyPct))} vs {ventas.parcial && ventas.prevHasta ? `1–${fechaCorta(ventas.prevHasta)} ${ventas.prevHasta.slice(0, 4)}` : mesPrevAnio}{ventas.parcial && !ventas.prevHasta ? " (parcial)" : ""}
            </span>
          )
        }
      />

      {/* Margen bruto */}
      <KpiCard
        href="/ventas"
        label="Margen bruto"
        hoverLabel="Ir a Ventas"
        value={margen ? pct(margen.pct) : "—"}
        sub={margen ? <span className="text-stone-400">{moneyK(margen.utilidad)} utilidad bruta</span> : <span className="text-stone-400">Sin datos</span>}
      />

      {/* 🔴 ACÁ ESTABA LA TARJETA "Gastos" CON UN TOTAL DEL GRUPO. SE FUE
          (13-ago-2026). Daniel, textual: "La tarjeta de Gastos de Vista General
          también por empresa". Era la suma de las empresas que tuvieran el mes
          utilizable: tres un mes, cinco al siguiente, y siempre leída como "el
          gasto del grupo". El reemplazo es el panel "Gastos por empresa" de más
          abajo, donde cada empresa muestra SU gasto y la que no lo tiene DICE
          por qué. Igual que con la Rentabilidad, el total tampoco quedó en el
          payload: mientras el número exista, la pantalla puede volver a
          pintarlo sin que nadie lo note. */}

      {/* 🔴 ACÁ ESTABA LA TARJETA "Rentabilidad" DEL GRUPO. SE FUE (13-ago-2026).
          Daniel, textual: "no quiero Rentabilidad del grupo, lo quiero por
          empresa". Era `utilidad − gasto` sumando las empresas que tuvieran el
          mes cerrado: un solo número que no era de nadie.

          El reemplazo NO es otra tarjeta: es la lista "Rentabilidad por empresa"
          de más abajo, donde cada empresa compara SU venta contra SU gasto y la
          que no tiene gasto cargado lo DICE en vez de mostrar un número lindo.
          Por eso tampoco queda como fila del grupo: no hay ninguna forma de
          escribir ese número que no sea la que él pidió no tener. */}

      {/* Disponibilidad — sale de los saldos de banco, que ahora tienen módulo
          propio. El NÚMERO no cambia: lo sigue calculando la misma ruta sobre
          la misma tabla (bancos_saldos); solo cambia a dónde lleva el toque. */}
      <KpiCard
        href="/saldos-banco"
        label="Disponibilidad"
        hoverLabel="Ir a Saldos de Banco"
        value={disponibilidad ? moneyK(disponibilidad.total) : "—"}
        sub={disponibilidad
          ? <span className="text-stone-400">al {fechaCorta(disponibilidad.fechaMasVieja)}</span>
          : <span className="text-stone-400">Sin saldos cargados</span>}
      />

      {/* Inventario — al lado de la Disponibilidad a propósito: son las dos
          formas en que la plata está parada (en el banco y en la bodega).
          🔴 EL NÚMERO ES EL COSTO, y la etiqueta viaja pegada: los $4,06M a
          precio de etiqueta son potencial y viven en el panel de abajo. */}
      <KpiCard
        href="/referencia"
        label="Inventario"
        hoverLabel="Ir a Referencia"
        value={InventarioKpiValue({ inv: inventario })}
        tags={inventario?.disponible ? ["al costo"] : []}
        sub={
          !inventario ? (
            <span className="text-stone-400">No se pudo medir</span>
          ) : !inventario.disponible ? (
            <span className="text-stone-400">Todavía no está conectado</span>
          ) : (
            <span className={inventario.viejo ? "text-amber-600 font-medium" : "text-stone-400"}>
              {piezas(inventario.totalUnidades)} piezas · {textoFrescura(inventario.medidoEn, inventario.viejo)}
            </span>
          )
        }
      />

      {/* CXC */}
      <KpiCard
        href="/cxc"
        label="Por cobrar (CXC)"
        hoverLabel="Ir a CXC"
        value={moneyK(cxc.total)}
        sub={
          <span className={cxc.vencido > 0 ? "text-red-600 font-medium" : "text-stone-400"}>
            {moneyK(cxc.vencido)} con más de 90 días
          </span>
        }
      />

      {/* CXP */}
      <KpiCard
        href="/proveedores"
        label="Por pagar (CXP)"
        hoverLabel="Ir a Proveedores"
        value={moneyK(cxp.total)}
        sub={
          <span className={cxp.vencido > 0 ? "text-amber-600 font-medium" : "text-stone-400"}>
            {moneyK(cxp.vencido)} vencido +90d
          </span>
        }
      />
    </div>
  );
}

function KpiCard({ href, label, hoverLabel, value, valueClass, tags = [], sub }: {
  href: string;
  label: string;
  hoverLabel: string;
  value: string;
  valueClass?: string;
  tags?: string[];
  sub: React.ReactNode;
}) {
  return (
    <Link href={href} className="group rounded-[14px] border border-stone-200 bg-white p-4 hover:border-teal-600/40 transition">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-stone-500">{label}</span>
        {tags.map((t) => (
          <span key={t} className="text-[12px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full">{t}</span>
        ))}
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${valueClass ?? "text-stone-900"}`}>{value}</div>
      {/* El subtítulo ENVUELVE, no se corta. En iPhone la tarjeta mide 175px y
          "▼ 20.3% vs julio 2025 (parcial)" necesita 148: con `truncate` se
          perdía justo el "(parcial)", que es el aviso de que la comparación
          está incompleta. `min-h` reserva las 2 líneas siempre, así todas las
          tarjetas quedan de la misma altura (y el label de hover, que es de 1
          sola línea, no la hace saltar). */}
      <div className="text-xs mt-1 tabular-nums min-h-[2rem] sm:min-h-0">
        <span className="group-hover:hidden">{sub}</span>
        <span className="hidden group-hover:inline text-teal-600 font-medium">{hoverLabel} →</span>
      </div>
    </Link>
  );
}

// ── Requiere tu atención ─────────────────────────────────────────────────────

// Filas de "Requiere tu atención": eran links de 33px de alto (iPhone 390x844).
// min-h-[44px] las lleva a la regla de la casa sin cambiar el ritmo visual de la
// card (py-1.5 seguía dando 33px con una sola línea de texto).
const FILA_ALERTA =
  "flex min-h-[44px] items-center justify-between gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-stone-50 transition";
// Decisión de Daniel: letra más chica antes que cortar el nombre (ni dos líneas
// ni acortar). text-sm (14px) cortaba hasta 46px; text-xs (13px en este repo) es
// lo JUSTO — por debajo de 12px no se baja, es el piso de legibilidad.
const NOMBRE_ALERTA = "text-xs text-stone-700";

function Atencion({ data }: { data: VistaGeneral }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-stone-900 mb-3">Requiere tu atención</h2>
      {/* 🩸 A 1024 px las 3 columnas apretaban la tarjeta a 159 px y el nombre
          del cliente perdía 125 px con puntos suspensivos — 18 de las 21 filas.
          Es el ancho PEOR de todos, y no por casualidad: `lg` entra justo a
          1024, que es donde el útil recién se recupera de la barra lateral (742
          px para tres columnas). Medido por ancho: 390 → 12 px · 834 → 0 ·
          **1024 → 125** · 1280 → 50 · 1440 → 50.

          Con un paso intermedio de 2 columnas, 1024 baja de 125 a ~9 px. NO se
          tocó la tipografía: el #301 ya decidió esto con Daniel —letra más
          chica antes que cortar el nombre, ni dos líneas ni abreviar, piso de
          12 px— y esa decisión sigue en pie. Acá cambia el ANCHO de la tarjeta,
          no la letra. De `xl` para arriba quedan las 3 columnas de siempre: el
          escritorio no cambia. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* CXC +90d */}
        <AlertCard title="Clientes con saldo +90 días" href="/cxc" linkLabel="Ir a CXC" count={data.cxc.topClientes.length}>
          {data.cxc.topClientes.length === 0 ? (
            <Empty>Nada vencido a +90 días.</Empty>
          ) : (
            data.cxc.topClientes.map((c) => (
              <Link key={`${c.empresa}-${c.codigo}-${c.nombre}`} href="/cxc" className={FILA_ALERTA}>
                <span className={`${NOMBRE_ALERTA} truncate`}>{c.nombre}<span className="text-stone-400 text-[12px]"> · {c.empresa}</span></span>
                <span className="text-sm font-semibold text-red-600 tabular-nums shrink-0">{moneyK(c.saldo)}</span>
              </Link>
            ))
          )}
        </AlertCard>

        {/* Proveedores vencidos +90d */}
        <AlertCard title="Proveedores con saldo vencido +90d" href="/proveedores" linkLabel="Ir a Proveedores" count={data.cxp.topProveedores.length}>
          {data.cxp.topProveedores.length === 0 ? (
            <Empty>Nada vencido a +90 días.</Empty>
          ) : (
            data.cxp.topProveedores.map((p) => (
              <Link key={`${p.empresa}-${p.nombre}`} href="/proveedores" className={FILA_ALERTA}>
                <span className={`${NOMBRE_ALERTA} truncate`}>{p.nombre}<span className="text-stone-400 text-[12px]"> · {p.empresa}</span></span>
                <span className="text-sm font-semibold text-red-600 tabular-nums shrink-0">{moneyK(p.saldo)}</span>
              </Link>
            ))
          )}
        </AlertCard>

        {/* Reclamos antiguos sin pagar */}
        <AlertCard title="Reclamos sin pagar (+30 días)" href="/reclamos" linkLabel="Ir a Reclamos" count={data.reclamos.antiguos.length}>
          {data.reclamos.antiguos.length === 0 ? (
            <Empty>Sin reclamos antiguos pendientes.</Empty>
          ) : (
            data.reclamos.antiguos.map((r) => (
              <Link key={r.id} href={`/reclamos?id=${r.id}`} className={FILA_ALERTA}>
                <span className={`${NOMBRE_ALERTA} truncate`}>{r.nro}<span className="text-stone-400 text-[12px]"> · {r.empresa}</span></span>
                <span className="text-sm font-semibold text-amber-600 tabular-nums shrink-0">{r.dias}d</span>
              </Link>
            ))
          )}
        </AlertCard>
      </div>
    </div>
  );
}

function AlertCard({ title, href, linkLabel, count, children }: { title: string; href: string; linkLabel: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-stone-200 bg-white p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-stone-700">{title}</h3>
        {count > 0 && <span className="text-[12px] font-bold text-white bg-stone-900 rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">{count}</span>}
      </div>
      <div className="flex-1">{children}</div>
      {/* "Ir a CXC →" medía 18px de alto. self-start + min-h-[44px] lo lleva a
          44 sin estirarlo a todo el ancho de la card. */}
      <Link href={href} className="text-xs text-teal-600 hover:text-teal-700 font-medium mt-1 inline-flex min-h-[44px] min-w-[44px] items-center self-start">{linkLabel} →</Link>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-stone-400 py-2">{children}</p>;
}

// ── Skeleton de carga ────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-[14px] border border-stone-200 bg-white p-4">
            <div className="h-3 w-20 bg-stone-200 rounded" />
            <div className="h-7 w-24 bg-stone-200 rounded mt-2" />
            <div className="h-3 w-28 bg-stone-100 rounded mt-2" />
          </div>
        ))}
      </div>
      {/* Equilibrio */}
      <div className="rounded-[14px] border border-stone-200 bg-white p-5 mb-8">
        <div className="h-3.5 w-36 bg-stone-200 rounded" />
        <div className="h-3.5 w-72 max-w-full bg-stone-100 rounded mt-3" />
        <div className="h-3 w-full bg-stone-100 rounded-full mt-3" />
      </div>
      {/* Semáforo */}
      <div className="rounded-[14px] border border-stone-200 bg-white p-4 mb-8 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-stone-200 shrink-0" />
            <div className="h-3.5 w-36 bg-stone-200 rounded" />
            <div className="h-3.5 w-16 bg-stone-100 rounded ml-auto" />
            <div className="h-5 w-20 bg-stone-100 rounded-full" />
          </div>
        ))}
      </div>
      {/* Atención */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[14px] border border-stone-200 bg-white p-4">
            <div className="h-3 w-40 bg-stone-200 rounded" />
            <div className="h-3.5 w-full bg-stone-100 rounded mt-3" />
            <div className="h-3.5 w-3/4 bg-stone-100 rounded mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

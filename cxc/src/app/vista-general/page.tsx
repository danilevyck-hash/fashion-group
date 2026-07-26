"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";

// ── Tipos del API ─────────────────────────────────────────────────────────────

interface EmpresaVentas { key: string; name: string; ventas: number; utilidad: number }

interface SemaforoRow {
  key: string;
  name: string;
  ventas: number;
  utilidad: number;
  gastosDirectos: number;
  prorrateo: number;
  rentabilidad: number | null;
  pct: number | null;
  estado: "verde" | "ambar" | "rojo" | "sin_gastos";
}

interface VistaGeneral {
  mes: string;
  ventas: null | { total: number; prevYear: number | null; yoyPct: number | null; parcial: boolean; empresasCount: number; byEmpresa: EmpresaVentas[] };
  margen: null | { pct: number | null; utilidad: number };
  gastos: { totalMes: number; gastosFijos: number; grupoTotal: number; empresasConGastos: string[] };
  rentabilidad: null | { mes: string; monto: number; pct: number | null; parcial: boolean; esMesSeleccionado: boolean };
  equilibrio: null | { necesitas: number; real: number; progresoPct: number; gastosFijos: number; margenPct: number };
  disponibilidad: null | { total: number; fechaMasVieja: string; cuentas: number };
  semaforo: SemaforoRow[];
  cxc: { total: number; corriente: number; vigilancia: number; vencido: number; empresasCount: number; topClientes: { nombre: string; codigo: string | null; empresa: string; saldo: number }[] };
  cxp: { total: number; corriente: number; vigilancia: number; vencido: number; empresasCount: number; topProveedores: { nombre: string; empresa: string; saldo: number }[] };
  reclamos: { antiguos: { id: string; nro: string; empresa: string; estado: string; dias: number }[]; total: number };
}

// ── Helpers de meses (copiados de gastos-empresa, locales a esta página) ─────

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

/** "2026-07" → "Julio" */
function mesNombre(ym: string): string {
  if (!mesValido(ym)) return ym;
  const m = Number(ym.split("-")[1]);
  return MESES_ES[m - 1];
}

/** "2026-07-15" → "15 jul" */
function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1] ?? ""}`;
}

// ── Helpers de formato ───────────────────────────────────────────────────────

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function moneyK(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(0)}k`;
  return `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

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
          <h1 className="font-serif text-2xl sm:text-3xl tracking-tight text-stone-900">
            Vista General
          </h1>
          <div className="flex items-center gap-1 mt-3 -ml-3">
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
            <Equilibrio eq={data.equilibrio} />
            <Semaforo rows={data.semaforo} mes={mes} />
            <Atencion data={data} />
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function KpiGrid({ data, mes }: { data: VistaGeneral; mes: string }) {
  const { ventas, margen, rentabilidad, disponibilidad, cxc, cxp } = data;
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
              {ventas.yoyPct >= 0 ? "▲" : "▼"} {pct(Math.abs(ventas.yoyPct))} vs {mesPrevAnio}{ventas.parcial ? " (parcial)" : ""}
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

      {/* Rentabilidad */}
      <KpiCard
        href="/gastos-empresa"
        label="Rentabilidad"
        hoverLabel="Ir a Gastos"
        value={rentabilidad ? moneyK(rentabilidad.monto) : "—"}
        valueClass={rentabilidad ? (rentabilidad.monto >= 0 ? "text-green-600" : "text-red-600") : undefined}
        tags={rentabilidad ? [
          ...(!rentabilidad.esMesSeleccionado ? [`de ${mesNombre(rentabilidad.mes)}`] : []),
          ...(rentabilidad.parcial ? ["parcial"] : []),
        ] : []}
        sub={rentabilidad
          ? <span className="text-stone-400">{pct(rentabilidad.pct)} sobre ventas</span>
          : <span className="text-stone-400">Sin gastos completos (8/8)</span>}
      />

      {/* Disponibilidad */}
      <KpiCard
        href="/gastos-empresa"
        label="Disponibilidad"
        hoverLabel="Ir a Gastos"
        value={disponibilidad ? moneyK(disponibilidad.total) : "—"}
        sub={disponibilidad
          ? <span className="text-stone-400">al {fechaCorta(disponibilidad.fechaMasVieja)}</span>
          : <span className="text-stone-400">Sin saldos cargados</span>}
      />

      {/* CXC */}
      <KpiCard
        href="/admin"
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
          <span key={t} className="text-[10px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full">{t}</span>
        ))}
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${valueClass ?? "text-stone-900"}`}>{value}</div>
      <div className="text-xs mt-1 tabular-nums truncate">
        <span className="group-hover:hidden">{sub}</span>
        <span className="hidden group-hover:inline text-teal-600 font-medium">{hoverLabel} →</span>
      </div>
    </Link>
  );
}

// ── Punto de equilibrio ──────────────────────────────────────────────────────

function Equilibrio({ eq }: { eq: VistaGeneral["equilibrio"] }) {
  return (
    <div className="rounded-[14px] border border-stone-200 bg-white p-5 mb-8">
      <h2 className="text-sm font-semibold text-stone-900 mb-2">Punto de equilibrio</h2>
      {eq ? (
        <>
          <p className="text-sm text-stone-700 tabular-nums">
            Necesitas <span className="font-semibold">{money(eq.necesitas)}</span>/mes para no perder — vas en <span className="font-semibold">{money(eq.real)}</span>.
            {eq.real >= eq.necesitas && <span className="text-green-600 font-medium"> ✓ Cubierto</span>}
          </p>
          <div className="relative h-3 rounded-full bg-stone-100 mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${eq.real >= eq.necesitas ? "bg-green-500" : "bg-teal-600"}`}
              style={{ width: `${Math.min(eq.progresoPct, 1) * 100}%` }}
            />
            {/* Marca del 100% */}
            <div className="absolute top-0 right-0 h-full w-0.5 bg-stone-400" />
          </div>
          <p className="text-xs text-stone-400 mt-2 tabular-nums">
            Gastos fijos {money(eq.gastosFijos)} ÷ margen {pct(eq.margenPct)}
          </p>
        </>
      ) : (
        <p className="text-sm text-stone-500">
          Para calcularlo carga los gastos del mes en{" "}
          <Link href="/gastos-empresa" className="text-teal-600 hover:text-teal-700 font-medium">Gastos de Empresa</Link>.
        </p>
      )}
    </div>
  );
}

// ── Semáforo por empresa ─────────────────────────────────────────────────────

const SEMAFORO_DOT: Record<SemaforoRow["estado"], string> = {
  verde: "bg-green-500",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
  sin_gastos: "bg-stone-300",
};

const SEMAFORO_PILL: Record<SemaforoRow["estado"], { label: string; cls: string }> = {
  verde: { label: "Sana", cls: "bg-green-50 text-green-700" },
  ambar: { label: "Al límite", cls: "bg-amber-50 text-amber-700" },
  rojo: { label: "Pierde plata", cls: "bg-red-50 text-red-700" },
  sin_gastos: { label: "Sin gastos cargados", cls: "bg-stone-100 text-stone-500" },
};

function Semaforo({ rows, mes }: { rows: SemaforoRow[]; mes: string }) {
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-stone-900 mb-3">Semáforo por empresa</h2>
      <div className="rounded-[14px] border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-stone-400 border-b border-stone-100">
              <th className="text-left font-medium px-4 py-2.5">Empresa</th>
              <th className="text-right font-medium px-4 py-2.5">Ventas</th>
              <th className="text-right font-medium px-4 py-2.5">Rentabilidad</th>
              <th className="text-right font-medium px-4 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-stone-400">Sin datos este mes.</td></tr>
            ) : rows.map((e) => {
              const pill = SEMAFORO_PILL[e.estado];
              const abiertaEsta = abierta === e.key;
              return (
                <SemaforoFila
                  key={e.key}
                  e={e}
                  pill={pill}
                  abierta={abiertaEsta}
                  onToggle={() => setAbierta(abiertaEsta ? null : e.key)}
                  mes={mes}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SemaforoFila({ e, pill, abierta, onToggle, mes }: {
  e: SemaforoRow;
  pill: { label: string; cls: string };
  abierta: boolean;
  onToggle: () => void;
  mes: string;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-stone-50 last:border-0 hover:bg-stone-50 cursor-pointer transition"
      >
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${SEMAFORO_DOT[e.estado]}`} />
            <span className="font-medium text-stone-800">{e.name}</span>
            <svg className={`w-3.5 h-3.5 text-stone-300 transition-transform ${abierta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-stone-700">{moneyK(e.ventas)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {e.rentabilidad == null ? (
            <span className="text-stone-400">—</span>
          ) : (
            <>
              <span className={`font-semibold ${e.rentabilidad >= 0 ? "text-stone-900" : "text-red-600"}`}>{moneyK(e.rentabilidad)}</span>
              <span className="text-xs text-stone-400 ml-1.5">{pct(e.pct)}</span>
            </>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap ${pill.cls}`}>{pill.label}</span>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-stone-50 last:border-0 bg-stone-50/60">
          <td colSpan={4} className="px-4 py-3">
            {e.rentabilidad == null ? (
              <p className="text-sm text-stone-500">Aún no hay gastos cargados para esta empresa este mes.</p>
            ) : (
              <p className="text-sm text-stone-700 tabular-nums">
                Utilidad bruta <span className="font-medium">{money(e.utilidad)}</span>
                {" − "}Gastos directos <span className="font-medium">{money(e.gastosDirectos)}</span>
                {" − "}Parte de gastos de Grupo <span className="font-medium">{money(e.prorrateo)}</span>
                {" = "}Rentabilidad <span className={`font-semibold ${e.rentabilidad >= 0 ? "text-green-600" : "text-red-600"}`}>{money(e.rentabilidad)}</span>
              </p>
            )}
            <Link
              href={`/gastos-empresa?mes=${mes}&empresa=${e.key}`}
              onClick={(ev) => ev.stopPropagation()}
              className="inline-block text-xs text-teal-600 hover:text-teal-700 font-medium mt-1.5"
            >
              Ver gastos de {e.name} →
            </Link>
          </td>
        </tr>
      )}
    </>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* CXC +90d */}
        <AlertCard title="Clientes con saldo +90 días" href="/admin" linkLabel="Ir a CXC" count={data.cxc.topClientes.length}>
          {data.cxc.topClientes.length === 0 ? (
            <Empty>Nada vencido a +90 días.</Empty>
          ) : (
            data.cxc.topClientes.map((c) => (
              <Link key={`${c.empresa}-${c.codigo}-${c.nombre}`} href="/admin" className={FILA_ALERTA}>
                <span className={`${NOMBRE_ALERTA} truncate`}>{c.nombre}<span className="text-stone-400 text-[11px]"> · {c.empresa}</span></span>
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
                <span className={`${NOMBRE_ALERTA} truncate`}>{p.nombre}<span className="text-stone-400 text-[11px]"> · {p.empresa}</span></span>
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
                <span className={`${NOMBRE_ALERTA} truncate`}>{r.nro}<span className="text-stone-400 text-[11px]"> · {r.empresa}</span></span>
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
        {count > 0 && <span className="text-[11px] font-bold text-white bg-stone-900 rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">{count}</span>}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

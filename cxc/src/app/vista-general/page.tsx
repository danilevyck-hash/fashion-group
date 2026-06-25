"use client";

import { Suspense } from "react";
import Link from "next/link";
import useSWR from "swr";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";

// ── Tipos del API ─────────────────────────────────────────────────────────────
interface VistaGeneral {
  generadoEn: string;
  ms: number;
  ventas: null | { mes: number; mesAnterior: number; deltaPct: number | null; mesNum: number; parcial: boolean; empresasCount: number; byEmpresa: { name: string; ventas: number }[] };
  margen: null | { pct: number | null; utilidad: number; empresasCount: number };
  cxc: { total: number; corriente: number; vigilancia: number; vencido: number; empresasCount: number; topClientes: { nombre: string; codigo: string | null; empresa: string; saldo: number }[] };
  cxp: { total: number; corriente: number; vigilancia: number; vencido: number; empresasCount: number };
  cheques: { proximos7d: { id: string; cliente: string; empresa: string; monto: number; fecha: string }[]; total: number; count: number };
  reclamos: { antiguos: { id: string; nro: string; empresa: string; estado: string; dias: number }[]; total: number };
}

const TOTAL_EMPRESAS = 8;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function moneyK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${money(n)}`;
}
function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function cobertura(count: number): string | null {
  return count >= TOTAL_EMPRESAS ? null : `${count} de ${TOTAL_EMPRESAS} empresas`;
}
const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error("err"); return r.json(); });

export default function VistaGeneralPage() {
  return (
    <Suspense>
      <VistaGeneralInner />
    </Suspense>
  );
}

function VistaGeneralInner() {
  const { authChecked } = useAuth({ moduleKey: "vista-general", allowedRoles: ["admin"] });
  const { data, isLoading, error } = useSWR<VistaGeneral>(
    authChecked ? "/api/dashboard/vista-general" : null,
    fetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: true },
  );

  if (!authChecked) return null;

  const hoy = new Date().toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const mesNombre = data?.ventas ? MESES[data.ventas.mesNum - 1] : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Vista General" />
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Encabezado */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Fashion Group · Vista General</h1>
          <p className="text-sm text-gray-400 capitalize">{hoy}</p>
        </div>

        {isLoading && !data ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">No se pudo cargar la vista general. Recarga en unos segundos.</div>
        ) : data ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <Kpi
                href="/ventas"
                label={`Ventas de ${mesNombre}`}
                value={data.ventas ? moneyK(data.ventas.mes) : "—"}
                delta={data.ventas?.deltaPct ?? null}
                deltaLabel="vs mes anterior"
                deltaMuted={data.ventas?.parcial}
                tag={data.ventas?.parcial ? "mes en curso" : undefined}
                cobertura={data.ventas ? cobertura(data.ventas.empresasCount) : null}
                accent="indigo"
              />
              <Kpi
                href="/admin"
                label="Por cobrar (CXC)"
                value={moneyK(data.cxc.total)}
                sub={`${moneyK(data.cxc.vencido)} vencido +120d`}
                subTone={data.cxc.vencido > 0 ? "danger" : "muted"}
                cobertura={cobertura(data.cxc.empresasCount)}
                accent="blue"
              />
              <Kpi
                href="/proveedores"
                label="Por pagar (CXP)"
                value={moneyK(data.cxp.total)}
                sub={`${moneyK(data.cxp.vencido)} vencido +120d`}
                subTone={data.cxp.vencido > 0 ? "danger" : "muted"}
                cobertura={cobertura(data.cxp.empresasCount)}
                accent="rose"
              />
              <Kpi
                href="/ventas"
                label={`Margen de ${mesNombre}`}
                value={data.margen ? pct(data.margen.pct) : "—"}
                sub={data.margen ? `${moneyK(data.margen.utilidad)} utilidad` : undefined}
                subTone="muted"
                cobertura={data.margen ? cobertura(data.margen.empresasCount) : null}
                accent="emerald"
              />
            </div>

            {/* Ventas del mes por empresa */}
            <Section title={`Ventas de ${mesNombre} por empresa`} href="/ventas" linkLabel="Ver Ventas">
              {data.ventas && data.ventas.byEmpresa.length > 0 ? (
                <div className="space-y-2.5">
                  {(() => {
                    const max = Math.max(...data.ventas.byEmpresa.map((e) => e.ventas), 1);
                    return data.ventas.byEmpresa.map((e) => (
                      <div key={e.name} className="flex items-center gap-3">
                        <div className="w-32 sm:w-40 shrink-0 text-sm text-gray-700 truncate">{e.name}</div>
                        <div className="flex-1 h-7 bg-gray-100 rounded-md overflow-hidden">
                          <div className="h-full bg-indigo-500/85 rounded-md transition-all" style={{ width: `${Math.max((e.ventas / max) * 100, 3)}%` }} />
                        </div>
                        <div className="w-20 shrink-0 text-right text-sm font-semibold text-gray-900 tabular-nums">{moneyK(e.ventas)}</div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <Empty>Sin ventas registradas este mes.</Empty>
              )}
            </Section>

            {/* Cartera por antigüedad — CXC y CXP con los MISMOS tramos */}
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Cartera por antigüedad</h2>
              <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left font-medium px-4 py-2.5"></th>
                      <th className="text-right font-medium px-4 py-2.5">Corriente <span className="text-gray-300">(0-90)</span></th>
                      <th className="text-right font-medium px-4 py-2.5">91-120 días</th>
                      <th className="text-right font-medium px-4 py-2.5">Vencido <span className="text-gray-300">(+120d)</span></th>
                      <th className="text-right font-medium px-4 py-2.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TramoRow label="Por cobrar (CXC)" href="/admin" t={data.cxc} />
                    <TramoRow label="Por pagar (CXP)" href="/proveedores" t={data.cxp} />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Requiere tu atención */}
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Requiere tu atención</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* CXC +90d */}
                <AlertCard title="Clientes con saldo +120 días" href="/admin" linkLabel="Ir a CXC" count={data.cxc.topClientes.length}>
                  {data.cxc.topClientes.length === 0 ? (
                    <Empty>Nada vencido a +120 días.</Empty>
                  ) : (
                    data.cxc.topClientes.map((c) => (
                      <Link key={`${c.empresa}-${c.codigo}-${c.nombre}`} href="/admin" className="flex items-center justify-between gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 transition">
                        <span className="text-sm text-gray-700 truncate">{c.nombre}<span className="text-gray-400 text-xs"> · {c.empresa}</span></span>
                        <span className="text-sm font-semibold text-rose-600 tabular-nums shrink-0">{moneyK(c.saldo)}</span>
                      </Link>
                    ))
                  )}
                </AlertCard>

                {/* Cheques por vencer */}
                <AlertCard title="Cheques por vencer (7 días)" href="/cheques" linkLabel="Ir a Cheques" count={data.cheques.count}>
                  {data.cheques.proximos7d.length === 0 ? (
                    <Empty>Ningún cheque vence esta semana.</Empty>
                  ) : (
                    data.cheques.proximos7d.map((c) => (
                      <Link key={c.id} href="/cheques" className="flex items-center justify-between gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 transition">
                        <span className="text-sm text-gray-700 truncate">{c.cliente}<span className="text-gray-400 text-xs"> · {fmtDay(c.fecha)}</span></span>
                        <span className="text-sm font-semibold text-amber-600 tabular-nums shrink-0">{moneyK(c.monto)}</span>
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
                      <Link key={r.id} href={`/reclamos?id=${r.id}`} className="flex items-center justify-between gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 transition">
                        <span className="text-sm text-gray-700 truncate">{r.nro}<span className="text-gray-400 text-xs"> · {r.empresa}</span></span>
                        <span className="text-sm font-semibold text-orange-600 tabular-nums shrink-0">{r.dias}d</span>
                      </Link>
                    ))
                  )}
                </AlertCard>
              </div>
            </div>

            <p className="text-[11px] text-gray-300 mt-8 text-right">Generado en {data.ms} ms</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "short" }).replace(".", "");
}

// ── Componentes UI ────────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  indigo: "text-indigo-600", blue: "text-blue-600", rose: "text-rose-600", emerald: "text-emerald-600",
};

function Kpi({ href, label, value, delta, deltaLabel, deltaMuted, tag, sub, subTone, cobertura, accent }: {
  href: string; label: string; value: string;
  delta?: number | null; deltaLabel?: string; deltaMuted?: boolean; tag?: string;
  sub?: string; subTone?: "danger" | "muted"; cobertura: string | null; accent: string;
}) {
  return (
    <Link href={href} className="group rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className={`text-2xl font-bold tabular-nums ${ACCENTS[accent] ?? "text-gray-900"}`}>{value}</div>
        {tag && <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{tag}</span>}
      </div>
      {delta != null && (
        <div className={`text-xs font-medium mt-0.5 ${deltaMuted ? "text-gray-400" : delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {delta >= 0 ? "▲" : "▼"} {pct(Math.abs(delta))} <span className="text-gray-400 font-normal">{deltaLabel}{deltaMuted ? " (parcial)" : ""}</span>
        </div>
      )}
      {sub && <div className={`text-xs mt-0.5 ${subTone === "danger" ? "text-rose-600 font-medium" : "text-gray-400"}`}>{sub}</div>}
      {cobertura && <div className="text-[11px] text-gray-400 mt-1.5 inline-flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-gray-300" />{cobertura}</div>}
    </Link>
  );
}

function TramoRow({ label, href, t }: { label: string; href: string; t: { corriente: number; vigilancia: number; vencido: number; total: number } }) {
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition">
      <td className="px-4 py-2.5">
        <Link href={href} className="text-sm font-medium text-gray-700 hover:text-gray-900 transition">{label}</Link>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{moneyK(t.corriente)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{moneyK(t.vigilancia)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-rose-600">{moneyK(t.vencido)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{moneyK(t.total)}</td>
    </tr>
  );
}

function Section({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <Link href={href} className="text-xs text-gray-400 hover:text-gray-900 transition">{linkLabel} →</Link>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">{children}</div>
    </div>
  );
}

function AlertCard({ title, href, linkLabel, count, children }: { title: string; href: string; linkLabel: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
        {count > 0 && <span className="text-[11px] font-bold text-white bg-gray-900 rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">{count}</span>}
      </div>
      <div className="flex-1">{children}</div>
      <Link href={href} className="text-xs text-gray-400 hover:text-gray-900 transition mt-3">{linkLabel} →</Link>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 py-2">{children}</p>;
}

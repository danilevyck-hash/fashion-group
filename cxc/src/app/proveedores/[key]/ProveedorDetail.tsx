"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { EmptyState } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { telHref, mailtoHref } from "@/lib/contact-links";
import { getCompanyDisplay } from "@/lib/companies";

interface EmpresaTotals {
  empresa: string;
  comprado_ytd: number;
  pagado_ytd: number;
  por_pagar: number;
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null;
  ultimo_pago_dias: number | null;
}
interface Reclamo {
  id: string;
  nro_reclamo: string | null;
  empresa: string | null;
  marca: string | null;
  nro_factura: string | null;
  fecha_reclamo: string | null;
  estado: string | null;
}
interface Ficha {
  key: string;
  nombre: string;
  identificacion: string | null;
  dv: string | null;
  direccion: string | null;
  contacto: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  tipo_proveedor: string | null;
  empresas: EmpresaTotals[];
  total_grupo: { comprado_ytd: number; pagado_ytd: number; por_pagar: number; aging: { title: string; saldo: number }[] };
  synced_at: string | null;
  reclamos: Reclamo[];
}

export default function ProveedorDetail({ fichaKey }: { fichaKey: string }) {
  const { authChecked } = useAuth({ moduleKey: "proveedores", allowedRoles: ["admin", "contabilidad"] });
  const [data, setData] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/proveedores/${encodeURIComponent(fichaKey)}`, { cache: "no-store" });
        if (res.status === 404) { setNotFound(true); return; }
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [fichaKey]);

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Proveedores" breadcrumbs={[{ label: "Proveedores" }, { label: data?.nombre ?? "…" }]} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-2">
          <Link href="/proveedores" className="text-xs text-gray-500 hover:text-black transition">← Proveedores</Link>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 bg-gray-100 rounded" />
            <div className="h-28 bg-gray-100 rounded-lg" />
            <div className="h-40 bg-gray-100 rounded-lg" />
          </div>
        ) : notFound || !data ? (
          <EmptyState title="Proveedor no encontrado" subtitle="Puede que aún no esté sincronizado." />
        ) : (
          <>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight">{data.nombre}</h1>
              {data.tipo_proveedor && <div className="text-sm text-gray-500 mt-0.5">{data.tipo_proveedor}</div>}
            </div>

            {/* Total grupo: Por pagar + aging */}
            <section className="border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Por pagar · grupo</div>
                  <div className={`text-2xl font-semibold tabular-nums mt-1 ${data.total_grupo.por_pagar < 0 ? "text-blue-600" : "text-purple-700"}`}>
                    {data.total_grupo.por_pagar < 0
                      ? `Saldo a favor $${fmt(Math.abs(data.total_grupo.por_pagar))}`
                      : `$${fmt(data.total_grupo.por_pagar)}`}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500 tabular-nums">
                  <div>Comprado YTD ${fmt(data.total_grupo.comprado_ytd)}</div>
                  <div>Pagado YTD ${fmt(data.total_grupo.pagado_ytd)}</div>
                </div>
              </div>

              {/* Aging bucketizado (viene de Switch). Buckets vacíos en gris. */}
              <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2">Antigüedad del saldo</div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {data.total_grupo.aging.map((b, i) => {
                  const v = b.saldo;
                  const tone =
                    v === 0 ? "text-gray-300" : i >= 4 ? "text-red-700" : i >= 2 ? "text-amber-700" : "text-gray-800";
                  return (
                    <div key={b.title} className="text-center">
                      <div className="text-[10px] text-gray-400">{b.title}</div>
                      <div className={`text-xs tabular-nums mt-0.5 ${tone}`}>
                        {v < 0 ? `-$${fmt(Math.abs(v))}` : v === 0 ? "—" : `$${fmt(v)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Datos fiscales */}
            <section className="border border-gray-200 rounded-lg p-4 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Datos · sincronizados de Switch</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
                <Field label="RUC" value={data.identificacion} />
                <Field label="DV" value={data.dv} tabularNums />
                <Field label="Contacto" value={data.contacto} />
                <Field label="Teléfono" value={data.telefono} href={telHref(data.telefono)} />
                <Field label="Celular" value={data.celular} href={telHref(data.celular)} />
                <Field label="Email" value={data.email} href={mailtoHref(data.email)} />
                <Field label="Dirección" value={data.direccion} fullWidth />
              </div>
              {data.synced_at && (
                <div className="text-[11px] text-gray-400 mt-3">
                  Última sincronización: {fmtDate(data.synced_at.slice(0, 10))}
                </div>
              )}
            </section>

            {/* Historial por empresa */}
            <section className="border border-gray-200 rounded-lg p-4 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Por empresa · YTD {new Date().getFullYear()}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                    <th className="py-2 font-normal">Empresa</th>
                    <th className="py-2 font-normal text-right">Comprado YTD</th>
                    <th className="py-2 font-normal text-right">Pagado YTD</th>
                    <th className="py-2 font-normal text-right">Por pagar</th>
                    <th className="py-2 font-normal text-right">Último pago</th>
                  </tr>
                </thead>
                <tbody>
                  {data.empresas.map((e) => (
                    <tr key={e.empresa} className="border-b border-gray-100">
                      <td className="py-2 text-gray-700">{getCompanyDisplay(e.empresa)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">${fmt(e.comprado_ytd)}</td>
                      <td className={`py-2 text-right tabular-nums ${e.pagado_ytd > 0 ? "text-emerald-700" : "text-gray-400"}`}>${fmt(e.pagado_ytd)}</td>
                      <PorPagarCell value={e.por_pagar} />
                      <td className="py-2 text-right tabular-nums text-gray-600">
                        {e.ultimo_pago_monto != null
                          ? <span title={e.ultimo_pago_fecha ? fmtDate(e.ultimo_pago_fecha) : ""}>${fmt(e.ultimo_pago_monto)} · {e.ultimo_pago_dias}d</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="py-2.5">Total grupo</td>
                    <td className="py-2.5 text-right tabular-nums">${fmt(data.total_grupo.comprado_ytd)}</td>
                    <td className="py-2.5 text-right tabular-nums">${fmt(data.total_grupo.pagado_ytd)}</td>
                    <PorPagarCell value={data.total_grupo.por_pagar} className="py-2.5" />
                    <td className="py-2.5" />
                  </tr>
                </tbody>
              </table>
            </section>

            {/* Reclamos vinculados */}
            {data.reclamos.length > 0 && (
              <section className="border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Reclamos vinculados</h2>
                  <Link href="/reclamos" className="text-xs text-blue-600 hover:underline">Ver en Reclamos →</Link>
                </div>
                <ul className="divide-y divide-gray-100">
                  {data.reclamos.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{r.nro_reclamo || "Reclamo"}</span>
                        <span className="text-gray-500">
                          {r.empresa ? ` · ${getCompanyDisplay(r.empresa)}` : ""}{r.marca ? ` · ${r.marca}` : ""}
                          {r.nro_factura ? ` · Fac ${r.nro_factura}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.estado && <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600">{r.estado}</span>}
                        {r.fecha_reclamo && <span className="text-[11px] tabular-nums text-gray-400">{fmtDate(r.fecha_reclamo.slice(0, 10))}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Por pagar: positivo púrpura; cero gris; negativo = "Saldo a favor" azul (crédito).
function PorPagarCell({ value, className = "py-2" }: { value: number; className?: string }) {
  if (value < 0) {
    return <td className={`${className} text-right tabular-nums text-blue-600`}>Saldo a favor ${fmt(Math.abs(value))}</td>;
  }
  return (
    <td className={`${className} text-right tabular-nums ${value > 0 ? "text-purple-700" : "text-gray-400"}`}>
      ${fmt(value)}
    </td>
  );
}

function Field({ label, value, tabularNums, fullWidth, href }: { label: string; value: string | null | undefined; tabularNums?: boolean; fullWidth?: boolean; href?: string | null }) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400">{label}</div>
      <div className={`text-sm mt-0.5 ${tabularNums ? "tabular-nums" : ""} ${value ? "text-gray-900" : "text-gray-400"}`}>
        {value && href ? <a href={href} className="text-blue-600 hover:underline">{value}</a> : (value || "—")}
      </div>
    </div>
  );
}

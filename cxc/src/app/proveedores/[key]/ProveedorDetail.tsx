"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { EmptyState } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { telHref, mailtoHref } from "@/lib/contact-links";
import { getCompanyDisplay } from "@/lib/companies";
import { tonoDeMonto, textoDeMonto } from "@/lib/proveedores/tono";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { ROLES_SYNC_PROVEEDORES } from "@/components/shared/syncNowOpciones";
import { empresasConCxp } from "@/lib/switch-api/empresas";
import { EMPRESA_KEY_TO_NAME, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { TRAMOS, repartirEnTramos } from "@/lib/proveedores/tramos";
import { PROVEEDORES_APPLE_2026_10, lineaUltimoPago } from "@/lib/proveedores/apple-2026-10";

// Universo válido del módulo proveedores (7 empresas con CxP).
const EMPRESAS_CXP = empresasConCxp() as readonly string[];

interface EmpresaTotals {
  empresa: string;
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
  /** Las otras maneras en que Switch escribe a este proveedor. */
  grafias: string[];
  identificacion: string | null;
  dv: string | null;
  direccion: string | null;
  contacto: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  tipo_proveedor: string | null;
  empresas: EmpresaTotals[];
  total_grupo: { por_pagar: number; aging: { title: string; saldo: number }[] };
  synced_at: string | null;
  reclamos: Reclamo[];
}

export default function ProveedorDetail({ fichaKey, apple = PROVEEDORES_APPLE_2026_10 }: { fichaKey: string; apple?: boolean }) {
  const { authChecked } = useAuth({ moduleKey: "proveedores", allowedRoles: ["admin", "contabilidad"] });
  const [data, setData] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proveedores/${encodeURIComponent(fichaKey)}`, { cache: "no-store" });
      if (res.status === 404) { setNotFound(true); return; }
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [fichaKey]);

  useEffect(() => { void load(); }, [load]);

  if (!authChecked) return null;

  // "Actualizar ahora" de la ficha: SOLO las empresas donde este proveedor
  // tiene cuenta (normalmente 1-2), en secuencia si son varias.
  const sincronizables = (data?.empresas ?? [])
    .map((e) => e.empresa)
    .filter((k) => EMPRESAS_CXP.includes(k));
  const syncOpciones = sincronizables.map((k) => ({
    modulo: "proveedores",
    empresa: k,
    label: EMPRESA_KEY_TO_NAME[k] ?? getCompanyDisplay(k),
  }));

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Proveedores" breadcrumbs={[{ label: data?.nombre ?? "…" }]} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Apple: «← Proveedores» va en la misma línea del nombre (diseno.md). */}
        {!apple && (
        <div className="mb-2">
          <Link href="/proveedores" className="text-xs text-gray-500 hover:text-black transition">← Proveedores</Link>
        </div>
        )}

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 bg-gray-100 rounded" />
            <div className="h-28 bg-gray-100 rounded-lg" />
            <div className="h-40 bg-gray-100 rounded-lg" />
          </div>
        ) : notFound || !data ? (
          <EmptyState title="Proveedor no encontrado" subtitle="Puede que aún no se haya recibido de Switch." />
        ) : apple ? (
          <FichaApple data={data} syncOpciones={syncOpciones} onRecargar={load} />
        ) : (
          <>
            {/* Header */}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{data.nombre}</h1>
                {data.tipo_proveedor && <div className="text-sm text-gray-500 mt-0.5">{data.tipo_proveedor}</div>}
                {/* 🔴 Las otras grafías. No es adorno: es lo que explica por qué
                    esta ficha suma empresas que en Switch se llaman distinto —
                    Confecciones Boston llega escrito de cuatro maneras. */}
                {(data.grafias ?? []).length > 0 && (
                  <div className="text-sm text-gray-500 mt-1">
                    En Switch también aparece como {(data.grafias ?? []).join(" · ")}
                  </div>
                )}
              </div>
              {/* Actualiza el CxP de las empresas de ESTE proveedor (en
                  secuencia si son varias) y recarga la ficha. */}
              {syncOpciones.length > 0 && (
                <LineaDeFrescura
                  actualizado={data.synced_at}
                  opciones={syncOpciones}
                  secuencial
                  roles={ROLES_SYNC_PROVEEDORES}
                  onSuccess={load}
                />
              )}
            </div>

            {/* Total grupo: Por pagar + aging */}
            <section className="border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Saldo por pagar (total)</div>
                  <div className={`text-2xl font-semibold tabular-nums mt-1 ${data.total_grupo.por_pagar < 0 ? "text-blue-600" : "text-gray-900"}`}>
                    {data.total_grupo.por_pagar < 0
                      ? `Saldo a favor $${fmt(Math.abs(data.total_grupo.por_pagar))}`
                      : `$${fmt(data.total_grupo.por_pagar)}`}
                  </div>
                </div>
              </div>

              {/* Aging bucketizado (viene de Switch). Buckets vacíos en gris. */}
              <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-2">Antigüedad del saldo</div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {data.total_grupo.aging.map((b) => {
                  const v = b.saldo;
                  // 🔴 UN SOLO TONO, nunca rojo ni ámbar: acá el dato es la EDAD
                  // del documento, no días de mora. Ver `lib/proveedores/tono.ts`.
                  const tone = tonoDeMonto(v);
                  return (
                    <div key={b.title} className="text-center">
                      <div className="text-xs text-gray-400">{b.title}</div>
                      <div className={`text-xs tabular-nums mt-0.5 ${tone} ${b.title === "Mas de 365" && v !== 0 ? "font-medium" : ""}`}>
                        {textoDeMonto(v, fmt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Datos fiscales — solo campos con dato real; si todos vacíos, no se muestra el bloque. */}
            {(() => {
              const campos: { label: string; value: string | null; tabularNums?: boolean; fullWidth?: boolean; href?: string | null }[] = [
                { label: "RUC", value: data.identificacion },
                { label: "DV", value: data.dv, tabularNums: true },
                { label: "Contacto", value: data.contacto },
                { label: "Teléfono", value: data.telefono, href: telHref(data.telefono) },
                { label: "Celular", value: data.celular, href: telHref(data.celular) },
                { label: "Correo", value: data.email, href: mailtoHref(data.email) },
                { label: "Dirección", value: data.direccion, fullWidth: true },
              ].filter((c) => c.value != null && String(c.value).trim() !== "");
              if (campos.length === 0) return null;
              return (
                <section className="border border-gray-200 rounded-lg p-4 mb-4">
                  {/* La fecha del dato la dice la línea de frescura junto al
                      nombre (4-oct-2026). */}
                  <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-3">Datos</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
                    {campos.map((c) => (
                      <Field key={c.label} label={c.label} value={c.value} tabularNums={c.tabularNums} fullWidth={c.fullWidth} href={c.href} />
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Historial por empresa */}
            <section className="border border-gray-200 rounded-lg p-4 mb-4">
              {/* `sr-only`: la primera columna de la tabla de abajo se llama
                  "Empresa". El encabezado sigue existiendo para un lector. */}
              <h2 className="sr-only">Por empresa</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                    <th className="py-2 font-normal">Empresa</th>
                    <th className="py-2 font-normal text-right">Por pagar</th>
                    <th className="py-2 font-normal text-right">Último pago</th>
                  </tr>
                </thead>
                <tbody>
                  {data.empresas.map((e) => (
                    <tr key={e.empresa} className="border-b border-gray-100">
                      <td className="py-2 text-gray-700">{nombreCortoEmpresa(e.empresa)}</td>
                      <PorPagarCell value={e.por_pagar} />
                      <td className="py-2 text-right tabular-nums text-gray-600">
                        {e.ultimo_pago_monto != null
                          ? <span title={e.ultimo_pago_fecha ? fmtDate(e.ultimo_pago_fecha) : ""}>${fmt(e.ultimo_pago_monto)} · {e.ultimo_pago_dias}d</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="py-2.5">Total</td>
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
                  <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400">Reclamos vinculados</h2>
                  <Link href="/reclamos" className="text-xs text-blue-600 hover:underline">Ver en Reclamos →</Link>
                </div>
                <ul className="divide-y divide-gray-100">
                  {data.reclamos.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{r.nro_reclamo || "Reclamo"}</span>
                        <span className="text-gray-500">
                          {r.empresa ? ` · ${getCompanyDisplay(r.empresa)}` : ""}{r.marca ? ` · ${r.marca}` : ""}
                          {r.nro_factura ? ` · Factura ${r.nro_factura}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.estado && <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{r.estado}</span>}
                        {r.fecha_reclamo && <span className="text-xs tabular-nums text-gray-400">{fmtDate(r.fecha_reclamo.slice(0, 10))}</span>}
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

/**
 * 🔴 LA FICHA «COMO LO HARÍA APPLE» (6-oct-2026, `PROVEEDORES_APPLE_2026_10`).
 * La MISMA ficha y los MISMOS datos, en el orden de la pregunta «¿cuánto le
 * debemos y desde cuándo?»: el saldo grande con su línea gris; la antigüedad en
 * los cuatro tramos de la lista (`repartirEnTramos`, la misma suma); las
 * empresas en filas de dos renglones; luego los datos y los reclamos.
 */
function FichaApple({
  data,
  syncOpciones,
  onRecargar,
}: {
  data: Ficha;
  syncOpciones: { modulo: string; empresa: string; label: string }[];
  onRecargar: () => Promise<void>;
}) {
  const total = data.total_grupo.por_pagar;
  const tramos = repartirEnTramos(data.total_grupo.aging);
  const conSaldo = data.empresas.filter((e) => e.por_pagar !== 0).length;
  const campos = [
    { label: "RUC", value: data.identificacion },
    { label: "DV", value: data.dv },
    { label: "Contacto", value: data.contacto },
    { label: "Teléfono", value: data.telefono, href: telHref(data.telefono) },
    { label: "Celular", value: data.celular, href: telHref(data.celular) },
    { label: "Correo", value: data.email, href: mailtoHref(data.email) },
    { label: "Dirección", value: data.direccion },
  ].filter((c) => c.value != null && String(c.value).trim() !== "");

  return (
    <div data-ficha-apple>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <Link href="/proveedores" className="inline-flex min-h-[44px] items-center text-sm text-blue-600 hover:text-blue-800">‹ Proveedores</Link>
            <h1 className="text-2xl font-semibold tracking-tight">{data.nombre}</h1>
          </div>
          {(data.tipo_proveedor || (data.grafias ?? []).length > 0) && (
            <p className="mt-0.5 text-sm text-gray-500">
              {[data.tipo_proveedor, (data.grafias ?? []).length > 0 ? `En Switch también: ${(data.grafias ?? []).join(" · ")}` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {syncOpciones.length > 0 && (
          <LineaDeFrescura actualizado={data.synced_at} opciones={syncOpciones} secuencial roles={ROLES_SYNC_PROVEEDORES} onSuccess={onRecargar} />
        )}
      </div>

      <div data-numero-apple className="mb-6">
        <p className={`text-[34px] font-normal leading-none tracking-tight tabular-nums ${total < 0 ? "text-blue-600" : "text-gray-800"}`}>
          {total < 0 ? `Saldo a favor $${fmt(Math.abs(total))}` : `$${fmt(total)}`}
        </p>
        <p className="pt-2 text-sm text-gray-500">
          Por pagar · {conSaldo} {conSaldo === 1 ? "empresa" : "empresas"}
        </p>
        {/* Los cuatro tramos de la lista, en una fila. Nunca rojo: es edad. */}
        <div data-tramos-ficha className="mt-4 grid max-w-lg grid-cols-4 gap-3">
          {TRAMOS.map((t) => (
            <div key={t.key}>
              <div className="text-xs text-gray-400">{t.label}</div>
              <div className={`mt-0.5 text-sm tabular-nums ${tonoDeMonto(tramos[t.key])} ${t.key === "tMas365" && tramos[t.key] !== 0 ? "font-medium" : ""}`}>
                {textoDeMonto(tramos[t.key], fmt)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="sr-only">Por empresa</h2>
      <ul data-por-empresa-apple className="mb-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {data.empresas.map((e) => {
          const pago = lineaUltimoPago(e.ultimo_pago_monto, e.ultimo_pago_dias, fmt);
          return (
            <li key={e.empresa} className="flex min-h-[56px] items-center gap-4 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">{nombreCortoEmpresa(e.empresa)}</span>
                <span className="mt-0.5 block truncate text-sm text-gray-500 tabular-nums" title={e.ultimo_pago_fecha ? fmtDate(e.ultimo_pago_fecha) : undefined}>
                  {pago ?? "Sin pagos registrados"}
                </span>
              </span>
              <span className={`shrink-0 text-sm tabular-nums ${e.por_pagar < 0 ? "text-blue-600" : e.por_pagar > 0 ? "text-gray-900" : "text-gray-400"}`}>
                {e.por_pagar < 0 ? `Saldo a favor $${fmt(Math.abs(e.por_pagar))}` : `$${fmt(e.por_pagar)}`}
              </span>
            </li>
          );
        })}
      </ul>

      {campos.length > 0 && (
        <>
          <h2 className="sr-only">Datos</h2>
          <dl className="mb-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {campos.map((c) => (
              <div key={c.label} className="flex min-h-[44px] items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="shrink-0 text-gray-500">{c.label}</dt>
                <dd className="min-w-0 text-right text-gray-900 tabular-nums">
                  {c.href ? <a href={c.href} className="text-blue-600 hover:underline">{c.value}</a> : c.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {data.reclamos.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-gray-400">Reclamos vinculados</h2>
            <Link href="/reclamos" className="text-sm text-blue-600 hover:text-blue-800">Ver en Reclamos</Link>
          </div>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {data.reclamos.map((r) => (
              <li key={r.id} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900">{r.nro_reclamo || "Reclamo"}</span>
                  <span className="mt-0.5 block truncate text-gray-500">
                    {[r.empresa ? getCompanyDisplay(r.empresa) : null, r.marca, r.nro_factura ? `Factura ${r.nro_factura}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.estado && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r.estado}</span>}
                  {r.fecha_reclamo && <span className="text-xs tabular-nums text-gray-400">{fmtDate(r.fecha_reclamo.slice(0, 10))}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Por pagar: positivo púrpura; cero gris; negativo = "Saldo a favor" azul (crédito).
function PorPagarCell({ value, className = "py-2" }: { value: number; className?: string }) {
  if (value < 0) {
    return <td className={`${className} text-right tabular-nums text-blue-600`}>Saldo a favor ${fmt(Math.abs(value))}</td>;
  }
  return (
    <td className={`${className} text-right tabular-nums ${value > 0 ? "text-gray-900" : "text-gray-400"}`}>
      ${fmt(value)}
    </td>
  );
}

function Field({ label, value, tabularNums, fullWidth, href }: { label: string; value: string | null | undefined; tabularNums?: boolean; fullWidth?: boolean; href?: string | null }) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <div className="text-xs uppercase tracking-[0.05em] text-gray-400">{label}</div>
      <div className={`text-sm mt-0.5 ${tabularNums ? "tabular-nums" : ""} ${value ? "text-gray-900" : "text-gray-400"}`}>
        {value && href ? <a href={href} className="text-blue-600 hover:underline">{value}</a> : (value || "—")}
      </div>
    </div>
  );
}

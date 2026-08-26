"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { telHref, mailtoHref } from "@/lib/contact-links";
import { ALL_COMPANIES } from "@/lib/companies";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  opcionesFichaCliente,
  ROLES_SYNC_FICHA_CLIENTE,
} from "@/components/shared/syncNowOpciones";
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";

interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  razon_social: string | null;
  identificacion: string | null;
  dv: string | null;
  provincia: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  notas: string | null;
  last_synced_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

interface EmpresaTotals {
  empresa: string;
  ventas_ytd: number;
  cobrado_ytd: number;
  cxc: number;
  ultima_factura: string | null;
}

export interface ClienteDetailData {
  cliente: Cliente;
  empresas: EmpresaTotals[];
  total_grupo: {
    ventas_ytd: number;
    cobrado_ytd: number;
    cxc: number;
    cxc_vencido?: number; // CXC con +90d (vencido reciente + crítico)
    cxc_critico?: number; // CXC con +120d
    ultima_factura: string | null;
  };
  ultimas_guias?: { id: string; numero: number; fecha: string }[];
}

const EDITABLE_ROLES = ["admin", "secretaria"];

export default function ClienteDetail({ initialData }: { initialData: ClienteDetailData }) {
  const { authChecked, role } = useAuth({
    moduleKey: "directorio",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
  });
  const canEdit = EDITABLE_ROLES.includes(role);
  const router = useRouter();

  const [cliente, setCliente] = useState<Cliente>(initialData.cliente);
  const [editing, setEditing] = useState(false);

  // La página es server-rendered: tras "Actualizar ahora" se hace
  // router.refresh() y llega un initialData fresco — re-sembrar el estado
  // local del cliente (datos fiscales / last_synced_at), salvo en plena
  // edición de contacto (no pisar lo que se está tipeando).
  useEffect(() => {
    if (!editing) setCliente(initialData.cliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.cliente]);

  const [form, setForm] = useState({
    telefono: cliente.telefono ?? "",
    celular:  cliente.celular  ?? "",
    email:    cliente.email    ?? "",
    notas:    cliente.notas    ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInactivas, setShowInactivas] = useState(false);

  if (!authChecked) return null;

  const empresaName = (key: string) => ALL_COMPANIES.find(c => c.key === key)?.name || key;

  // (1) Filas de empresa sin actividad ($0 en todo) se colapsan; el Total grupo
  // siempre se muestra completo.
  const hasActividad = (e: EmpresaTotals) => e.ventas_ytd !== 0 || e.cobrado_ytd !== 0 || e.cxc !== 0;
  const empresasActivas = initialData.empresas.filter(hasActividad);
  const empresasInactivas = initialData.empresas.filter((e) => !hasActividad(e));

  // "Actualizar ahora" de la ficha: estadocuenta → recibos → facturas de las
  // empresas donde el cliente tiene actividad + clientes-master al final.
  const opcionesSync = opcionesFichaCliente(empresasActivas.map((e) => e.empresa));

  // (2) Dedup de teléfono: si TELÉFONO === CELULAR, mostrar uno solo (lectura).
  const telTrim = (cliente.telefono ?? "").trim();
  const celTrim = (cliente.celular ?? "").trim();
  const telDuplicado = telTrim !== "" && telTrim === celTrim;

  // (3) Pill de antigüedad del grupo (cuando hay vencido +90d).
  const cxcVencido = initialData.total_grupo.cxc_vencido ?? 0;
  const cxcCritico = initialData.total_grupo.cxc_critico ?? 0;
  const verEnCxcHref = `/admin?search=${encodeURIComponent(cliente.nombre)}`;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.codigo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || `HTTP ${res.status}`);
      } else {
        setCliente(json.cliente);
        setEditing(false);
        // El selector de clientes (Guías, Cheques, Marketing) guarda el
        // directorio en memoria para buscar sin ir a la red. La app navega sin
        // recargar, así que ese caché sobreviviría a esta edición y seguiría
        // mostrando el nombre viejo. Se invalida acá.
        invalidarDirectorioClientes();
        setToast("Datos actualizados");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setForm({
      telefono: cliente.telefono ?? "",
      celular:  cliente.celular  ?? "",
      email:    cliente.email    ?? "",
      notas:    cliente.notas    ?? "",
    });
    setEditing(false);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Clientes" breadcrumbs={[{ label: cliente.codigo }]} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-2">
          <Link href="/clientes" className="inline-flex min-h-[44px] items-center text-xs text-gray-500 hover:text-black transition">← Clientes</Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <div className="text-xs text-gray-400 tabular-nums">{cliente.codigo}</div>
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.nombre}</h1>
            {cliente.razon_social && cliente.razon_social !== cliente.nombre && (
              <div className="text-sm text-gray-500 mt-0.5">{cliente.razon_social}</div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* "Actualizar ahora" (admin/secretaria/vendedor; bodega ve la
                ficha pero NO el botón): secuencia de la empresa del cliente
                con enganche al sync en curso; al terminar, router.refresh()
                re-renderiza la página server-side con los datos frescos. */}
            <SyncNowButton
              opciones={opcionesSync}
              secuencial
              engancharRunning
              roles={ROLES_SYNC_FICHA_CLIENTE}
              resumenExito="Listo, cliente actualizado"
              onSuccess={() => router.refresh()}
            />
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex min-h-[44px] items-center justify-center bg-black text-white text-sm rounded-md px-4 py-2 active:scale-[0.97] transition"
              >
                Editar contacto
              </button>
            )}
          </div>
        </div>

        {/* Datos fiscales (read-only) */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          {/* "· sincronizados de Switch" se fue: cuatro renglones más abajo
              está "Última sincronización: {fecha}", que dice lo mismo y además
              cuándo. La misma poda ya se hizo en Proveedores. */}
          <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-3">Datos fiscales</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <Field label="RUC"          value={cliente.identificacion} />
            <Field label="DV"           value={cliente.dv}              tabularNums />
            <Field label="Razón social" value={cliente.razon_social}   />
            <Field label="Provincia"    value={cliente.provincia}      />
          </div>
          {cliente.last_synced_at && (
            <div className="text-xs text-gray-400 mt-3">
              {/* last_synced_at es timestamptz; fmtDate espera fecha (YYYY-MM-DD). */}
              Última sincronización: {fmtDate(cliente.last_synced_at.slice(0, 10))}
            </div>
          )}
        </section>

        {/* Contacto (editable) */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-3">Contacto</h2>
          {editing ? (
            <div className="space-y-3">
              <FormRow label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
              <FormRow label="Celular"  value={form.celular}  onChange={(v) => setForm({ ...form, celular: v })} />
              <FormRow label="Email"    value={form.email}    onChange={(v) => setForm({ ...form, email: v })} type="email" />
              <FormRow label="Notas"    value={form.notas}    onChange={(v) => setForm({ ...form, notas: v })} multiline />
              {error && <div className="text-red-600 text-xs">{error}</div>}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex min-h-[44px] items-center justify-center bg-black text-white text-sm rounded-md px-4 py-2 active:scale-[0.97] transition disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={cancel}
                  disabled={saving}
                  className="border border-gray-200 text-sm rounded-md px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <Field label="Teléfono" value={cliente.telefono} href={telHref(cliente.telefono)} />
              {/* Si celular == teléfono, no repetir la misma línea. */}
              {!telDuplicado && (
                <Field label="Celular" value={cliente.celular} href={telHref(cliente.celular)} />
              )}
              <Field label="Email"    value={cliente.email}    href={mailtoHref(cliente.email)} />
              <Field label="Notas"    value={cliente.notas} fullWidth />
            </div>
          )}
        </section>

        {/* Historial por empresa */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-1">
              <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400">
                {/* "YTD" era jerga en inglés en la ficha que abre todos los
                    días gente que no es contadora. El año a secas dice lo
                    mismo, y las columnas de abajo ya lo repiten. */}
                Historial {new Date().getFullYear()}
              </h2>
              {/* 🩸 POR QUÉ "VENTAS" Y "CXC" NO CUADRAN ENTRE SÍ — la pregunta
                  que se hace cualquiera al ver las dos cifras juntas. Daniel lo
                  dijo así: *"cxc si se muestra con itbms, porq es lo que tengo q
                  cobrar"*. NO SE BORRA NUNCA: sin esta explicación, la tabla se
                  lee como un error de la app. Lo que cambió es dónde vive —a un
                  toque, arriba de la tabla que explica, en vez de cuatro
                  renglones al pie de una ficha que se abre todos los días. */}
              <Ayuda titulo="Por qué las cifras no cuadran entre sí">
                <span className="font-medium text-gray-900">Ventas</span> va sin ITBMS — el impuesto se
                cobra para el fisco, no es venta de la empresa.{" "}
                <span className="font-medium text-gray-900">Cobrado</span> y{" "}
                <span className="font-medium text-gray-900">Por cobrar hoy</span> van con ITBMS, porque
                es la plata que entra y la que falta cobrar.
              </Ayuda>
            </div>
            <div className="flex items-center gap-2">
              {cxcVencido > 0 && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                    cxcCritico > 0
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                  title="Saldo vencido (más de 90 días)"
                >
                  {cxcCritico > 0 ? "Vencido crítico" : "Vencido reciente"} ${fmt(cxcVencido)}
                </span>
              )}
              <Link
                href={verEnCxcHref}
                className="relative text-xs text-blue-600 hover:underline whitespace-nowrap after:absolute after:-inset-y-[13px] after:inset-x-0 after:content-['']"
              >
                Ver en Cuentas por Cobrar →
              </Link>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                <th className="py-2 font-normal">Empresa</th>
                {/* Ventas SIN ITBMS, cobros y saldo CON ITBMS. No es un
                    descuido: son dos preguntas distintas y cada una se responde
                    con la cifra que le toca. Ver la nota al pie de la tabla. */}
                {/* Sin "YTD" y sin la sigla: el año va con todas sus cifras y
                    "CXC" se escribe como se llama la pantalla en todo el resto
                    del sistema ("Cuentas por Cobrar"). Acá va en dos líneas
                    porque es un encabezado de columna angosta. */}
                <th className="py-2 font-normal text-right">Ventas {new Date().getFullYear()}</th>
                <th className="py-2 font-normal text-right">Cobrado {new Date().getFullYear()}</th>
                <th className="py-2 font-normal text-right">Por cobrar hoy</th>
                <th className="py-2 font-normal text-right">Última factura</th>
              </tr>
            </thead>
            <tbody>
              {empresasActivas.map(e => (
                <tr key={e.empresa} className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">{empresaName(e.empresa)}</td>
                  <td className="py-2 text-right tabular-nums">${fmt(e.ventas_ytd)}</td>
                  <td className={`py-2 text-right tabular-nums ${e.cobrado_ytd > 0 ? "text-emerald-700" : "text-gray-400"}`}>${fmt(e.cobrado_ytd)}</td>
                  <CxcCell value={e.cxc} />
                  <td className={`py-2 text-right tabular-nums ${e.ultima_factura ? "text-gray-600" : "text-gray-300"}`}>
                    {e.ultima_factura ? fmtDate(e.ultima_factura.slice(0, 10)) : "—"}
                  </td>
                </tr>
              ))}

              {/* (1) Empresas sin actividad: colapsadas tras una línea con el conteo. */}
              {empresasInactivas.length > 0 && (
                <tr className="border-b border-gray-100">
                  <td colSpan={5} className="py-1">
                    <button
                      onClick={() => setShowInactivas(v => !v)}
                      className="inline-flex min-h-[44px] items-center text-xs text-gray-400 hover:text-gray-600 transition"
                    >
                      {showInactivas ? "▾" : "▸"} {empresasInactivas.length}{" "}
                      {empresasInactivas.length === 1 ? "empresa sin actividad" : "empresas sin actividad"}
                    </button>
                  </td>
                </tr>
              )}
              {showInactivas && empresasInactivas.map(e => (
                <tr key={e.empresa} className="border-b border-gray-100 text-gray-400">
                  <td className="py-2">{empresaName(e.empresa)}</td>
                  <td className="py-2 text-right tabular-nums">${fmt(e.ventas_ytd)}</td>
                  <td className="py-2 text-right tabular-nums">${fmt(e.cobrado_ytd)}</td>
                  <CxcCell value={e.cxc} />
                  <td className="py-2 text-right tabular-nums text-gray-300">—</td>
                </tr>
              ))}

              <tr className="font-medium">
                <td className="py-2.5">Total grupo</td>
                <td className="py-2.5 text-right tabular-nums">${fmt(initialData.total_grupo.ventas_ytd)}</td>
                <td className="py-2.5 text-right tabular-nums">${fmt(initialData.total_grupo.cobrado_ytd)}</td>
                <CxcCell value={initialData.total_grupo.cxc} className="py-2.5" />
                <td className={`py-2.5 text-right tabular-nums ${initialData.total_grupo.ultima_factura ? "text-gray-600" : "text-gray-300"}`}>
                  {initialData.total_grupo.ultima_factura ? fmtDate(initialData.total_grupo.ultima_factura.slice(0, 10)) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Últimas guías del cliente (vínculo por cliente_codigo). Tappable al detalle. */}
        {initialData.ultimas_guias && initialData.ultimas_guias.length > 0 && (
          <section className="border border-gray-200 rounded-lg p-4 mb-4">
            <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-2">Últimas guías</h2>
            <ul className="divide-y divide-gray-100">
              {initialData.ultimas_guias.map(g => (
                <li key={g.id}>
                  <Link
                    href={`/guias/${g.id}/imprimir`}
                    className="-mx-2 flex items-center justify-between rounded px-2 py-2 text-sm transition hover:bg-gray-50"
                  >
                    <span className="text-gray-700">Guía #{g.numero}</span>
                    <span className="tabular-nums text-gray-400">{fmtDate(g.fecha.slice(0, 10))} ›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Toast message={toast} type="success" onDismiss={() => setToast(null)} />
    </div>
  );
}

// Celda de CXC: positivo = ámbar; cero = gris; negativo = "Saldo a favor" en
// AZUL (no es deuda, es crédito del cliente).
function CxcCell({ value, className = "py-2" }: { value: number; className?: string }) {
  if (value < 0) {
    return (
      <td className={`${className} text-right tabular-nums text-blue-600`}>
        Saldo a favor ${fmt(Math.abs(value))}
      </td>
    );
  }
  return (
    <td className={`${className} text-right tabular-nums ${value > 0 ? "text-amber-700" : "text-gray-400"}`}>
      ${fmt(value)}
    </td>
  );
}

function Field({ label, value, tabularNums, fullWidth, href }: { label: string; value: string | null | undefined; tabularNums?: boolean; fullWidth?: boolean; href?: string | null }) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <div className="text-xs uppercase tracking-[0.05em] text-gray-400">{label}</div>
      <div className={`text-sm mt-0.5 ${tabularNums ? "tabular-nums" : ""} ${value ? "text-gray-900" : "text-gray-400"}`}>
        {value && href ? (
          <a href={href} className="relative text-blue-600 hover:underline after:absolute after:-inset-y-[14px] after:inset-x-0 after:content-['']">{value}</a>
        ) : (value || "—")}
      </div>
    </div>
  );
}

function FormRow({ label, value, onChange, type, multiline }: { label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-[0.05em] text-gray-400 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition"
        />
      ) : (
        <input
          type={type || "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition"
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { telHref, mailtoHref } from "@/lib/contact-links";
import { ALL_COMPANIES } from "@/lib/companies";

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
  total_grupo: { ventas_ytd: number; cobrado_ytd: number; cxc: number; ultima_factura: string | null };
}

const EDITABLE_ROLES = ["admin", "secretaria"];

export default function ClienteDetail({ initialData }: { initialData: ClienteDetailData }) {
  const { authChecked, role } = useAuth({
    moduleKey: "directorio",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
  });
  const canEdit = EDITABLE_ROLES.includes(role);

  const [cliente, setCliente] = useState<Cliente>(initialData.cliente);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    telefono: cliente.telefono ?? "",
    celular:  cliente.celular  ?? "",
    email:    cliente.email    ?? "",
    notas:    cliente.notas    ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!authChecked) return null;

  const empresaName = (key: string) => ALL_COMPANIES.find(c => c.key === key)?.name || key;

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
      <AppHeader module="Reportes" breadcrumbs={[{ label: "Clientes" }, { label: cliente.codigo }]} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-2">
          <Link href="/clientes" className="text-xs text-gray-500 hover:text-black transition">← Clientes</Link>
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
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="bg-black text-white text-sm rounded-md px-4 py-2 active:scale-[0.97] transition"
            >
              Editar contacto
            </button>
          )}
        </div>

        {/* Datos fiscales (read-only) */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Datos fiscales · sincronizados de Switch</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <Field label="RUC"          value={cliente.identificacion} />
            <Field label="DV"           value={cliente.dv}              tabularNums />
            <Field label="Razón social" value={cliente.razon_social}   />
            <Field label="Provincia"    value={cliente.provincia}      />
          </div>
          {cliente.last_synced_at && (
            <div className="text-[11px] text-gray-400 mt-3">
              {/* last_synced_at es timestamptz; fmtDate espera fecha (YYYY-MM-DD). */}
              Última sincronización: {fmtDate(cliente.last_synced_at.slice(0, 10))}
            </div>
          )}
        </section>

        {/* Contacto (editable) */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Contacto · editable en fashiongr</h2>
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
                  className="bg-black text-white text-sm rounded-md px-4 py-2 active:scale-[0.97] transition disabled:opacity-50"
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
              <Field label="Celular"  value={cliente.celular}  href={telHref(cliente.celular)} />
              <Field label="Email"    value={cliente.email}    href={mailtoHref(cliente.email)} />
              <Field label="Notas"    value={cliente.notas} fullWidth />
            </div>
          )}
        </section>

        {/* Historial por empresa */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">
            Historial · YTD {new Date().getFullYear()}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                <th className="py-2 font-normal">Empresa</th>
                <th className="py-2 font-normal text-right">Ventas YTD</th>
                <th className="py-2 font-normal text-right">Cobrado YTD</th>
                <th className="py-2 font-normal text-right">CXC actual</th>
                <th className="py-2 font-normal text-right">Última factura</th>
              </tr>
            </thead>
            <tbody>
              {initialData.empresas.map(e => (
                <tr key={e.empresa} className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">{empresaName(e.empresa)}</td>
                  <td className="py-2 text-right tabular-nums">${fmt(e.ventas_ytd)}</td>
                  <td className={`py-2 text-right tabular-nums ${e.cobrado_ytd > 0 ? "text-emerald-700" : "text-gray-400"}`}>${fmt(e.cobrado_ytd)}</td>
                  <td className={`py-2 text-right tabular-nums ${e.cxc > 0 ? "text-amber-700" : e.cxc < 0 ? "text-emerald-700" : "text-gray-400"}`}>
                    ${fmt(e.cxc)}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${e.ultima_factura ? "text-gray-600" : "text-gray-300"}`}>
                    {e.ultima_factura ? fmtDate(e.ultima_factura.slice(0, 10)) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2.5">Total grupo</td>
                <td className="py-2.5 text-right tabular-nums">${fmt(initialData.total_grupo.ventas_ytd)}</td>
                <td className="py-2.5 text-right tabular-nums">${fmt(initialData.total_grupo.cobrado_ytd)}</td>
                <td className={`py-2.5 text-right tabular-nums ${initialData.total_grupo.cxc > 0 ? "text-amber-700" : initialData.total_grupo.cxc < 0 ? "text-emerald-700" : "text-gray-400"}`}>
                  ${fmt(initialData.total_grupo.cxc)}
                </td>
                <td className={`py-2.5 text-right tabular-nums ${initialData.total_grupo.ultima_factura ? "text-gray-600" : "text-gray-300"}`}>
                  {initialData.total_grupo.ultima_factura ? fmtDate(initialData.total_grupo.ultima_factura.slice(0, 10)) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
      <Toast message={toast} type="success" onDismiss={() => setToast(null)} />
    </div>
  );
}

function Field({ label, value, tabularNums, fullWidth, href }: { label: string; value: string | null | undefined; tabularNums?: boolean; fullWidth?: boolean; href?: string | null }) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400">{label}</div>
      <div className={`text-sm mt-0.5 ${tabularNums ? "tabular-nums" : ""} ${value ? "text-gray-900" : "text-gray-400"}`}>
        {value && href ? (
          <a href={href} className="text-blue-600 hover:underline">{value}</a>
        ) : (value || "—")}
      </div>
    </div>
  );
}

function FormRow({ label, value, onChange, type, multiline }: { label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">{label}</label>
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

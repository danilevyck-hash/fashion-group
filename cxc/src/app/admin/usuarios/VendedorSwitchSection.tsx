"use client";

// Sección "Vendedor en Switch" del modal de edición de usuario (Sistema →
// Usuarios). Mapea al fg_user con su vendedorId de Switch POR EMPRESA de
// catálogo (Reebok=active_shoes, Joybees=joystep) — el checkout usa este mapeo
// para setear el vendedor del pedido automáticamente según el login.
// Autocontenida: carga vendedores en vivo + mapeos, y guarda al cambiar.

import { useEffect, useState } from "react";

const EMPRESAS = [
  { key: "active_shoes", label: "Reebok (Active Shoes)" },
  { key: "joystep", label: "Joybees (Joystep)" },
] as const;

interface Vendedor { id: number; nombre: string }
interface Mapping { user_id: string; empresa_key: string; vendedor_id: number; vendedor_nombre: string | null }

export default function VendedorSwitchSection({ userId, showToast }: { userId: string; showToast: (m: string) => void }) {
  const [vendedores, setVendedores] = useState<Record<string, Vendedor[] | null>>({});
  const [mapping, setMapping] = useState<Record<string, number | "">>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [ddlPendiente, setDdlPendiente] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Mapeos actuales del usuario.
    fetch("/api/admin/vendedor-mapping")
      .then(async (r) => {
        if (r.status === 503) { if (!cancelled) setDdlPendiente(true); return { mappings: [] }; }
        return r.ok ? r.json() : { mappings: [] };
      })
      .then((d: { mappings: Mapping[] }) => {
        if (cancelled) return;
        const m: Record<string, number | ""> = {};
        for (const row of d.mappings ?? []) {
          if (row.user_id === userId) m[row.empresa_key] = row.vendedor_id;
        }
        setMapping(m);
      })
      .catch(() => { /* la sección degrada a selects vacíos */ });
    // Vendedores en vivo por empresa (secuencial: sesión única por instancia).
    (async () => {
      for (const e of EMPRESAS) {
        try {
          const r = await fetch(`/api/admin/switch-vendedores?empresa=${e.key}`);
          const d = r.ok ? await r.json() : null;
          if (!cancelled) setVendedores((prev) => ({ ...prev, [e.key]: d?.vendedores ?? null }));
        } catch {
          if (!cancelled) setVendedores((prev) => ({ ...prev, [e.key]: null }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function save(empresaKey: string, value: string) {
    const vendedorId = value === "" ? null : Number(value);
    const lista = vendedores[empresaKey] ?? [];
    const nombre = lista.find((v) => v.id === vendedorId)?.nombre ?? null;
    setSaving(empresaKey);
    try {
      const res = await fetch("/api/admin/vendedor-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, empresa_key: empresaKey, vendedor_id: vendedorId, vendedor_nombre: nombre }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data?.error || "No se pudo guardar el vendedor"); return; }
      setMapping((prev) => ({ ...prev, [empresaKey]: vendedorId ?? "" }));
      showToast(vendedorId ? `Vendedor asignado: ${nombre}` : "Vendedor quitado");
    } catch {
      showToast("Error de conexión al guardar el vendedor");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        Vendedor en Switch <span className="normal-case font-normal text-gray-400">· para pedidos de catálogos</span>
      </div>
      {ddlPendiente ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Falta correr el DDL <code>20260705100000_fg_user_switch_vendedor.sql</code> en Supabase.
        </p>
      ) : (
        <div className="space-y-2">
          {EMPRESAS.map((e) => {
            const lista = vendedores[e.key];
            return (
              <label key={e.key} className="block">
                <span className="text-xs text-gray-500">{e.label}</span>
                <select
                  value={mapping[e.key] ?? ""}
                  onChange={(ev) => save(e.key, ev.target.value)}
                  disabled={saving === e.key || lista === undefined}
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 min-h-[44px] text-sm bg-white outline-none focus:border-black transition disabled:opacity-50"
                >
                  <option value="">
                    {lista === undefined ? "Cargando vendedores…" : lista === null ? "Switch no respondió — reintenta" : "Sin asignar"}
                  </option>
                  {(lista ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
              </label>
            );
          })}
          <p className="text-xs text-gray-400">
            El pedido del catálogo sale a Switch con este vendedor según quién esté logueado.
          </p>
        </div>
      )}
    </div>
  );
}

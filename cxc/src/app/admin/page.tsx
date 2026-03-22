"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { COMPANIES } from "@/lib/companies";
import type { CxcRow, CxcUpload, ConsolidatedClient } from "@/lib/types";
import { normalizeName } from "@/lib/normalize";

// ── Helpers ──────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function uploadAge(dateStr: string): "fresh" | "warning" | "stale" {
  const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (days > 15) return "stale";
  if (days > 7) return "warning";
  return "fresh";
}

const ageBg: Record<string, string> = {
  fresh: "",
  warning: "bg-yellow-50",
  stale: "bg-red-50",
};
const ageDot: Record<string, string> = {
  fresh: "bg-green-500",
  warning: "bg-yellow-500",
  stale: "bg-red-500",
};

function riskColor(current: number, watch: number, overdue: number) {
  if (overdue > 0) return "border-l-red-500";
  if (watch > 0) return "border-l-yellow-500";
  return "border-l-green-500";
}

// ── Main Component ───────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const [clients, setClients] = useState<ConsolidatedClient[]>([]);
  const [uploads, setUploads] = useState<Record<string, CxcUpload>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState({ correo: "", telefono: "", celular: "", contacto: "" });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role");
    if (role !== "admin") {
      router.push("/");
      return;
    }
    loadData();
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Load latest uploads per company
    const { data: uploadData } = await supabase
      .from("cxc_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false });

    const latestUploads: Record<string, CxcUpload> = {};
    if (uploadData) {
      for (const u of uploadData) {
        if (!latestUploads[u.company_key]) latestUploads[u.company_key] = u;
      }
    }
    setUploads(latestUploads);

    // Load all CXC rows
    const { data: rows } = await supabase.from("cxc_rows").select("*");

    // Load overrides
    const { data: overrides } = await supabase.from("cxc_client_overrides").select("*");
    const overrideMap: Record<string, { correo: string; telefono: string; celular: string; contacto: string }> = {};
    if (overrides) {
      for (const o of overrides) {
        overrideMap[o.nombre_normalized] = o;
      }
    }

    // Consolidate by normalized name
    const map = new Map<string, ConsolidatedClient>();
    if (rows) {
      for (const r of rows as CxcRow[]) {
        const key = r.nombre_normalized;
        if (!key) continue;

        let client = map.get(key);
        if (!client) {
          const ovr = overrideMap[key];
          client = {
            nombre_normalized: key,
            companies: {},
            correo: ovr?.correo || r.correo || "",
            telefono: ovr?.telefono || r.telefono || "",
            celular: ovr?.celular || r.celular || "",
            contacto: ovr?.contacto || r.contacto || "",
            total: 0,
            current: 0,
            watch: 0,
            overdue: 0,
            hasOverride: !!ovr,
          };
          map.set(key, client);
        }

        // Aggregate per company
        const existing = client.companies[r.company_key];
        if (existing) {
          existing.d0_30 += r.d0_30;
          existing.d31_60 += r.d31_60;
          existing.d61_90 += r.d61_90;
          existing.d91_120 += r.d91_120;
          existing.d121_180 += r.d121_180;
          existing.d181_270 += r.d181_270;
          existing.d271_365 += r.d271_365;
          existing.mas_365 += r.mas_365;
          existing.total += r.total;
        } else {
          client.companies[r.company_key] = {
            nombre: r.nombre,
            codigo: r.codigo,
            d0_30: r.d0_30,
            d31_60: r.d31_60,
            d61_90: r.d61_90,
            d91_120: r.d91_120,
            d121_180: r.d121_180,
            d181_270: r.d181_270,
            d271_365: r.d271_365,
            mas_365: r.mas_365,
            total: r.total,
          };
        }

        // Fill contact info from first non-empty
        if (!client.correo && r.correo) client.correo = r.correo;
        if (!client.telefono && r.telefono) client.telefono = r.telefono;
        if (!client.celular && r.celular) client.celular = r.celular;
        if (!client.contacto && r.contacto) client.contacto = r.contacto;
      }
    }

    // Compute totals
    for (const client of map.values()) {
      let total = 0, current = 0, watch = 0, overdue = 0;
      for (const co of Object.values(client.companies)) {
        total += co.total;
        current += co.d0_30 + co.d31_60 + co.d61_90;
        watch += co.d91_120;
        overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
      }
      client.total = total;
      client.current = current;
      client.watch = watch;
      client.overdue = overdue;
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.total - a.total);
    setClients(sorted);
    setLoading(false);
  }, []);

  // ── KPIs ─────────────────────────────────────────────

  const totalCxc = clients.reduce((s, c) => s + c.total, 0);
  const totalOverdue = clients.reduce((s, c) => s + c.overdue, 0);
  const criticalClients = clients.filter((c) => c.overdue > 0).length;

  // ── Edit/Save Override ────────────────────────────────

  function startEdit(client: ConsolidatedClient) {
    setEditing(client.nombre_normalized);
    setEditData({
      correo: client.correo,
      telefono: client.telefono,
      celular: client.celular,
      contacto: client.contacto,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const { error } = await supabase.from("cxc_client_overrides").upsert(
      {
        nombre_normalized: editing,
        correo: editData.correo,
        telefono: editData.telefono,
        celular: editData.celular,
        contacto: editData.contacto,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "nombre_normalized" }
    );
    if (!error) {
      setEditing(null);
      loadData();
    }
  }

  // ── Filter ────────────────────────────────────────────

  const filtered = search
    ? clients.filter((c) => c.nombre_normalized.includes(normalizeName(search)))
    : clients;

  // ── Render ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-sm">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold">CXC — Fashion Group</h1>
          <p className="text-sm text-gray-500">Panel de Cuentas por Cobrar</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/upload")}
            className="text-sm text-gray-500 hover:text-black"
          >
            Cargar archivos
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem("cxc_role");
              router.push("/");
            }}
            className="text-sm text-gray-500 hover:text-black"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Upload freshness */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        {COMPANIES.map((co) => {
          const up = uploads[co.key];
          const age = up ? uploadAge(up.uploaded_at) : "stale";
          return (
            <div
              key={co.key}
              className={`rounded px-3 py-2 text-xs border border-gray-100 ${up ? ageBg[age] : "bg-gray-50"}`}
            >
              <div className="font-medium truncate">{co.name}</div>
              {up ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${ageDot[age]}`} />
                  <span className="text-gray-500">
                    {new Date(up.uploaded_at).toLocaleDateString("es-PA")}
                  </span>
                </div>
              ) : (
                <div className="text-gray-400 mt-1">Sin datos</div>
              )}
            </div>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="border border-gray-200 rounded px-4 py-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total CXC</div>
          <div className="text-2xl font-bold mt-1">${fmt(totalCxc)}</div>
        </div>
        <div className="border border-red-200 rounded px-4 py-3 bg-red-50">
          <div className="text-xs text-red-600 uppercase tracking-wide">Vencido +120d</div>
          <div className="text-2xl font-bold mt-1 text-red-700">${fmt(totalOverdue)}</div>
        </div>
        <div className="border border-gray-200 rounded px-4 py-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Clientes Críticos</div>
          <div className="text-2xl font-bold mt-1">{criticalClients}</div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full border border-gray-300 rounded px-4 py-2 text-sm focus:outline-none focus:border-black"
        />
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div className="col-span-4">Cliente</div>
          <div className="col-span-2 text-right">Corriente</div>
          <div className="col-span-2 text-right">Vigilancia</div>
          <div className="col-span-2 text-right">Vencido</div>
          <div className="col-span-2 text-right">Total</div>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados</div>
        )}

        {filtered.map((client) => {
          const isExpanded = expanded === client.nombre_normalized;
          const isEditing = editing === client.nombre_normalized;

          return (
            <div key={client.nombre_normalized} className={`border-l-4 ${riskColor(client.current, client.watch, client.overdue)}`}>
              {/* Main row */}
              <div
                className="grid grid-cols-12 gap-2 px-4 py-3 text-sm cursor-pointer hover:bg-gray-50 transition border-b border-gray-100"
                onClick={() => setExpanded(isExpanded ? null : client.nombre_normalized)}
              >
                <div className="col-span-4 font-medium truncate">
                  <span className="mr-2 text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
                  {client.nombre_normalized}
                </div>
                <div className="col-span-2 text-right text-green-700">{fmt(client.current)}</div>
                <div className="col-span-2 text-right text-yellow-600">{fmt(client.watch)}</div>
                <div className="col-span-2 text-right text-red-600">{fmt(client.overdue)}</div>
                <div className="col-span-2 text-right font-semibold">{fmt(client.total)}</div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  {/* Contact info */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Contacto</span>
                      {!isEditing && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(client);
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-2 max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="border rounded px-2 py-1 text-sm"
                          placeholder="Correo"
                          value={editData.correo}
                          onChange={(e) => setEditData({ ...editData, correo: e.target.value })}
                        />
                        <input
                          className="border rounded px-2 py-1 text-sm"
                          placeholder="Teléfono"
                          value={editData.telefono}
                          onChange={(e) => setEditData({ ...editData, telefono: e.target.value })}
                        />
                        <input
                          className="border rounded px-2 py-1 text-sm"
                          placeholder="Celular"
                          value={editData.celular}
                          onChange={(e) => setEditData({ ...editData, celular: e.target.value })}
                        />
                        <input
                          className="border rounded px-2 py-1 text-sm"
                          placeholder="Contacto"
                          value={editData.contacto}
                          onChange={(e) => setEditData({ ...editData, contacto: e.target.value })}
                        />
                        <div className="col-span-2 flex gap-2 mt-1">
                          <button
                            onClick={saveEdit}
                            className="text-xs bg-black text-white px-3 py-1 rounded hover:bg-gray-800"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="text-xs text-gray-500 hover:text-black"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600 space-y-0.5">
                        {client.contacto && <div>👤 {client.contacto}</div>}
                        {client.correo && <div>✉ {client.correo}</div>}
                        {client.telefono && <div>☎ {client.telefono}</div>}
                        {client.celular && <div>📱 {client.celular}</div>}
                        {!client.contacto && !client.correo && !client.telefono && !client.celular && (
                          <div className="text-gray-400 italic">Sin información de contacto</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Per-company breakdown */}
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Desglose por empresa</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase">
                        <th className="text-left py-1 font-medium">Empresa</th>
                        <th className="text-left py-1 font-medium">Código</th>
                        <th className="text-right py-1 font-medium">0-30</th>
                        <th className="text-right py-1 font-medium">31-60</th>
                        <th className="text-right py-1 font-medium">61-90</th>
                        <th className="text-right py-1 font-medium">91-120</th>
                        <th className="text-right py-1 font-medium">121-180</th>
                        <th className="text-right py-1 font-medium">181-270</th>
                        <th className="text-right py-1 font-medium">271-365</th>
                        <th className="text-right py-1 font-medium">+365</th>
                        <th className="text-right py-1 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COMPANIES.filter((co) => client.companies[co.key]).map((co) => {
                        const d = client.companies[co.key];
                        return (
                          <tr key={co.key} className="border-t border-gray-100">
                            <td className="py-1.5">{co.name}</td>
                            <td className="py-1.5 text-gray-500">{d.codigo}</td>
                            <td className="text-right py-1.5">{fmt(d.d0_30)}</td>
                            <td className="text-right py-1.5">{fmt(d.d31_60)}</td>
                            <td className="text-right py-1.5">{fmt(d.d61_90)}</td>
                            <td className="text-right py-1.5 text-yellow-600">{fmt(d.d91_120)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.d121_180)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.d181_270)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.d271_365)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.mas_365)}</td>
                            <td className="text-right py-1.5 font-semibold">{fmt(d.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-gray-400 text-center">
        {filtered.length} clientes &middot; Política: 0-90d corriente · 91-120d vigilancia · +120d vencido
      </div>
    </div>
  );
}

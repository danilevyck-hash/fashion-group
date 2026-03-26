"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { COMPANIES, getCompaniesForRole } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { normalizeName } from "@/lib/normalize";
import { VENDOR_MAP } from "@/lib/vendors";
import AppHeader from "@/components/AppHeader";
import UploadFreshness from "./components/UploadFreshness";
import KpiCards from "./components/KpiCards";
import CompanySummary from "./components/CompanySummary";
import ClientTable from "./components/ClientTable";
import { SkeletonRow } from "./components/Skeleton";
import useAdminData from "./hooks/useAdminData";

// ── Helpers ──────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type RiskFilter = "all" | "current" | "watch" | "overdue";
type SortKey = "name" | "current" | "watch" | "overdue" | "total";
type SortDir = "asc" | "desc";

function buildWhatsAppMsg(client: ConsolidatedClient) {
  const lines = [
    `Estimado/a cliente,`,
    ``,
    `Le escribimos de Fashion Group para informarle sobre su estado de cuenta actualizado:`,
    ``,
    `*Estado de Cuenta - ${client.nombre_normalized}*`,
    ``,
  ];
  for (const co of COMPANIES) {
    const d = client.companies[co.key];
    if (!d || d.total === 0) continue;
    lines.push(`*${co.name}* (${co.brand}): $${fmt(d.total)}`);
  }
  lines.push(``);
  if (client.current > 0) lines.push(`Corriente (0-90d): $${fmt(client.current)}`);
  if (client.watch > 0) lines.push(`Vigilancia (91-120d): $${fmt(client.watch)}`);
  if (client.overdue > 0) lines.push(`*Vencido (121d+): $${fmt(client.overdue)}*`);
  lines.push(`*Total: $${fmt(client.total)}*`);
  lines.push(``);
  lines.push(`Agradecemos su pronta atencion a este saldo. Quedamos a su disposicion para cualquier consulta.`);
  lines.push(``);
  lines.push(`Atentamente,`);
  lines.push(`Fashion Group - Departamento de Cobros`);
  return lines.join("\n");
}

function buildEmailSubject(client: ConsolidatedClient) {
  return `Estado de Cuenta - ${client.nombre_normalized} - Fashion Group`;
}

function buildEmailBody(client: ConsolidatedClient) {
  const lines = [
    `Estimado/a cliente,`,
    ``,
    `Le escribimos de Fashion Group para informarle sobre su estado de cuenta actualizado.`,
    ``,
    `Estado de Cuenta - ${client.nombre_normalized}`,
    ``,
  ];
  for (const co of COMPANIES) {
    const d = client.companies[co.key];
    if (!d || d.total === 0) continue;
    lines.push(`${co.name} (${co.brand}): $${fmt(d.total)}`);
  }
  lines.push(``);
  if (client.current > 0) lines.push(`Corriente (0-90d): $${fmt(client.current)}`);
  if (client.watch > 0) lines.push(`Vigilancia (91-120d): $${fmt(client.watch)}`);
  if (client.overdue > 0) lines.push(`VENCIDO (121d+): $${fmt(client.overdue)}`);
  lines.push(`TOTAL: $${fmt(client.total)}`);
  lines.push(``);
  lines.push(`Agradecemos su pronta atencion a este saldo. Quedamos a su disposicion para cualquier consulta.`);
  lines.push(``);
  lines.push(`Atentamente,`);
  lines.push(`Fashion Group - Departamento de Cobros`);
  return lines.join("\n");
}

// ── PDF generation (pure client-side) ────────────────────

function generatePDF(data: ConsolidatedClient[], title: string, detailed: boolean = false, companyKeys?: string[]) {
  const w = window.open("", "_blank");
  if (!w) return;

  let rows: string;

  if (detailed && companyKeys) {
    rows = data.map((c) => {
      const mainRow = `
        <tr style="background:#f9f9f9">
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;font-weight:600" colspan="1">${c.nombre_normalized}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;color:#15803d;font-weight:600">${fmt(c.current)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;color:#ca8a04;font-weight:600">${fmt(c.watch)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;color:#dc2626;font-weight:600">${fmt(c.overdue)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;font-weight:700">${fmt(c.total)}</td>
        </tr>`;
      const companyRows = companyKeys
        .filter((k) => c.companies[k] && c.companies[k].total !== 0)
        .map((k) => {
          const d = c.companies[k];
          const co = COMPANIES.find((x) => x.key === k);
          const cur = d.d0_30 + d.d31_60 + d.d61_90;
          const wat = d.d91_120;
          const ove = d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
          return `<tr>
            <td style="padding:2px 8px 2px 24px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#666">${co?.name || k}</td>
            <td style="padding:2px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:11px;color:#15803d">${fmt(cur)}</td>
            <td style="padding:2px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:11px;color:#ca8a04">${fmt(wat)}</td>
            <td style="padding:2px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:11px;color:#dc2626">${fmt(ove)}</td>
            <td style="padding:2px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:11px">${fmt(d.total)}</td>
          </tr>`;
        }).join("");
      return mainRow + companyRows;
    }).join("");
  } else {
    rows = data.map((c) => `
      <tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${c.nombre_normalized}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:#15803d">${fmt(c.current)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:#ca8a04">${fmt(c.watch)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:#dc2626">${fmt(c.overdue)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(c.total)}</td>
      </tr>
    `).join("");
  }

  const totalCxc = data.reduce((s, c) => s + c.total, 0);
  const totalCurrent = data.reduce((s, c) => s + c.current, 0);
  const totalWatch = data.reduce((s, c) => s + c.watch, 0);
  const totalOverdue = data.reduce((s, c) => s + c.overdue, 0);

  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:-apple-system,sans-serif;margin:40px;color:#111}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;padding:6px 8px;border-bottom:2px solid #111;font-size:11px;text-transform:uppercase;color:#666}
    .right{text-align:right}
    h1{font-size:18px;margin:0} h2{font-size:13px;color:#666;margin:4px 0 20px}
    .footer{margin-top:16px;font-size:11px;color:#999;text-align:center}
    .totals td{font-weight:700;border-top:2px solid #111;padding:6px 8px}
    @media print{body{margin:20px}}
    </style></head><body>
    <h1>CXC — Fashion Group</h1>
    <h2>${title}${detailed ? " (Detallado)" : ""} &middot; ${new Date().toLocaleDateString("es-PA")} &middot; ${data.length} clientes</h2>
    <table>
      <thead><tr>
        <th>Cliente</th><th class="right">Corriente 0-90d</th><th class="right">Vigilancia 91-120d</th><th class="right">Vencido 121d+</th><th class="right">Total</th>
      </tr></thead>
      <tbody>${rows}
        <tr class="totals">
          <td>TOTAL</td>
          <td class="right" style="color:#15803d">${fmt(totalCurrent)}</td>
          <td class="right" style="color:#ca8a04">${fmt(totalWatch)}</td>
          <td class="right" style="color:#dc2626">${fmt(totalOverdue)}</td>
          <td class="right">${fmt(totalCxc)}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">Politica: 0-90d corriente &middot; 91-120d vigilancia &middot; 121d+ vencido</div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`);
  w.document.close();
}

function exportCSV(data: ConsolidatedClient[], label?: string) {
  const header = "Cliente,Corriente 0-90d,Vigilancia 91-120d,Vencido 121d+,Total,Correo,Telefono,Celular\n";
  const rows = data.map((c) =>
    `"${c.nombre_normalized}",${c.current.toFixed(2)},${c.watch.toFixed(2)},${c.overdue.toFixed(2)},${c.total.toFixed(2)},"${c.correo}","${c.telefono}","${c.celular}"`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = label ? `_${label.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}` : "";
  a.download = `cxc_fashion_group${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildVendorMsg(vendorName: string, companyName: string, brand: string, criticalClients: { name: string; total: number; overdue: number; watch: number }[]) {
  const lines = [
    `Hola ${vendorName}, te envio el reporte de cobros pendientes de *${companyName} (${brand})*:`,
    ``,
    `*Clientes criticos (${criticalClients.length}):*`,
    ``,
  ];
  for (const c of criticalClients) {
    let status = "";
    if (c.overdue > 0) status = `Vencido: $${fmt(c.overdue)}`;
    else if (c.watch > 0) status = `Vigilancia: $${fmt(c.watch)}`;
    lines.push(`- *${c.name}*: Total $${fmt(c.total)}${status ? " | " + status : ""}`);
  }
  lines.push(``);
  const totalPending = criticalClients.reduce((s, c) => s + c.total, 0);
  lines.push(`*Total pendiente de cobro: $${fmt(totalPending)}*`);
  lines.push(``);
  lines.push(`Favor dar seguimiento a estos clientes. Gracias.`);
  return lines.join("\n");
}

// ── Main Component ───────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const { clients, uploads, contactLog, loading, loadError, loadData, setContactLog } = useAdminData();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showExport, setShowExport] = useState(false);
  const [userRole, setUserRole] = useState<string>("admin");
  const [showUploadHistory, setShowUploadHistory] = useState(true);
  const [activityLogs, setActivityLogs] = useState<{id:string;action:string;details:string;created_at:string}[]>([]);
  const [showActivity, setShowActivity] = useState(false);

  const roleCompanies = useMemo(() => getCompaniesForRole(userRole), [userRole]);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role");
    if (r !== "admin" && r !== "director" && r !== "david") {
      router.push("/");
      return;
    }
    setUserRole(r);
    loadData();
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearch(q);
  }, [router, loadData]);

  // ── Sorting ──────────────────────────────────────────

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  // ── Filtering + sorting ──────────────────────────────

  const filtered = useMemo(() => {
    const roleKeys = new Set(roleCompanies.map((c) => c.key));
    let result = clients
      .map((c) => {
        const filteredCompanies: typeof c.companies = {};
        for (const [key, data] of Object.entries(c.companies)) {
          if (roleKeys.has(key)) filteredCompanies[key] = data;
        }
        if (Object.keys(filteredCompanies).length === 0) return null;
        let current = 0, watch = 0, overdue = 0, total = 0;
        let gd0 = 0, gd1 = 0, gd2 = 0, gd3 = 0, gd4 = 0;
        for (const co of Object.values(filteredCompanies)) {
          current += co.d0_30 + co.d31_60 + co.d61_90;
          watch += co.d91_120;
          overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
          total += co.total;
          gd0 += co.d0_30; gd1 += co.d31_60; gd2 += co.d61_90;
          gd3 += co.d91_120; gd4 += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
        }
        return { ...c, companies: filteredCompanies, current, watch, overdue, total, d0_30: gd0, d31_60: gd1, d61_90: gd2, d91_120: gd3, d121_plus: gd4 };
      })
      .filter((c): c is ConsolidatedClient => c !== null && c.total > 0);

    if (companyFilter !== "all") {
      result = result
        .filter((c) => c.companies[companyFilter])
        .map((c) => {
          const d = c.companies[companyFilter];
          return {
            ...c,
            current: d.d0_30 + d.d31_60 + d.d61_90,
            watch: d.d91_120,
            overdue: d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365,
            total: d.total,
            d0_30: d.d0_30, d31_60: d.d31_60, d61_90: d.d61_90,
            d91_120: d.d91_120, d121_plus: d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365,
          };
        });
    }

    if (riskFilter === "current") result = result.filter((c) => c.overdue === 0 && c.watch === 0);
    else if (riskFilter === "watch") result = result.filter((c) => c.watch > 0);
    else if (riskFilter === "overdue") result = result.filter((c) => c.overdue > 0);

    if (search) {
      const q = normalizeName(search);
      result = result.filter((c) => c.nombre_normalized.includes(q));
    }

    result.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === "name") { va = a.nombre_normalized; vb = b.nombre_normalized; }
      else if (sortKey === "current") { va = a.current; vb = b.current; }
      else if (sortKey === "watch") { va = a.watch; vb = b.watch; }
      else if (sortKey === "overdue") { va = a.overdue; vb = b.overdue; }
      else { va = a.total; vb = b.total; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [clients, roleCompanies, companyFilter, riskFilter, search, sortKey, sortDir]);

  // ── Role-filtered clients ──
  const roleClients = useMemo(() => {
    const roleKeys = new Set(roleCompanies.map((c) => c.key));
    return clients
      .map((c) => {
        const fc: typeof c.companies = {};
        for (const [key, data] of Object.entries(c.companies)) {
          if (roleKeys.has(key)) fc[key] = data;
        }
        if (Object.keys(fc).length === 0) return null;
        let current = 0, watch = 0, overdue = 0, total = 0;
        for (const co of Object.values(fc)) {
          current += co.d0_30 + co.d31_60 + co.d61_90;
          watch += co.d91_120;
          overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
          total += co.total;
        }
        return { ...c, companies: fc, current, watch, overdue, total };
      })
      .filter((c): c is ConsolidatedClient => c !== null && c.total > 0);
  }, [clients, roleCompanies]);

  // ── Actions ──────────────────────────────────────────

  function openWhatsApp(client: ConsolidatedClient) {
    let phone = (client.celular || client.telefono).replace(/[^0-9]/g, "");
    if (!phone) { alert("Este cliente no tiene numero de telefono registrado. Edite el contacto primero."); return; }
    if (!phone.startsWith("507") && phone.length <= 8) {
      phone = "507" + phone;
    }
    const msg = encodeURIComponent(buildWhatsAppMsg(client));
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }

  function sendVendorWhatsApp(companyKey: string) {
    const co = roleCompanies.find((c) => c.key === companyKey);
    if (!co?.vendedorPhone || !co?.vendedor) { alert("Esta empresa no tiene vendedor asignado."); return; }

    const vendorClients = VENDOR_MAP[companyKey] || {};
    const vendorClientNames = new Set(
      Object.entries(vendorClients)
        .filter(([, v]) => v === co.vendedor!.toUpperCase())
        .map(([name]) => name)
    );

    const critical = clients
      .filter((c) => {
        if (!vendorClientNames.has(c.nombre_normalized)) return false;
        const d = c.companies[companyKey];
        if (!d || d.total <= 0) return false;
        const watch = d.d91_120;
        const overdue = d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
        return watch > 0 || overdue > 0;
      })
      .map((c) => {
        const d = c.companies[companyKey];
        return {
          name: c.nombre_normalized,
          total: d.total,
          watch: d.d91_120,
          overdue: d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365,
        };
      })
      .sort((a, b) => b.total - a.total);

    if (critical.length === 0) {
      alert("No hay clientes criticos de " + co.vendedor + " en " + co.name);
      return;
    }

    const msg = encodeURIComponent(buildVendorMsg(co.vendedor, co.name, co.brand, critical));
    window.open(`https://wa.me/${co.vendedorPhone}?text=${msg}`, "_blank");
  }

  function massWhatsApp(companyKey?: string) {
    const targets = clients.filter((c) => {
      if (companyKey) {
        const d = c.companies[companyKey];
        if (!d) return false;
        const overdue = d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
        return overdue > 0;
      }
      return c.overdue > 0;
    });

    if (targets.length === 0) {
      alert("No hay clientes vencidos" + (companyKey ? " en esta empresa" : ""));
      return;
    }

    const withPhone = targets.filter((c) => c.celular || c.telefono);
    if (withPhone.length === 0) {
      alert(`Hay ${targets.length} clientes vencidos pero ninguno tiene numero de telefono registrado.`);
      return;
    }

    if (!confirm(`Se abriran ${withPhone.length} ventanas de WhatsApp (de ${targets.length} clientes vencidos). ¿Continuar?`)) return;

    withPhone.forEach((client, i) => {
      setTimeout(() => {
        let phone = (client.celular || client.telefono).replace(/[^0-9]/g, "");
        if (!phone.startsWith("507") && phone.length <= 8) phone = "507" + phone;
        const msg = encodeURIComponent(buildWhatsAppMsg(client));
        window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
        markContacted(client.nombre_normalized, "whatsapp");
      }, i * 1500);
    });
  }

  function openEmail(client: ConsolidatedClient) {
    if (!client.correo) { alert("Este cliente no tiene correo registrado. Edite el contacto primero."); return; }
    const subject = encodeURIComponent(buildEmailSubject(client));
    const body = encodeURIComponent(buildEmailBody(client));
    window.open(`mailto:${client.correo}?subject=${subject}&body=${body}`, "_blank");
  }

  async function markContacted(clientName: string, method: string) {
    await supabase.from("cxc_contact_log").insert({
      nombre_normalized: clientName,
      method,
    });
    setContactLog((prev) => ({
      ...prev,
      [clientName]: { date: new Date().toISOString(), method },
    }));
  }

  async function handleSaveEdit(nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) {
    const { error } = await supabase.from("cxc_client_overrides").upsert(
      { nombre_normalized: nombre, ...data, updated_at: new Date().toISOString() },
      { onConflict: "nombre_normalized" }
    );
    if (!error) loadData();
  }

  // ── Render ────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-500 text-sm">{loadError}</p>
        <button onClick={loadData} className="text-sm bg-black text-white px-4 py-2 rounded hover:bg-gray-800">Reintentar</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
      </div>
    );
  }

  return (
    <div>
      <AppHeader module="Panel CXC" />
      <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Export */}
      <div className="flex justify-end mb-6">
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition"
            >
              Exportar
            </button>
            {showExport && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10">
                <button
                  onClick={() => {
                    const riskL = riskFilter === "all" ? "" : riskFilter === "current" ? "corriente" : riskFilter === "watch" ? "vigilancia" : "vencido";
                    const coL = companyFilter !== "all" ? COMPANIES.find((c) => c.key === companyFilter)?.name || "" : "";
                    exportCSV(filtered, [riskL, coL].filter(Boolean).join("_") || undefined);
                    setShowExport(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                >
                  CSV (Excel)
                </button>
                <button
                  onClick={() => {
                    const riskLabel = riskFilter === "all" ? "Todos los clientes"
                      : riskFilter === "current" ? "Clientes Corrientes"
                      : riskFilter === "watch" ? "Clientes en Vigilancia"
                      : "Clientes Vencidos";
                    const coLabel = companyFilter !== "all"
                      ? COMPANIES.find((c) => c.key === companyFilter)?.name || ""
                      : "";
                    const label = coLabel ? `${riskLabel} — ${coLabel}` : riskLabel;
                    generatePDF(filtered, label);
                    setShowExport(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                >
                  PDF Resumen
                </button>
                {companyFilter === "all" && <button
                  onClick={() => {
                    const riskLabel = riskFilter === "all" ? "Todos los clientes"
                      : riskFilter === "current" ? "Clientes Corrientes"
                      : riskFilter === "watch" ? "Clientes en Vigilancia"
                      : "Clientes Vencidos";
                    const keys = roleCompanies.map((c) => c.key);
                    generatePDF(filtered, riskLabel, true, keys);
                    setShowExport(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                >
                  PDF Detallado
                </button>}
              </div>
            )}
          </div>
      </div>

      <UploadFreshness roleCompanies={roleCompanies} uploads={uploads} />

      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black w-full max-w-md"
        />
      </div>

      {/* Activity logs */}
      {userRole === "admin" && (
        <div className="mb-4">
          <button onClick={async () => { if (showActivity) { setShowActivity(false); return; } const res = await fetch("/api/activity-logs"); if (res.ok) setActivityLogs(await res.json()); setShowActivity(true); }} className="text-xs text-gray-400 hover:text-black transition flex items-center gap-1">{showActivity ? "▲" : "▼"} Actividad reciente</button>
          {showActivity && (
            <div className="mt-3">{activityLogs.length === 0 ? <p className="text-sm text-gray-300 py-4 text-center">Sin actividad registrada</p> : (
              <div className="space-y-1">{activityLogs.map((log) => {
                const diff = Date.now() - new Date(log.created_at).getTime();
                const m = Math.floor(diff / 60000); const h = Math.floor(diff / 3600000); const d = Math.floor(diff / 86400000);
                const ago = d > 0 ? `${d}d` : h > 0 ? `${h}h` : `${m}m`;
                const labels: Record<string, string> = { reclamo_creado: "Nuevo reclamo", reclamo_editado: "Editado", reclamo_eliminado: "Eliminado", csv_subido: "CSV subido" };
                return <div key={log.id} className="flex items-center gap-3 py-2 border-b border-gray-50 text-xs"><span className="text-gray-300 w-12 flex-shrink-0">{ago}</span><span className="font-medium text-gray-700 w-28 flex-shrink-0">{labels[log.action] || log.action}</span><span className="text-gray-400 truncate">{log.details}</span></div>;
              })}</div>
            )}</div>
          )}
        </div>
      )}

      {/* Upload history toggle */}
      <div className="mb-4">
        <button onClick={() => setShowUploadHistory(!showUploadHistory)} className="text-xs text-gray-400 hover:text-black transition flex items-center gap-1">{showUploadHistory ? "▲" : "▼"} Historial de cargas</button>
        {showUploadHistory && (
          <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs"><thead><tr className="bg-gray-50 border-b border-gray-100"><th className="text-left px-4 py-2.5 font-medium text-gray-500">Empresa</th><th className="text-left px-4 py-2.5 font-medium text-gray-500">Último upload</th><th className="text-left px-4 py-2.5 font-medium text-gray-500">Hace</th><th className="text-right px-4 py-2.5 font-medium text-gray-500">Registros</th></tr></thead>
            <tbody>{roleCompanies.map((co) => {
              const u = uploads[co.key];
              if (!u) return <tr key={co.key}><td className="px-4 py-2.5">{co.name}</td><td colSpan={3} className="px-4 py-2.5 text-gray-300">Sin datos</td></tr>;
              const days = Math.floor((Date.now() - new Date(u.uploaded_at).getTime()) / 86400000);
              const hours = Math.floor((Date.now() - new Date(u.uploaded_at).getTime()) / 3600000);
              const hace = days >= 1 ? `${days}d` : `${hours}h`;
              const color = days > 14 ? "text-red-500" : days > 7 ? "text-amber-500" : "text-green-600";
              return <tr key={co.key} className="border-b border-gray-50"><td className="px-4 py-2.5 font-medium">{co.name}</td><td className="px-4 py-2.5 text-gray-500">{new Date(u.uploaded_at).toLocaleDateString("es-PA")}</td><td className={`px-4 py-2.5 font-medium ${color}`}>hace {hace}</td><td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{(u.row_count || 0).toLocaleString()}</td></tr>;
            })}</tbody></table>
          </div>
        )}
      </div>

      <KpiCards roleClients={roleClients} />

      <CompanySummary
        roleCompanies={roleCompanies}
        roleClients={roleClients}
        companyFilter={companyFilter}
        clients={clients}
        vendorMap={VENDOR_MAP}
        onSendVendorWhatsApp={sendVendorWhatsApp}
        onMassWhatsApp={massWhatsApp}
      />

      <ClientTable
        filtered={filtered}
        roleCompanies={roleCompanies}
        roleClients={roleClients}
        companyFilter={companyFilter}
        setCompanyFilter={setCompanyFilter}
        riskFilter={riskFilter}
        setRiskFilter={setRiskFilter}
        search={search}
        setSearch={setSearch}
        sortKey={sortKey}
        sortDir={sortDir}
        toggleSort={toggleSort}
        sortArrow={sortArrow}
        userRole={userRole}
        clients={clients}
        contactLog={contactLog}
        onOpenWhatsApp={openWhatsApp}
        onOpenEmail={openEmail}
        onMarkContacted={markContacted}
        onSaveEdit={handleSaveEdit}
      />

    </div>
    </div>
  );
}

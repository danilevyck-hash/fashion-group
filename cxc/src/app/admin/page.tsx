"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { COMPANIES, getCompaniesForRole } from "@/lib/companies";
import type { CxcRow, CxcUpload, ConsolidatedClient } from "@/lib/types";
import { normalizeName } from "@/lib/normalize";
import { VENDOR_MAP } from "@/lib/vendors";

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

const ageBg: Record<string, string> = { fresh: "", warning: "bg-yellow-50", stale: "bg-red-50" };
const ageDot: Record<string, string> = { fresh: "bg-green-500", warning: "bg-yellow-500", stale: "bg-red-500" };

function riskColor(current: number, watch: number, overdue: number) {
  if (overdue > 0) return "border-l-red-500";
  if (watch > 0) return "border-l-yellow-500";
  return "border-l-green-500";
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
    // Detailed view: show company breakdown per client
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
  const [clients, setClients] = useState<ConsolidatedClient[]>([]);
  const [uploads, setUploads] = useState<Record<string, CxcUpload>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState({ correo: "", telefono: "", celular: "", contacto: "" });
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contactLog, setContactLog] = useState<Record<string, { date: string; method: string }>>({});
  const [userRole, setUserRole] = useState<string>("admin");

  const roleCompanies = useMemo(() => getCompaniesForRole(userRole), [userRole]);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role");
    if (r !== "admin" && r !== "director" && r !== "david") {
      router.push("/");
      return;
    }
    setUserRole(r);
    loadData();
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);

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

    const { data: rows } = await supabase.from("cxc_rows").select("*");
    const { data: overrides } = await supabase.from("cxc_client_overrides").select("*");
    const overrideMap: Record<string, { correo: string; telefono: string; celular: string; contacto: string }> = {};
    if (overrides) {
      for (const o of overrides) overrideMap[o.nombre_normalized] = o;
    }

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
            total: 0, current: 0, watch: 0, overdue: 0,
            hasOverride: !!ovr,
          };
          map.set(key, client);
        }

        const existing = client.companies[r.company_key];
        if (existing) {
          existing.d0_30 += r.d0_30; existing.d31_60 += r.d31_60; existing.d61_90 += r.d61_90;
          existing.d91_120 += r.d91_120; existing.d121_180 += r.d121_180;
          existing.d181_270 += r.d181_270; existing.d271_365 += r.d271_365;
          existing.mas_365 += r.mas_365; existing.total += r.total;
        } else {
          client.companies[r.company_key] = {
            nombre: r.nombre, codigo: r.codigo,
            d0_30: r.d0_30, d31_60: r.d31_60, d61_90: r.d61_90,
            d91_120: r.d91_120, d121_180: r.d121_180,
            d181_270: r.d181_270, d271_365: r.d271_365,
            mas_365: r.mas_365, total: r.total,
          };
        }

        if (!client.correo && r.correo) client.correo = r.correo;
        if (!client.telefono && r.telefono) client.telefono = r.telefono;
        if (!client.celular && r.celular) client.celular = r.celular;
        if (!client.contacto && r.contacto) client.contacto = r.contacto;
      }
    }

    for (const client of map.values()) {
      let total = 0, current = 0, watch = 0, overdue = 0;
      for (const co of Object.values(client.companies)) {
        total += co.total;
        current += co.d0_30 + co.d31_60 + co.d61_90;
        watch += co.d91_120;
        overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
      }
      client.total = total; client.current = current;
      client.watch = watch; client.overdue = overdue;
    }

    // Filter out clients with zero or negative total
    setClients(Array.from(map.values()).filter((c) => c.total > 0));

    // Load contact log (latest per client)
    const { data: logData } = await supabase
      .from("cxc_contact_log")
      .select("*")
      .order("contacted_at", { ascending: false });
    const latestLog: Record<string, { date: string; method: string }> = {};
    if (logData) {
      for (const l of logData) {
        if (!latestLog[l.nombre_normalized]) {
          latestLog[l.nombre_normalized] = { date: l.contacted_at, method: l.method };
        }
      }
    }
    setContactLog(latestLog);

    setLoading(false);
  }, []);

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
    // Filter clients to only those with data in role's companies, recalculate totals
    let result = clients
      .map((c) => {
        const filteredCompanies: typeof c.companies = {};
        for (const [key, data] of Object.entries(c.companies)) {
          if (roleKeys.has(key)) filteredCompanies[key] = data;
        }
        if (Object.keys(filteredCompanies).length === 0) return null;
        let current = 0, watch = 0, overdue = 0, total = 0;
        for (const co of Object.values(filteredCompanies)) {
          current += co.d0_30 + co.d31_60 + co.d61_90;
          watch += co.d91_120;
          overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
          total += co.total;
        }
        return { ...c, companies: filteredCompanies, current, watch, overdue, total };
      })
      .filter((c): c is ConsolidatedClient => c !== null && c.total > 0);

    // Company filter — recalculate totals to show only that company's amounts
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
          };
        });
    }

    // Risk filter
    if (riskFilter === "current") result = result.filter((c) => c.overdue === 0 && c.watch === 0);
    else if (riskFilter === "watch") result = result.filter((c) => c.watch > 0);
    else if (riskFilter === "overdue") result = result.filter((c) => c.overdue > 0);

    // Search
    if (search) {
      const q = normalizeName(search);
      result = result.filter((c) => c.nombre_normalized.includes(q));
    }

    // Sort
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

  // ── Role-filtered clients (only companies visible to this role) ──
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

  // ── KPIs ─────────────────────────────────────────────

  const totalCxc = roleClients.reduce((s, c) => s + c.total, 0);
  const totalCurrent = roleClients.reduce((s, c) => s + c.current, 0);
  const totalWatch = roleClients.reduce((s, c) => s + c.watch, 0);
  const totalOverdue = roleClients.reduce((s, c) => s + c.overdue, 0);
  const criticalClients = roleClients.filter((c) => c.overdue > 0).length;
  const pctCurrent = totalCxc > 0 ? (totalCurrent / totalCxc) * 100 : 0;
  const pctWatch = totalCxc > 0 ? (totalWatch / totalCxc) * 100 : 0;
  const pctOverdue = totalCxc > 0 ? (totalOverdue / totalCxc) * 100 : 0;

  // ── Company summary ──────────────────────────────────

  const companySummary = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const co of roleCompanies) sums[co.key] = 0;
    for (const c of roleClients) {
      for (const [key, data] of Object.entries(c.companies)) {
        sums[key] = (sums[key] || 0) + data.total;
      }
    }
    return sums;
  }, [roleClients, roleCompanies]);

  const maxCompanyTotal = Math.max(...Object.values(companySummary), 1);

  // ── Counts ───────────────────────────────────────────

  const countCurrent = roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length;
  const countWatch = roleClients.filter((c) => c.watch > 0).length;
  const countOverdue = roleClients.filter((c) => c.overdue > 0).length;

  // ── Edit/Save ────────────────────────────────────────

  function startEdit(client: ConsolidatedClient) {
    setEditing(client.nombre_normalized);
    setEditData({
      correo: client.correo, telefono: client.telefono,
      celular: client.celular, contacto: client.contacto,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const { error } = await supabase.from("cxc_client_overrides").upsert(
      { nombre_normalized: editing, ...editData, updated_at: new Date().toISOString() },
      { onConflict: "nombre_normalized" }
    );
    if (!error) { setEditing(null); loadData(); }
  }

  // ── Actions ──────────────────────────────────────────

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  }

  function openWhatsApp(client: ConsolidatedClient) {
    let phone = (client.celular || client.telefono).replace(/[^0-9]/g, "");
    if (!phone) { alert("Este cliente no tiene numero de telefono registrado. Edite el contacto primero."); return; }
    // Auto-prepend Panama country code if not present
    if (!phone.startsWith("507") && phone.length <= 8) {
      phone = "507" + phone;
    }
    const msg = encodeURIComponent(buildWhatsAppMsg(client));
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }

  function sendVendorWhatsApp(companyKey: string) {
    const co = roleCompanies.find((c) => c.key === companyKey);
    if (!co?.vendedorPhone || !co?.vendedor) { alert("Esta empresa no tiene vendedor asignado."); return; }

    // Get this vendor's client list
    const vendorClients = VENDOR_MAP[companyKey] || {};
    const vendorClientNames = new Set(
      Object.entries(vendorClients)
        .filter(([, v]) => v === co.vendedor!.toUpperCase())
        .map(([name]) => name)
    );

    // Find vendor's clients with debt that have watch or overdue
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
    // Get overdue clients, optionally filtered by company
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

    // Filter to those with phone numbers
    const withPhone = targets.filter((c) => c.celular || c.telefono);
    if (withPhone.length === 0) {
      alert(`Hay ${targets.length} clientes vencidos pero ninguno tiene numero de telefono registrado.`);
      return;
    }

    if (!confirm(`Se abriran ${withPhone.length} ventanas de WhatsApp (de ${targets.length} clientes vencidos). ¿Continuar?`)) return;

    // Open WhatsApp for each client with a small delay
    withPhone.forEach((client, i) => {
      setTimeout(() => {
        let phone = (client.celular || client.telefono).replace(/[^0-9]/g, "");
        if (!phone.startsWith("507") && phone.length <= 8) phone = "507" + phone;
        const msg = encodeURIComponent(buildWhatsAppMsg(client));
        window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
        markContacted(client.nombre_normalized, "whatsapp");
      }, i * 1500); // 1.5 sec delay between each
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
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 hover:border-black transition"
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
          {userRole !== "director" && (
            <button onClick={() => router.push("/upload")} className="text-sm text-gray-500 hover:text-black">
              Cargar archivos
            </button>
          )}
          <button
            onClick={() => { sessionStorage.removeItem("cxc_role"); router.push("/"); }}
            className="text-sm text-gray-500 hover:text-black"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Upload freshness */}
      <div className={`grid grid-cols-2 ${roleCompanies.length > 5 ? "sm:grid-cols-4 lg:grid-cols-7" : "sm:grid-cols-5"} gap-2 mb-6`}>
        {roleCompanies.map((co) => {
          const up = uploads[co.key];
          const age = up ? uploadAge(up.uploaded_at) : "stale";
          return (
            <div key={co.key} className={`rounded px-3 py-2 text-xs border border-gray-100 ${up ? ageBg[age] : "bg-gray-50"}`}>
              <div className="font-medium truncate">{co.name}</div>
              {up ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${ageDot[age]}`} />
                  <span className="text-gray-500">{new Date(up.uploaded_at).toLocaleDateString("es-PA")}</span>
                </div>
              ) : (
                <div className="text-gray-400 mt-1">Sin datos</div>
              )}
            </div>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="border border-gray-200 rounded px-4 py-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total CXC</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">${fmt(totalCxc)}</div>
        </div>
        <div className="border border-red-200 rounded px-4 py-3 bg-red-50">
          <div className="text-xs text-red-600 uppercase tracking-wide">Vencido +121d</div>
          <div className="text-xl sm:text-2xl font-bold mt-1 text-red-700">${fmt(totalOverdue)}</div>
        </div>
        <div className="border border-gray-200 rounded px-4 py-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Clientes Criticos</div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{criticalClients}</div>
        </div>
      </div>

      {/* Risk % bar */}
      {totalCxc > 0 && (
        <div className="mb-6">
          <div className="flex h-3 rounded overflow-hidden">
            <div className="bg-green-500" style={{ width: `${pctCurrent}%` }} title={`Corriente: ${pctCurrent.toFixed(0)}%`} />
            <div className="bg-yellow-400" style={{ width: `${pctWatch}%` }} title={`Vigilancia: ${pctWatch.toFixed(0)}%`} />
            <div className="bg-red-500" style={{ width: `${pctOverdue}%` }} title={`Vencido: ${pctOverdue.toFixed(0)}%`} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>Corriente {pctCurrent.toFixed(0)}%</span>
            <span>Vigilancia {pctWatch.toFixed(0)}%</span>
            <span>Vencido {pctOverdue.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Company summary bars — hide when only 1 company */}
      {roleCompanies.length > 1 && (
        <div className="mb-6 border border-gray-200 rounded px-4 py-3">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">CXC por Empresa</div>
          <div className="space-y-2">
            {roleCompanies.map((co) => {
              const val = companySummary[co.key] || 0;
              const pct = (val / maxCompanyTotal) * 100;
              return (
                <div key={co.key} className="flex items-center gap-3">
                  <div className="w-36 text-xs truncate">{co.name}</div>
                  <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-black rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-28 text-xs text-right font-medium">${fmt(val)}</div>
                  {co.vendedorPhone ? (
                    <button
                      onClick={() => sendVendorWhatsApp(co.key)}
                      className="text-xs border border-green-600 text-green-700 px-2 py-1 rounded hover:bg-green-50 transition whitespace-nowrap"
                    >
                      Enviar a {co.vendedor}
                    </button>
                  ) : (
                    <div className="w-24" />
                  )}
                </div>
              );
            })}
          </div>
          {/* Mass WhatsApp button */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
            <button
              onClick={() => massWhatsApp(companyFilter !== "all" ? companyFilter : undefined)}
              className="text-xs border border-green-600 text-green-700 px-3 py-1.5 rounded hover:bg-green-50 transition"
            >
              📱 WhatsApp masivo a vencidos {companyFilter !== "all" ? `de ${COMPANIES.find(c => c.key === companyFilter)?.name || ""}` : "(todas)"}
            </button>
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setRiskFilter("all")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "all" ? "bg-black text-white border-black" : "border-gray-300 text-gray-600 hover:border-black"}`}>
            Todos ({clients.length})
          </button>
          <button onClick={() => setRiskFilter("current")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "current" ? "bg-green-600 text-white border-green-600" : "border-green-300 text-green-700 hover:bg-green-50"}`}>
            Corriente ({countCurrent})
          </button>
          <button onClick={() => setRiskFilter("watch")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "watch" ? "bg-yellow-500 text-white border-yellow-500" : "border-yellow-300 text-yellow-700 hover:bg-yellow-50"}`}>
            Vigilancia ({countWatch})
          </button>
          <button onClick={() => setRiskFilter("overdue")}
            className={`px-3 py-1.5 rounded text-sm border transition ${riskFilter === "overdue" ? "bg-red-600 text-white border-red-600" : "border-red-300 text-red-700 hover:bg-red-50"}`}>
            Vencido ({countOverdue})
          </button>
        </div>
        {roleCompanies.length > 1 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-black"
          >
            <option value="all">Todas las empresas</option>
            {roleCompanies.map((co) => (
              <option key={co.key} value={co.key}>{co.name}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 border border-gray-300 rounded px-4 py-1.5 text-sm focus:outline-none focus:border-black"
        />
      </div>

      {/* Client table */}
      <div className="border border-gray-200 rounded overflow-hidden">
        {/* Sortable header */}
        <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-50 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-5 sm:col-span-4 cursor-pointer hover:text-black" onClick={() => toggleSort("name")}>
            Cliente{sortArrow("name")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("current")}>
            0-90d{sortArrow("current")}
          </div>
          <div className="hidden sm:block col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("watch")}>
            91-120d{sortArrow("watch")}
          </div>
          <div className="col-span-3 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("overdue")}>
            121d+{sortArrow("overdue")}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right cursor-pointer hover:text-black" onClick={() => toggleSort("total")}>
            Total{sortArrow("total")}
          </div>
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
                className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer hover:bg-gray-50 transition border-b border-gray-100"
                onClick={() => setExpanded(isExpanded ? null : client.nombre_normalized)}
              >
                <div className="col-span-5 sm:col-span-4 font-medium truncate">
                  <span className="mr-1 sm:mr-2 text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
                  {client.nombre_normalized}
                </div>
                <div className="hidden sm:block col-span-2 text-right text-green-700">{fmt(client.current)}</div>
                <div className="hidden sm:block col-span-2 text-right text-yellow-600">{fmt(client.watch)}</div>
                <div className="col-span-3 sm:col-span-2 text-right text-red-600">{fmt(client.overdue)}</div>
                <div className="col-span-4 sm:col-span-2 text-right font-semibold">{fmt(client.total)}</div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  {/* Contact info + action buttons */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-medium text-gray-500 uppercase">Contacto</span>
                      {!isEditing && (
                        <button onClick={(e) => { e.stopPropagation(); startEdit(client); }}
                          className="text-xs text-blue-600 hover:underline">Editar</button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-2 max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Correo"
                          value={editData.correo} onChange={(e) => setEditData({ ...editData, correo: e.target.value })} />
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Telefono"
                          value={editData.telefono} onChange={(e) => setEditData({ ...editData, telefono: e.target.value })} />
                        <input className="border rounded px-2 py-1 text-sm" placeholder="WhatsApp / Celular"
                          value={editData.celular} onChange={(e) => setEditData({ ...editData, celular: e.target.value })} />
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Nombre contacto"
                          value={editData.contacto} onChange={(e) => setEditData({ ...editData, contacto: e.target.value })} />
                        <div className="col-span-2 flex gap-2 mt-1">
                          <button onClick={saveEdit} className="text-xs bg-black text-white px-3 py-1 rounded hover:bg-gray-800">Guardar</button>
                          <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-black">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600 space-y-0.5">
                        {client.contacto && <div>Contacto: {client.contacto}</div>}
                        {client.correo && (
                          <div className="flex items-center gap-2">
                            Correo: {client.correo}
                            <button onClick={(e) => { e.stopPropagation(); copyEmail(client.correo); }}
                              className="text-xs text-blue-600 hover:underline">
                              {copied === client.correo ? "Copiado" : "Copiar"}
                            </button>
                          </div>
                        )}
                        {client.telefono && <div>Tel: {client.telefono}</div>}
                        {client.celular && <div>Cel: {client.celular}</div>}
                        {!client.contacto && !client.correo && !client.telefono && !client.celular && (
                          <div className="text-gray-400 italic">Sin informacion de contacto</div>
                        )}
                      </div>
                    )}

                    {/* Action buttons: WhatsApp + Email + Mark contacted */}
                    {!isEditing && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); openWhatsApp(client); markContacted(client.nombre_normalized, "whatsapp"); }}
                          className="text-xs border border-green-600 text-green-700 px-3 py-1.5 rounded hover:bg-green-50 transition"
                        >
                          WhatsApp cobro
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEmail(client); markContacted(client.nombre_normalized, "email"); }}
                          className="text-xs border border-gray-400 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-100 transition"
                        >
                          Email cobro
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); markContacted(client.nombre_normalized, "llamada"); }}
                          className="text-xs border border-blue-400 text-blue-700 px-3 py-1.5 rounded hover:bg-blue-50 transition"
                        >
                          Marcar llamada
                        </button>
                      </div>
                    )}
                    {/* Last contact */}
                    {contactLog[client.nombre_normalized] && (
                      <div className="mt-2 text-[11px] text-gray-400">
                        Ultimo contacto: {new Date(contactLog[client.nombre_normalized].date).toLocaleDateString("es-PA")} via {contactLog[client.nombre_normalized].method}
                      </div>
                    )}
                  </div>

                  {/* Per-company breakdown */}
                  {(() => {
                    const visibleCompanies = companyFilter !== "all"
                      ? roleCompanies.filter((co) => co.key === companyFilter && client.companies[co.key])
                      : roleCompanies.filter((co) => client.companies[co.key]);
                    return visibleCompanies.length > 0 && (
                      <>
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                    {roleCompanies.length === 1 || companyFilter !== "all" ? "Detalle de aging" : "Desglose por empresa"}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase">
                        {roleCompanies.length > 1 && <th className="text-left py-1 font-medium">Empresa</th>}
                        <th className="text-left py-1 font-medium">Codigo</th>
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
                      {visibleCompanies.map((co) => {
                        const d = client.companies[co.key];
                        return (
                          <tr key={co.key} className="border-t border-gray-100">
                            {roleCompanies.length > 1 && <td className="py-1.5">{co.name}</td>}
                            <td className="py-1.5 text-gray-500">{d.codigo}</td>
                            <td className="text-right py-1.5">{fmt(d.d0_30)}</td>
                            <td className="text-right py-1.5">{fmt(d.d31_60)}</td>
                            <td className="text-right py-1.5">{fmt(d.d61_90)}</td>
                            <td className="text-right py-1.5 text-yellow-600">{fmt(d.d91_120)}</td>
                            <td className="text-right py-1.5 text-yellow-600">{fmt(d.d121_180)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.d181_270)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.d271_365)}</td>
                            <td className="text-right py-1.5 text-red-600">{fmt(d.mas_365)}</td>
                            <td className="text-right py-1.5 font-semibold">{fmt(d.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-gray-400 text-center">
        {filtered.length} clientes &middot; Politica: 0-90d corriente &middot; 91-120d vigilancia &middot; 121d+ vencido
      </div>
    </div>
  );
}

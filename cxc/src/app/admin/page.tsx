"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import { COMPANIES, getCompaniesForRole } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { normalizeName } from "@/lib/normalize";
import { VENDOR_MAP } from "@/lib/vendors";
import AppHeader from "@/components/AppHeader";
import { Toast } from "@/components/ui";
import UploadFreshness from "./components/UploadFreshness";
import KpiCards from "./components/KpiCards";
import CompanySummary from "./components/CompanySummary";
import ClientTable from "./components/ClientTable";
import { SkeletonRow } from "./components/Skeleton";
import { generatePDFResumen, generatePDFDetallado } from "@/lib/pdf-cxc";
import useAdminData from "./hooks/useAdminData";
import { exportConsolidado } from "@/lib/excel-cxc-consolidado";

// ── Helpers ──────────────────────────────────────────────

type RiskFilter = "all" | "current" | "watch" | "overdue";
type SortKey = "name" | "current" | "watch" | "overdue" | "total" | "follow_up";
type SortDir = "asc" | "desc";

function buildWhatsAppMsg(client: ConsolidatedClient) {
  const contactName = client.contacto || "cliente";
  const d91_plus = client.d91_120 + client.d121_plus;
  const lines = [
    `Estimado/a ${contactName},`,
    ``,
    `Le escribimos de Fashion Group para darle seguimiento a su cuenta por cobrar.`,
    ``,
    `Saldo pendiente: *$${fmt(client.total)}*`,
  ];
  if (d91_plus > 0) {
    lines.push(`Facturas vencidas: *$${fmt(d91_plus)}* (más de 90 días)`);
  }
  lines.push(``);
  lines.push(`Detalle por antigüedad:`);
  lines.push(`- 0-30 días: $${fmt(client.d0_30)}`);
  lines.push(`- 31-60 días: $${fmt(client.d31_60)}`);
  lines.push(`- 61-90 días: $${fmt(client.d61_90)}`);
  lines.push(`- 91+ días: $${fmt(d91_plus)}`);
  lines.push(``);
  lines.push(`Agradecemos su pronta gestión. Quedamos atentos.`);
  lines.push(`Fashion Group Panamá`);
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

// ── PDF generation (via jsPDF) ────────────────────

function exportCSV(data: ConsolidatedClient[], label?: string, riskLabel?: string, companyLabel?: string) {
  const date = new Date().toISOString().slice(0, 10);
  const meta = `"Reporte CXC Fashion Group — ${date}${companyLabel ? ` — ${companyLabel}` : ""}${riskLabel ? ` — ${riskLabel}` : ""} — ${data.length} registros"\n`;
  const header = "Cliente,0-30d,31-60d,61-90d,91-120d,121d+,Total,Estado,Correo,Telefono,Celular,Contacto\n";
  const rows = data.map((c) => {
    const estado = c.overdue > 0 ? "Vencido" : c.watch > 0 ? "Vigilancia" : "Corriente";
    return `"${c.nombre_normalized}",${(c.d0_30 ?? c.current).toFixed(2)},${(c.d31_60 ?? 0).toFixed(2)},${(c.d61_90 ?? 0).toFixed(2)},${(c.d91_120 ?? c.watch).toFixed(2)},${(c.d121_plus ?? c.overdue).toFixed(2)},${c.total.toFixed(2)},"${estado}","${c.correo}","${c.telefono}","${c.celular}","${c.contacto}"`;
  }).join("\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + meta + header + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = label ? `_${label.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}` : "";
  a.download = `CXC${suffix}_${date}.csv`;
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
  const { authChecked, role: userRole } = useAuth({ moduleKey: "cxc", allowedRoles: ["admin", "secretaria", "director"] });
  const { clients, uploads, contactLog, loading, loadError, loadData, setContactLog } = useAdminData();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  const [showExport, setShowExport] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cxc_favorites") || "[]")); } catch { return new Set(); }
  });

  function toggleFavorite(name: string) {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      localStorage.setItem("cxc_favorites", JSON.stringify([...next]));
      return next;
    });
  }

  const roleCompanies = useMemo(() => getCompaniesForRole(userRole), [userRole]);

  const CXC_RESTRICTED = ["fashion_wear", "fashion_shoes", "vistana", "active_wear", "active_shoes"];
  const cxcCompanies = useMemo(
    () => userRole === "director" ? roleCompanies : roleCompanies.filter(c => CXC_RESTRICTED.includes(c.key)),
    [userRole, roleCompanies]
  );

  // ── Filtering + sorting ──────────────────────────────

  const filtered = useMemo(() => {
    const roleKeys = new Set(cxcCompanies.map((c) => c.key));
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
      const qLower = search.toLowerCase();
      result = result.filter((c) =>
        c.nombre_normalized.includes(q) ||
        (c.correo && c.correo.toLowerCase().includes(qLower)) ||
        (c.telefono && c.telefono.includes(search)) ||
        (c.celular && c.celular.includes(search)) ||
        (c.contacto && c.contacto.toLowerCase().includes(qLower))
      );
    }

    result.sort((a, b) => {
      // Favorites always first
      const aFav = favorites.has(a.nombre_normalized) ? 0 : 1;
      const bFav = favorites.has(b.nombre_normalized) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;

      if (sortKey === "name") {
        const cmp = a.nombre_normalized.localeCompare(b.nombre_normalized, "es", { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortKey === "follow_up") {
        // Clients with overdue follow-up (date < today) first, then by date asc, then no date last
        const today = new Date().toISOString().slice(0, 10);
        const da = a.proximo_seguimiento || "";
        const db = b.proximo_seguimiento || "";
        const aOverdue = da && da < today;
        const bOverdue = db && db < today;
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        if (!da && db) return 1;
        if (da && !db) return -1;
        if (da !== db) return da < db ? -1 : 1;
        return a.nombre_normalized.localeCompare(b.nombre_normalized, "es", { sensitivity: "base" });
      }
      let va: number, vb: number;
      if (sortKey === "current") { va = a.current; vb = b.current; }
      else if (sortKey === "watch") { va = a.watch; vb = b.watch; }
      else if (sortKey === "overdue") { va = a.overdue; vb = b.overdue; }
      else { va = a.total; vb = b.total; }
      if (va !== vb) return sortDir === "asc" ? va - vb : vb - va;
      // Stable tiebreaker: sort by name when numeric values are equal
      return a.nombre_normalized.localeCompare(b.nombre_normalized, "es", { sensitivity: "base" });
    });

    return result;
  }, [clients, cxcCompanies, companyFilter, riskFilter, search, sortKey, sortDir, favorites]);

  // ── Role-filtered clients ──
  const roleClients = useMemo(() => {
    const roleKeys = new Set(cxcCompanies.map((c) => c.key));
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
  }, [clients, cxcCompanies]);

  useEffect(() => {
    if (!authChecked) return;
    loadData();
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearch(q);
  }, [authChecked, loadData]);

  if (!authChecked) return null;

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

  // ── Actions ──────────────────────────────────────────

  function openWhatsApp(client: ConsolidatedClient) {
    let phone = (client.celular || client.telefono).replace(/[^0-9]/g, "");
    if (!phone) { showToast("No hay WhatsApp registrado para este cliente"); return; }
    if (!phone.startsWith("507") && phone.length <= 8) {
      phone = "507" + phone;
    }
    const msg = encodeURIComponent(buildWhatsAppMsg(client));
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }

  function copyCollectionMsg(client: ConsolidatedClient) {
    const msg = buildWhatsAppMsg(client);
    navigator.clipboard.writeText(msg).then(() => {
      showToast("Mensaje copiado al portapapeles");
    }).catch(() => {
      showToast("Error al copiar");
    });
  }

  function sendVendorWhatsApp(companyKey: string) {
    const co = cxcCompanies.find((c) => c.key === companyKey);
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

  async function handleRegisterContact(clientName: string, data: { resultado_contacto: string; proximo_seguimiento: string; metodo: string }) {
    // Save resultado + proximo_seguimiento to cxc_client_overrides (merge with existing contact fields)
    const existingClient = clients.find((c) => c.nombre_normalized === clientName);
    await supabase.from("cxc_client_overrides").upsert(
      {
        nombre_normalized: clientName,
        correo: existingClient?.correo || "",
        telefono: existingClient?.telefono || "",
        celular: existingClient?.celular || "",
        contacto: existingClient?.contacto || "",
        resultado_contacto: data.resultado_contacto,
        proximo_seguimiento: data.proximo_seguimiento || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "nombre_normalized" }
    );
    // Also log the contact in cxc_contact_log
    await markContacted(clientName, data.metodo.toLowerCase());
    loadData();
  }

  function buildExportSubtitle() {
    const parts: string[] = [];
    if (riskFilter !== "all") {
      const labels: Record<string, string> = { current: "Corriente", watch: "Vigilancia", overdue: "Vencido" };
      parts.push(labels[riskFilter] || "");
    }
    if (companyFilter !== "all") {
      const co = COMPANIES.find((c) => c.key === companyFilter);
      if (co) parts.push(co.name);
    }
    return parts.length > 0 ? parts.join(" — ") : undefined;
  }

  // ── Render ────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-500 text-sm">{loadError}</p>
        <button onClick={loadData} className="text-sm bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800">Reintentar</button>
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
      <div className="flex justify-end items-center gap-3 mb-6">
          <button
            onClick={() => (window.location.href = "/upload?tab=cxc")}
            className="text-sm border border-gray-200 text-gray-700 px-5 py-2 rounded-md font-medium hover:bg-gray-50 transition flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Cargar archivo
          </button>
          <button
            onClick={() => exportConsolidado(roleClients, cxcCompanies)}
            className="text-sm border border-gray-200 text-gray-700 px-5 py-2 rounded-md font-medium hover:bg-gray-50 transition flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Consolidado
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="text-sm bg-black text-white px-5 py-2 rounded-md font-medium hover:bg-gray-800 transition flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar
            </button>
            {showExport && (<>
              <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
              <div className="absolute right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-72 py-1">
                <div className="px-3 py-2 border-b border-gray-200">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Se exportaran {filtered.length} clientes</p>
                </div>
                <button
                  onClick={() => {
                    const riskL = riskFilter === "all" ? "" : riskFilter === "current" ? "corriente" : riskFilter === "watch" ? "vigilancia" : "vencido";
                    const coL = companyFilter !== "all" ? COMPANIES.find((c) => c.key === companyFilter)?.name || "" : "";
                    const riskLabel = riskFilter === "all" ? "" : riskFilter === "current" ? "Corriente" : riskFilter === "watch" ? "Vigilancia" : "Vencido";
                    exportCSV(filtered, [riskL, coL].filter(Boolean).join("_") || undefined, riskLabel || undefined, coL || undefined);
                    setShowExport(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition flex items-start gap-3"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <div>
                    <div className="text-sm font-medium text-gray-800">CSV (Excel)</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Hoja de calculo con aging detallado</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    const sub = buildExportSubtitle();
                    generatePDFResumen(filtered, sub);
                    setShowExport(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition flex items-start gap-3"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><rect x="6" y="3" width="12" height="18" rx="1"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
                  <div>
                    <div className="text-sm font-medium text-gray-800">PDF Resumen</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Vista general, listo para imprimir</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    const sub = buildExportSubtitle();
                    generatePDFDetallado(filtered, cxcCompanies, sub);
                    setShowExport(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition flex items-start gap-3"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>
                  <div>
                    <div className="text-sm font-medium text-gray-800">PDF Detallado</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Desglose completo por empresa y aging</div>
                  </div>
                </button>
              </div>
            </>)}
          </div>
      </div>

      <UploadFreshness roleCompanies={cxcCompanies} uploads={uploads} />

      <KpiCards roleClients={roleClients} onFilterOverdue={() => setRiskFilter("overdue")} />

      <CompanySummary
        roleCompanies={cxcCompanies}
        roleClients={roleClients}
        companyFilter={companyFilter}
        clients={clients}
        vendorMap={VENDOR_MAP}
        onSendVendorWhatsApp={sendVendorWhatsApp}
      />

      <ClientTable
        filtered={filtered}
        roleCompanies={cxcCompanies}
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
        onCopyCollectionMsg={copyCollectionMsg}
        onOpenEmail={openEmail}
        onMarkContacted={markContacted}
        onSaveEdit={handleSaveEdit}
        onRegisterContact={handleRegisterContact}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />

      <Toast message={toast} />
    </div>
    </div>
  );
}

"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt } from "@/lib/format";
import { csvBlob, buildCsv } from "@/lib/csv-export";
import { waHref } from "@/lib/contact-links";
import { COMPANIES, B2B_COMPANIES } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { normalizeName } from "@/lib/normalize";
import AppHeader from "@/components/AppHeader";
import FreshnessChip from "@/components/FreshnessChip";
import { Toast, PullToRefresh } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import KpiCards from "./components/KpiCards";
import AgingLegend from "./components/AgingLegend";
import ClientTable from "./components/ClientTable";
import { SkeletonRow } from "./components/Skeleton";
import PanelCxcMobile from "./components/PanelCxcMobile";
import useAdminData from "./hooks/useAdminData";
import SyncStatus from "@/components/shared/SyncStatus";
import {
  SWITCH_ESTADOCUENTA_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { useSmartSuggestions, type SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { useLastUsed } from "@/lib/hooks/useLastUsed";

// ── Helpers ──────────────────────────────────────────────

type RiskFilter = "all" | "current" | "watch" | "overdue";
type SortKey = "name" | "current" | "watch" | "overdue" | "total";
type SortDir = "asc" | "desc";

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
  if (client.current > 0) lines.push(`Por vencer (0-90d): $${fmt(client.current)}`);
  if (client.watch > 0) lines.push(`Vencido reciente (91-120d): $${fmt(client.watch)}`);
  if (client.overdue > 0) lines.push(`VENCIDO CRITICO (+120d): $${fmt(client.overdue)}`);
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
  const meta = `Reporte CXC Fashion Group — ${date}${companyLabel ? ` — ${companyLabel}` : ""}${riskLabel ? ` — ${riskLabel}` : ""} — ${data.length} registros`;
  const header = ["Cliente", "0-30d", "31-60d", "61-90d", "91-120d", "121d+", "Total", "Estado", "Correo", "Telefono", "Celular", "Contacto"];
  const rows = data.map((c) => {
    const estado = c.overdue > 0 ? "Vencido crítico" : c.watch > 0 ? "Vencido reciente" : "Por vencer";
    return [
      c.nombre_normalized,
      (c.d0_30 ?? c.current).toFixed(2),
      (c.d31_60 ?? 0).toFixed(2),
      (c.d61_90 ?? 0).toFixed(2),
      (c.d91_120 ?? c.watch).toFixed(2),
      (c.d121_plus ?? c.overdue).toFixed(2),
      c.total.toFixed(2),
      estado,
      c.correo,
      c.telefono,
      c.celular,
      c.contacto,
    ];
  });
  const blob = csvBlob(buildCsv([[meta], header, ...rows], ","));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = label ? `_${label.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}` : "";
  a.download = `CXC${suffix}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ───────────────────────────────────────

export default function AdminDashboard() {
  return (
    <Suspense>
      <AdminDashboardInner />
    </Suspense>
  );
}

function AdminDashboardInner() {
  const { authChecked, role: userRole } = useAuth({ moduleKey: "cxc", allowedRoles: ["admin", "secretaria", "vendedor"] });
  const { clients, uploads, contactLog, loading, loadError, loadData, setContactLog, dataTs, fromCache } = useAdminData(authChecked);
  usePersistedScroll("cxc", !loading && clients.length > 0);
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  // riskFilter vive en la URL (?risk=) → compartible y sobrevive refresh.
  const [riskFilter, setRiskFilter] = useUrlState<RiskFilter>("risk", "all");

  // Per-user empresa restriction (e.g. Edwin only sees Vistana International)
  const [empresaRestriction, setEmpresaRestriction] = useState<string | null>(null);
  useEffect(() => {
    const ef = sessionStorage.getItem("fg_empresa_filter");
    if (ef) setEmpresaRestriction(ef);
  }, []);
  // Filtro de empresa: la URL (?empresa=) MANDA si está presente (compartible /
  // sobrevive refresh); si no, cae a la memoria de useLastUsed (D3,
  // fg_last_cxc_empresa). Al cambiarlo se escribe en AMBOS. La restricción por
  // usuario tiene prioridad absoluta (Edwin → Vistana), incluso sobre la URL.
  const [urlEmpresa, setUrlEmpresa] = useUrlState("empresa", "all");
  const [lastEmpresa, setLastEmpresa] = useLastUsed("cxc_empresa", "all");
  const empresaParamPresent = searchParams.get("empresa") !== null;
  const companyFilter = empresaRestriction
    ? empresaRestriction
    : (empresaParamPresent ? urlEmpresa : lastEmpresa);
  const setCompanyFilter = useCallback((next: string) => {
    setUrlEmpresa(next);   // fuente compartible
    setLastEmpresa(next);  // memoria fallback para próxima visita sin URL
  }, [setUrlEmpresa, setLastEmpresa]);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [toast, setToast] = useState<string | null>(null);
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  const [showExport, setShowExport] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cxc_favorites") || "[]")); } catch { return new Set(); }
  });

  // Load favorites from DB (overrides localStorage on success)
  useEffect(() => {
    if (!authChecked) return;
    fetch("/api/cxc/favorites")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: { favorites: string[] }) => {
        const dbSet = new Set(data.favorites);
        setFavorites(dbSet);
        localStorage.setItem("cxc_favorites", JSON.stringify(data.favorites));
      })
      .catch(() => {
        // Fallback: keep localStorage value (already loaded in useState)
      });
  }, [authChecked]);

  function toggleFavorite(name: string) {
    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      localStorage.setItem("cxc_favorites", JSON.stringify([...next]));
      return next;
    });
    // Persist to DB
    fetch("/api/cxc/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName: name }),
    }).then(res => {
      if (!res.ok) throw new Error("Server error");
    }).catch(() => {
      // Revert optimistic update
      setFavorites(prev => {
        const reverted = new Set(prev);
        if (reverted.has(name)) reverted.delete(name); else reverted.add(name);
        localStorage.setItem("cxc_favorites", JSON.stringify([...reverted]));
        return reverted;
      });
      showToast("Error al guardar favorito");
    });
  }

  // CXC sólo aplica a las 6 empresas B2B (Boston y American Classic son retail
  // sin código D-XXX, no tienen detallessaldos). B2B_COMPANIES es la lista
  // canónica desde lib/empresa-mapping.ts — incluye joystep.
  const cxcCompanies = useMemo(() => {
    if (empresaRestriction) return B2B_COMPANIES.filter(c => c.key === empresaRestriction);
    return B2B_COMPANIES;
  }, [empresaRestriction]);

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
      .filter((c): c is ConsolidatedClient => c !== null && c.total !== 0);

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

    if (riskFilter === "current") result = result.filter((c) => c.total > 0 && c.overdue === 0 && c.watch === 0);
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

      // Negative totals (credit) always last
      const aNeg = a.total < 0 ? 1 : 0;
      const bNeg = b.total < 0 ? 1 : 0;
      if (aNeg !== bNeg) return aNeg - bNeg;

      if (sortKey === "name") {
        const cmp = a.nombre_normalized.localeCompare(b.nombre_normalized, "es", { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
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
      .filter((c): c is ConsolidatedClient => c !== null && c.total !== 0);
  }, [clients, cxcCompanies]);

  // ── Clients para el resumen de buckets (KPIs) ──
  // Reacciona al filtro de empresa: con "Todas" usa el total global (roleClients);
  // con una empresa seleccionada recalcula los buckets sólo para esa empresa.
  const kpiClients = useMemo(() => {
    if (companyFilter === "all") return roleClients;
    return roleClients
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
      })
      .filter((c) => c.total !== 0);
  }, [roleClients, companyFilter]);

  useEffect(() => {
    if (!authChecked) return;
    // El fetch inicial lo dispara SWR al activarse su clave (authChecked); aquí
    // solo levantamos el ?search de la URL.
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearch(q);
  }, [authChecked]);

  // Hook still called to maintain hook order, but SuggestionCard removed from render
  const cxcSuggestions = useMemo<SmartSuggestion[]>(() => [], []);
  useSmartSuggestions(cxcSuggestions);

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

  function openEmail(client: ConsolidatedClient) {
    if (!client.correo) { showToast("Este cliente no tiene correo registrado. Edite el contacto primero."); return; }
    const subject = encodeURIComponent(buildEmailSubject(client));
    const body = encodeURIComponent(buildEmailBody(client));
    window.open(`mailto:${client.correo}?subject=${subject}&body=${body}`, "_blank");
  }

  // WhatsApp al celular (o teléfono) del cliente con el estado de cuenta
  // prellenado. Los usuarios cobran por WhatsApp — mailto: solo no alcanza.
  function openWhatsApp(client: ConsolidatedClient) {
    const href = waHref(client.celular || client.telefono, buildEmailBody(client));
    if (!href) { showToast("Este cliente no tiene teléfono registrado. Edite el contacto primero."); return; }
    window.open(href, "_blank");
  }

  // Copia el mensaje de cobro al portapapeles (para pegar donde sea).
  function copyMessage(client: ConsolidatedClient) {
    navigator.clipboard.writeText(`${buildEmailSubject(client)}\n\n${buildEmailBody(client)}`)
      .then(() => showToast("Mensaje copiado — pégalo en WhatsApp o correo"))
      .catch(() => showToast("No se pudo copiar. Intenta de nuevo."));
  }

  function handleQuickMarkContacted(clientName: string, method: string) {
    const prevEntry = contactLog[clientName];
    const now = new Date().toISOString();
    const methodLabel: Record<string, string> = {
      email: "Email", llamada: "Llamada", visita: "Visita",
    };

    // Optimistic: badge transita a "0d" inmediatamente
    setContactLog((prev) => ({ ...prev, [clientName]: { date: now, method } }));

    scheduleAction({
      id: `contact-${clientName}-${now}`,
      message: `Contacto registrado vía ${methodLabel[method] ?? method}`,
      execute: async () => {
        const res = await fetch("/api/cxc/contact-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre_normalized: clientName, method }),
        });
        if (!res.ok) {
          showToast("No se pudo registrar el contacto. Intenta de nuevo.");
          throw new Error("contact-log POST failed");
        }
        // Invalidar la caché SWR tras la escritura → el último contacto del
        // server reemplaza al optimista al toque (mutate).
        loadData();
      },
      onRevert: () => {
        setContactLog((prev) => {
          const next = { ...prev };
          if (prevEntry) next[clientName] = prevEntry;
          else delete next[clientName];
          return next;
        });
      },
    });
  }

  async function handleSaveEdit(nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) {
    const res = await fetch("/api/cxc/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre_normalized: nombre, ...data }),
    });
    if (!res.ok) {
      showToast("Error al guardar contacto");
      return;
    }
    showToast("Contacto actualizado");
    loadData();

    // Sync to directorio
    try {
      await fetch(`/api/directorio/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_normalized: nombre, ...data }),
      });
    } catch (err) { console.error('Directorio sync error:', err); }
  }

  function buildExportSubtitle() {
    const parts: string[] = [];
    if (riskFilter !== "all") {
      const labels: Record<string, string> = { current: "Por vencer", watch: "Vencido reciente", overdue: "Vencido crítico" };
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
        <button onClick={loadData} className="text-sm bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 active:scale-[0.97] transition-all">Reintentar</button>
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

  const canExport = userRole === "admin" || userRole === "secretaria";

  // Mobile actions — wired al mismo handler que usa el dropdown del desktop.
  // Inline para evitar prop drilling de COMPANIES + import dinámicos.
  const handleMobileExportCsv = () => {
    const riskL = riskFilter === "all" ? "" : riskFilter === "current" ? "por-vencer" : riskFilter === "watch" ? "vencido-reciente" : "vencido-critico";
    const coL = companyFilter !== "all" ? COMPANIES.find((c) => c.key === companyFilter)?.name || "" : "";
    const riskLabel = riskFilter === "all" ? "" : riskFilter === "current" ? "Por vencer" : riskFilter === "watch" ? "Vencido reciente" : "Vencido crítico";
    exportCSV(filtered, [riskL, coL].filter(Boolean).join("_") || undefined, riskLabel || undefined, coL || undefined);
  };

  return (
    <PullToRefresh onRefresh={loadData}>
    <div>
      <AppHeader module="Panel CXC" />

      {dataTs != null && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 flex justify-end">
          <FreshnessChip ts={dataTs} fromCache={fromCache} financial />
        </div>
      )}

      <PanelCxcMobile
        filtered={filtered}
        roleClients={kpiClients}
        cxcCompanies={cxcCompanies}
        search={search}
        setSearch={setSearch}
        riskFilter={riskFilter}
        setRiskFilter={setRiskFilter}
        companyFilter={companyFilter}
        setCompanyFilter={setCompanyFilter}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        contactLog={contactLog}
        onQuickMarkContacted={handleQuickMarkContacted}
        onOpenEmail={openEmail}
        onWhatsApp={openWhatsApp}
        onCopyMessage={copyMessage}
        canExport={canExport}
        onExportarCsv={handleMobileExportCsv}
        empresaRestriction={empresaRestriction}
      />

      <div className="hidden md:block max-w-6xl mx-auto px-6 py-8">

      {/* Sync status — MAX(synced_at) por empresa del cron switch-sync, con
          warning si alguna empresa lleva >26h sin actualizar. */}
      <div className="mb-4">
        <SyncStatus
          tabla="estadocuenta"
          empresasEsperadas={SWITCH_ESTADOCUENTA_EMPRESA_KEYS}
          empresaLabels={EMPRESA_KEY_TO_NAME}
        />
      </div>

      {/* Export buttons — admin/secretaria only */}
      {canExport && (
        <div className="flex justify-end items-center gap-2 sm:gap-3 mb-6 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="text-sm bg-black text-white px-4 sm:px-5 rounded-lg font-medium hover:bg-gray-800 active:scale-[0.97] transition-all flex items-center gap-2 min-h-[44px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar
            </button>
            {showExport && (<>
              <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
              <div className="absolute right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-72 py-1">
                <div className="px-3 py-2 border-b border-gray-200">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Se exportaran {filtered.length} clientes</p>
                </div>
                <button
                  onClick={() => {
                    const riskL = riskFilter === "all" ? "" : riskFilter === "current" ? "por-vencer" : riskFilter === "watch" ? "vencido-reciente" : "vencido-critico";
                    const coL = companyFilter !== "all" ? COMPANIES.find((c) => c.key === companyFilter)?.name || "" : "";
                    const riskLabel = riskFilter === "all" ? "" : riskFilter === "current" ? "Por vencer" : riskFilter === "watch" ? "Vencido reciente" : "Vencido crítico";
                    exportCSV(filtered, [riskL, coL].filter(Boolean).join("_") || undefined, riskLabel || undefined, coL || undefined);
                    setShowExport(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition flex items-start gap-3"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <div>
                    <div className="text-sm font-medium text-gray-800">CSV (Excel)</div>
                    <div className="text-xs text-gray-400 mt-0.5">Hoja de calculo con aging detallado</div>
                  </div>
                </button>
                <button
                  onClick={async () => {
                    const sub = buildExportSubtitle();
                    const { generatePDFResumen } = await import("@/lib/pdf-cxc");
                    generatePDFResumen(filtered, sub);
                    setShowExport(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition flex items-start gap-3"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><rect x="6" y="3" width="12" height="18" rx="1"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
                  <div>
                    <div className="text-sm font-medium text-gray-800">PDF Resumen</div>
                    <div className="text-xs text-gray-400 mt-0.5">Vista general, listo para imprimir</div>
                  </div>
                </button>
                <button
                  onClick={async () => {
                    const sub = buildExportSubtitle();
                    const { generatePDFDetallado } = await import("@/lib/pdf-cxc");
                    generatePDFDetallado(filtered, cxcCompanies, sub);
                    setShowExport(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition flex items-start gap-3"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>
                  <div>
                    <div className="text-sm font-medium text-gray-800">PDF Detallado</div>
                    <div className="text-xs text-gray-400 mt-0.5">Desglose completo por empresa y aging</div>
                  </div>
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Smart empty state: no CXC data loaded */}
      {!loading && roleClients.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center mb-8">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-200 mb-4">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
          <p className="text-sm font-medium text-gray-500 mb-1">No hay datos de cartera cargados</p>
          <p className="text-xs text-gray-400 mb-4 max-w-xs">Los datos de cartera se sincronizan automáticamente desde Switch.</p>
          {/* Botón "Importar archivo de cartera" → /upload OCULTO: upload manual
              de CSV deprecado (el sync de Switch cubre la carga). La página
              /upload sigue viva y accesible por URL directa. */}
        </div>
      )}

      {/* Search input — above KPIs */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente, teléfono, email…"
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Clickable KPI chips = risk filter */}
      <KpiCards roleClients={kpiClients} riskFilter={riskFilter} onRiskFilterChange={setRiskFilter} />

      {/* Leyenda / clave de colores del aging, arriba de la lista */}
      <AgingLegend />

      <ClientTable
        filtered={filtered}
        roleCompanies={cxcCompanies}
        roleClients={kpiClients}
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
        contactLog={contactLog}
        onOpenEmail={openEmail}
        onSaveEdit={handleSaveEdit}
        onQuickMarkContacted={handleQuickMarkContacted}
        onWhatsApp={openWhatsApp}
        onCopyMessage={copyMessage}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        hideSearchAndRiskFilters
      />
      </div>

      <Toast message={toast} />
      {pendingUndo && (
        <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />
      )}
    </div>
    </PullToRefresh>
  );
}

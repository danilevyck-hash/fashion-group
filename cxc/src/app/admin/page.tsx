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
import { Toast, PullToRefresh } from "@/components/ui";
import BostonTab from "@/components/cxc/BostonTab";
import KpiCards from "./components/KpiCards";
import ClientTable from "./components/ClientTable";
import { SkeletonRow } from "./components/Skeleton";
import PanelCxcMobile from "./components/PanelCxcMobile";
import TabsCartera from "./components/TabsCartera";
import EstadoCuentaDrawer from "./components/EstadoCuentaDrawer";
import EnviarEmailModal from "./components/EnviarEmailModal";
import useAdminData from "./hooks/useAdminData";
import { CARTERA_GRUPO } from "@/lib/cxc/cartera";
import { tabCxcPermitida } from "@/lib/cxc/boston-roles";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import {
  CXC_GRUPO_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
} from "@/lib/empresa-mapping";
import { useSmartSuggestions, type SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import { usePersistedScroll } from "@/lib/hooks/usePersistedState";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import {
  ordenEfectivo,
  ordenAlTocarTitulo,
  siguienteRiskFilter,
  pasaFiltroRiesgo,
  compararClientes,
  type RiskFilter,
  type SortKey,
  type OrdenOverride,
} from "@/lib/cxc-orden";

// ── Helpers ──────────────────────────────────────────────

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
  // 🔴 ESTE TEXTO LO LEE EL CLIENTE (botones "WhatsApp" y "Copiar mensaje" del
  // menú "···"), así que le rige la MISMA regla que al correo
  // de estado de cuenta: **la palabra "vencido"/"vencida" está PROHIBIDA**
  // (ver el encabezado de `lib/cxc/estado-cuenta-email.ts`).
  //
  // 🩸 Decía, en mayúsculas y al cliente, `VENCIDO CRITICO (+120d)`. Y no es
  // solo tono: `dias` es la EDAD del documento desde su emisión, NO días de
  // mora — no sabemos el plazo de crédito de cada factura, así que llamar
  // "vencido" a un documento de 121 días es afirmar algo que el dato no dice.
  // Se rotula por ANTIGÜEDAD, exactamente como la columna "Más de 90 días" del
  // correo aprobado.
  //
  // ⚠️ LOS TRAMOS Y LAS CIFRAS NO CAMBIAN: siguen siendo current / watch /
  // overdue (0-90 · 91-120 · 121+), los mismos campos que suma la pantalla.
  if (client.current > 0) lines.push(`Hasta 90 días: $${fmt(client.current)}`);
  if (client.watch > 0) lines.push(`De 91 a 120 días: $${fmt(client.watch)}`);
  if (client.overdue > 0) lines.push(`Más de 120 días: $${fmt(client.overdue)}`);
  lines.push(`Total: $${fmt(client.total)}`);
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
  // "Cuentas por Cobrar", no "Reporte CXC": mismo criterio que el PDF — es como
  // se llama la pantalla, y "CXC" es jerga. (El NOMBRE del archivo se deja como
  // está: Daniel ya tiene esos CSV archivados con ese prefijo.)
  const meta = `Cuentas por Cobrar · Fashion Group — ${date}${companyLabel ? ` — ${companyLabel}` : ""}${riskLabel ? ` — ${riskLabel}` : ""} — ${data.length} registros`;
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
  // `uploads` (la lista de cargas de archivo) se dejó de pedir: se desestructuraba
  // acá y no lo leía ninguna línea de la pantalla. Ver `useAdminData`.
  const { clients, loading, loadError, loadData } = useAdminData(authChecked);
  usePersistedScroll("cxc", !loading && clients.length > 0);
  const searchParams = useSearchParams();
  // Pestaña activa. Las dos carteras NUNCA se ven juntas: son dos consultas a
  // dos vistas disjuntas (switch_estadocuenta_aging / _boston), así que no hay
  // ninguna pantalla donde los saldos del grupo y los de Boston puedan sumarse.
  // Vive en la URL (?tab=boston) para que refresh y compartir-link conserven la
  // vista. Tab del MISMO nivel → replace (default de useUrlState): el Atrás del
  // navegador no cicla por pestañas, sale de la página (convención del sistema).
  //
  // 🔴 El permiso lo decide `lib/cxc/boston-roles.ts`, el MISMO que usa el
  // endpoint: quien no puede leer la cartera de Boston tampoco puede quedarse
  // parado en su pestaña por un link con `?tab=boston`.
  const [tabRaw, setTab] = useUrlState<"grupo" | "boston">("tab", "grupo");
  const tab = tabCxcPermitida(tabRaw, userRole);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  // riskFilter vive en la URL (?risk=) → compartible y sobrevive refresh.
  const [riskFilter, setRiskFilter] = useUrlState<RiskFilter>("risk", "all");
  // Tocar una píldora de tramo FILTRA y ORDENA por ese tramo en una sola acción,
  // y tocar la que ya está activa la apaga. Toda la regla vive en lib/cxc-orden.
  const handleRiskFilterChange = useCallback((tocada: RiskFilter) => {
    setRiskFilter(siguienteRiskFilter(riskFilter, tocada));
  }, [riskFilter, setRiskFilter]);

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
  // El orden se DERIVA del tramo activo. El clic en el título de una columna es
  // un override anclado a ese tramo: sirve para ordenar sin filtrar, y al cambiar
  // de píldora deja de aplicar solo. Así encabezado y píldora nunca se contradicen.
  const [ordenOverride, setOrdenOverride] = useState<OrdenOverride | null>(null);
  const orden = ordenEfectivo(riskFilter, ordenOverride);
  const { key: sortKey, dir: sortDir } = orden;
  const [toast, setToast] = useState<string | null>(null);
  const [estadoClient, setEstadoClient] = useState<ConsolidatedClient | null>(null);
  const openEstadoCuenta = useCallback((client: ConsolidatedClient) => setEstadoClient(client), []);
  const [emailClient, setEmailClient] = useState<ConsolidatedClient | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  const [showExport, setShowExport] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cxc_favorites") || "[]")); } catch { return new Set(); }
  });

  // Load favorites from DB (overrides localStorage on success)
  useEffect(() => {
    if (!authChecked) return;
    fetch(`/api/cxc/favorites?cartera=${CARTERA_GRUPO}`)
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
      body: JSON.stringify({ clientName: name, cartera: CARTERA_GRUPO }),
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

    if (riskFilter !== "all") result = result.filter((c) => pasaFiltroRiesgo(c, riskFilter));

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

    result.sort((a, b) => compararClientes(a, b, {
      orden: { key: sortKey, dir: sortDir },
      esFavorito: (nombre) => favorites.has(nombre),
    }));

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
    setOrdenOverride({ risk: riskFilter, ...ordenAlTocarTitulo(orden, key) });
  }

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  // ── Actions ──────────────────────────────────────────

  // Envío real desde el sistema (Resend) con estado de cuenta multi-empresa
  // adjunto. Reemplaza al viejo mailto:. El modal resuelve el destinatario y
  // permite editarlo, así que ya no exigimos client.correo acá.
  function openEmail(client: ConsolidatedClient) {
    setEmailClient(client);
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

  // 🔴 EL SEGUIMIENTO DE COBRO NO EXISTE EN ESTE MÓDULO (Daniel, 14-ago-2026,
  // textual: *"sobre darle seguimiento no es algo que quiero para ese módulo,
  // llamo al cliente por fuera y ya"*). Acá vivía `handleQuickMarkContacted`,
  // que escribía en `cxc_contact_log` desde las opciones "Ya contacté ·
  // Llamada/Visita" del menú "···" — y lo escrito no se pintaba en NINGUNA
  // parte: `contactLog` llegaba como prop a la tabla y a la tarjeta del celular
  // y no se desestructuraba en ninguna de las dos. Medido: la tabla tiene 141
  // filas, todas entre el 22-mar y el 16-abr-2026, cero en los últimos 90 días.
  // La tabla y sus filas QUEDAN (son historia y no molestan); lo que se retiró
  // es el camino que las escribía sin que nadie las leyera.

  // 🔴 EL GUARDADO DE CONTACTO SE RETIRÓ DE ACÁ (24-ago-2026). `handleSaveEdit`
  // escribía en `cxc_client_overrides` y sincronizaba el directorio, y **no lo
  // llamaba nadie**: la edición de contacto vive en la ficha del cliente
  // (`/clientes/[codigo]`) desde que se retiró el formulario de `ContactPanel`.
  // Lo que quedaba era el camino de escritura sin ninguna puerta que lo abriera.
  //
  // ⚠️ La tabla `cxc_client_overrides` NO se toca y se sigue LEYENDO en
  // `useAdminData` (un override guardado antes le sigue ganando al maestro).

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
      <AppHeader module="Cuentas por Cobrar" />

      <TabsCartera role={userRole} tab={tab} onTab={setTab} />

      {tab === "boston" ? (
        <div className="max-w-6xl mx-auto px-4 py-4 pb-16">
          <BostonTab />
        </div>
      ) : (
      <>

      <PanelCxcMobile
        filtered={filtered}
        roleClients={kpiClients}
        cxcCompanies={cxcCompanies}
        search={search}
        setSearch={setSearch}
        riskFilter={riskFilter}
        setRiskFilter={handleRiskFilterChange}
        companyFilter={companyFilter}
        setCompanyFilter={setCompanyFilter}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onOpenEmail={openEmail}
        onWhatsApp={openWhatsApp}
        onCopyMessage={copyMessage}
        onOpenEstado={openEstadoCuenta}
        canExport={canExport}
        onExportarCsv={handleMobileExportCsv}
        empresaRestriction={empresaRestriction}
        onSyncedNow={() => loadData()}
      />

      <div className="hidden md:block max-w-6xl mx-auto px-6 py-8">

      {/* Sync status — MAX(synced_at) por empresa del cron switch-sync, con
          warning si alguna empresa lleva >26h sin actualizar. El botón
          "Actualizar ahora" (admin/secretaria) dispara estadocuenta de la
          empresa seleccionada en el filtro; con "Todas" queda deshabilitado. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SyncStatus
          tabla="estadocuenta"
          empresasEsperadas={CXC_GRUPO_EMPRESA_KEYS}
          empresaLabels={EMPRESA_KEY_TO_NAME}
        />
        <SyncNowButton
          opciones={[{ modulo: "estadocuenta", empresa: companyFilter }]}
          disabledReason={companyFilter === "all" ? "Elige una empresa en el filtro para actualizarla" : null}
          onSuccess={() => loadData()}
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
              {/* El alcance del export ya está dicho arriba de la tabla
                  ("{N} de {M} clientes"): repetirlo acá era el MISMO número dos
                  veces en la misma pantalla. */}
              <div className="absolute right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-72 py-1">
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
                    {/* "aging" era jerga en inglés en el menú que describe el
                        papel. Se dice lo que trae el archivo. */}
                    <div className="text-xs text-gray-400 mt-0.5">Hoja de cálculo con el detalle por tramo de días</div>
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
                    <div className="text-xs text-gray-400 mt-0.5">Desglose completo por empresa y tramo de días</div>
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
      <KpiCards roleClients={kpiClients} riskFilter={riskFilter} onRiskFilterChange={handleRiskFilterChange} />

      <ClientTable
        filtered={filtered}
        roleCompanies={cxcCompanies}
        roleClients={kpiClients}
        companyFilter={companyFilter}
        setCompanyFilter={setCompanyFilter}
        riskFilter={riskFilter}
        search={search}
        sortKey={sortKey}
        sortDir={sortDir}
        toggleSort={toggleSort}
        sortArrow={sortArrow}
        userRole={userRole}
        onOpenEmail={openEmail}
        onWhatsApp={openWhatsApp}
        onCopyMessage={copyMessage}
        onOpenEstado={openEstadoCuenta}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />
      </div>
      </>
      )}

      <EstadoCuentaDrawer
        client={estadoClient}
        companyFilter={companyFilter}
        onClose={() => setEstadoClient(null)}
      />

      <EnviarEmailModal
        client={emailClient}
        companyFilter={companyFilter}
        onClose={() => setEmailClient(null)}
        onSent={showToast}
      />

      <Toast message={toast} />
    </div>
    </PullToRefresh>
  );
}

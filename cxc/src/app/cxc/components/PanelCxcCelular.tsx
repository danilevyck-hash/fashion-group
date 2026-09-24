"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS POR COBRAR EN EL CELULAR — «LA LISTA ES LA CARTERA» (24-sep-2026).
//
// Un número, tres chips, un buscador y la lista. Dos renglones por cliente:
// el nombre y lo que urge; el monto EXACTO a la derecha; la rayita de color
// dice dónde está su plata. Tocar la fila abre la hoja «Cobrar» de siempre:
// cobrar son DOS toques.
//
// El porqué —y las mediciones de lo que reemplaza— viven en
// `lib/cxc/celular.ts`; las reglas puras (orden, «lo que urge», la rayita, la
// cartera por empresa), en `lib/cxc/lista-celular.ts`.
//
// 🔴 ACÁ NO SE SUMA NADA NUEVO. Los totales llegan de `roleClients` (los mismos
// `kpiClients` de la computadora) y las filas de `filtered` (la misma lista
// filtrada). Lo único que este archivo decide es el ORDEN de la lista, y lo
// decide con `ordenDelCelular`, que es `ordenParaRiskFilter` — la regla que ya
// rige las píldoras del escritorio desde el 27-jul-2026.
//
// 🔴 La pantalla de antes (`PanelCxcMobile`) NO se tocó: es lo que se dibuja
// con `CXC_CELULAR` en `false`, y conserva todos sus candados.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import { formatCompactCurrency } from "@/lib/ventas/format";
import { AGING_ORDER, type AgingKey } from "@/lib/cxc-aging";
import { ordenarClientes, type RiskFilter } from "@/lib/cxc-orden";
import { nombreDeCliente } from "@/lib/cxc/nombre-cliente";
import { seLeCobra } from "@/lib/cxc/cobrable";
import {
  chipCorto,
  loQueUrge,
  montoExacto,
  ordenDelCelular,
  subtituloDeLaPortada,
  totalDeLaPortada,
  tramoDominante,
  urgeEnRojo,
} from "@/lib/cxc/lista-celular";
import type { ClaveDescarga } from "@/lib/cxc/descargas";
import type { FormatoDescarga } from "../hooks/useDescargasCartera";
import { HojaElegirEmpresa, HojaPorEmpresa, HojaMasOpciones } from "./HojasCxcCelular";

/** El color de la rayita de la izquierda, por tramo dominante. */
const RAYA: Record<AgingKey, string> = {
  current: "bg-[#0F6E56]",
  watch: "bg-[#B45309]",
  overdue: "bg-[#A32D2D]",
};

export interface PanelCxcCelularProps {
  /** La lista YA filtrada por la pantalla (empresa · tramo · búsqueda · +90 d). */
  filtered: ConsolidatedClient[];
  /** El universo accesible con el filtro de empresa puesto: de acá salen los totales. */
  roleClients: ConsolidatedClient[];
  cxcCompanies: Company[];
  search: string;
  setSearch: (v: string) => void;
  riskFilter: RiskFilter;
  setRiskFilter: (v: RiskFilter) => void;
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  /** Abre la hoja «Cobrar» — la MISMA de la computadora. */
  onCobrar: (client: ConsolidatedClient) => void;
  /** Días desde el último pago real (`null` = nunca pagó). */
  diasSinPagarDe: (client: ConsolidatedClient) => number | null;
  canExport: boolean;
  onDescargar: (clave: ClaveDescarga, formato: FormatoDescarga) => void;
  empresaRestriction: string | null;
  onSyncedNow?: () => void;
  avisoMontos?: string | null;
  /** `null` = este rol no puede ver la cartera de Boston. */
  onBoston: (() => void) | null;
}

export default function PanelCxcCelular({
  filtered,
  roleClients,
  cxcCompanies,
  search,
  setSearch,
  riskFilter,
  setRiskFilter,
  companyFilter,
  setCompanyFilter,
  onCobrar,
  diasSinPagarDe,
  canExport,
  onDescargar,
  empresaRestriction,
  onSyncedNow,
  avisoMontos,
  onBoston,
}: PanelCxcCelularProps) {
  const [hoja, setHoja] = useState<"empresa" | "porEmpresa" | "mas" | null>(null);

  // Los totales de la tira: EXACTAMENTE los mismos que la computadora, sobre el
  // mismo universo (`roleClients` = `kpiClients`). Acá solo se suman.
  const totals = useMemo(() => {
    let total = 0, current = 0, watch = 0, overdue = 0;
    for (const c of roleClients) {
      total += c.total; current += c.current; watch += c.watch; overdue += c.overdue;
    }
    return { total, current, watch, overdue };
  }, [roleClients]);

  // 🔴 EL ORDEN DEL CELULAR: por plata. Sin chip, el que más debe arriba; con un
  // chip tocado, el que más debe EN ESE TRAMO. Una sola regla (`cxc-orden`).
  const lista = useMemo(
    () => ordenarClientes(filtered, { orden: ordenDelCelular(riskFilter) }),
    [filtered, riskFilter],
  );

  const empresaElegida = companyFilter === "all"
    ? null
    : cxcCompanies.find((c) => c.key === companyFilter)?.name ?? null;

  return (
    <div className="lg:hidden min-h-screen bg-[#F2F2F7] pb-10">
      {/* ── La barra: Boston a la derecha, y el «···» con lo que no es de todos
          los días (actualizar y las dos descargas). ─────────────────────── */}
      <div className="flex items-center justify-end gap-1 px-2 pt-1">
        {onBoston && (
          <button
            type="button"
            onClick={onBoston}
            className="min-h-[44px] px-3 text-[17px] text-blue-600 active:opacity-60"
          >
            Boston
          </button>
        )}
        <button
          type="button"
          onClick={() => setHoja("mas")}
          aria-label="Más opciones"
          className="grid h-11 w-11 place-items-center rounded-full text-gray-500 active:bg-gray-200"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

      {/* ── Título grande + la empresa que se mira ────────────────────────── */}
      <div className="px-4">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-gray-900">
          Por cobrar
        </h1>
        <button
          type="button"
          onClick={() => { if (!empresaRestriction) setHoja("empresa"); }}
          disabled={!!empresaRestriction || cxcCompanies.length <= 1}
          className="mt-0.5 min-h-[44px] -ml-1 px-1 text-[15px] text-gray-500 active:opacity-60 disabled:opacity-100"
        >
          {empresaElegida ?? "Todas mis empresas"}
          {!empresaRestriction && cxcCompanies.length > 1 && " ▾"}
        </button>
      </div>

      {/* Qué se quedó AFUERA del número que viene abajo. Va ANTES del número. */}
      <div className="px-4">
        <AvisoRechazosSwitch texto={avisoMontos} />
      </div>

      {/* ── El número grande. Tocarlo abre la cartera por empresa. ────────── */}
      <button
        type="button"
        onClick={() => setHoja("porEmpresa")}
        className="block w-full px-4 pt-3 text-center active:opacity-60"
      >
        <span className="block text-[46px] font-light leading-none tracking-tight tabular-nums text-gray-900">
          {montoExacto(totalDeLaPortada(totals, riskFilter))}
        </span>
      </button>
      <p className="px-4 pt-2 text-center text-[14px] text-gray-500">
        {subtituloDeLaPortada({
          cuantos: lista.length,
          risk: riskFilter,
          empresas: cxcCompanies.length,
          unaEmpresa: empresaElegida,
        })}
        {riskFilter !== "all" && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setRiskFilter(riskFilter)}
              className="text-blue-600 active:opacity-60"
            >
              ver todo
            </button>
          </>
        )}
      </p>

      {/* ── Los tres tramos. Tocar uno filtra Y ordena por su plata. ──────── */}
      <div className="flex gap-2 px-4 pt-3">
        {AGING_ORDER.map((k) => {
          const activo = riskFilter === k;
          const valor = k === "current" ? totals.current : k === "watch" ? totals.watch : totals.overdue;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setRiskFilter(k)}
              aria-pressed={activo}
              className={[
                "flex-1 min-h-[44px] rounded-full border px-2 py-2 text-center transition active:scale-[0.97]",
                activo
                  ? "border-gray-900 bg-gray-900 text-white"
                  : k === "overdue"
                    ? "border-[#A32D2D] bg-white text-[#A32D2D]"
                    : "border-gray-200 bg-white text-gray-900",
              ].join(" ")}
            >
              <span className="block text-[13px] font-semibold tabular-nums">
                {formatCompactCurrency(valor)}
              </span>
              <span className={`block text-[11px] ${activo ? "text-gray-300" : "text-gray-500"}`}>
                {chipCorto(k)}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Buscar ────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <input
          type="search"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente"
          aria-label="Buscar cliente"
          className="w-full rounded-xl border border-transparent bg-[#E9E9EB] px-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none"
        />
      </div>

      {/* ── La lista ──────────────────────────────────────────────────────── */}
      {lista.length === 0 ? (
        <div className="mx-4 mt-3 rounded-2xl bg-white px-4 py-8 text-center">
          <p className="text-[15px] text-gray-500">No hay clientes con estos filtros</p>
          {(search || riskFilter !== "all" || companyFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setRiskFilter("all");
                if (!empresaRestriction) setCompanyFilter("all");
              }}
              className="mt-2 min-h-[44px] text-[15px] font-medium text-blue-600"
            >
              Quitar los filtros
            </button>
          )}
        </div>
      ) : (
        <ul data-lista="cxc-celular" className="mx-4 mt-3 overflow-hidden rounded-2xl bg-white">
          {lista.map((c) => (
            <FilaCliente
              key={c.nombre_normalized}
              client={c}
              dias={diasSinPagarDe(c)}
              onAbrir={() => onCobrar(c)}
            />
          ))}
        </ul>
      )}

      {/* ── Las hojas ─────────────────────────────────────────────────────── */}
      {hoja === "empresa" && (
        <HojaElegirEmpresa
          empresas={cxcCompanies}
          elegida={companyFilter}
          onElegir={(k) => { setCompanyFilter(k); setHoja(null); }}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja === "porEmpresa" && (
        <HojaPorEmpresa
          clientes={roleClients}
          empresas={cxcCompanies}
          onElegirEmpresa={(k) => { setCompanyFilter(k); setHoja(null); }}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja === "mas" && (
        <HojaMasOpciones
          canExport={canExport}
          companyFilter={companyFilter}
          onDescargar={(clave, formato) => { setHoja(null); onDescargar(clave, formato); }}
          onSyncedNow={onSyncedNow}
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La fila: DOS renglones y el monto exacto.
// ─────────────────────────────────────────────────────────────────────────────

function FilaCliente({
  client,
  dias,
  onAbrir,
}: {
  client: ConsolidatedClient;
  dias: number | null;
  onAbrir: () => void;
}) {
  const tramo = tramoDominante(client);
  const urge = loQueUrge(client, dias);
  const rojo = urgeEnRojo(client, dias);
  // Al que tiene saldo a favor no se le cobra: su fila no abre la hoja de cobro.
  const cobrable = seLeCobra(client.total);

  return (
    <li className="border-t border-gray-100 first:border-t-0">
      <button
        type="button"
        onClick={onAbrir}
        disabled={!cobrable}
        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50 disabled:active:bg-transparent"
      >
        <span
          aria-hidden
          className={`w-[3px] self-stretch rounded-full ${tramo ? RAYA[tramo] : "bg-gray-200"}`}
        />
        <span className="min-w-0 flex-1">
          {/* 🔴 El nombre es el que escribe Switch, y va COMPLETO: el renglón se
              parte antes que recortarlo — al llamar hace falta el nombre entero. */}
          <span className="block text-[17px] font-semibold leading-tight tracking-tight text-gray-900">
            {nombreDeCliente(client)}
          </span>
          <span className={`mt-0.5 block text-[14px] ${rojo ? "text-[#A32D2D]" : "text-gray-500"}`}>
            {urge}
          </span>
        </span>
        <span className="shrink-0 text-[17px] tabular-nums text-gray-900">
          {montoExacto(client.total)}
        </span>
      </button>
    </li>
  );
}

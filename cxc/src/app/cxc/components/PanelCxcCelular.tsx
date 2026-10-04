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
  subtituloCompacto,
  subtituloDeLaPortada,
  totalDeLaPortada,
  tramoDominante,
  urgeEnRojo,
} from "@/lib/cxc/lista-celular";
import type { ClaveDescarga } from "@/lib/cxc/descargas";
import type { FormatoDescarga } from "../hooks/useDescargasCartera";
import { HojaElegirEmpresa, HojaPorEmpresa, HojaMasOpciones } from "./HojasCxcCelular";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import SyncStatus from "@/components/shared/SyncStatus";
import { CXC_GRUPO_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { tituloCelular, usaBarraCelular } from "@/lib/navegacion/barra-controles-celular";
import { ChevronDown, MoreHorizontal, Search } from "lucide-react";
import { CLASE_TITULO_BARRA, IconoBarra } from "@/components/celular/BarraDeControles";
import { CLASE_LINEA_TOTAL, CLASE_TOTAL_CELULAR, SegmentadoCelular } from "@/components/celular/CabeceraCompacta";
import { CXC_APPLE_2026_10, opcionesActualizarCxc, partirPorAtencion, saldoMas90 } from "@/lib/cxc/apple-2026-10";

/** El color de la rayita de la izquierda, por tramo dominante. */
const RAYA: Record<AgingKey, string> = {
  current: "bg-emerald-700",
  watch: "bg-amber-700",
  overdue: "bg-red-600",
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
  /** `CXC_APPLE_2026_10` (4-oct-2026). Solo cuenta con la barra v3.3. */
  apple?: boolean;
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
  apple: appleProp = CXC_APPLE_2026_10,
}: PanelCxcCelularProps) {
  const [hoja, setHoja] = useState<"empresa" | "porEmpresa" | "mas" | null>(null);
  // v3.2: la cabecera compacta (tres renglones) vive detrás de la barra nueva.
  const compacta = usaBarraCelular(true);
  const apple = compacta && appleProp;
  const [buscando, setBuscando] = useState(false);
  const puedeElegirEmpresa = !empresaRestriction && cxcCompanies.length > 1;

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

  // Apple: «Clientes +90 días» arriba y «Otros clientes» debajo, sin repetir a
  // nadie. Solo mirando la cartera entera: un chip o una búsqueda ya acotan.
  const secciones = apple && riskFilter === "all" && search === "" ? partirPorAtencion(lista) : null;
  const mas90 = useMemo(() => roleClients.reduce((s, c) => s + (c.total > 0 ? saldoMas90(c) : 0), 0), [roleClients]);

  const empresaElegida = companyFilter === "all"
    ? null
    : cxcCompanies.find((c) => c.key === companyFilter)?.name ?? null;

  // 🔴 «Actualizado 4:00 pm ↻» (4-oct-2026): sale de la hoja «Más» y va bajo
  // el total, como en Comisiones. Con una empresa, esa; con «Todas», las 6 una
  // tras otra (N/6). El aviso de la empresa sin actualizar va aparte.
  const frescura = (
    <div data-frescura-cxc>
      <LineaDeFrescura
        forma="celular"
        tabla="estadocuenta"
        empresas={companyFilter === "all" ? CXC_GRUPO_EMPRESA_KEYS : [companyFilter]}
        opciones={opcionesActualizarCxc(companyFilter)}
        secuencial={companyFilter === "all"}
        onSuccess={() => onSyncedNow?.()}
      />
      <SyncStatus tabla="estadocuenta" empresasEsperadas={CXC_GRUPO_EMPRESA_KEYS} empresaLabels={EMPRESA_KEY_TO_NAME} />
    </div>
  );

  return (
    <div className="lg:hidden min-h-screen bg-fondo-celular pb-10">
      {compacta ? (
        <div data-cabecera-cxc-v32 className="px-4">
          {/* 1 · «Cuentas por cobrar ▾» (elige empresa) · Boston · 🔍 · «···» */}
          <div data-fila-del-avatar className="relative flex h-11 min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => { if (puedeElegirEmpresa) setHoja("empresa"); }}
              disabled={!puedeElegirEmpresa}
              className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-1 text-left active:opacity-60 disabled:opacity-100 ${CLASE_TITULO_BARRA}`}
            >
              <span className="truncate">Cuentas por cobrar</span>
              {puedeElegirEmpresa && <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />}
            </button>
            <IconoBarra etiqueta="Buscar cliente" onClick={() => setBuscando(true)}>
              <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
            </IconoBarra>
            {/* Sin nada que ofrecer no se dibuja el «···» (`diseno.md`). */}
            {(canExport || onBoston) && (
            <IconoBarra etiqueta="Más opciones" onClick={() => setHoja("mas")}>
              <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
            </IconoBarra>
            )}
          </div>
          <AvisoRechazosSwitch texto={avisoMontos} />
          {/* 2 · el total a 36 px; tocarlo abre la cartera por empresa */}
          <button type="button" onClick={() => setHoja("porEmpresa")} className="block w-full pt-1 text-left active:opacity-60">
            <span className={CLASE_TOTAL_CELULAR}>{montoExacto(totalDeLaPortada(totals, riskFilter))}</span>
          </button>
          {apple ? (
            <span data-linea-cxc-apple className={CLASE_LINEA_TOTAL}>
              {riskFilter === "all"
                ? <span className="text-red-600">+90 días {montoExacto(mas90)}</span>
                : subtituloCompacto({ cuantos: lista.length, risk: riskFilter, unaEmpresa: empresaElegida })}
              {" · "}
              <LineaDeFrescura
                forma="celular"
                tabla="estadocuenta"
                empresas={CXC_GRUPO_EMPRESA_KEYS}
                opciones={opcionesActualizarCxc(companyFilter)}
                secuencial={companyFilter === "all"}
                onSuccess={() => onSyncedNow?.()}
              />
            </span>
          ) : (
          <span className={CLASE_LINEA_TOTAL}>
            {subtituloCompacto({ cuantos: lista.length, risk: riskFilter, unaEmpresa: empresaElegida })}
          </span>
          )}
          {/* 🔴 4-oct-2026: sin la barra Apple, la misma línea va bajo el total;
              con ella, el aviso de la empresa sin actualizar, aparte. */}
          {apple
            ? <SyncStatus tabla="estadocuenta" empresasEsperadas={CXC_GRUPO_EMPRESA_KEYS} empresaLabels={EMPRESA_KEY_TO_NAME} />
            : frescura}
          {/* 3 · los tres tramos, delgados; tocar el prendido lo apaga (como hoy) */}
          <div className="pt-3">
            <SegmentadoCelular
              etiqueta="Tramos de antigüedad"
              activa={riskFilter === "all" ? null : riskFilter}
              onElegir={(k) => setRiskFilter(k)}
              opciones={AGING_ORDER.map((k) => ({
                clave: k,
                rojo: k === "overdue",
                rotulo: `${formatCompactCurrency(k === "current" ? totals.current : k === "watch" ? totals.watch : totals.overdue)} · ${chipCorto(k)}`,
              }))}
            />
          </div>
        </div>
      ) : (<>
      {/* ── La barra: Boston a la derecha, y el «···» con lo que no es de todos
          los días (actualizar y las dos descargas). ─────────────────────── */}
      <div data-fila-del-avatar className="flex items-center justify-end gap-1 px-2 pt-1">
        {onBoston && (
          <button
            type="button"
            onClick={onBoston}
            className="min-h-[44px] px-3 text-[17px] text-blue-600 active:opacity-60"
          >
            Boston
          </button>
        )}
        {canExport && (
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
        )}
      </div>

      {/* ── Título grande + la empresa que se mira ────────────────────────── */}
      <div className="px-4">
        <h1 className={tituloCelular("text-[32px] font-bold leading-tight tracking-tight text-gray-900")}>
          Cuentas por cobrar
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

      <div className="px-4 text-center">{frescura}</div>

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
                    ? "border-red-600 bg-white text-red-600"
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

      </>)}

      {/* ── Buscar ────────────────────────────────────────────────────────── */}
      {(!compacta || buscando || search !== "") && (
      <div className="px-4 pt-3">
        <input
          type="search"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente"
          aria-label="Buscar cliente"
          className="w-full rounded-xl border border-transparent bg-control-celular px-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none"
          autoFocus={compacta && buscando && search === ""}
          onBlur={() => { if (search === "") setBuscando(false); }}
        />
      </div>
      )}

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
              Limpiar filtros
            </button>
          )}
        </div>
      ) : secciones && secciones.atencion.length > 0 ? (
        <>
          <SeccionClientes titulo="Clientes +90 días" clientes={secciones.atencion} diasSinPagarDe={diasSinPagarDe} onCobrar={onCobrar} />
          {secciones.resto.length > 0 && (
            <SeccionClientes titulo="Otros clientes" clientes={secciones.resto} diasSinPagarDe={diasSinPagarDe} onCobrar={onCobrar} />
          )}
        </>
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
          onDescargar={(clave, formato) => { setHoja(null); onDescargar(clave, formato); }}
          onCerrar={() => setHoja(null)}
          onBoston={compacta ? onBoston : null}
        />
      )}
    </div>
  );
}

/** Apple (4-oct-2026): una sección con su título gris, como Ajustes de iOS. */
function SeccionClientes({
  titulo,
  clientes,
  diasSinPagarDe,
  onCobrar,
}: {
  titulo: string;
  clientes: ConsolidatedClient[];
  diasSinPagarDe: (client: ConsolidatedClient) => number | null;
  onCobrar: (client: ConsolidatedClient) => void;
}) {
  return (
    <section data-seccion-cxc={titulo}>
      <h2 className="px-8 pt-5 pb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">{titulo}</h2>
      <ul data-lista="cxc-celular" className="mx-4 overflow-hidden rounded-2xl bg-white">
        {clientes.map((c) => (
          <FilaCliente key={c.nombre_normalized} client={c} dias={diasSinPagarDe(c)} onAbrir={() => onCobrar(c)} />
        ))}
      </ul>
    </section>
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
          <span className={`mt-0.5 block text-[14px] ${rojo ? "text-red-600" : "text-gray-500"}`}>
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

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS TRES HOJAS DEL CELULAR DEL CXC (24-sep-2026).
//
//  · «Ver la cartera de»  — elegir empresa (el subtítulo de la portada).
//  · «Por empresa»        — tocar el número grande: la cartera abierta por
//                           empresa, con sus tres tramos y su pulso.
//  · «···»                — actualizar y las dos descargas de siempre.
//
// 🔴 Suben DESDE ABAJO con `ModalOverlay align="center"`, el patrón de hoja del
// sistema (el mismo de «Cobrar»): no se estrena un segundo mecanismo, y ningún
// panel cuelga `absolute` de un ancla que lo recorte.
//
// 🔴 Ningún número nace acá: «Por empresa» agrupa con `carteraPorEmpresa`, que
// suma los MISMOS tramos que la computadora cuando se elige una empresa en el
// filtro. Boston no entra: la lista de empresas la manda quien llama.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { ModalOverlay } from "@/components/ui";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import MenuDescargar from "./MenuDescargar";
import { CXC_GRUPO_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { carteraPorEmpresa, haceCuanto, montoExacto } from "@/lib/cxc/lista-celular";
import type { ClaveDescarga } from "@/lib/cxc/descargas";
import type { FormatoDescarga } from "../hooks/useDescargasCartera";

function Hoja({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <ModalOverlay onBackdropClick={onCerrar} align="center">
      <div className="mx-0 mb-0 max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white sm:mx-4 sm:my-16 sm:max-w-md sm:rounded-lg">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 pb-3 pt-5">
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-1 p-1 text-gray-400 transition hover:text-gray-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </ModalOverlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Elegir empresa
// ─────────────────────────────────────────────────────────────────────────────

export function HojaElegirEmpresa({
  empresas,
  elegida,
  onElegir,
  onCerrar,
}: {
  empresas: Company[];
  elegida: string;
  onElegir: (key: string) => void;
  onCerrar: () => void;
}) {
  const opciones = [{ key: "all", name: "Todas mis empresas" }, ...empresas];
  return (
    <Hoja titulo="Ver la cartera de" onCerrar={onCerrar}>
      <ul className="divide-y divide-gray-100">
        {opciones.map((o) => (
          <li key={o.key}>
            <button
              type="button"
              onClick={() => onElegir(o.key)}
              className="flex min-h-[44px] w-full items-center justify-between px-5 py-3 text-left text-[17px] text-gray-900 active:bg-gray-50"
            >
              <span>{o.name}</span>
              {elegida === o.key && <span className="text-blue-600">✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </Hoja>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · «Por empresa»
// ─────────────────────────────────────────────────────────────────────────────

export function HojaPorEmpresa({
  clientes,
  empresas,
  onElegirEmpresa,
  onCerrar,
}: {
  /** El universo accesible, SIN el filtro de tramo ni la búsqueda. */
  clientes: ConsolidatedClient[];
  empresas: Company[];
  onElegirEmpresa: (key: string) => void;
  onCerrar: () => void;
}) {
  const hoy = hoyPanama();
  const filas = useMemo(
    () => carteraPorEmpresa(clientes, empresas.map((e) => ({ key: e.key, name: e.name }))),
    [clientes, empresas],
  );
  const total = filas.reduce((s, f) => s + f.total, 0);

  return (
    <Hoja titulo="Por empresa" onCerrar={onCerrar}>
      <p className="px-5 pt-3 text-[13px] text-gray-500">
        {montoExacto(total)} · {filas.length} {filas.length === 1 ? "empresa" : "empresas"}
        {" · "}verde hasta 90 días · ámbar 91 a 120 · rojo más de 120
      </p>
      <ul data-lista="cxc-por-empresa" className="mt-2 divide-y divide-gray-100">
        {filas.map((f) => (
          <li key={f.key}>
            <button
              type="button"
              onClick={() => onElegirEmpresa(f.key)}
              className="flex w-full items-start gap-3 px-5 py-3 text-left active:bg-gray-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold tracking-tight text-gray-900">
                  {f.nombre}
                </span>
                <span className="mt-0.5 block text-[14px] tabular-nums">
                  <span className="text-[#0F6E56]">{f.current > 0 ? montoExacto(f.current) : "—"}</span>
                  {" · "}
                  <span className="text-[#B45309]">{f.watch > 0 ? montoExacto(f.watch) : "—"}</span>
                  {" · "}
                  <span className="text-[#A32D2D]">{f.overdue > 0 ? montoExacto(f.overdue) : "—"}</span>
                </span>
                <span className="mt-0.5 block text-[13px] text-gray-500">
                  {f.clientes} {f.clientes === 1 ? "cliente" : "clientes"}
                  {f.ultimoPago && (
                    <> · pagó {f.ultimoPago.cliente} {montoExacto(f.ultimoPago.monto)} {haceCuanto(f.ultimoPago.fecha, hoy)}</>
                  )}
                  {f.ultimaCompra && (
                    <> · vendió {montoExacto(f.ultimaCompra.monto)} {haceCuanto(f.ultimaCompra.fecha, hoy)}</>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-[17px] tabular-nums text-gray-900">
                {montoExacto(f.total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Hoja>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · «···» — lo que no es de todos los días
// ─────────────────────────────────────────────────────────────────────────────

export function HojaMasOpciones({
  canExport,
  companyFilter,
  onDescargar,
  onSyncedNow,
  onCerrar,
}: {
  canExport: boolean;
  companyFilter: string;
  onDescargar: (clave: ClaveDescarga, formato: FormatoDescarga) => void;
  onSyncedNow?: () => void;
  onCerrar: () => void;
}) {
  return (
    <Hoja titulo="Más" onCerrar={onCerrar}>
      <div className="px-5 py-3">
        <SyncStatus
          tabla="estadocuenta"
          empresasEsperadas={CXC_GRUPO_EMPRESA_KEYS}
          empresaLabels={EMPRESA_KEY_TO_NAME}
        />
        <SyncNowButton
          className="mt-2"
          opciones={[{ modulo: "estadocuenta", empresa: companyFilter }]}
          disabledReason={companyFilter === "all" ? "Elige una empresa arriba para actualizarla" : null}
          onSuccess={() => onSyncedNow?.()}
        />
      </div>
      {canExport && (
        <div className="border-t border-gray-100 py-1">
          <MenuDescargar onDescargar={onDescargar} />
        </div>
      )}
    </Hoja>
  );
}

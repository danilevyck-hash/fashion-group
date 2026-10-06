"use client";

import { fmt, fmtDate } from "@/lib/format";
import { montoEnPantalla, saldoDelPeriodo, saldoEsNegativo } from "@/lib/caja/dinero";
import { CajaPeriodo } from "./types";
import { SkeletonTable, EmptyState } from "@/components/ui";
import OverflowMenu, { OverflowMenuItem } from "@/components/ui/OverflowMenu";
import { lineaPeriodoCaja } from "@/lib/egresos/apple-2026-10";
import { Aviso } from "@/components/ui/Aviso";

interface Props {
  periodos: CajaPeriodo[];
  loading: boolean;
  error: string | null;
  /** Un hecho que hay que decir, no una falla (ej.: no se abrió otro período). */
  aviso?: string | null;
  hasOpenPeriod: boolean;
  role: string | null;
  onCreatePeriodo: () => void;
  onLoadDetail: (id: string) => void;
  onPrintPeriodo: (id: string) => void;
  onClosePeriodo: (id: string) => void;
  onDeletePeriodo: (id: string) => void;
  /** `GASTOS_APPLE_2026_10` (6-oct-2026). Las pruebas lo fuerzan. */
  apple?: boolean;
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function StatusPill({ estado }: { estado: string }) {
  if (estado === "abierto") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
        style={{
          background: "var(--caja-success-soft)",
          color: "var(--caja-success-onSoft)",
          border: "1px solid var(--caja-success-border)",
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--caja-success)" }}
        />
        Abierto
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        background: "var(--caja-stone-100)",
        color: "var(--caja-stone-600)",
        border: "1px solid var(--caja-stone-200)",
      }}
    >
      Cerrado
    </span>
  );
}

/** Saldo del período: pill rojo si es negativo, ámbar si queda <10% del fondo,
 *  texto normal si está sano. Estilo pill consistente con StatusPill. */
function SaldoValue({ saldo, fondo }: { saldo: number; fondo: number }) {
  // 🩸 `saldo < 0` a pelo pintaba EN ROJO el período Nº2, cuadrado al centavo:
  // la suma de sus 26 recibos daba 200.00000000000003 y el saldo, −2.8e-14.
  const neg = saldoEsNegativo(saldo);
  const low = !neg && fondo > 0 && saldo < 0.1 * fondo;
  if (neg || low) {
    const tone = neg ? "danger" : "warning";
    return (
      <span
        className="inline-flex items-center caja-mono text-[12px] font-medium px-2 py-0.5 rounded-full"
        style={{
          background: `var(--caja-${tone}-soft)`,
          color: `var(--caja-${tone}-onSoft)`,
          border: `1px solid var(--caja-${tone}-border)`,
        }}
      >
        {montoEnPantalla(saldo)}
      </span>
    );
  }
  return (
    <span className="caja-money caja-money-strong" style={{ color: "var(--caja-fg-strong)" }}>
      {montoEnPantalla(saldo)}
    </span>
  );
}

/** Cuántos recibos vivos tiene un período. Lo cuenta el servidor. */
function recibosDe(p: CajaPeriodo): number {
  if (typeof p.recibos === "number") return p.recibos;
  return (p.caja_gastos || []).filter((g) => !(g as { deleted?: boolean }).deleted).length;
}

export default function PeriodoList({
  periodos,
  loading,
  error,
  aviso,
  hasOpenPeriod,
  role,
  onCreatePeriodo,
  onLoadDetail,
  onPrintPeriodo,
  onClosePeriodo,
  onDeletePeriodo,
  apple = false,
}: Props) {
  // UN solo h1 en la pantalla, apagado o prendido.
  const encabezado = <h1 className="sr-only">Caja menuda</h1>;
  // Lo que ofrece el «···» de un período: lo MISMO que la tarjeta de siempre.
  const itemsDe = (p: CajaPeriodo): OverflowMenuItem[] => {
    const items: OverflowMenuItem[] = [{ label: "Imprimir", onClick: () => onPrintPeriodo(p.id) }];
    if (p.estado === "abierto") items.push({ label: "Cerrar período", onClick: () => onClosePeriodo(p.id) });
    if (p.estado === "cerrado" && role === "admin" && recibosDe(p) === 0) {
      items.push({ label: "Eliminar", onClick: () => onDeletePeriodo(p.id), destructive: true });
    }
    return items;
  };
  if (apple) {
    return (
      <ListaApple
        periodos={periodos} loading={loading} error={error} aviso={aviso}
        hasOpenPeriod={hasOpenPeriod} onCreatePeriodo={onCreatePeriodo}
        onLoadDetail={onLoadDetail} itemsDe={itemsDe} encabezado={encabezado}
      />
    );
  }
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-9 py-8 sm:py-10">
      {/* Sin título grande: "Caja Menuda" ya lo dicen la barra sticky (celular)
          y el breadcrumb (escritorio). Queda sr-only para no dejar la página sin
          encabezado. Sin bajada NO queda un hueco: el bloque de arriba se fue
          entero y el botón se acomoda solo a la derecha. */}
      {encabezado}
      {!hasOpenPeriod && (
        <div className="flex justify-end mb-5">
          <button
            onClick={onCreatePeriodo}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 min-h-[44px] rounded-md transition-transform active:scale-[0.97]"
            style={{ background: "var(--caja-accent)", color: "#fff" }}
          >
            <PlusIcon /> Nuevo período
          </button>
        </div>
      )}

      {aviso && !error && (
        <p
          className="text-sm mb-4 px-3 py-2 rounded-md"
          style={{
            color: "var(--caja-warning-onSoft)",
            background: "var(--caja-warning-soft)",
            border: "1px solid var(--caja-warning-border)",
          }}
        >
          {aviso}
        </p>
      )}
      {error && (
        <p
          className="text-sm mb-4 px-3 py-2 rounded-md"
          style={{
            color: "var(--caja-danger-onSoft)",
            background: "var(--caja-danger-soft)",
            border: "1px solid var(--caja-danger-border)",
          }}
        >
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : periodos.length === 0 ? (
        <EmptyState
          title="No hay períodos registrados"
          actionLabel="+ Nuevo período"
          onAction={onCreatePeriodo}
        />
      ) : (
        <>
          {/* ── Tarjetas (celular, iPad y ventanas angostas) ──────────────────
              🩸 Esta pantalla se rompía SOLO en el iPad: a 390 px ya usaba
              tarjetas y a 1440 la tabla entraba, pero a 834 px se encendía la
              tabla de escritorio JUSTO cuando aparece la barra lateral (`md`
              arranca en 768 y la barra se lleva 224 px). Quedaban 384 px de
              arrastre y afuera FONDO, GASTADO y SALDO.
              El corte es `xl` (1280) y NO `lg`, y está medido: el ancho natural
              de las 8 columnas suma 491 px de puro texto, que con el relleno
              mínimo (px-3) dan ~744 px, y un iPad horizontal de 1024 deja 728 px
              útiles. Correr el corte a `lg` habría dejado el problema vivo a
              1024 — 16 px de arrastre. A 1280 quedan 984 px útiles: entra con
              240 px de aire. */}
          <div className="xl:hidden space-y-3">
            {periodos.map((p) => {
              const saldo = saldoDelPeriodo(p.fondo_inicial, p.total_gastado);
              const items: OverflowMenuItem[] = [
                { label: "Imprimir", onClick: () => onPrintPeriodo(p.id) },
              ];
              if (p.estado === "abierto") {
                items.push({ label: "Cerrar período", onClick: () => onClosePeriodo(p.id) });
              }
              // 🔴 Un período CON GASTOS no se elimina (Daniel: «no es
              // normal»), así que el botón no se dibuja: el servidor lo
              // rechazaría igual, y un control que no ofrece nada no va.
              if (p.estado === "cerrado" && role === "admin" && recibosDe(p) === 0) {
                items.push({ label: "Eliminar", onClick: () => onDeletePeriodo(p.id), destructive: true });
              }
              return (
                <div
                  key={p.id}
                  data-periodo-fila={p.id}
                  onClick={() => onLoadDetail(p.id)}
                  className="rounded-lg p-4 active:scale-[0.99] transition cursor-pointer"
                  style={{
                    background: "var(--caja-bg-surface)",
                    border: "1px solid var(--caja-border-subtle)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="caja-display-sm"
                        style={{ fontSize: 18, color: "var(--caja-fg-strong)" }}
                      >
                        Nº {p.numero}
                      </span>
                      <StatusPill estado={p.estado} />
                    </div>
                    <div className="-my-2 -mr-2" onClick={(e) => e.stopPropagation()}>
                      <OverflowMenu items={items} />
                    </div>
                  </div>
                  <p
                    className="caja-mono text-xs mb-3"
                    style={{ color: "var(--caja-fg-muted)" }}
                  >
                    {fmtDate(p.fecha_apertura)}
                    {p.fecha_cierre ? ` — ${fmtDate(p.fecha_cierre)}` : " · en curso"}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--caja-fg-muted)" }}>
                      Fondo{" "}
                      <span className="caja-money caja-money-strong" data-periodo-campo="fondo">${fmt(p.fondo_inicial)}</span>
                    </span>
                    <span style={{ color: "var(--caja-fg-muted)" }}>
                      Gastado{" "}
                      <span className="caja-money" data-periodo-campo="gastado">${fmt(p.total_gastado)}</span>
                    </span>
                    <span data-periodo-campo="saldo">
                      <SaldoValue saldo={saldo} fondo={p.fondo_inicial} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table — scroll horizontal para que SALDO/Acciones no se corten */}
          <div
            className="hidden xl:block overflow-x-auto"
            style={{
              background: "var(--caja-bg-surface)",
              border: "1px solid var(--caja-border-subtle)",
              borderRadius: 8,
            }}
          >
            <div style={{ minWidth: 920 }}>
            <div
              className="grid items-center caja-eyebrow"
              style={{
                gridTemplateColumns:
                  "56px 1fr 1fr 110px 120px 120px 120px 130px",
                background: "var(--caja-stone-100)",
                borderBottom: "1px solid var(--caja-border-subtle)",
              }}
            >
              <div className="px-4 py-2.5">Nº</div>
              <div className="px-4 py-2.5">Apertura</div>
              <div className="px-4 py-2.5">Cierre</div>
              <div className="px-4 py-2.5">Estado</div>
              <div className="px-4 py-2.5 text-right">Fondo</div>
              <div className="px-4 py-2.5 text-right">Gastado</div>
              <div className="px-4 py-2.5 text-right">Saldo</div>
              <div className="px-4 py-2.5 text-right">Acciones</div>
            </div>
            {periodos.map((p, i) => {
              const saldo = saldoDelPeriodo(p.fondo_inicial, p.total_gastado);
              const items: OverflowMenuItem[] = [];
              if (p.estado === "cerrado" && role === "admin" && recibosDe(p) === 0) {
                items.push({ label: "Eliminar", onClick: () => onDeletePeriodo(p.id), destructive: true });
              }
              const stop = (e: React.MouseEvent) => e.stopPropagation();
              return (
                <div
                  key={p.id}
                  data-periodo-fila={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onLoadDetail(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onLoadDetail(p.id);
                    }
                  }}
                  className="caja-row grid items-center cursor-pointer"
                  style={{
                    gridTemplateColumns:
                      "56px 1fr 1fr 110px 120px 120px 120px 130px",
                    borderBottom:
                      i < periodos.length - 1
                        ? "1px solid var(--caja-stone-100)"
                        : 0,
                    minHeight: 56,
                    fontSize: 13,
                  }}
                >
                  <div
                    className="caja-display-sm px-4"
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--caja-fg-strong)",
                    }}
                  >
                    {p.numero}
                  </div>
                  <div
                    className="caja-mono px-4"
                    style={{ color: "var(--caja-fg-default)" }}
                  >
                    {fmtDate(p.fecha_apertura)}
                  </div>
                  <div
                    className="caja-mono px-4"
                    style={{
                      color: p.fecha_cierre
                        ? "var(--caja-fg-default)"
                        : "var(--caja-fg-subtle)",
                    }}
                  >
                    {p.fecha_cierre ? fmtDate(p.fecha_cierre) : "—"}
                  </div>
                  <div className="px-4">
                    <StatusPill estado={p.estado} />
                  </div>
                  <div className="caja-money caja-money-strong px-4 text-right" data-periodo-campo="fondo">
                    ${fmt(p.fondo_inicial)}
                  </div>
                  <div className="caja-money px-4 text-right" data-periodo-campo="gastado">
                    ${fmt(p.total_gastado)}
                  </div>
                  <div className="px-4 text-right" data-periodo-campo="saldo">
                    <SaldoValue saldo={saldo} fondo={p.fondo_inicial} />
                  </div>
                  <div className="px-4 flex items-center justify-end gap-1.5">
                    <button
                      onClick={(e) => { stop(e); onPrintPeriodo(p.id); }}
                      title="Imprimir"
                      className="caja-row-action inline-flex min-h-[44px] items-center text-xs px-2 rounded-md"
                      style={{
                        color: "var(--caja-fg-muted)",
                        border: "1px solid transparent",
                        background: "transparent",
                      }}
                    >
                      Imprimir
                    </button>
                    {p.estado === "abierto" && (
                      <button
                        onClick={(e) => { stop(e); onClosePeriodo(p.id); }}
                        title="Cerrar período"
                        className="caja-row-action inline-flex min-h-[44px] items-center text-xs px-2 rounded-md"
                        style={{
                          color: "var(--caja-fg-muted)",
                          border: "1px solid transparent",
                          background: "transparent",
                        }}
                      >
                        Cerrar
                      </button>
                    )}
                    {items.length > 0 && (
                      <span onClick={stop}>
                        <OverflowMenu items={items} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          <style jsx>{`
            :global(.caja-row) {
              transition: background-color 120ms ease;
            }
            :global(.caja-row:hover) {
              background: var(--caja-bg-page);
            }
            :global(.caja-row:focus-visible) {
              outline: none;
              background: var(--caja-bg-page);
              box-shadow: inset 0 0 0 2px var(--caja-accent);
            }
            :global(.caja-row-action):hover {
              color: var(--caja-fg-strong) !important;
              border-color: var(--caja-border-subtle) !important;
              background: #fff !important;
            }
          `}</style>

          <div
            className="mt-3 text-xs flex items-center gap-1.5"
            style={{ color: "var(--caja-fg-muted)" }}
          >
            Mostrando {periodos.length}{" "}
            {periodos.length === 1 ? "período" : "períodos"}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 🔴 «COMO LO HARÍA APPLE» (6-oct-2026, `GASTOS_APPLE_2026_10`). La pregunta
 * de esta pantalla es «¿cuánto queda en la caja?»: el saldo del período ABIERTO
 * va grande con UNA línea gris (fondo, gastado, recibos). Abajo, cada período es
 * una fila de dos renglones con su saldo, su «···» y la ›, en el celular y en la
 * computadora. Los números son los MISMOS (`saldoDelPeriodo`, `recibosDe`).
 * 🔴 Nunca se suman períodos entre sí: el número grande es UNO solo.
 */
function ListaApple({
  periodos, loading, error, aviso, hasOpenPeriod, onCreatePeriodo, onLoadDetail, itemsDe, encabezado,
}: {
  encabezado: React.ReactNode;
  periodos: CajaPeriodo[];
  loading: boolean;
  error: string | null;
  aviso?: string | null;
  hasOpenPeriod: boolean;
  onCreatePeriodo: () => void;
  onLoadDetail: (id: string) => void;
  itemsDe: (p: CajaPeriodo) => OverflowMenuItem[];
}) {
  const abierto = periodos.find((p) => p.estado === "abierto") ?? null;
  const saldoAbierto = abierto ? saldoDelPeriodo(abierto.fondo_inicial, abierto.total_gastado) : 0;
  return (
    <div data-caja-apple-lista className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {encabezado}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {abierto && (
            <>
              <p className={`text-[34px] font-normal leading-none tracking-tight tabular-nums ${saldoEsNegativo(saldoAbierto) ? "text-red-600" : "text-gray-800"}`}>
                {montoEnPantalla(saldoAbierto)}
              </p>
              <p className="pt-2 text-sm text-gray-500 tabular-nums">
                {`Saldo del período Nº ${abierto.numero} · `}
                {lineaPeriodoCaja(`$${fmt(abierto.fondo_inicial)}`, `$${fmt(abierto.total_gastado)}`, recibosDe(abierto))}
              </p>
            </>
          )}
        </div>
        {!hasOpenPeriod && (
          <button
            onClick={onCreatePeriodo}
            className="inline-flex min-h-[44px] items-center rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]"
          >
            Nuevo período
          </button>
        )}
      </div>

      {aviso && !error && <Aviso className="mb-4">{aviso}</Aviso>}
      {error && <Aviso tono="error" className="mb-4">{error}</Aviso>}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : periodos.length === 0 ? (
        <EmptyState title="No hay períodos registrados" actionLabel="+ Nuevo período" onAction={onCreatePeriodo} />
      ) : (
        <ul data-lista="caja-periodos-apple" className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {periodos.map((p) => {
            const saldo = saldoDelPeriodo(p.fondo_inicial, p.total_gastado);
            const n = recibosDe(p);
            const abiertoP = p.estado === "abierto";
            return (
              <li key={p.id} data-periodo-apple={p.id} className="flex min-h-[56px] items-center gap-2 pr-2">
                <button type="button" onClick={() => onLoadDetail(p.id)} className="flex min-w-0 flex-1 items-center gap-4 py-2.5 pl-4 text-left transition hover:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      Período Nº {p.numero}
                      {abiertoP && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Abierto</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-gray-500 tabular-nums">
                      {fmtDate(p.fecha_apertura)}
                      {p.fecha_cierre ? ` — ${fmtDate(p.fecha_cierre)}` : " · en curso"}
                      {` · Gastado $${fmt(p.total_gastado)} · ${n} ${n === 1 ? "recibo" : "recibos"}`}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm tabular-nums ${saldoEsNegativo(saldo) ? "text-red-600" : "text-gray-900"}`}>
                    {montoEnPantalla(saldo)}
                  </span>
                  <span aria-hidden className="shrink-0 text-gray-300">›</span>
                </button>
                <OverflowMenu items={itemsDe(p)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

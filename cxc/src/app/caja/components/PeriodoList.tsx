"use client";

import { fmt, fmtDate } from "@/lib/format";
import { CajaPeriodo } from "./types";
import { SkeletonTable, EmptyState } from "@/components/ui";
import OverflowMenu, { OverflowMenuItem } from "@/components/ui/OverflowMenu";

interface Props {
  periodos: CajaPeriodo[];
  loading: boolean;
  error: string | null;
  hasOpenPeriod: boolean;
  role: string | null;
  onCreatePeriodo: () => void;
  onLoadDetail: (id: string) => void;
  onPrintPeriodo: (id: string) => void;
  onClosePeriodo: (id: string) => void;
  onDeletePeriodo: (id: string) => void;
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
  const neg = saldo < 0;
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
        ${fmt(saldo)}
      </span>
    );
  }
  return (
    <span className="caja-money caja-money-strong" style={{ color: "var(--caja-fg-strong)" }}>
      ${fmt(saldo)}
    </span>
  );
}

export default function PeriodoList({
  periodos,
  loading,
  error,
  hasOpenPeriod,
  role,
  onCreatePeriodo,
  onLoadDetail,
  onPrintPeriodo,
  onClosePeriodo,
  onDeletePeriodo,
}: Props) {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-9 py-8 sm:py-10">
      <div className="flex items-end justify-between gap-6 mb-7 sm:mb-10">
        <div className="max-w-xl">
          <h1
            className="caja-display"
            style={{ fontSize: "clamp(28px, 4vw, 38px)", margin: 0 }}
          >
            Caja Menuda
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--caja-fg-muted)", maxWidth: 520 }}
          >
            Cada período representa un ciclo del fondo fijo de gastos. Crea uno nuevo cuando se reponga el fondo.
          </p>
        </div>
        {!hasOpenPeriod && (
          <button
            onClick={onCreatePeriodo}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 min-h-[44px] rounded-md transition-transform active:scale-[0.97]"
            style={{ background: "var(--caja-accent)", color: "#fff" }}
          >
            <PlusIcon /> Nuevo período
          </button>
        )}
      </div>

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
              const saldo = p.fondo_inicial - p.total_gastado;
              const items: OverflowMenuItem[] = [
                { label: "Imprimir", onClick: () => onPrintPeriodo(p.id) },
              ];
              if (p.estado === "abierto") {
                items.push({ label: "Cerrar período", onClick: () => onClosePeriodo(p.id) });
              }
              if (p.estado === "cerrado" && role === "admin") {
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
              const saldo = p.fondo_inicial - p.total_gastado;
              const items: OverflowMenuItem[] = [];
              if (p.estado === "cerrado" && role === "admin") {
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
                      className="caja-row-action text-xs px-2 h-7 rounded-md"
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
                        className="caja-row-action text-xs px-2 h-7 rounded-md"
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

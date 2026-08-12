"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";

type Severity = "ok" | "info" | "warning" | "critical";

interface CheckRow {
  id: string;
  check_name: string;
  table_name: string;
  severity: Severity;
  rows_affected: number;
  threshold_exceeded: boolean;
  details: Record<string, unknown> | null;
  checked_at: string;
}

interface DataHealthResponse {
  latest: CheckRow[];
  history: Record<string, Record<string, Severity>>;
  last_run: string | null;
  total_runs_30d: number;
}

const SEVERITY_BADGE: Record<Severity, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-700", label: "CRITICAL" },
  warning:  { bg: "bg-amber-100", text: "text-amber-700", label: "WARNING" },
  info:     { bg: "bg-sky-100", text: "text-sky-700", label: "INFO" },
  ok:       { bg: "bg-emerald-100", text: "text-emerald-700", label: "OK" },
};

const SEVERITY_DOT: Record<Severity | "missing", string> = {
  critical: "bg-red-500",
  warning:  "bg-amber-400",
  info:     "bg-sky-400",
  ok:       "bg-emerald-500",
  missing:  "bg-gray-200",
};

// Qué significa cada severidad + qué hacer (para un director, no ingeniero).
const SEVERITY_MEANING: Record<Severity, string> = {
  critical: "Dato posiblemente incorrecto (afecta CXC/Ventas). Revisar ahora.",
  warning:  "Posible problema; monitorear. Sin acción inmediata.",
  info:     "Informativo o condición de borde. Revisar sin urgencia.",
  ok:       "Sin problemas detectados.",
};

// Explicación en lenguaje natural + acción sugerida por check.
const CHECK_INFO: Record<string, { desc: string; action: string }> = {
  cheques_criticos_null: {
    desc: "Cheques con campos críticos (monto, fecha o cliente) vacíos.",
    action: "Abre esos cheques y completa los datos faltantes.",
  },
  prestamos_saldo_anomalo: {
    desc: "Empleados con saldo de préstamo negativo (pagaron más de lo prestado).",
    action: "Revisa sus movimientos: puede haber un pago duplicado o un abono mal cargado.",
  },
  last_upload_age_cxc: {
    desc: "Días desde la última actualización del estado de cuenta (CXC) desde Switch.",
    action: "Si está atrasado, revisa el cron switch-sync y la conexión con Switch.",
  },
  aging_tipos_sin_clasificar: {
    desc: "Tipos de comprobante del estado de cuenta sin clasificar (crédito vs débito).",
    action: "Clasifícalos en una migración para que el aging de CXC sea correcto.",
  },
  aging_dias_anomalo: {
    desc: "Filas con días NULL o negativos y saldo: no entran en ningún rango del aging.",
    action: "Revisa fechaCreacion/días de esas filas en el estado de cuenta.",
  },
  switch_facturas_continuidad: {
    desc: "Empresa-mes sin facturas en switch_facturas (el dashboard lo cuenta como $0).",
    action: "Backfill de ese período con scripts/switch-backfill.ts.",
  },
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "nunca";
  const t = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const hr = Math.floor(diffMin / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-PA", { day: "2-digit", month: "short" });
}

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PA", {
    timeZone: "America/Panama",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildLast30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default function DataHealthPage() {
  const { authChecked } = useAuth({ moduleKey: "data-health", allowedRoles: ["admin"] });
  const [data, setData] = useState<DataHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<CheckRow | null>(null);
  // El detalle del check cierra con clic fuera (abajo) y con Escape.
  const cerrarDetalle = useCallback(() => setSelectedCheck(null), []);
  useEscapeClose(!!selectedCheck, cerrarDetalle);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/data-health", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as DataHealthResponse;
      setData(json);
    } catch (err) {
      showToast(`Error al cargar: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    loadData();
  }, [authChecked, loadData]);

  async function runChecksNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/cron/integrity-check", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      showToast(`Listo. ${json.summary?.total ?? 0} checks corridos en ${json.duration_ms}ms.`);
      await loadData();
    } catch (err) {
      showToast(`Error al correr: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setRunning(false);
    }
  }

  const days30 = useMemo(buildLast30Days, []);

  if (!authChecked) return null;

  const summary = data?.latest.reduce<Record<Severity, number>>(
    (acc, r) => { acc[r.severity]++; return acc; },
    { critical: 0, warning: 0, info: 0, ok: 0 },
  );

  return (
    <div>
      <AppHeader module="Data Health" />
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header con resumen + botón */}
        {/* Sin subtítulo: cada check ya muestra su "Último check" en la lista
            de abajo, y el mapa de 30 días ya muestra las corridas. Y sin título
            grande: "Data Health" ya lo dicen la barra sticky (celular) y el
            breadcrumb (escritorio). Queda sr-only para no dejar la página sin
            encabezado, y la fila pasa a `justify-end` para que el botón no se
            corra a la izquierda al quedar solo. */}
        <div className="flex flex-wrap items-start justify-end gap-4 mb-6">
          <h1 className="sr-only">Data Health</h1>
          <button
            onClick={runChecksNow}
            disabled={running}
            className="text-sm bg-black text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-h-[44px]"
          >
            {running ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                Corriendo…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Correr checks ahora
              </>
            )}
          </button>
        </div>

        {/* KPI summary */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {(["critical", "warning", "info", "ok"] as const).map(sev => (
              <div key={sev} className="border border-gray-200 rounded-lg px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">{SEVERITY_BADGE[sev].label}</div>
                <div className={`text-2xl font-semibold tabular-nums mt-1 ${SEVERITY_BADGE[sev].text}`}>{summary[sev]}</div>
                <div className="text-xs text-gray-400 mt-1 leading-snug">{SEVERITY_MEANING[sev]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Latest results table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-8">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Estado actual por check</h2>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Cargando…</div>
          ) : data?.latest.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No hay resultados todavía. Corre el primer check con el botón de arriba.
            </div>
          ) : (
            // ── 🩸 MEDIDO (30-jul-2026, build de producción) ──────────────
            // El `overflow-x-auto` salvó el dato de ser RECORTADO por el
            // `overflow-hidden` de la card, pero dejaba el arrastre: 353px en
            // iPhone y 133px en iPad, con Severity y Rows —el dato por el que
            // existe la página— fuera de la pantalla. Ahora, hasta `lg`, son
            // TARJETAS; de `lg` para arriba la tabla entra sola (medido: 0px a
            // 1024) y no se le tocó nada.
            //
            // `data-medir` es FIJO, no una clase de breakpoint: el arnés compara
            // los mismos números en los 4 anchos y buscar por `.lg\:hidden`
            // devolvería vacío al mover el corte, pasando sin comparar nada.
            <div data-medir="dh-checks">
              {/* Celular e iPad vertical: una tarjeta por check. */}
              <ul className="lg:hidden divide-y divide-gray-200" data-vista="tarjetas">
                {data?.latest.map(r => {
                  const badge = SEVERITY_BADGE[r.severity];
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedCheck(r)}
                        className="w-full min-h-[44px] px-4 py-3 text-left transition hover:bg-gray-50 active:bg-gray-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-mono text-xs break-all">{r.check_name}</span>
                          <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-semibold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          <span className="font-mono">{r.table_name}</span>
                          <span className="tabular-nums font-medium text-gray-700">{r.rows_affected}</span>
                          <span title={fmtAbsolute(r.checked_at)}>{fmtRelative(r.checked_at)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden lg:block overflow-x-auto" data-vista="tabla">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 font-medium">Check</th>
                    <th className="text-left px-4 py-2 font-medium">Tabla</th>
                    <th className="text-center px-4 py-2 font-medium">Severity</th>
                    <th className="text-right px-4 py-2 font-medium">Rows</th>
                    <th className="text-left px-4 py-2 font-medium">Último check</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.latest.map(r => {
                    const badge = SEVERITY_BADGE[r.severity];
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedCheck(r)}
                        className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 cursor-pointer transition"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs">{r.check_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.table_name}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.rows_affected}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          <span className="flex items-center justify-between gap-2">
                            <span title={fmtAbsolute(r.checked_at)}>{fmtRelative(r.checked_at)}</span>
                            <span className="text-gray-300 group-hover:text-gray-500" aria-hidden>›</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        {/* History 30d heatmap */}
        {data && data.latest.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">Historial 30 días</h2>
              <p className="text-xs text-gray-400 mt-0.5">Cada celda = peor severity del día. Gris = sin corrida.</p>
            </div>
            {/* ── 🩸 EL MAPA DE 31 COLUMNAS, MEDIDO (30-jul-2026) ───────────
                Era el peor arrastre de la pantalla: 448px en iPhone y 228px en
                iPad — de los 30 días se veían 7. **Y a 1024 todavía quedaban
                38px**, así que acá el corte `lg` NO alcanzaba: el corte no tiene
                por qué ser el mismo en toda la app, se mide pantalla por
                pantalla.

                Esto no es una tabla de datos, es una CUADRÍCULA de estado, así
                que en vez de correr el corte se la deja ENVOLVER: los 30 puntos
                bajan de renglón (`flex-wrap`) y el arrastre es 0 por
                construcción, en todos los anchos, sin tocar el escritorio.

                ⚠️ Al envolver se pierde el renglón con el número de día — no
                habría forma de alinearlo. La fecha no se pierde: sigue en el
                `title` de cada punto, que ya era la fuente de verdad del dato
                (el `título` del escritorio dice el día, el `title` dice la fecha
                completa y la severidad). */}
            <div className="px-4 py-4">
              {/* Hasta `xl`: un bloque por check con los puntos envueltos. */}
              <div className="xl:hidden space-y-3" data-vista="tarjetas">
                {data.latest.map(r => (
                  <div key={r.check_name}>
                    <div className="font-mono text-xs text-gray-600 break-all mb-1">{r.check_name}</div>
                    <div className="flex flex-wrap gap-1">
                      {days30.map(d => {
                        const sev = data.history[r.check_name]?.[d];
                        const dotClass = sev ? SEVERITY_DOT[sev] : SEVERITY_DOT.missing;
                        const tooltipLabel = sev ? `${d}: ${sev}` : `${d}: sin corrida`;
                        return <div key={d} className={`w-3 h-3 rounded-sm ${dotClass}`} title={tooltipLabel} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* ≥xl: la cuadrícula de siempre, con su renglón de días. */}
              <div className="hidden xl:block overflow-x-auto" data-vista="tabla">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-left pr-3 font-medium text-gray-500"></th>
                    {days30.map(d => (
                      <th key={d} className="px-0.5 font-normal text-xs text-gray-400" title={d}>
                        {new Date(d + "T12:00:00").getDate()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.latest.map(r => (
                    <tr key={r.check_name}>
                      <td className="pr-3 py-1 font-mono text-xs text-gray-600 whitespace-nowrap">{r.check_name}</td>
                      {days30.map(d => {
                        const sev = data.history[r.check_name]?.[d];
                        const dotClass = sev ? SEVERITY_DOT[sev] : SEVERITY_DOT.missing;
                        const tooltipLabel = sev ? `${d}: ${sev}` : `${d}: sin corrida`;
                        return (
                          <td key={d} className="px-0.5 py-1">
                            <div className={`w-3 h-3 rounded-sm ${dotClass}`} title={tooltipLabel} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {/* `flex-wrap`: las 4 etiquetas de severidad no entran en 342px y
                  la card las RECORTA (overflow-hidden, sin scroller adentro).
                  Antes quedaba tapado por el arrastre del mapa; al sacarlo,
                  aparecieron sus 28px. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-gray-500">
                {(["ok", "info", "warning", "critical"] as const).map(s => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-sm ${SEVERITY_DOT[s]}`} />
                    {SEVERITY_BADGE[s].label}
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-sm ${SEVERITY_DOT.missing}`} />
                  Sin corrida
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal con detalles JSON */}
        {selectedCheck && (
          <ModalOverlay onBackdropClick={cerrarDetalle} backdropClassName="bg-black/40" align="middle">
            <div
              className="bg-white rounded-lg shadow-xl border border-gray-200 w-[min(720px,calc(100vw-2rem))] max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                <div>
                  <div className="font-mono text-sm font-semibold">{selectedCheck.check_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{selectedCheck.table_name} · {fmtAbsolute(selectedCheck.checked_at)}</div>
                </div>
                <button
                  onClick={() => setSelectedCheck(null)}
                  className="text-gray-400 hover:text-gray-700 transition p-1"
                  aria-label="Cerrar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="px-5 py-4 overflow-auto flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_BADGE[selectedCheck.severity].bg} ${SEVERITY_BADGE[selectedCheck.severity].text}`}>
                    {SEVERITY_BADGE[selectedCheck.severity].label}
                  </span>
                  <span className="text-sm text-gray-600">
                    <span className="font-medium">{selectedCheck.rows_affected}</span> rows afectados
                  </span>
                </div>

                {/* El check falló al correr (≠ "sin datos") */}
                {selectedCheck.details && typeof selectedCheck.details.error === "string" && (
                  <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <p className="font-medium">El check no pudo correr.</p>
                    <p className="mt-0.5 text-xs">{String(selectedCheck.details.error)}</p>
                  </div>
                )}

                {/* Explicación + acción en lenguaje natural */}
                {CHECK_INFO[selectedCheck.check_name] && (
                  <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                    <p className="text-gray-700">{CHECK_INFO[selectedCheck.check_name].desc}</p>
                    <p className="mt-1.5 text-gray-600">
                      <span className="font-medium text-gray-800">Qué hacer:</span> {CHECK_INFO[selectedCheck.check_name].action}
                    </p>
                  </div>
                )}

                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1.5">Detalles técnicos</p>
                <div className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap break-all text-gray-700">
                  {selectedCheck.details ? JSON.stringify(selectedCheck.details, null, 2) : "El check corrió sin observaciones (sin detalles)."}
                </div>
              </div>
            </div>
          </ModalOverlay>
        )}

        <Toast message={toast} />
      </div>
    </div>
  );
}

"use client";

// ============================================================================
// Marketing nuevo › POR COBRAR (8-oct-2026).
//
// Pregunta: ¿cuánto tiene acumulado cada marca y desde cuándo?
//
//   · Una tarjeta por marca: lo acumulado (el total del ZIP), cuántos gastos,
//     desde cuándo y cuántas tiendas van sin fotos. Al tocarla, el cobro.
//   · El cobro: los gastos por tienda, como van en el ZIP. Dos acciones
//     separadas (Daniel): «Descargar ZIP» cuantas veces quiera, sin cerrar
//     nada, y «Cerrar», con su confirmación. Al cerrar se puede excluir uno o
//     varios gastos: pasan al cierre siguiente, sin cambiar.
//   · Debajo, los cobros anteriores (fecha y monto), solo para consultar.
//
// Sin «Registrar pago»: Daniel cobra a la marca por fuera; lo cerrado queda
// como cobrado, igual que hoy.
// ============================================================================

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useToast } from "@/components/ToastSystem";
import VentanaCentrada from "@/components/ui/VentanaCentrada";
import { Aviso } from "@/components/ui/Aviso";
import { usePublicarAltoBarraFija } from "@/lib/navegacion/useBarraFijaAbajo";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import type { GastoDeLaLista, LineaDelCobro, MarketingDelCobro, ResumenDelCobro } from "@/lib/marketing/zip-marca";
import { useDescargasPeriodo } from "../useDescargasPeriodo";

const claveDeLinea = (l: Pick<LineaDelCobro, "tipo" | "documentoId">) => `${l.tipo}:${l.documentoId ?? ""}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const BOTON_PRINCIPAL =
  "rounded-md bg-black text-white hover:bg-gray-800 px-4 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition disabled:opacity-40";
export const BOTON_SECUNDARIO =
  "rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 px-4 min-h-[44px] inline-flex items-center justify-center text-sm transition disabled:opacity-40";

export default function PorCobrarNuevo({
  datos,
  escribe,
  onCambio,
}: {
  datos: MarketingDelCobro | null;
  escribe: boolean;
  onCambio: () => void;
}) {
  const [cobro, setCobro] = useUrlState<string>("cobro", "", { history: "push" });
  const abierto = datos?.abiertos.find((a) => a.marcaCodigo === cobro) ?? null;

  if (!datos) return <div className="text-sm text-gray-500 py-8 text-center">Cargando…</div>;
  if (abierto) {
    return (
      <DetalleDelCobro
        resumen={abierto}
        gastos={datos.gastos}
        escribe={escribe}
        onVolver={() => setCobro("")}
        onCerrado={() => {
          setCobro("");
          onCambio();
        }}
      />
    );
  }
  return <Portada datos={datos} onAbrir={setCobro} />;
}

// ─── LA PORTADA ─────────────────────────────────────────────────────────────

function Portada({ datos, onAbrir }: { datos: MarketingDelCobro; onAbrir: (marca: string) => void }) {
  const { bajando, bajarZipMarca } = useDescargasPeriodo();
  const total = datos.abiertos.reduce((s, a) => s + a.total, 0);
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Por cobrar</h2>
        {datos.abiertos.length > 0 && (
          <div className="text-sm text-gray-500">
            Total <span className="text-gray-900 font-semibold tabular-nums">{formatearMonto(total)}</span>
          </div>
        )}
      </div>

      {datos.abiertos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 text-center">Sin gastos por cobrar</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {datos.abiertos.map((a) => (
            <button
              key={a.marcaCodigo}
              type="button"
              onClick={() => onAbrir(a.marcaCodigo)}
              data-testid={`tarjeta-${a.marcaCodigo}`}
              className="text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-400 transition min-h-[44px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-gray-700">{a.marcaNombre}</div>
                {a.tiendasSinFoto.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 whitespace-nowrap">
                    {plural(a.tiendasSinFoto.length, "tienda sin fotos", "tiendas sin fotos")}
                  </span>
                )}
              </div>
              <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums" data-testid={`total-${a.marcaCodigo}`}>
                {formatearMonto(a.total)}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {plural(a.lineas.length, "gasto", "gastos")}
                {desdeDe(a) ? ` · desde ${desdeDe(a)}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {datos.cerrados.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Cobros anteriores</h3>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {datos.cerrados.map((c) => (
              <div key={`${c.periodoId}:${c.marcaCodigo}`} className="flex items-center gap-3 px-4 min-h-[44px] py-2 text-sm">
                <span className="w-28 shrink-0 text-gray-500">{formatearFecha(c.cerradoEn) || "—"}</span>
                <span className="flex-1 min-w-0 truncate text-gray-900">{c.marcaNombre}</span>
                <span className="tabular-nums text-gray-900">{formatearMonto(c.total)}</span>
                <button
                  type="button"
                  disabled={bajando !== null}
                  onClick={() => bajarZipMarca(c.marcaCodigo, `${c.marcaNombre} · ${c.periodoNombre}`, c.periodoId)}
                  className="text-blue-600 hover:text-blue-800 min-h-[44px] px-1 disabled:opacity-40"
                >
                  ZIP
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function desdeDe(r: ResumenDelCobro): string {
  return formatearFecha(r.abiertoEn) || formatearFecha(r.lineas.map((l) => l.fecha).sort()[0] ?? null);
}

// ─── EL COBRO DE UNA MARCA ──────────────────────────────────────────────────

function DetalleDelCobro({
  resumen,
  gastos,
  escribe,
  onVolver,
  onCerrado,
}: {
  resumen: ResumenDelCobro;
  gastos: GastoDeLaLista[];
  escribe: boolean;
  onVolver: () => void;
  onCerrado: () => void;
}) {
  const { bajando, bajarZipMarca } = useDescargasPeriodo();
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  // La barra de abajo publica su alto: el botón redondo del menú sube encima.
  const barraRef = useRef<HTMLDivElement>(null);
  usePublicarAltoBarraFija(barraRef);

  const montoCompleto = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gastos) m.set(`${g.tipo === "mobiliario" ? "entrega" : "factura"}:${g.id}`, g.monto);
    return m;
  }, [gastos]);

  const grupos = useMemo(() => {
    const porCarpeta = new Map<string, LineaDelCobro[]>();
    for (const l of resumen.lineas) porCarpeta.set(l.carpeta, [...(porCarpeta.get(l.carpeta) ?? []), l]);
    return Array.from(porCarpeta, ([carpeta, lineas]) => ({
      carpeta,
      codigo: lineas.find((l) => l.clienteCodigo)?.clienteCodigo ?? null,
      lineas: [...lineas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    })).sort((a, b) => (a.codigo ? 0 : 1) - (b.codigo ? 0 : 1) || a.carpeta.localeCompare(b.carpeta));
  }, [resumen]);

  const incluidas = resumen.lineas.filter((l) => !excluidos.has(claveDeLinea(l)));
  const totalIncluido = Math.round(incluidas.reduce((s, l) => s + l.monto, 0) * 100) / 100;
  const tiendasIncluidas = new Set(incluidas.filter((l) => l.clienteCodigo).map((l) => l.carpeta)).size;

  const alternar = (l: LineaDelCobro) =>
    setExcluidos((prev) => {
      const k = claveDeLinea(l);
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onVolver} className="text-sm text-gray-600 hover:text-black min-h-[44px] inline-flex items-center">
          ‹ Por cobrar
        </button>
        <h2 className="text-lg font-semibold text-gray-900">Cobro · {resumen.marcaNombre}</h2>
      </div>

      {grupos.map((g) => {
        const fotos = resumen.fotosPorCarpeta[g.carpeta] ?? 0;
        const subtotal = g.lineas.filter((l) => !excluidos.has(claveDeLinea(l))).reduce((s, l) => s + l.monto, 0);
        return (
          <section key={g.carpeta} className="rounded-lg border border-gray-200 bg-white" data-testid="grupo-del-cobro">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-gray-100">
              <span className="font-medium text-gray-900">
                {g.carpeta}
                {g.codigo ? <span className="text-gray-500 font-normal"> ({g.codigo})</span> : null}
              </span>
              {g.codigo && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    fotos === 0 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  Fotos · {fotos}
                </span>
              )}
              <span className="ml-auto text-sm text-gray-500">
                {plural(g.lineas.length, "gasto", "gastos")} ·{" "}
                <span className="text-gray-900 tabular-nums">{formatearMonto(subtotal)}</span>
              </span>
            </header>
            <ul className="divide-y divide-gray-100">
              {g.lineas.map((l) => {
                const fuera = excluidos.has(claveDeLinea(l));
                const monto = montoCompleto.get(claveDeLinea(l)) ?? l.monto;
                const pct = monto > 0 ? Math.round((l.monto / monto) * 100) : 100;
                return (
                  <li
                    key={claveDeLinea(l)}
                    className={`flex items-center gap-3 px-4 py-2 min-h-[44px] text-sm ${fuera ? "text-gray-400" : ""}`}
                    data-testid="linea-del-cobro"
                  >
                    <span className="hidden sm:block w-24 shrink-0 text-gray-500">{formatearFecha(l.fecha)}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`block truncate ${fuera ? "line-through" : "text-gray-900"}`}>
                        {l.proveedor} · {l.concepto}
                      </span>
                      <span className="block text-xs text-gray-500 sm:hidden">
                        {formatearFecha(l.fecha)}
                        {pct !== 100 ? ` · ${pct} % de ${formatearMonto(monto)}` : ""}
                      </span>
                      {fuera && <span className="block text-xs text-gray-500">Excluido de este cierre</span>}
                    </span>
                    <span className="hidden sm:block w-28 text-right tabular-nums text-gray-500">{formatearMonto(monto)}</span>
                    <span className="hidden sm:block w-14 text-right tabular-nums text-gray-500">{pct} %</span>
                    <span className="w-28 text-right tabular-nums">{formatearMonto(l.monto)}</span>
                    {escribe && (
                      <button
                        type="button"
                        onClick={() => alternar(l)}
                        className="text-blue-600 hover:text-blue-800 min-h-[44px] w-16 text-right"
                        aria-label={fuera ? "Incluir en este cierre" : "Excluir de este cierre"}
                      >
                        {fuera ? "Incluir" : "Excluir"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="text-xs text-gray-500">
        Descargar ZIP lleva todo lo abierto · al cerrar, el ZIP del cierre lleva solo lo incluido
      </p>

      <div ref={barraRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="text-sm text-gray-600 mr-auto">
            {plural(incluidas.length, "gasto", "gastos")} · {plural(tiendasIncluidas, "tienda", "tiendas")}
            {excluidos.size > 0 ? ` · ${plural(excluidos.size, "excluido", "excluidos")}` : ""} ·{" "}
            <span className="font-semibold text-gray-900 tabular-nums" data-testid="total-del-cierre">
              {formatearMonto(totalIncluido)}
            </span>
          </div>
          {escribe && (
            <>
              <button
                type="button"
                disabled={bajando !== null}
                onClick={() => bajarZipMarca(resumen.marcaCodigo, `${resumen.marcaNombre} · ${resumen.periodoNombre}`)}
                className={BOTON_SECUNDARIO}
              >
                {bajando ? "Descargando…" : "Descargar ZIP"}
              </button>
              <button type="button" disabled={incluidas.length === 0} onClick={() => setConfirmando(true)} className={BOTON_PRINCIPAL}>
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>

      {confirmando && (
        <ConfirmarCierre
          resumen={resumen}
          incluidas={incluidas}
          excluidas={resumen.lineas.filter((l) => excluidos.has(claveDeLinea(l)))}
          total={totalIncluido}
          onCancelar={() => setConfirmando(false)}
          onCerrado={onCerrado}
        />
      )}
    </div>
  );
}

// ─── CERRAR ─────────────────────────────────────────────────────────────────

function ConfirmarCierre({
  resumen,
  incluidas,
  excluidas,
  total,
  onCancelar,
  onCerrado,
}: {
  resumen: ResumenDelCobro;
  incluidas: LineaDelCobro[];
  excluidas: LineaDelCobro[];
  total: number;
  onCancelar: () => void;
  onCerrado: () => void;
}) {
  const { toast } = useToast();
  const { bajando, bajarZipMarca } = useDescargasPeriodo();
  const [cerrando, setCerrando] = useState(false);
  const [cerrado, setCerrado] = useState<{ total: number } | null>(null);

  const sinFotos = useMemo(() => {
    const carpetas = new Set(incluidas.filter((l) => l.clienteCodigo).map((l) => l.carpeta));
    return resumen.tiendasSinFoto
      .filter((c) => carpetas.has(c))
      .map((c) => ({
        carpeta: c,
        codigo: incluidas.find((l) => l.carpeta === c)?.clienteCodigo ?? "",
        monto: incluidas.filter((l) => l.carpeta === c).reduce((s, l) => s + l.monto, 0),
      }));
  }, [incluidas, resumen.tiendasSinFoto]);

  const cerrar = async () => {
    setCerrando(true);
    try {
      const res = await fetch("/api/marketing/cobros/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcaCodigo: resumen.marcaCodigo,
          periodoId: resumen.periodoId,
          excluidos: excluidas.map(claveDeLinea),
        }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string; total?: number } | null;
      if (!res.ok) throw new Error(d?.error ?? "No se pudo cerrar el cobro.");
      setCerrado({ total: Number(d?.total ?? total) });
      toast(`Cobro cerrado · ${resumen.marcaNombre} · ${formatearMonto(Number(d?.total ?? total))}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo cerrar el cobro.", "error");
    } finally {
      setCerrando(false);
    }
  };

  if (cerrado) {
    return (
      <VentanaCentrada
        open
        onClose={onCerrado}
        title={`Cobro cerrado · ${resumen.marcaNombre}`}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrado} className={BOTON_SECUNDARIO}>
              Cerrar ventana
            </button>
            <button
              type="button"
              disabled={bajando !== null}
              onClick={() => bajarZipMarca(resumen.marcaCodigo, `${resumen.marcaNombre} · ${resumen.periodoNombre}`, resumen.periodoId)}
              className={BOTON_PRINCIPAL}
            >
              Descargar ZIP del cierre
            </button>
          </div>
        }
      >
        <div className="text-sm text-gray-700 px-6 py-4">
          {plural(incluidas.length, "gasto", "gastos")} ·{" "}
          <span className="font-semibold tabular-nums">{formatearMonto(cerrado.total)}</span>
          {excluidas.length > 0 ? ` · ${plural(excluidas.length, "gasto pasa", "gastos pasan")} al cierre siguiente` : ""}
        </div>
      </VentanaCentrada>
    );
  }

  return (
    <VentanaCentrada
      open
      onClose={cerrando ? () => {} : onCancelar}
      title={`Cerrar cobro · ${resumen.marcaNombre} · ${formatearMonto(total)}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={cerrando} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="button" onClick={cerrar} disabled={cerrando} className={BOTON_PRINCIPAL} data-testid="confirmar-cierre">
            {cerrando ? "Cerrando…" : "Cerrar"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm px-6 py-4">
        <div className="text-gray-700">
          {plural(incluidas.length, "gasto", "gastos")} · <span className="font-semibold tabular-nums">{formatearMonto(total)}</span>
        </div>
        {sinFotos.length > 0 && (
          <Aviso tono="aviso" testId="aviso-sin-fotos">
            <div className="font-medium">Atención: {plural(sinFotos.length, "tienda sin fotos", "tiendas sin fotos")}</div>
            {sinFotos.map((t) => (
              <div key={t.carpeta} className="flex items-center justify-between gap-3">
                <span>
                  {t.carpeta}
                  {t.codigo ? ` (${t.codigo})` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{formatearMonto(t.monto)}</span>
                  {t.codigo && (
                    <Link href={`/marketing/tienda/${encodeURIComponent(t.codigo)}`} className="text-blue-600 hover:text-blue-800">
                      Subir fotos
                    </Link>
                  )}
                </span>
              </div>
            ))}
          </Aviso>
        )}
        {excluidas.length > 0 && (
          <div className="px-1 text-gray-700">
            Excluidos de este cierre: {plural(excluidas.length, "gasto", "gastos")} ·{" "}
            <span className="tabular-nums">{formatearMonto(excluidas.reduce((s, l) => s + l.monto, 0))}</span> · pasan al cierre siguiente
          </div>
        )}
      </div>
    </VentanaCentrada>
  );
}

"use client";

// Pestaña «Configuración» de Comisiones — a pantalla completa, SOLO admin.
//
// 🩸 Daniel, 3-sep-2026, textual: «¿por qué en card y no como tab en toda la
// pantalla normal?». Hasta hoy la configuración era un modal («Configurar»)
// que solo mostraba la tasa de venta. Ahora es el tercer modo del shell, con
// dos tarjetas con borde (sin sombra, Design System):
//
//   1. «Tasas por vendedor» — lo que tenía el modal, más la tasa de COBRO al
//      lado de la de VENTA (las dos existen en comision_vendedor_tasa y la
//      RPC usa las dos; la de cobro solo se podía tocar en la base). Los que
//      no se pagan (DEFAULT y Daniel, lib/comisiones/sin-pago) salen en gris
//      con «no se paga» y sin cajas: no hay tasa que editar para quien no cobra.
//   2. «Clientes que no comisionan» — Daniel: «crea configuración en
//      comisiones para desactivar cálculos de clientes». Grano empresa +
//      cliente + vendedor; aplica a venta y cobro. Sin «motivo»: Daniel no lo
//      pidió. Lista + «+ Agregar» que abre una fila de formulario encima de la
//      tabla (Empresa → Cliente → Vendedor → Guardar). Quitar = soft delete
//      con confirmación. El cliente se elige con ClienteSwitchPicker, el
//      ÚNICO selector de cliente de Switch del sistema.
//
// Los números de las comisiones no viven aquí: quien resta es la RPC (v7).

import { useCallback, useEffect, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import { ConfirmDeleteModal } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ClienteSwitchPicker, { type ClienteSwitchOpcion } from "@/components/catalogo/ClienteSwitchPicker";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { ROTULO_NO_SE_PAGA, sePagaComision } from "@/lib/comisiones/sin-pago";
import { ROTULO_CLIENTES_SIN_COMISION, type ExclusionActiva } from "@/lib/comisiones/exclusiones";
import { fmtDate } from "@/lib/format";
import { fechaPanamaDe } from "@/lib/fecha-panama";

// ═══ Tarjeta 1 — Tasas por vendedor ══════════════════════════════════════════

interface ConfigRow {
  vendedor_nombre: string;
  tasa_venta: number; // decimal (0.0050 = 0.5%)
  tasa_cobro: number;
  activo: boolean;
  origen: string[];
}

// decimal ↔ % humano
const toPct = (dec: number): string => (dec * 100).toFixed(2);
// % humano → decimal. parseFloat(pct)/100 evita la pérdida de precisión del
// Math.round previo (que mal-redondeaba tasas con >2 decimales).
const fromPct = (pct: string): number => (parseFloat(pct) || 0) / 100;

const CAJA_PCT =
  "w-16 rounded-md border border-gray-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none transition focus:border-black";

function TasasPorVendedor({ onSaved }: { onSaved: (msg: string) => void }) {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [pctVenta, setPctVenta] = useState<Record<string, string>>({});
  const [pctCobro, setPctCobro] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas/comisiones/config", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { vendedores: ConfigRow[] };
      setRows(data.vendedores);
      setPctVenta(Object.fromEntries(data.vendedores.map((r) => [r.vendedor_nombre, toPct(r.tasa_venta)])));
      setPctCobro(Object.fromEntries(data.vendedores.map((r) => [r.vendedor_nombre, toPct(r.tasa_cobro ?? r.tasa_venta)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleActivo = (nombre: string) =>
    setRows((prev) => prev.map((r) => (r.vendedor_nombre === nombre ? { ...r, activo: !r.activo } : r)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updates = rows.map((r) => {
        const venta = fromPct(pctVenta[r.vendedor_nombre] ?? toPct(r.tasa_venta));
        const cobro = fromPct(pctCobro[r.vendedor_nombre] ?? toPct(r.tasa_cobro));
        if (!Number.isFinite(venta) || venta < 0 || venta > 0.2) {
          throw new Error(`Tasa de venta inválida para ${r.vendedor_nombre} (0% a 20%)`);
        }
        if (!Number.isFinite(cobro) || cobro < 0 || cobro > 0.2) {
          throw new Error(`Tasa de cobro inválida para ${r.vendedor_nombre} (0% a 20%)`);
        }
        return { vendedor_nombre: r.vendedor_nombre, tasa_venta: venta, tasa_cobro: cobro, activo: r.activo };
      });
      const res = await fetch("/api/ventas/comisiones/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      onSaved("Tasas guardadas");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="tasas-titulo">
      <div className="mb-3 flex items-center justify-between gap-2">
        {/* La tasa con la que entra un vendedor nuevo se aprende una vez → ⓘ.
            No se borra: explica por qué alguien aparece ya con un número. */}
        <h3 id="tasas-titulo" className="flex items-center gap-1 text-sm font-medium text-gray-900">
          Tasas por vendedor
          <Ayuda titulo="Cómo se calcula">
            <p>Los vendedores nuevos entran con 0.50%.</p>
            <p>La tasa de venta se aplica a lo facturado con utilidad mayor a 20%; la de cobro, a lo que ese vendedor registró como recibo.</p>
          </Ayuda>
        </h3>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading || rows.length === 0}
          className="min-h-[44px] shrink-0 rounded-md bg-black px-4 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar tasas"}
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Aún no hay vendedores. Aparecerán tras el próximo sync de Switch.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3.5 font-medium">Vendedor</th>
                <th className="px-3.5 py-2 text-right font-medium">Venta</th>
                <th className="px-3.5 py-2 text-right font-medium">Cobro</th>
                <th className="px-3.5 py-2 font-medium">Empresas</th>
                <th className="py-2 pl-3.5 text-right font-medium">Activo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sePaga = sePagaComision(r.vendedor_nombre);
                return (
                  <tr
                    key={r.vendedor_nombre}
                    data-se-paga={sePaga ? "si" : "no"}
                    className={`border-b border-gray-100 last:border-0 ${sePaga ? "" : "text-gray-400"}`}
                  >
                    <td className={`py-2.5 pr-3.5 ${sePaga ? "text-gray-900" : "text-gray-400"}`}>{r.vendedor_nombre}</td>
                    {sePaga ? (
                      <>
                        <td className="px-3.5 py-2.5 text-right">
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.05"
                              min="0"
                              max="20"
                              aria-label={`Tasa de venta de ${r.vendedor_nombre}`}
                              value={pctVenta[r.vendedor_nombre] ?? ""}
                              onChange={(e) => setPctVenta((p) => ({ ...p, [r.vendedor_nombre]: e.target.value }))}
                              className={CAJA_PCT}
                            />
                            <span className="text-gray-400">%</span>
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.05"
                              min="0"
                              max="20"
                              aria-label={`Tasa de cobro de ${r.vendedor_nombre}`}
                              value={pctCobro[r.vendedor_nombre] ?? ""}
                              onChange={(e) => setPctCobro((p) => ({ ...p, [r.vendedor_nombre]: e.target.value }))}
                              className={CAJA_PCT}
                            />
                            <span className="text-gray-400">%</span>
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs text-gray-500">
                          {r.origen.length > 0 ? r.origen.join(", ") : "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3.5 py-2.5 text-right text-gray-400">—</td>
                        <td className="px-3.5 py-2.5 text-right text-gray-400">—</td>
                        <td className="px-3.5 py-2.5 text-xs text-gray-400">{ROTULO_NO_SE_PAGA}</td>
                      </>
                    )}
                    <td className="py-2.5 pl-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleActivo(r.vendedor_nombre)}
                        aria-pressed={r.activo}
                        aria-label={`${r.activo ? "Desactivar" : "Activar"} a ${r.vendedor_nombre}`}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          r.activo ? "bg-teal-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            r.activo ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
    </section>
  );
}

// ═══ Tarjeta 2 — Clientes que no comisionan ══════════════════════════════════

interface ListaExclusiones {
  exclusiones: ExclusionActiva[];
  vendedores: Record<string, string[]>;
}

const nombreEmpresa = (k: string) => EMPRESA_KEY_TO_NAME[k] ?? k;

function ClientesQueNoComisionan({ onSaved }: { onSaved: (msg: string) => void }) {
  const [datos, setDatos] = useState<ListaExclusiones | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fila de alta (encima de la tabla).
  const [agregando, setAgregando] = useState(false);
  const [empresa, setEmpresa] = useState<string>(EMPRESAS_COMISIONAN[0]);
  const [cliente, setCliente] = useState<ClienteSwitchOpcion | undefined>(undefined);
  const [vendedor, setVendedor] = useState<string>("");
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  // Quitar (soft delete) con confirmación.
  const [aQuitar, setAQuitar] = useState<ExclusionActiva | null>(null);
  const [quitando, setQuitando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas/comisiones/exclusiones", { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setDatos((await res.json()) as ListaExclusiones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista. Intenta de nuevo.");
      setDatos(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Cambiar de empresa limpia cliente y vendedor: son de ESA empresa.
  const elegirEmpresa = (k: string) => {
    setEmpresa(k);
    setCliente(undefined);
    setVendedor("");
  };

  const cancelarAlta = () => {
    setAgregando(false);
    setCliente(undefined);
    setVendedor("");
    setErrorAlta(null);
  };

  const vendedoresDeEmpresa = datos?.vendedores[empresa] ?? [];
  const clienteCodigo = cliente?.codigo?.trim().toUpperCase() ?? "";
  const puedeGuardar = !!clienteCodigo && !!vendedor && !guardando;

  async function guardar() {
    setGuardando(true);
    setErrorAlta(null);
    try {
      const res = await fetch("/api/ventas/comisiones/exclusiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_key: empresa, cliente_codigo: clienteCodigo, vendedor }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      onSaved("Listo, guardado");
      cancelarAlta();
      void load();
    } catch (err) {
      setErrorAlta(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    if (!aQuitar) return;
    setQuitando(true);
    try {
      const res = await fetch(`/api/ventas/comisiones/exclusiones?id=${aQuitar.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      onSaved("Listo, ya vuelve a comisionar");
      setAQuitar(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar. Intenta de nuevo en unos segundos.");
      setAQuitar(null);
    } finally {
      setQuitando(false);
    }
  }

  const filas = datos?.exclusiones ?? [];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="sin-comision-titulo">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="sin-comision-titulo" className="flex items-center gap-1 text-sm font-medium text-gray-900">
          {ROTULO_CLIENTES_SIN_COMISION}
          <Ayuda titulo="Qué hace esta lista">
            <p>Ese vendedor no cobra comisión por ese cliente en esa empresa: ni por lo que le vende ni por lo que le cobra.</p>
            <p>Si otro vendedor le vende o le cobra al mismo cliente, ese otro sí comisiona.</p>
          </Ayuda>
        </h3>
        {!agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            disabled={loading || !datos}
            className="min-h-[44px] shrink-0 rounded-md bg-black px-3 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
          >
            + Agregar
          </button>
        )}
      </div>

      {agregando && (
        <div className="mb-3 rounded-md border border-gray-300 bg-gray-50 p-3" data-testid="alta-sin-comision">
          <div className="grid gap-3 md:grid-cols-[1fr_1.8fr_1fr] md:items-start">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Empresa</span>
              <Select value={empresa} onValueChange={elegirEmpresa}>
                <SelectTrigger className="min-h-[44px] w-full bg-white" aria-label="Empresa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMPRESAS_COMISIONAN.map((k) => (
                    <SelectItem key={k} value={k}>{nombreEmpresa(k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div>
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Cliente</span>
              {/* El ÚNICO selector de cliente de Switch del sistema; la empresa
                  va en la URL y el servidor lista el directorio de esa empresa. */}
              <ClienteSwitchPicker
                key={empresa}
                api={`/api/ventas/comisiones/exclusiones/${empresa}`}
                directorioLabel={nombreEmpresa(empresa)}
                valor={cliente}
                onElegir={setCliente}
                disabled={guardando}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">Vendedor</span>
              <select
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                disabled={guardando}
                aria-label="Vendedor"
                className="min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-black disabled:opacity-50"
              >
                <option value="">Elige el vendedor</option>
                {vendedoresDeEmpresa.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!puedeGuardar}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={cancelarAlta}
              disabled={guardando}
              className="min-h-[44px] rounded-md px-3 text-sm text-gray-500 transition hover:text-black disabled:opacity-40"
            >
              Cancelar
            </button>
            {!puedeGuardar && !guardando && (
              <span className="text-xs text-gray-400">
                {!clienteCodigo ? "Falta elegir el cliente" : "Falta elegir el vendedor"}
              </span>
            )}
          </div>
          {errorAlta && <p className="mt-2 text-xs text-rose-600">{errorAlta}</p>}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">Cargando…</div>
      ) : error ? (
        <div className="py-8 text-center text-sm">
          <p className="text-rose-600">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-md border border-gray-200 px-3 text-xs text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
          >
            Reintentar
          </button>
        </div>
      ) : filas.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Todavía no hay clientes en esta lista: todos comisionan.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3.5 font-medium">Empresa</th>
                <th className="px-3.5 py-2 font-medium">Cliente</th>
                <th className="px-3.5 py-2 font-medium">Vendedor</th>
                <th className="px-3.5 py-2 font-medium">Desde</th>
                <th className="py-2 pl-3.5"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0" data-exclusion-id={f.id}>
                  <td className="py-2.5 pr-3.5 text-gray-500">{nombreEmpresa(f.empresa_key)}</td>
                  <td className="px-3.5 py-2.5 text-gray-900">
                    {f.cliente_nombre ?? f.cliente_codigo}
                    {f.cliente_nombre && (
                      <span className="ml-1 font-mono text-xs text-gray-400">{f.cliente_codigo}</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-gray-900">{f.vendedor}</td>
                  <td className="px-3.5 py-2.5 text-xs text-gray-500">{fmtDate(fechaPanamaDe(f.creado_en))}</td>
                  <td className="py-2.5 pl-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setAQuitar(f)}
                      aria-label={`Quitar a ${f.cliente_nombre ?? f.cliente_codigo} de la lista de ${f.vendedor}`}
                      title="Quitar de la lista"
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-lg text-gray-300 transition hover:text-rose-600 active:scale-[0.97]"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quitar es soft delete (activa = false): la fila queda como historial. */}
      <ConfirmDeleteModal
        open={aQuitar !== null}
        title="¿Quitar de la lista?"
        description={
          aQuitar
            ? `${aQuitar.vendedor} vuelve a cobrar comisión por ${aQuitar.cliente_nombre ?? aQuitar.cliente_codigo} en ${nombreEmpresa(aQuitar.empresa_key)}, en venta y en cobro, desde el próximo cálculo.`
            : ""
        }
        confirmLabel="Quitar"
        loadingLabel="Quitando..."
        loading={quitando}
        onConfirm={() => void quitar()}
        onCancel={() => { if (!quitando) setAQuitar(null); }}
      />
    </section>
  );
}

// ═══ La pestaña ══════════════════════════════════════════════════════════════

export function ComisionesConfiguracionView() {
  const [msg, setMsg] = useState<string | null>(null);
  const avisar = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 3000);
  }, []);

  return (
    <div className="space-y-4">
      {msg && <p className="text-xs text-teal-700" role="status">{msg}</p>}
      <TasasPorVendedor onSaved={avisar} />
      <ClientesQueNoComisionan onSaved={avisar} />
    </div>
  );
}

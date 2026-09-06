"use client";

// «Tasas por vendedor» — la primera tarjeta de Comisiones › Configuración.
//
// 🩸 Daniel, 3-sep-2026: «¿por qué en card y no como tab en toda la pantalla
// normal?». Trae la tasa de VENTA y la de COBRO al lado (las dos existen en
// `comision_vendedor_tasa` y la RPC usa las dos; la de cobro solo se podía
// tocar en la base). UNA FILA POR PERSONA («¿por qué hay 4 Reinaldo?»): el
// servidor junta las grafías de Switch por el alias y el nombre se muestra
// capitalizado («Reynaldo Espinosa», con Y). Los que no se pagan (DEFAULT y
// Daniel) no están — Daniel: «quítalo» — y los retirados tampoco.
//
// 🩸 SE FUE EL INTERRUPTOR «ACTIVO» (6-sep-2026). Daniel: «quitarlo».
// MEDIDO: no le quitaba la comisión a NADIE. `comision_b2b_v8` une la tabla de
// tasas SIN filtrar por `activo` (el `t.activo = true` de la CTE `universo`
// solo arma la lista de vendedores que NO vendieron ni cobraron nada; cualquiera
// con una venta o un cobro entra igual por el UNION, y su tasa se aplica desde
// un LEFT JOIN sin filtro). Prueba: `REY STOUTE AGUAS` estaba en
// `activo = false` desde el 4-sep-2026 y la RPC lo SEGUÍA devolviendo con
// comisión los 9 meses de 2026 ($49,83) — solo desaparecía de la pantalla por
// estar en la lista de retirados, que es otra cosa. Un interruptor que promete
// algo que no cumple es peor que no tenerlo.
//
// 🔴 LA COLUMNA `activo` DE LA BASE NO SE DROPEA (patrón de la casa): queda sin
// lectores en la pantalla y sin escritores en el PUT. Para sacar a alguien de
// Comisiones hay UNA sola forma, y sí funciona en el servidor: la lista de
// retirados (`src/lib/comisiones/retirados.ts`).

import { useCallback, useEffect, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { estaRetirado } from "@/lib/comisiones/retirados";

interface ConfigRow {
  vendedor_nombre: string;
  tasa_venta: number; // decimal (0.0050 = 0.5%)
  tasa_cobro: number;
  origen: string[];
}

// decimal ↔ % humano
const toPct = (dec: number): string => (dec * 100).toFixed(2);
// % humano → decimal. parseFloat(pct)/100 evita la pérdida de precisión del
// Math.round previo (que mal-redondeaba tasas con >2 decimales).
const fromPct = (pct: string): number => (parseFloat(pct) || 0) / 100;

const CAJA_PCT =
  "w-16 rounded-md border border-gray-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none transition focus:border-black";

export function TasasPorVendedor({ onSaved }: { onSaved: (msg: string) => void }) {
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
      // El servidor ya los deja fuera; por si llega una respuesta vieja, aquí
      // tampoco se dibuja a quien no se paga (Daniel: «quítalo») ni a los
      // retirados de Comisiones (Aguas — «te dije que eliminaras Rey Stoute
      // Aguas», lista en `lib/comisiones/retirados`).
      setRows(data.vendedores.filter((r) => sePagaComision(r.vendedor_nombre) && !estaRetirado(r.vendedor_nombre)));
      setPctVenta(Object.fromEntries(data.vendedores.map((r) => [r.vendedor_nombre, toPct(r.tasa_venta)])));
      setPctCobro(Object.fromEntries(data.vendedores.map((r) => [r.vendedor_nombre, toPct(r.tasa_cobro ?? r.tasa_venta)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
        return { vendedor_nombre: r.vendedor_nombre, tasa_venta: venta, tasa_cobro: cobro };
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const nombre = nombreVendedorEnPantalla(r.vendedor_nombre);
                return (
                  <tr
                    key={r.vendedor_nombre}
                    data-vendedor={r.vendedor_nombre}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2.5 pr-3.5 text-gray-900">{nombre}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.05"
                          min="0"
                          max="20"
                          aria-label={`Tasa de venta de ${nombre}`}
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
                          aria-label={`Tasa de cobro de ${nombre}`}
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

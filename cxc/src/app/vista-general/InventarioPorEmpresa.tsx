"use client";

// ── INVENTARIO VALORIZADO, POR EMPRESA ──────────────────────────────────────
//
// El activo más grande del grupo, que hasta hoy no se veía en ninguna pantalla.
// El dato ya viajaba todas las madrugadas a `switch_articulo_info`; nadie lo
// sumaba nunca.
//
// ── 🔴 LAS TRES COSAS QUE ESTA PANTALLA NO PUEDE HACER ──────────────────────
//
// 1. **NO puede rotular como "lo que tengo" el valor a precio de etiqueta.** Son
//    $4,06M contra $2,80M al costo. El costo es la plata que Daniel PUSO; el
//    precio es lo que valdría si vendiera todo, o sea potencial. Por eso el
//    número grande es el costo, y el otro va abajo, en gris y con la palabra
//    "potencial" pegada.
//
// 2. **NO puede mostrar $0 en Boston ni en Multifashion.** No sincronizan
//    catálogo (decisión de Daniel: el cron cubre las 6 de Fashion Group). Un
//    cero se lee como "no tengo mercancía", que es falso — tienen bodega, lo que
//    no hay es dato. Van en su propio renglón, con el motivo escrito.
//
// 3. **NO puede decir "ahora".** El dato es de la madrugada anterior (el cron
//    corre 04:30-04:50 UTC = 11:30-11:50 pm Panamá). La fecha va SIEMPRE al
//    lado del número, y si pasó de 26 h el aviso se pone en ámbar.

import Link from "next/link";
import { money, moneyK } from "./formato";
import { fmtFrescura } from "@/lib/ventas/referencia-info";

export interface InventarioEmpresaRow {
  key: string;
  name: string;
  articulos: number;
  conStock: number;
  unidades: number;
  costo: number;
  precio: number;
  sinCostoArticulos: number;
  sinCostoUnidades: number;
  unidadesNegativas: number;
  medidoEn: string | null;
}

export interface InventarioData {
  disponible: boolean;
  totalUnidades: number;
  totalCosto: number;
  totalPrecio: number;
  porEmpresa: InventarioEmpresaRow[];
  sinInventario: { key: string; name: string; motivo: string }[];
  sinCosto: { articulos: number; unidades: number };
  medidoEn: string | null;
  viejo: boolean;
  horas: number | null;
}

/** `82997` → `"82,997"`. Piezas: enteras, nunca con centavos. */
export function piezas(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * La frase de frescura. Es OBLIGATORIA al lado del número: sin ella, un dato de
 * anoche se lee como el de este momento. `null` cuando no hay sello — y entonces
 * lo dice, no se inventa una hora.
 */
export function textoFrescura(medidoEn: string | null, viejo: boolean): string {
  if (!medidoEn) return "sin fecha de medición";
  return `${viejo ? "⚠ sin actualizar desde el " : "al "}${fmtFrescura(medidoEn)}`;
}

/** El valor AL COSTO para la tarjeta chica del tablero. */
export function InventarioKpiValue({ inv }: { inv: InventarioData | null }): string {
  if (!inv || !inv.disponible) return "—";
  return moneyK(inv.totalCosto);
}

export default function InventarioPorEmpresa({ inv }: { inv: InventarioData | null }) {
  // 🔴 Sin dato NO va un cero: va la razón. Un inventario en $0 y un inventario
  // que no se pudo medir se ven idénticos, y uno de los dos es una mentira.
  if (!inv || !inv.disponible) {
    return (
      <div data-panel="inventario" className="rounded-[14px] border border-stone-200 bg-white p-4">
        <h3 className="text-xs font-semibold text-stone-700">Inventario</h3>
        <p className="mt-2 text-sm text-stone-500">
          {inv === null
            ? "No se pudo leer el inventario en este momento. Volvé a intentar en unos segundos."
            : "El inventario todavía no está conectado — falta correr la migración en Supabase."}
        </p>
      </div>
    );
  }

  return (
    <div data-panel="inventario" className="rounded-[14px] border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold text-stone-700">Inventario por empresa</h3>
        <span
          data-col="frescura"
          className={`text-xs tabular-nums ${inv.viejo ? "text-amber-600 font-medium" : "text-stone-400"}`}
        >
          {textoFrescura(inv.medidoEn, inv.viejo)}
        </span>
      </div>
      {/* La bajada dice CUÁL de los dos números es plata. Sin ella, los $4,06M
          de abajo se leen como parte de lo que tiene. */}
      <p className="mt-0.5 text-xs text-stone-500">
        Lo que costó la mercancía que hay en bodega. El valor a precio de etiqueta va aparte:
        es lo que valdría si se vendiera todo, no plata que ya tengas.
      </p>

      <div className="mt-3 space-y-2">
        {inv.porEmpresa.map((e) => (
          <div key={e.key} data-fila-inventario={e.key} className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div data-col="empresa" className="truncate text-sm font-medium text-stone-800">{e.name}</div>
              <div className="text-xs text-stone-400 tabular-nums">
                <span data-col="unidades">{piezas(e.unidades)} piezas</span>
                {" · a precio "}
                <span data-col="precio">{money(e.precio)}</span>
              </div>
            </div>
            <div data-col="costo" className="shrink-0 text-sm font-semibold tabular-nums text-stone-900">
              {money(e.costo)}
            </div>
          </div>
        ))}
      </div>

      {/* El total del grupo va al PIE, después del desglose: primero de quién es
          la plata y recién después cuánta. Y rotulado "al costo" en el mismo
          renglón — la etiqueta viaja pegada al número, no en otro lado de la
          pantalla donde se puede recortar. */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-stone-100 pt-3">
        <span className="text-xs font-medium text-stone-500">
          Total al costo <span className="text-stone-400">· {piezas(inv.totalUnidades)} piezas</span>
        </span>
        <span data-col="total-costo" className="text-lg font-bold tabular-nums text-stone-900">
          {money(inv.totalCosto)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-stone-400">
        <span>A precio de etiqueta — potencial, no plata que tengas</span>
        <span data-col="total-precio" className="tabular-nums">{money(inv.totalPrecio)}</span>
      </div>

      {/* ── Lo que NO se midió, dicho con todas las letras ── */}
      {(inv.sinInventario.length > 0 || inv.sinCosto.articulos > 0) && (
        <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
          {inv.sinInventario.map((s) => (
            <p key={s.key} data-fila-sin-inventario={s.key} className="text-xs text-stone-500">
              <span className="font-medium text-stone-600">{s.name}</span>: {s.motivo}
            </p>
          ))}
          {inv.sinCosto.articulos > 0 && (
            <p data-col="sin-costo" className="text-xs text-stone-500 tabular-nums">
              {piezas(inv.sinCosto.unidades)} piezas ({inv.sinCosto.articulos}{" "}
              {inv.sinCosto.articulos === 1 ? "artículo" : "artículos"}) no tienen costo cargado en Switch:
              quedan fuera del valor de arriba.
            </p>
          )}
        </div>
      )}

      <Link
        href="/referencia"
        className="mt-1 inline-flex min-h-[44px] min-w-[44px] items-center text-xs font-medium text-teal-600 hover:text-teal-700"
      >
        Ver artículo por artículo →
      </Link>
    </div>
  );
}

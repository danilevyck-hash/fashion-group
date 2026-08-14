/**
 * LA PRUEBA DE QUE SIGUE ACTUALIZANDO — contra PRODUCCIÓN, sin escribir NADA.
 *
 * Saltearse las escrituras que no cambian nada solo sirve si lo que SÍ cambió se
 * sigue escribiendo. Este script lo demuestra con el motor REAL, los productos
 * REALES de producción y el Switch REAL, en `dryRun` (o sea: cero escrituras).
 *
 * Corre dos veces el MISMO sync:
 *
 *   1. CONTROL — tal cual está la base. `escrituras` es cuántos UPDATE haría de
 *      verdad esta corrida, y `sinCambios` cuántos se ahorra.
 *   2. MUTADO — se le cambia a UN producto el valor guardado de una columna que
 *      el sync escribe (`disponibilidad`, +1) EN LA RESPUESTA DE LA LECTURA, no
 *      en la base. Para el motor es indistinguible de que ese artículo se haya
 *      movido en Switch, que es justo lo que hay que probar. Se exige
 *      `escrituras = control + 1`.
 *
 * 🔴 NO TOCA LA BASE. El doble de Supabase reenvía TODO al cliente real y solo
 * interviene la lectura de productos; y el motor va en `dryRun`, así que ningún
 * `update`/`insert`/`upsert` sale. Igual se verifica al final que la fila mutada
 * siga con su valor original.
 *
 * ⚠️ SESIÓN ÚNICA POR EMPRESA: mirar el calendario de crons antes de correr.
 *
 *   MARCA=tommy DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-catalogo-escribe-lo-que-cambio.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const MARCA = (process.env.MARCA ?? "tommy") as "tommy" | "calvin" | "reebok" | "joybees";

interface Marca {
  tabla: string;
  server: () => Promise<SupabaseClient>;
  sync: (db: SupabaseClient) => Promise<unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Envuelve un query builder de PostgREST conservando el encadenado: cada método
 *  que devuelve otro builder (`.select()`, `.eq()`, …) vuelve envuelto, así el
 *  `await` final pasa por `alTerminar`. Sin esto, `.select()` devolvería el
 *  builder crudo y la intervención se perdería en silencio. */
function envolver(builder: any, alTerminar: (r: any) => any): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return (res: (v: any) => any, rej?: (e: any) => any) =>
          Promise.resolve(target as PromiseLike<any>).then((r) => res(alTerminar(r)), rej);
      }
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        const out = v.apply(target, args);
        const esBuilder = out && typeof out === "object" && typeof (out as any).then === "function";
        return esBuilder ? envolver(out, alTerminar) : out;
      };
    },
  });
}

/** Cliente real + una sola fila con una columna movida EN LA RESPUESTA de la
 *  lectura de productos. La base NO se toca. */
function dbConUnaFilaMovida(real: SupabaseClient, tabla: string, columna: string) {
  const info = { sku: "", antes: null as unknown, despues: null as unknown, hecho: false };
  const alTerminar = (r: any) => {
    const filas = r?.data;
    if (info.hecho || !Array.isArray(filas) || filas.length === 0) return r;
    if (!(columna in (filas[0] as object))) return r;
    const fila = (filas.find((x: any) => x?.[columna] != null) ?? filas[0]) as Record<string, unknown>;
    info.sku = String(fila.sku ?? "?");
    info.antes = fila[columna];
    info.despues = Number(fila[columna] ?? 0) + 1;
    fila[columna] = info.despues;
    info.hecho = true;
    return r;
  };
  const proxy = new Proxy(real as any, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (t: string) => {
          const b = target.from(t);
          return t === tabla ? envolver(b, alTerminar) : b;
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as SupabaseClient;
  return { proxy, info };
}

async function main() {
  const marcas: Record<string, Marca> = {
    tommy: {
      tabla: "tommy_products",
      server: async () => (await import("../src/lib/tommy-supabase-server")).tommyServer,
      sync: async (db) => {
        const { syncCatalogo } = await import("../src/lib/switch-api/sync-catalogo");
        const { buildTommyDerivedFields } = await import("../src/lib/tommy-nombres");
        const { isTommyArticulo } = await import("../src/lib/switch-api/sync-catalogo-tommy");
        return syncCatalogo(
          {
            db,
            marca: "tommy",
            syncLogType: "catalogo_tommy",
            productsTable: "tommy_products",
            empresas: [{ empresaKey: "fashion_shoes", categories: [], defaultCategory: "otros" }],
            articuloFilter: isTommyArticulo,
            stockFields: (e, d) => ({ existencia: e, disponibilidad: d, stock: e }),
            columnasEscritas: ["existencia", "disponibilidad", "stock", "category", "gender", "bulto_pzas"],
            derive: {
              extraCols: ["nombre_manual"],
              insertFields: (a) => {
                const x = buildTommyDerivedFields(a.codigo, a.descripcion);
                return { name: x.name, category: x.category, gender: x.gender };
              },
              updateFields: (a, existing) => {
                const x = buildTommyDerivedFields(a.codigo, a.descripcion);
                const cat = { category: x.category, gender: x.gender };
                return existing.nombre_manual === true ? cat : { ...cat, name: x.name };
              },
            },
          },
          { dryRun: true },
        );
      },
    },
  };

  const m = marcas[MARCA];
  if (!m) throw new Error(`marca ${MARCA} sin receta en este script`);
  const real = await m.server();

  console.log(`\n════ ¿se escribe lo que cambió? · ${MARCA} · PRODUCCIÓN · dryRun ════\n`);

  const control = (await m.sync(real)) as { empresas: Array<Record<string, number>> };
  const c = control.empresas[0];
  console.log(
    `   CONTROL  comparados=${c.comparados} · escrituras=${c.escrituras} · sinCambios=${c.sinCambios}` +
      `  (se ahorran ${((c.sinCambios / Math.max(1, c.comparados)) * 100).toFixed(1)}%)`,
  );

  const { proxy, info } = dbConUnaFilaMovida(real, m.tabla, "disponibilidad");
  const mutado = (await m.sync(proxy)) as { empresas: Array<Record<string, number>> };
  const x = mutado.empresas[0];
  console.log(
    `   MUTADO   comparados=${x.comparados} · escrituras=${x.escrituras} · sinCambios=${x.sinCambios}` +
      `   (sku ${info.sku}: disponibilidad ${String(info.antes)} → ${String(info.despues)} SOLO en la lectura)`,
  );

  // La fila de la base NO se tocó.
  const { data } = await real.from(m.tabla).select("sku, disponibilidad").eq("sku", info.sku).limit(1);
  const enBase = (data as Array<{ disponibilidad: unknown }> | null)?.[0]?.disponibilidad;
  const intacta = String(enBase) === String(info.antes);

  const ok = x.escrituras === c.escrituras + 1 && x.comparados === c.comparados && intacta;
  console.log(
    `\n   ${ok ? "🟢" : "🔴"} un solo campo distinto ⇒ ${x.escrituras - c.escrituras} escritura(s) más ` +
      `· la base quedó ${intacta ? "INTACTA" : "TOCADA (🔴)"} (disponibilidad=${String(enBase)})\n`,
  );
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error("FALLÓ:", e?.message ?? e);
  process.exitCode = 1;
});

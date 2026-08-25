/**
 * ¿El cron de compras rompió algo? — foto ANTES / foto DESPUÉS, contra producción.
 *
 * SOLO LECTURA. No corre el cron: saca la foto y compara. El cron se dispara
 * aparte (curl con Bearer CRON_SECRET) para que esto no pueda "arreglar" lo que
 * mide.
 *
 * 🔴 LO QUE PRUEBA, y es lo que importa: **ninguna fila que ya existía cambió de
 * valor**. Se comparan las columnas de NEGOCIO fila por fila, por su llave
 * `(empresa_key, n_interno, linea)`. `synced_at` y `updated_at` quedan FUERA a
 * propósito: el upsert los reescribe por diseño y compararlos marcaría como
 * "cambió" a toda la ventana sin que un solo dato se haya movido.
 *
 * 🩸 Compara por LLAVE, no por posición ni como conjunto: dos filas
 * intercambiadas se verían idénticas como conjunto, y basta que entre una fila
 * nueva para que todas las posiciones se corran.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-ingresos-cron-produccion.ts antes|despues|comparar
 */
import { writeFileSync, readFileSync } from "node:fs";
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { INGRESOS_EMPRESA_KEYS } from "../src/lib/switch-api/ingresos-mercancia-web";

const MODO = process.argv[2] ?? "antes";
const ARCHIVO = (m: string) => `/tmp/ingresos-foto-${m}.json`;

/** Columnas de NEGOCIO. `synced_at`/`updated_at` quedan fuera: son del sync. */
const COLS =
  "empresa_key, fecha, n_interno, linea, sucursal, proveedor, codigo_articulo, articulo, referencia, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, costo_promedio, utilidad_pct";

type Fila = Record<string, unknown> & { empresa_key: string; n_interno: string; linea: number };
const llave = (f: Fila) => `${f.empresa_key}|${f.n_interno}|${f.linea}`;

async function foto(): Promise<Fila[]> {
  const filas = await leerTodoPaginado<Fila>("switch_ingresos_mercancia (foto)", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("switch_ingresos_mercancia")
      .select(COLS, pedirCount ? { count: "exact" } : {})
      .in("empresa_key", [...INGRESOS_EMPRESA_KEYS])
      // Orden TOTAL: paginar con filas empatadas puede repetir o saltear.
      .order("empresa_key", { ascending: true })
      .order("n_interno", { ascending: true })
      .order("linea", { ascending: true })
      .range(desde, hasta),
  );
  return filas;
}

function resumen(filas: Fila[]) {
  const por = new Map<string, { lineas: number; docs: Set<string>; unidades: number; max: string }>();
  for (const f of filas) {
    const e = por.get(f.empresa_key) ?? { lineas: 0, docs: new Set<string>(), unidades: 0, max: "" };
    e.lineas++;
    e.docs.add(f.n_interno);
    e.unidades += Number(f.cantidad ?? 0);
    const fe = String(f.fecha ?? "");
    if (fe > e.max) e.max = fe;
    por.set(f.empresa_key, e);
  }
  return por;
}

function imprimirResumen(filas: Fila[]) {
  const por = resumen(filas);
  console.log(`  TOTAL ${filas.length} líneas`);
  for (const k of [...por.keys()].sort()) {
    const e = por.get(k)!;
    console.log(
      `  ${k.padEnd(15)} ${String(e.lineas).padStart(6)} líneas · ${String(e.docs.size).padStart(4)} docs · ` +
        `${e.unidades.toLocaleString("es-PA").padStart(11)} uds · hasta ${e.max}`,
    );
  }
}

async function main() {
  if (MODO === "comparar") {
    const antes = JSON.parse(readFileSync(ARCHIVO("antes"), "utf8")) as Fila[];
    const despues = JSON.parse(readFileSync(ARCHIVO("despues"), "utf8")) as Fila[];

    const mapAntes = new Map(antes.map((f) => [llave(f), f]));
    const mapDespues = new Map(despues.map((f) => [llave(f), f]));

    /**
     * 🔴 DOS CLASES DE CAMBIO, y confundirlas sería el error.
     *
     * `precio` (el precio de ETIQUETA) y su `utilidad_pct` derivada NO están
     * congelados al momento del ingreso: el reporte de Switch los recalcula
     * contra el precio VIGENTE del artículo. Medido el 25-ago-2026 con el
     * documento `fashion_wear 19-000000743` línea 10 (`69JA520WF5`): la carga a
     * mano del 11-ago guardó 25.00 / 36.64 y hoy el CSV CRUDO de Switch dice
     * **21.00 / 24.5714** — alguien le cambió el precio de etiqueta allá. El
     * sync escribió lo que Switch dice, que es la regla del módulo ("se guarda
     * TAL COMO VIENE, no se corrige").
     *
     * Lo que NO puede moverse nunca es lo que sostiene el "Compré": la
     * cantidad, los costos, la fecha y la identidad de la línea.
     */
    const ESPEJO_DE_SWITCH = new Set(["precio", "utilidad_pct"]);
    const cambiadas: string[] = [];
    const espejo: string[] = [];
    const desaparecidas: string[] = [];
    let camposComparados = 0;
    for (const [k, a] of mapAntes) {
      const d = mapDespues.get(k);
      if (!d) {
        desaparecidas.push(k);
        continue;
      }
      for (const col of Object.keys(a)) {
        camposComparados++;
        if (String(a[col]) !== String(d[col])) {
          const linea = `${k} · ${col}: ${String(a[col])} → ${String(d[col])}`;
          if (ESPEJO_DE_SWITCH.has(col)) espejo.push(linea);
          else cambiadas.push(linea);
        }
      }
    }
    const nuevas = [...mapDespues.keys()].filter((k) => !mapAntes.has(k));

    console.log("═══ ANTES ═══");
    imprimirResumen(antes);
    console.log("\n═══ DESPUÉS ═══");
    imprimirResumen(despues);

    console.log("\n═══ VEREDICTO ═══");
    console.log(`  filas que ya existían .... ${mapAntes.size}`);
    console.log(`  campos comparados ........ ${camposComparados}`);
    console.log(`  🔴 CANTIDAD/COSTO/FECHA cambiados ... ${cambiadas.length}`);
    console.log(`  🔴 filas DESAPARECIDAS .............. ${desaparecidas.length}`);
    console.log(`  ⚠️  precio de etiqueta re-espejado ... ${espejo.length}`);
    console.log(`  ✅ filas NUEVAS ..................... ${nuevas.length}`);
    for (const c of cambiadas.slice(0, 20)) console.log(`     🔴 ${c}`);
    for (const c of espejo.slice(0, 20)) console.log(`     ⚠️  ${c}`);
    for (const c of desaparecidas.slice(0, 20)) console.log(`     falta: ${c}`);

    // Qué entró, por empresa y por fecha — es lo que hay que poder contar.
    const porEmpresa = new Map<string, { docs: Set<string>; uds: number; min: string; max: string }>();
    for (const k of nuevas) {
      const f = mapDespues.get(k)!;
      const e = porEmpresa.get(f.empresa_key) ?? {
        docs: new Set<string>(),
        uds: 0,
        min: "9999",
        max: "0000",
      };
      e.docs.add(f.n_interno);
      e.uds += Number(f.cantidad ?? 0);
      const fe = String(f.fecha ?? "");
      if (fe < e.min) e.min = fe;
      if (fe > e.max) e.max = fe;
      porEmpresa.set(f.empresa_key, e);
    }
    console.log("\n═══ COMPRAS NUEVAS ═══");
    if (porEmpresa.size === 0) console.log("  (ninguna)");
    for (const k of [...porEmpresa.keys()].sort()) {
      const e = porEmpresa.get(k)!;
      console.log(
        `  ${k.padEnd(15)} ${String(e.docs.size).padStart(3)} documentos · ` +
          `${e.uds.toLocaleString("es-PA").padStart(9)} uds · ${e.min} → ${e.max}`,
      );
    }

    const ok = cambiadas.length === 0 && desaparecidas.length === 0;
    console.log(
      `\n${ok ? "🟢 NI UNA CANTIDAD, NI UN COSTO, NI UNA FECHA SE MOVIÓ" : "🔴 SE MOVIÓ UN DATO QUE SOSTIENE EL «Compré»"}`,
    );
    process.exit(ok ? 0 : 1);
  }

  const filas = await foto();
  writeFileSync(ARCHIVO(MODO), JSON.stringify(filas));
  console.log(`Foto "${MODO}" guardada en ${ARCHIVO(MODO)}`);
  imprimirResumen(filas);
}

main().catch((e) => {
  console.error("FALLÓ:", e instanceof Error ? e.message : e);
  process.exit(1);
});

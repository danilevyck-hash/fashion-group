/**
 * LOS OCHO NÚMEROS DEL HUB, POR LOS DOS CAMINOS — contra PRODUCCIÓN, solo lectura.
 *
 * Camino A («filas»): baja las filas tal como las baja hoy el navegador
 *   (`products?active=true` con las MISMAS columnas de `marcas.ts`, más el
 *   `inventory` de Reebok) y cuenta con `contarDeFilas`, o sea con
 *   `productosALaVenta` — la regla de verdad del catálogo.
 *
 * Camino B («base»): corre el SQL que GENERA `lib/catalogo/contadores.ts` —el
 *   mismo que va en la migración— por la Management API de Supabase.
 *
 * Los dos tienen que dar EXACTAMENTE lo mismo, marca por marca y número por
 * número. Si uno solo difiere, este script sale con código 1 y lo dice: la regla
 * nueva se separó de la vieja y NO se ajusta a ojo.
 *
 * También imprime cuántos BYTES viajaban al navegador con el camino viejo, que
 * es la razón del cambio.
 *
 *   npx tsx scripts/_verif-contadores-hub.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CLAUSULA_SIN_FOTO,
  MARCAS_DEL_HUB,
  columnasParaContar,
  contarDeFilas,
  sinFoto,
  sqlContadores,
  type MarcaContada,
  type ContadoresMarca,
  type FilaContada,
} from "../src/lib/catalogo/contadores";

const RAIZ = path.resolve(__dirname, "..");
const PROJECT_REF = "rspocgqhtpveytgbtler";

function env(): Record<string, string> {
  const txt = readFileSync(path.join(RAIZ, ".env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const linea of txt.split("\n")) {
    if (!linea.includes("=") || linea.trim().startsWith("#")) continue;
    const i = linea.indexOf("=");
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const E = env();

// Las columnas REALES de `marcas.ts` (products.cols). Se copian a propósito: el
// script tiene que bajar lo mismo que baja el navegador hoy, byte por byte, para
// que el «antes» sea el de verdad.
const COLS: Record<MarcaContada, string> = {
  reebok:
    "id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at",
  joybees:
    "id,sku,name,category,gender,price,stock,existencia,disponibilidad,keep_visible,image_url,active,popular,is_regalia,badge,created_at",
  tommy:
    "id,sku,name,category,gender,price,stock,existencia,disponibilidad,keep_visible,image_url,active,badge,nombre_manual,bulto_pzas,created_at",
  calvin:
    "id,sku,name,category,gender,price,stock,existencia,disponibilidad,keep_visible,image_url,active,badge,nombre_manual,bulto_pzas,created_at",
};
const TABLA: Record<MarcaContada, string> = {
  reebok: "products",
  joybees: "joybees_products",
  tommy: "tommy_products",
  calvin: "calvin_products",
};

async function rest<T>(tabla: string, query: string): Promise<{ filas: T[]; bytes: number }> {
  const url = `${E.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tabla}?${query}`;
  const r = await fetch(url, {
    headers: {
      apikey: E.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${tabla}: HTTP ${r.status} ${txt.slice(0, 300)}`);
  return { filas: JSON.parse(txt) as T[], bytes: Buffer.byteLength(txt, "utf8") };
}

async function sql<T>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`SQL: HTTP ${r.status} ${txt.slice(0, 500)}`);
  return JSON.parse(txt) as T[];
}

async function main() {
  console.log("\n════ Los ocho números del hub — camino viejo (filas) vs camino nuevo (base) ════\n");

  // ── Camino A: las filas, como las baja el navegador hoy ────────────────────
  const porFilas: Record<string, ContadoresMarca> = {};
  let stockReebok: Record<string, number> | undefined;
  let bytesTotales = 0;

  for (const marca of MARCAS_DEL_HUB) {
    const { filas, bytes } = await rest<FilaContada>(
      TABLA[marca],
      `select=${COLS[marca]},oculto_manual&active=eq.true&order=created_at.desc`,
    );
    bytesTotales += bytes;

    let stockPorProducto: Record<string, number> | undefined;
    if (marca === "reebok") {
      // Reebok: su existencia por talla vive en `inventory` (el mismo respaldo
      // que usa el catálogo). Paginado — son más de 1.000 filas posibles.
      const mapa: Record<string, number> = {};
      let desde = 0;
      for (;;) {
        const url = `select=id,product_id,size,quantity&order=size.asc,id.asc`;
        const r = await fetch(`${E.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/inventory?${url}`, {
          headers: {
            apikey: E.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}`,
            Range: `${desde}-${desde + 999}`,
          },
        });
        const txt = await r.text();
        if (!r.ok) throw new Error(`inventory: HTTP ${r.status} ${txt.slice(0, 300)}`);
        bytesTotales += Buffer.byteLength(txt, "utf8");
        const lote = JSON.parse(txt) as { product_id: string; quantity: number }[];
        for (const i of lote) mapa[i.product_id] = (mapa[i.product_id] || 0) + i.quantity;
        if (lote.length < 1000) break;
        desde += 1000;
      }
      stockPorProducto = mapa;
      stockReebok = mapa;
    }

    porFilas[marca] = contarDeFilas(marca, filas, stockPorProducto);
    console.log(
      `  ${marca.padEnd(8)} ${String(filas.length).padStart(4)} filas bajadas` +
        ` · ${(bytes / 1024).toFixed(1).padStart(6)} KB`,
    );
  }
  console.log(`\n  Total que viaja hoy al navegador: ${(bytesTotales / 1024).toFixed(1)} KB\n`);

  // ── Camino B: el SQL generado por el módulo ────────────────────────────────
  const filasSql = await sql<{
    marca: string;
    a_la_venta: number;
    sin_foto: number;
    tarjetas: number;
    tarjetas_sin_foto: number;
  }>(sqlContadores());
  const porBase: Record<string, ContadoresMarca> = {};
  for (const f of filasSql) {
    porBase[f.marca] = {
      aLaVenta: Number(f.a_la_venta),
      sinFoto: Number(f.sin_foto),
      tarjetas: Number(f.tarjetas),
      tarjetasSinFoto: Number(f.tarjetas_sin_foto),
    };
  }

  // ── Comparación ────────────────────────────────────────────────────────────
  // 🔴 Las TARJETAS son el número del hub: lo que el cliente ve al entrar. En
  // Joybees no coincide con las filas a propósito (11 modelos de dos tallas).
  console.log("  marca      filas (TS → base)   tarjetas (TS → base)   sin foto (TS → base)   ¿igual?");
  console.log("  ──────────────────────────────────────────────────────────────────────────────────────");
  let diferencias = 0;
  for (const marca of MARCAS_DEL_HUB) {
    const a = porFilas[marca];
    const b = porBase[marca];
    const igual =
      !!b &&
      a.aLaVenta === b.aLaVenta &&
      a.sinFoto === b.sinFoto &&
      a.tarjetas === b.tarjetas &&
      a.tarjetasSinFoto === b.tarjetasSinFoto;
    if (!igual) diferencias++;
    console.log(
      `  ${marca.padEnd(9)} ${String(a.aLaVenta).padStart(6)} → ${String(b?.aLaVenta ?? "—").padStart(6)}` +
        `      ${String(a.tarjetas).padStart(6)} → ${String(b?.tarjetas ?? "—").padStart(6)}` +
        `        ${String(a.sinFoto).padStart(5)} → ${String(b?.sinFoto ?? "—").padStart(5)}` +
        `          ${igual ? "sí" : "🔴 NO"}`,
    );
  }

  // ── CONTROL del camino de RESPALDO ────────────────────────────────────────
  // El servidor, cuando la función de la base todavía no existe, pide SOLO las
  // columnas que la regla lee (`columnasParaContar`). Si esa lista se quedara
  // corta, `disponibleVendible` leería `undefined` y caería al siguiente
  // respaldo EN SILENCIO — o sea, números distintos sin ningún error.
  console.log("\n  CONTROL del respaldo (solo las columnas que la regla lee):");
  for (const marca of MARCAS_DEL_HUB) {
    const { filas } = await rest<FilaContada>(
      TABLA[marca],
      `select=${columnasParaContar(marca)}&active=eq.true`,
    );
    const stock = marca === "reebok" ? stockReebok : undefined;
    const c = contarDeFilas(marca, filas, stock);
    const a = porFilas[marca];
    const igual =
      c.aLaVenta === a.aLaVenta && c.sinFoto === a.sinFoto && c.tarjetas === a.tarjetas;
    if (!igual) diferencias++;
    console.log(
      `    ${marca.padEnd(8)} ${String(c.aLaVenta).padStart(4)} filas / ${String(c.tarjetas).padStart(4)} tarjetas` +
        `   contra ${String(a.aLaVenta).padStart(4)} / ${String(a.tarjetas).padStart(4)} con todas las columnas` +
        `   ${igual ? "sí" : "🔴 NO"}`,
    );
  }

  // ── CONTROL de «sin foto» ──────────────────────────────────────────────────
  // Hoy los cuatro contadores de foto dan 0: todo lo que no tiene foto está
  // apagado. Un 0 contra un 0 no prueba nada, así que la cláusula se compara
  // aparte sobre TODAS las filas de cada tabla — ahí sí hay productos sin foto.
  console.log("\n  CONTROL «sin foto» sobre TODAS las filas (activas o no):");
  let difFoto = 0;
  for (const marca of MARCAS_DEL_HUB) {
    const { filas } = await rest<{ image_url: string | null }>(
      TABLA[marca],
      "select=image_url",
    );
    const enTs = filas.filter(sinFoto).length;
    const [fila] = await sql<{ n: number }>(
      `select count(*) filter (where ${CLAUSULA_SIN_FOTO})::int as n from public.${TABLA[marca]} p`,
    );
    const enSql = Number(fila.n);
    if (enTs !== enSql) difFoto++;
    console.log(
      `    ${marca.padEnd(8)} de ${String(filas.length).padStart(4)} filas:` +
        ` TS ${String(enTs).padStart(3)} · base ${String(enSql).padStart(3)}` +
        `   ${enTs === enSql ? "sí" : "🔴 NO"}`,
    );
  }
  if (difFoto > 0) diferencias += difFoto;

  const bytesNuevos = Buffer.byteLength(
    JSON.stringify({ contadores: porBase, fuente: "sql" }),
    "utf8",
  );
  console.log(`\n  Lo que viajaría con el camino nuevo: ${bytesNuevos} bytes\n`);

  if (diferencias > 0) {
    console.log(`🔴 ${diferencias} marca(s) NO coinciden. NO se ajusta a ojo: se revisa la regla.\n`);
    process.exitCode = 1;
  } else {
    console.log("✅ Los ocho números dan idénticos por los dos caminos.\n");
  }
}

main().catch((e) => {
  console.log(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});

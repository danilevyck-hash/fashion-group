/**
 * SOLO LECTURA — regenera la evidencia de `boston-no-se-mezcla.test.ts`.
 *
 *   npx tsx scripts/_probe-boston-mezcla.ts
 *
 * Responde UNA pregunta: ¿hay clientes que existan a la vez en
 * `confecciones_boston` y en las empresas del grupo con CXC? Porque el CXC
 * consolidado agrupa por NOMBRE normalizado (no por código), y por ahí es por
 * donde se sumarían solos si algún día Boston entrara a `switch_estadocuenta`.
 *
 * Medido el 27-jul-2026: Boston tiene 1.940 clientes distintos (sobre 8.814
 * facturas) y las 6 B2B 127 con saldo abierto. **Se cruzan 10** — CITY MALL
 * DAVID, CITY MALL PASO CANOA, LA FRONTERA DUTY FREE, JERUSALEM DUTY FREE,
 * WOLF MALL CENTER INT, GOLDEN MALL, EL MACHETAZO-CALIDONIA, ALADDIN,
 * CENTRO DOLLAR 123 RIFAT y VENTAS: malls y duty-free, o sea justo los clientes
 * que le compran a varias empresas del grupo. Por CÓDIGO el cruce es CERO
 * (Boston usa ids numéricos de Switch; las B2B el esquema D-XXX), que es
 * precisamente por lo que mirar solo el código daría una falsa tranquilidad.
 *
 * No escribe nada. Consultas espaciadas a propósito: la base ya se cayó una vez
 * por saturación de auditorías.
 */
import fs from "node:fs";

function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mismo normalizado que `src/lib/normalize.ts` — el que usa el CXC para agrupar. */
const norm = (s: string) => s.toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

/** PostgREST corta en 1000 filas EN SILENCIO: se pagina con orden estable. */
async function paginar<T>(
  db: { from: (t: string) => any },
  tabla: string,
  cols: string,
  orderCol: string,
  filtro?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  const P = 1000;
  for (let from = 0; ; from += P) {
    let q = db.from(tabla).select(cols).order(orderCol, { ascending: true }).range(from, from + P - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < P) break;
    await sleep(400);
  }
  return out;
}

async function main() {
  cargarEnv();
  const { supabaseServer: db } = await import("../src/lib/supabase-server");

  // Clientes de Boston: su única huella en nuestra base son las facturas.
  const bos = await paginar<{ cliente_nombre: string | null; cliente_switch_id: number | null }>(
    db,
    "switch_facturas",
    "cliente_nombre,cliente_switch_id",
    "cliente_switch_id",
    (q) => q.eq("empresa_key", "confecciones_boston"),
  );
  const bostonPorNombre = new Map<string, number | null>();
  for (const r of bos) if (r.cliente_nombre) bostonPorNombre.set(norm(r.cliente_nombre), r.cliente_switch_id);
  console.log(`Boston: ${bos.length} facturas · ${bostonPorNombre.size} clientes distintos`);

  await sleep(1500);

  // Clientes del grupo con saldo abierto.
  const b2b = await paginar<{ cliente_nombre: string | null; cliente_codigo: string | null; empresa_key: string }>(
    db,
    "switch_estadocuenta",
    "cliente_nombre,cliente_codigo,empresa_key",
    "cliente_codigo",
  );
  const grupoPorNombre = new Map<string, Set<string>>();
  for (const r of b2b) {
    if (!r.cliente_nombre) continue;
    const k = norm(r.cliente_nombre);
    if (!grupoPorNombre.has(k)) grupoPorNombre.set(k, new Set());
    grupoPorNombre.get(k)!.add(r.empresa_key);
  }
  console.log(`Grupo (6 B2B): ${b2b.length} documentos · ${grupoPorNombre.size} clientes distintos`);

  const cruce = [...bostonPorNombre.keys()].filter((k) => grupoPorNombre.has(k)).sort();
  console.log(`\n>>> CLIENTES EN LOS DOS LADOS (por nombre normalizado): ${cruce.length}`);
  for (const c of cruce) {
    console.log(`   ${c}  —  Boston id ${bostonPorNombre.get(c)}  |  grupo: ${[...grupoPorNombre.get(c)!].sort().join(", ")}`);
  }

  // El código NO cruza, y por eso no sirve como garantía.
  const codsGrupo = new Set(b2b.map((r) => r.cliente_codigo).filter(Boolean));
  const cruceCodigo = [...new Set(bos.map((r) => String(r.cliente_switch_id)))].filter((c) => codsGrupo.has(c));
  console.log(`\n>>> Cruce por CÓDIGO: ${cruceCodigo.length} (esperado 0 — esquemas de código distintos)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

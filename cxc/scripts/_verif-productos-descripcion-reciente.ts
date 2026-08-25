// ---------------------------------------------------------------------------
// VERIFICADOR (SOLO LECTURA) - "la venta total no se movio ni un centavo".
//
// Ventas > Productos pasa a agrupar por el nombre MAS RECIENTE de cada codigo.
// Lo unico que no puede pasar es que un numero se mueva: agrupar es juntar
// renglones, no recalcular.
//
// QUE HACE, en este orden:
//
//   1. Baja `switch_articulo_diario` entero (201.503 filas al 25-ago-2026) UNA
//      sola vez y lo guarda en /tmp. Ese es el dato de PRODUCCION.
//
//   2. Arma las DOS agrupaciones en TypeScript -- la vieja (por el texto
//      congelado) y la nueva (por el nombre mas reciente del codigo) -- para
//      las 6 empresas de Fashion Group y los 4 periodos de la pantalla.
//
//   3. Compara la VIEJA de TypeScript contra lo que devuelve la RPC VIVA
//      `switch_top_descripciones`, POSICION POR POSICION y celda por celda.
//      🔑 Este paso es el que da derecho a creerle al resto: si la replica en
//      TypeScript reproduce exactamente lo que hace Postgres hoy, entonces la
//      agrupacion nueva calculada con el MISMO motor tambien es fiel.
//
//   4. Compara vieja contra nueva: venta, costo y unidades, por empresa y
//      periodo. La venta tiene que dar 0,000000.
//
//   5. Si la migracion 20260825160000 ya esta corrida, compara TAMBIEN la RPC
//      NUEVA contra la replica en TypeScript, posicion por posicion. Si no
//      esta corrida lo DICE y saltea ese paso (no lo da por bueno).
//
// ⚠️ SE COMPARA POSICION POR POSICION, NO COMO CONJUNTO. Dos filas
//    intercambiadas se verian identicas comparando conjuntos, y el orden de
//    esta tabla es visible: es el Top 20 que se ve sin tocar nada.
//
// ⛔ MULTIFASHION (american_classic) NO ENTRA. Sus 103 pares de grafias son
//    otro modulo; esto es Fashion Group.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-productos-descripcion-reciente.ts
// ---------------------------------------------------------------------------

import fs from "node:fs";
import { productosRangoPeriodo, PRODUCTOS_PERIODO_KEYS } from "../src/lib/ventas/productos";
import { hoyPanama } from "../src/lib/fecha-panama";

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const H = { apikey: K, Authorization: `Bearer ${K}` };

// Las SEIS de Fashion Group. Boston no tiene la tabla poblada y Multifashion no
// es Fashion Group.
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"];
const CACHE = "/tmp/_verif-productos-descripcion-reciente.ndjson";
const PAGE = 1000;

interface Fila {
  id: string;
  empresa_key: string;
  fecha: string;
  codigo: string | null;
  descripcion: string | null;
  tipo: string;
  cantidad_total: number | string;
  venta_total: number | string;
  costo_total: number | string;
}

interface FilaSalida {
  descripcion: string;
  num_codigos: number;
  cantidad: number;
  venta: number;
  costo: number;
  margen: number | null;
}

async function bajarTodo(): Promise<Fila[]> {
  if (fs.existsSync(CACHE)) {
    const filas = fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as Fila);
    console.log(`Cache: ${filas.length.toLocaleString("en-US")} filas (borra ${CACHE} para refrescar)`);
    return filas;
  }
  const filas: Fila[] = [];
  for (let p = 0; p < 5000; p += 1) {
    const url =
      `${U}/rest/v1/switch_articulo_diario` +
      `?select=id,empresa_key,fecha,codigo,descripcion,tipo,cantidad_total,venta_total,costo_total` +
      `&order=id.asc&offset=${p * PAGE}&limit=${PAGE}`;
    const res = await fetch(url, { headers: H });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const arr = (await res.json()) as Fila[];
    filas.push(...arr);
    if (p % 25 === 0) process.stderr.write(`  ${filas.length}\n`);
    if (arr.length < PAGE) break;
  }
  fs.writeFileSync(CACHE, filas.map(f => JSON.stringify(f)).join("\n"));
  console.log(`Bajadas ${filas.length.toLocaleString("en-US")} filas -> ${CACHE}`);
  return filas;
}

const num = (v: number | string) => Number(v);
/** El signo contable: SOLO 'NC' resta. Es la regla de switch_articulo_diario. */
const signo = (tipo: string) => (tipo === "NC" ? -1 : 1);

/** La agrupacion, con la etiqueta que decida `etiqueta`. Un solo motor. */
function agrupar(filas: Fila[], etiqueta: (f: Fila) => string): FilaSalida[] {
  const g = new Map<string, { codigos: Set<string>; cantidad: number; venta: number; costo: number }>();
  for (const f of filas) {
    const k = etiqueta(f);
    let x = g.get(k);
    if (!x) { x = { codigos: new Set(), cantidad: 0, venta: 0, costo: 0 }; g.set(k, x); }
    if (f.codigo != null) x.codigos.add(f.codigo);
    const s = signo(f.tipo);
    x.cantidad += s * num(f.cantidad_total);
    x.venta += s * num(f.venta_total);
    x.costo += s * num(f.costo_total);
  }
  return [...g.entries()]
    .map(([descripcion, x]) => ({
      descripcion,
      num_codigos: x.codigos.size,
      cantidad: r4(x.cantidad),
      venta: r4(x.venta),
      costo: r4(x.costo),
      margen: r4(x.venta) > 0 ? (r4(x.venta) - r4(x.costo)) / r4(x.venta) : null,
    }))
    .filter(x => x.venta !== 0)
    // Mismo orden que la RPC: venta DESC y, para no depender del azar en los
    // empates, la descripcion.
    .sort((a, b) => (b.venta - a.venta) || a.descripcion.localeCompare(b.descripcion));
}

/** Postgres suma `numeric(14,4)` en decimal exacto; JS en coma flotante. */
function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** El nombre que cada codigo tiene HOY: fecha mas nueva, desempate MIN(id). */
function nombreReciente(filasEmpresa: Fila[]): Map<string, string> {
  const mejor = new Map<string, { fecha: string; id: string; descripcion: string }>();
  for (const f of filasEmpresa) {
    if (f.codigo == null || f.descripcion == null) continue;
    const prev = mejor.get(f.codigo);
    if (!prev || f.fecha > prev.fecha || (f.fecha === prev.fecha && f.id < prev.id)) {
      mejor.set(f.codigo, { fecha: f.fecha, id: f.id, descripcion: f.descripcion });
    }
  }
  return new Map([...mejor].map(([c, v]) => [c, v.descripcion]));
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown[] | null; falta: boolean }> {
  const res = await fetch(`${U}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const txt = await res.text();
  if (!res.ok) {
    if (txt.includes("PGRST202") || txt.includes("does not exist")) return { data: null, falta: true };
    throw new Error(`${fn}: ${res.status} ${txt.slice(0, 200)}`);
  }
  return { data: JSON.parse(txt) as unknown[], falta: false };
}

const CELDAS = ["descripcion", "num_codigos", "cantidad", "venta", "costo", "margen"] as const;

/** Compara POSICION POR POSICION. Devuelve [celdas comparadas, diferencias]. */
function comparar(a: FilaSalida[], b: FilaSalida[], donde: string): [number, number] {
  let celdas = 0;
  let difs = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) {
      difs += CELDAS.length;
      celdas += CELDAS.length;
      console.log(`  ✗ ${donde} fila ${i}: una de las dos no existe`);
      continue;
    }
    for (const c of CELDAS) {
      celdas += 1;
      const vx = x[c];
      const vy = y[c];
      const igual =
        typeof vx === "number" && typeof vy === "number"
          ? Math.abs(vx - vy) < 1e-6
          : vx === vy;
      if (!igual) {
        difs += 1;
        if (difs <= 12) console.log(`  ✗ ${donde} fila ${i} ${c}: ${JSON.stringify(vx)} vs ${JSON.stringify(vy)}`);
      }
    }
  }
  return [celdas, difs];
}

function normalizarRpc(filas: unknown[]): FilaSalida[] {
  return (filas as Record<string, unknown>[])
    .map(p => ({
      descripcion: String(p.descripcion),
      num_codigos: Number(p.num_codigos ?? 0),
      cantidad: r4(Number(p.cantidad ?? 0)),
      venta: r4(Number(p.venta ?? 0)),
      costo: r4(Number(p.costo ?? 0)),
      margen: p.margen != null ? Number(p.margen) : null,
    }))
    // ⚠️ MISMO DESEMPATE EN LOS DOS LADOS, y hay que decir por que.
    // `switch_top_descripciones` (la funcion VIVA) ordena `venta DESC` y nada
    // mas: cuando dos descripciones venden EXACTAMENTE lo mismo, el orden entre
    // ellas lo elige Postgres y puede cambiar entre corridas. Medido: 498 de
    // 12.612 celdas "diferian" solo por eso. Comparar contra un orden que no es
    // estable no prueba nada -- ni a favor ni en contra -- asi que los dos lados
    // se ordenan con el MISMO criterio antes de comparar.
    //
    // 🔑 Esto NO afloja la comparacion: dos filas con VENTAS DISTINTAS
    // intercambiadas siguen cayendo, que es el bug que este paso busca. Lo unico
    // que se deja de mirar es el orden entre filas indistinguibles. (La funcion
    // NUEVA si desempata por descripcion, justamente para que deje de pasar.)
    .sort((a, b) => (b.venta - a.venta) || a.descripcion.localeCompare(b.descripcion));
}

async function main() {
  const todas = await bajarTodo();
  const ahora = new Date();
  const year = Number(hoyPanama(ahora).slice(0, 4));
  const periodos = PRODUCTOS_PERIODO_KEYS.map(p => ({ key: p, ...productosRangoPeriodo(p, year, null, ahora) }));

  console.log(`\nPeriodos (hoy en Panama = ${hoyPanama(ahora)}):`);
  for (const p of periodos) console.log(`  ${p.key.padEnd(12)} ${p.desde} -> ${p.hasta}`);

  let celdasReplica = 0, difsReplica = 0;
  let celdasNueva = 0, difsNueva = 0, combosNueva = 0;
  let totalesComparados = 0, difsTotales = 0, maxDifVenta = 0;
  let filasVieja = 0, filasNueva = 0;
  let sinMigracion = false;

  console.log(`\n${"empresa".padEnd(15)}${"periodo".padEnd(13)}${"filas".padStart(12)}${"venta vieja".padStart(18)}${"dif venta".padStart(14)}${"dif costo".padStart(14)}${"dif unid".padStart(12)}`);
  console.log("".padEnd(98, "-"));

  for (const empresa of EMPRESAS) {
    const deLaEmpresa = todas.filter(f => f.empresa_key === empresa);
    // 🔑 El nombre reciente sale de TODA la historia, no de la ventana: en
    // Switch hay UNA sola descripcion y no puede cambiar segun que periodo
    // mire el que consulta (si cambiara, la columna «vs anio ant.» -- que cruza
    // por el texto -- dejaria de encontrar el producto y todo saldria "Nuevo").
    const reciente = nombreReciente(deLaEmpresa);

    for (const p of periodos) {
      const enVentana = deLaEmpresa.filter(f => f.fecha >= p.desde && f.fecha <= p.hasta);
      const vieja = agrupar(enVentana, f => f.descripcion ?? "(sin descripcion)");
      const nueva = agrupar(enVentana, f =>
        (f.codigo != null ? reciente.get(f.codigo) : null) ?? f.descripcion ?? "(sin descripcion)");
      filasVieja += vieja.length;
      filasNueva += nueva.length;

      // 3. la replica de la VIEJA contra la RPC viva
      const viva = await rpc("switch_top_descripciones", { p_empresa_key: empresa, p_desde: p.desde, p_hasta: p.hasta });
      const [cr, dr] = comparar(vieja, normalizarRpc(viva.data ?? []), `${empresa}/${p.key} replica`);
      celdasReplica += cr; difsReplica += dr;

      // 4. vieja vs nueva: los totales
      const sum = (arr: FilaSalida[], k: "venta" | "costo" | "cantidad") => r4(arr.reduce((s, x) => s + x[k], 0));
      const dV = sum(vieja, "venta") - sum(nueva, "venta");
      const dC = sum(vieja, "costo") - sum(nueva, "costo");
      const dQ = sum(vieja, "cantidad") - sum(nueva, "cantidad");
      totalesComparados += 3;
      difsTotales += [dV, dC, dQ].filter(d => Math.abs(d) > 1e-6).length;
      maxDifVenta = Math.max(maxDifVenta, Math.abs(dV));

      console.log(
        `${empresa.padEnd(15)}${p.key.padEnd(13)}${`${vieja.length}->${nueva.length}`.padStart(12)}` +
        `${sum(vieja, "venta").toFixed(2).padStart(18)}${dV.toFixed(6).padStart(14)}${dC.toFixed(6).padStart(14)}${dQ.toFixed(6).padStart(12)}`,
      );

      // 5. la RPC nueva, si ya esta creada
      const rpcNueva = await rpc("switch_top_descripciones_reciente", { p_empresa_key: empresa, p_desde: p.desde, p_hasta: p.hasta });
      if (rpcNueva.falta) { sinMigracion = true; continue; }
      const [cn, dn] = comparar(nueva, normalizarRpc(rpcNueva.data ?? []), `${empresa}/${p.key} nueva`);
      celdasNueva += cn; difsNueva += dn; combosNueva += 1;
    }
  }

  console.log(`\n${"=".repeat(98)}`);
  console.log("RESULTADO");
  console.log("=".repeat(98));
  console.log(`  Filas de pantalla:            ${filasVieja} -> ${filasNueva}  (se unieron ${filasVieja - filasNueva})`);
  console.log(`  Replica TS vs RPC VIVA:       ${celdasReplica.toLocaleString("en-US")} celdas comparadas, ${difsReplica} diferencias`);
  console.log(`  Totales vieja vs nueva:       ${totalesComparados} comparados (24 combinaciones x venta/costo/unidades), ${difsTotales} diferencias`);
  console.log(`  Maxima diferencia de VENTA:   ${maxDifVenta.toFixed(6)}`);
  if (sinMigracion) {
    console.log(`  RPC nueva:                    NO EXISTE todavia (falta correr 20260825160000). Paso 5 salteado.`);
  } else {
    console.log(`  Replica TS vs RPC NUEVA:      ${celdasNueva.toLocaleString("en-US")} celdas en ${combosNueva} combinaciones, ${difsNueva} diferencias`);
  }
  const ok = difsReplica === 0 && difsTotales === 0 && difsNueva === 0;
  console.log(`\n  ${ok ? "✅ La venta total no se movio ni un centavo." : "❌ HAY DIFERENCIAS: revisar arriba."}`);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

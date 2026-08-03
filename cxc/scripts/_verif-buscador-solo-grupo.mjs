// EL BUSCADOR (⌘K) EN LAS DOS DIRECCIONES: que no se cuele Boston ni
// Multifashion, Y que los clientes del grupo sigan saliendo con todo lo suyo.
//
// 🩸 POR QUÉ LAS DOS DIRECCIONES. Un buscador que no encuentra NADA pasa todos
// los tests de exclusión con honores. La dirección que de verdad importa es la
// segunda: que "Metro", "Machetazo", "City Mall" sigan apareciendo con su CXC,
// sus ventas, sus cheques y sus guías. Por eso el veredicto exige las dos y
// falla si la lista de casos del grupo queda vacía.
//
// 🩸 LOS NOMBRES SALEN DE LA BASE, NO DE UNA LISTA A MANO. Un nombre inventado
// no existe en ningún mundo y daría 0 resultados siempre — verde falso. El
// script pregunta a `switch_facturas` cuáles son los clientes REALES de cada
// mundo y prueba con esos. Si algún mundo no devuelve nombres, FALLA.
//
// ⚠️ Se excluyen los nombres que compran en LOS DOS mundos (CITY MALL DAVID, LA
// FRONTERA DUTY FREE…): son clientes del grupo que además le compran a Boston,
// así que TIENEN que seguir apareciendo. Meterlos entre los casos de Boston
// sería pedirle al filtro algo que no debe hacer.
//
// Qué mide, por consulta: cuántos resultados devuelve cada sección del ⌘K.
//
//   ETAPA=antes  node scripts/_verif-buscador-solo-grupo.mjs
//   ETAPA=despues node scripts/_verif-buscador-solo-grupo.mjs   → compara

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3186";
const ETAPA = process.env.ETAPA ?? "antes";
const SALIDA = process.env.SALIDA ?? "/tmp/t86-medicion";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ENV_PATH = process.env.ENV_PATH ?? "/Users/daniellevy/Code/fashion-group/cxc/.env.local";

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const GRUPO = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const FUERA = ["confecciones_boston", "american_classic"];
// "CONTADO" y "VENTAS" no son clientes: son etiquetas de mostrador. Probar con
// ellas mediría cualquier cosa menos un cliente.
const NO_SON_CLIENTES = new Set(["CONTADO", "VENTAS", "N/A", "-"]);

async function nombresDe(keys, limite = 4000) {
  const s = new Map();
  let desde = 0;
  for (;;) {
    const { data } = await sb
      .from("switch_facturas")
      .select("cliente_nombre, subtotal_descuento")
      .in("empresa_key", keys)
      .range(desde, desde + 999);
    if (!data?.length) break;
    for (const r of data) {
      const n = (r.cliente_nombre || "").trim();
      if (!n || NO_SON_CLIENTES.has(n.toUpperCase())) continue;
      s.set(n.toUpperCase(), (s.get(n.toUpperCase()) || 0) + Math.abs(Number(r.subtotal_descuento) || 0));
    }
    if (data.length < 1000 || desde + 1000 >= limite) break;
    desde += 1000;
  }
  return s;
}

const grupo = await nombresDe(GRUPO);
const fuera = await nombresDe(FUERA);

// 🩸 LA EXPECTATIVA DE CADA CASO SE DERIVA DE LA BASE, POR TÉRMINO DE BÚSQUEDA.
// El primer intento clasificaba al CLIENTE (Boston / grupo / los dos) a partir
// de una muestra de facturas y elegía una palabra suya. Dio 3 falsos rojos y
// los 3 eran el MISMO defecto de medición: la muestra estaba topeada en 4.000
// filas de 52.480, así que el conjunto "quiénes son del grupo" salía incompleto
// y una palabra que parecía exclusiva de Boston ("CONFECCIONES", "TOVA")
// también matchea clientes buenos, y un cliente que parecía puro del grupo
// ("MULTI FASHION HOLDING") tenía facturas de Multifashion que la muestra no
// vio. El filtro estaba bien; la vara estaba mal.
//
// La pregunta correcta no es "¿de qué mundo es este cliente?" sino
// "¿QUÉ MATCHEA ESTE TÉRMINO en cada mundo?", que es exactamente lo que hace el
// ⌘K (un `ilike %q%`). Se le pregunta a la base con COUNT exacto, sin muestra:
//
//   matchea en el grupo = 0  y  matchea afuera > 0  → tiene que dar CERO
//   matchea en el grupo > 0                          → tiene que SEGUIR saliendo
//
// Así no hay clasificación que equivocarse ni tope de filas que alcance mal.
async function cuentaEn(keys, q) {
  const { count } = await sb
    .from("switch_facturas")
    .select("*", { count: "exact", head: true })
    .in("empresa_key", keys)
    .ilike("cliente_nombre", `%${q}%`);
  return count ?? 0;
}
// La cartera y los cheques solo tienen empresas del grupo hoy, pero un término
// puede matchear un cliente de ahí aunque no tenga facturas: se mira igual, o
// un caso "de fuera" podría exigir 0 sobre una búsqueda que devuelve un cliente
// bueno por otra puerta.
async function matcheaEnGrupoPorOtraPuerta(q) {
  const [{ count: a }, { count: c }] = await Promise.all([
    sb.from("switch_estadocuenta_aging").select("*", { count: "exact", head: true })
      .in("company_key", GRUPO).ilike("nombre_normalized", `%${q}%`),
    sb.from("cheques").select("*", { count: "exact", head: true })
      .in("empresa", GRUPO).ilike("cliente", `%${q}%`),
  ]);
  return (a ?? 0) + (c ?? 0) > 0;
}

const tokens = (n) => n.replace(/[.,]/g, " ").split(/\s+/).filter((p) => p.length >= 4);

// Candidatos: los clientes con más plata de cada lado, y de cada uno se prueban
// sus palabras hasta encontrar una que la base clasifique sin ambigüedad.
async function armar(candidatos, quiero, cuantos) {
  const out = [];
  for (const [nombre] of candidatos) {
    if (out.length >= cuantos) break;
    for (const tk of tokens(nombre)) {
      const q = tk.slice(0, 14);
      if (out.some((c) => c.q === q)) continue;
      const [enGrupo, enFuera] = await Promise.all([cuentaEn(GRUPO, q), cuentaEn(FUERA, q)]);
      if (quiero === "fuera") {
        if (enGrupo === 0 && enFuera > 0 && !(await matcheaEnGrupoPorOtraPuerta(q))) {
          out.push({ q, mundo: "fuera", nombre, enGrupo, enFuera }); break;
        }
      } else if (enGrupo > 0) {
        out.push({ q, mundo: "grupo", nombre, enGrupo, enFuera }); break;
      }
    }
  }
  return out;
}

const CASOS = [
  ...(await armar([...fuera.entries()].sort((a, b) => b[1] - a[1]), "fuera", 6)),
  ...(await armar([...grupo.entries()].sort((a, b) => b[1] - a[1]), "grupo", 6)),
];
const nFuera = CASOS.filter((c) => c.mundo === "fuera").length;
const nGrupo = CASOS.filter((c) => c.mundo === "grupo").length;
if (nFuera === 0 || nGrupo === 0) {
  console.error(`❌ CONTROL DE VACÍO: fuera=${nFuera} grupo=${nGrupo} — no se probó nada`);
  process.exit(1);
}
console.error(`casos derivados de la base: ${nFuera} solo-Boston/Multifashion · ${nGrupo} del grupo`);

// Módulos que NO son de clientes: tienen que seguir encontrándose igual.
// Los ejemplos también salen de la base, por lo mismo que los nombres.
const otros = [];
{
  const { data: tr } = await sb.from("transportistas").select("nombre").limit(1);
  if (tr?.[0]) otros.push({ q: tr[0].nombre.split(/\s+/)[0].slice(0, 10), mundo: "guias", nombre: tr[0].nombre });
  const { data: re } = await sb.from("reclamos").select("nro_reclamo").eq("deleted", false).limit(1);
  if (re?.[0]) otros.push({ q: String(re[0].nro_reclamo).slice(0, 10), mundo: "reclamos", nombre: re[0].nro_reclamo });
  const { data: em } = await sb.from("prestamos_empleados").select("nombre").eq("activo", true).limit(1);
  if (em?.[0]) otros.push({ q: em[0].nombre.split(/\s+/)[0].slice(0, 10), mundo: "prestamos", nombre: em[0].nombre });
  const { data: ga } = await sb.from("caja_gastos").select("proveedor").eq("deleted", false).not("proveedor", "is", null).limit(1);
  if (ga?.[0]) otros.push({ q: ga[0].proveedor.split(/\s+/)[0].slice(0, 10), mundo: "caja", nombre: ga[0].proveedor });
}
if (otros.length < 4) {
  console.error(`❌ CONTROL DE VACÍO: solo ${otros.length} de 4 módulos no-cliente con ejemplo real`);
  process.exit(1);
}

async function buscar(q) {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`, {
    headers: { cookie: `cxc_session=${COOKIE}` },
  });
  if (!res.ok) throw new Error(`/api/search?q=${q} → ${res.status}`);
  const j = await res.json();
  return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
}

mkdirSync(SALIDA, { recursive: true });
const filas = [];
console.error(`\n${"".padEnd(94, "─")}\n${ETAPA.toUpperCase()} — cuántos resultados devuelve el ⌘K\n${"".padEnd(94, "─")}`);
console.error(`${"mundo".padEnd(9)} ${"busqué".padEnd(14)} ${"cliente real".padEnd(30)} cxc ventas cheques dir guias otros`);
for (const c of [...CASOS, ...otros]) {
  const r = await buscar(c.q);
  filas.push({ ...c, r });
  const otrosN = (r.reclamos ?? 0) + (r.prestamos ?? 0) + (r.caja ?? 0);
  console.error(
    `${c.mundo.padEnd(9)} ${c.q.padEnd(14)} ${c.nombre.slice(0, 30).padEnd(30)} ` +
    `${String(r.cxc ?? 0).padStart(3)} ${String(r.ventas ?? 0).padStart(6)} ${String(r.cheques ?? 0).padStart(7)} ` +
    `${String(r.directorio ?? 0).padStart(3)} ${String(r.guias ?? 0).padStart(5)} ${String(otrosN).padStart(5)}`,
  );
}

const dest = path.join(SALIDA, `buscador-${ETAPA}.json`);
writeFileSync(dest, JSON.stringify(filas, null, 2));

// ── Veredicto ────────────────────────────────────────────────────────────────
if (ETAPA === "despues") {
  const antesPath = path.join(SALIDA, "buscador-antes.json");
  if (!existsSync(antesPath)) {
    console.error("\n⚠️ no hay corrida 'antes' para comparar");
    process.exit(1);
  }
  const antes = JSON.parse(readFileSync(antesPath, "utf8"));
  const clave = (f) => `${f.mundo}|${f.q}`;
  const mapaAntes = new Map(antes.map((f) => [clave(f), f]));
  let fallas = 0;

  console.error(`\n${"".padEnd(94, "─")}\nVEREDICTO\n${"".padEnd(94, "─")}`);

  // (1) El término solo matchea Boston/Multifashion → CERO resultados de cliente
  const deFuera = filas.filter((f) => f.mundo === "fuera");
  if (deFuera.length === 0) { console.error("❌ 0 casos de Boston/Multifashion — no se comparó nada"); fallas++; }
  for (const f of deFuera) {
    const a = mapaAntes.get(clave(f));
    const cli = (f.r.cxc ?? 0) + (f.r.ventas ?? 0) + (f.r.cheques ?? 0);
    const cliAntes = a ? (a.r.cxc ?? 0) + (a.r.ventas ?? 0) + (a.r.cheques ?? 0) : 0;
    const ok = cli === 0 && cliAntes > 0;   // y ANTES aparecía: si no, no probó nada
    if (!ok) fallas++;
    console.error(`${ok ? "✅" : "❌"} fuera  "${f.q}" (${f.nombre.slice(0, 28)}) → ${cliAntes} → ${cli} · facturas grupo ${f.enGrupo} / fuera ${f.enFuera}`);
  }

  // (2) El término matchea clientes del grupo → SIGUEN saliendo.
  //     LA DIRECCIÓN QUE MÁS IMPORTA: un buscador vacío pasa todo lo de arriba.
  const delGrupo = filas.filter((f) => f.mundo === "grupo");
  if (delGrupo.length === 0) { console.error("❌ 0 casos del grupo — un buscador vacío pasaría todo lo anterior"); fallas++; }
  for (const f of delGrupo) {
    const a = mapaAntes.get(clave(f));
    const cli = (f.r.cxc ?? 0) + (f.r.ventas ?? 0) + (f.r.cheques ?? 0);
    const cliAntes = a ? (a.r.cxc ?? 0) + (a.r.ventas ?? 0) + (a.r.cheques ?? 0) : 0;
    // Si además matchea afuera, su nº de ventas BAJA a propósito: se va lo de
    // Boston/Multifashion. Lo que no puede pasar nunca es que desaparezca.
    const mixto = f.enFuera > 0;
    const ok = mixto ? cli > 0 : (cli > 0 && cli === cliAntes);
    if (!ok) fallas++;
    console.error(`${ok ? "✅" : "❌"} grupo  "${f.q}" (${f.nombre.slice(0, 28)}) → ${cliAntes} → ${cli}` +
      (mixto ? ` · también compra afuera (${f.enFuera} facturas): baja a propósito` : " · exacto"));
  }

  // (3) El resto del ⌘K, intacto
  for (const f of filas.filter((x) => !["fuera", "grupo"].includes(x.mundo))) {
    const a = mapaAntes.get(clave(f));
    const propio = f.r[f.mundo] ?? 0;
    const propioAntes = a ? (a.r[f.mundo] ?? 0) : 0;
    const ok = propio === propioAntes && propio > 0;
    if (!ok) fallas++;
    console.error(`${ok ? "✅" : "❌"} ${f.mundo.padEnd(6)} "${f.q}" → sección ${f.mundo}: ${propioAntes} → ${propio}`);
  }

  console.error(fallas === 0
    ? "\nBOSTON Y MULTIFASHION FUERA, EL GRUPO INTACTO, EL RESTO DEL ⌘K IGUAL."
    : `\n${fallas} chequeo(s) en rojo.`);
  process.exit(fallas === 0 ? 0 : 1);
}
console.error(`\nJSON → ${dest}`);

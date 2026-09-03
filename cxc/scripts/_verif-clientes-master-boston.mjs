// ─────────────────────────────────────────────────────────────────────────────
// QUÉ FILAS DE BOSTON HAY QUE SACAR DE `clientes_master`, Y CUÁLES NO.
//
// 🔴 SOLO LECTURA. Este script NO borra, NO actualiza y NO escribe una sola
// fila: hace GET contra PostgREST y reporta.
//
// ✅ EL BORRADO YA SE APLICÓ (2-sep-2026, aprobado por Daniel: *"el directorio
// por dentro se va"*): 4.914 filas con `deleted = true`, quedan 150. Este script
// queda como VERIFICADOR — vuelve a correr la regla y dice si algo se coló de
// nuevo. Si `SE MARCARÍAN` vuelve a dar > 0, el sync se rompió.
//
// ── EL PROBLEMA ─────────────────────────────────────────────────────────────
// El 28-jul-2026 a las 07:01 UTC, `sync-clientes-master` metió los clientes de
// Confecciones Boston en `clientes_master`, que es el directorio del GRUPO.
// La tabla NO tiene columna `empresa_key` —es una fila por CÓDIGO, compartida
// por las 6 empresas del grupo—, así que una vez adentro un cliente de Boston
// es indistinguible de uno del grupo. Ver el post-mortem de Boston.
//
// ── LA REGLA PARA DECIDIR, Y POR QUÉ NO ES "EL CÓDIGO ES NUMÉRICO" ──────────
// Es EXACTAMENTE la de `soloClientesDelGrupo()` en `src/lib/clientes/mundos.ts`,
// que es la única definición de "cliente del grupo" del repo. Una fila se queda si:
//   · su código le compra a alguna de las 6 del grupo (según `switch_clientes`), o
//   · Switch no conoce ese código en ninguna empresa (los huérfanos: 3 de los 4
//     documentados en `mundos.ts` son del grupo con el código desfasado, y
//     esconderlos rompería el Directorio, Guías y todos los selectores).
// Se va SOLO la fila cuyo código Switch SÍ conoce y que NO le compra a ninguna
// de las 6.
//
// ⚠️ Se midió el atajo "los códigos del grupo son D-<n>" y NO SIRVE: el grupo
// tiene el código `12188`, pelado y numérico. Un CHECK de forma sobre `codigo`
// habría rechazado a un cliente legítimo.
//
// ── SOFT DELETE, NO DELETE ──────────────────────────────────────────────────
// `clientes_master` tiene `deleted boolean` y todos los lectores del ranking, la
// ficha, el Directorio y el CXC filtran `deleted = false` (auditado). Marcar es
// reversible con un UPDATE y deja el rastro; un DELETE de 4.914 filas no.
//
// Uso:  node scripts/_verif-clientes-master-boston.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Las 6 de `EMPRESAS_DEL_GRUPO` (src/lib/clientes/mundos.ts). */
const EMPRESAS_DEL_GRUPO = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
];

/** PostgREST corta en 1.000 EN SILENCIO: se pagina, y por una columna que NO se
 *  mueve (`id`), que es lo que este repo ya pagó una vez con `synced_at`. */
async function leerTodo(tabla, columnas) {
  const PAGE = 1000;
  const out = [];
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await sb
      .from(tabla)
      .select(columnas)
      .order("id", { ascending: true })
      .range(desde, desde + PAGE - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

const fmt = (n) => n.toLocaleString("es-PA");

const master = await leerTodo("clientes_master", "id, codigo, nombre, nombre_normalized, deleted, created_at");
const switchClientes = await leerTodo("switch_clientes", "id, empresa_key, codigo");

const grupo = new Set();
const conocidos = new Set();
const empresasPorCodigo = new Map();
for (const f of switchClientes) {
  if (!f.codigo) continue;
  const cod = f.codigo.trim();
  conocidos.add(cod);
  if (EMPRESAS_DEL_GRUPO.includes(f.empresa_key)) grupo.add(cod);
  if (!empresasPorCodigo.has(cod)) empresasPorCodigo.set(cod, new Set());
  empresasPorCodigo.get(cod).add(f.empresa_key);
}

const vivos = master.filter((r) => !r.deleted);
const seQueda = (r) => {
  const cod = (r.codigo ?? "").trim();
  if (!cod) return true;
  if (grupo.has(cod)) return true;
  if (!conocidos.has(cod)) return true;
  return false;
};

const quedan = vivos.filter(seQueda);
const sacar = vivos.filter((r) => !seQueda(r));

console.log("═══ clientes_master, hoy ═══");
console.log(`  filas totales      ${fmt(master.length)}`);
console.log(`  vivas              ${fmt(vivos.length)}`);
console.log(`  ya marcadas        ${fmt(master.length - vivos.length)}`);

console.log("\n═══ VEREDICTO ═══");
console.log(`  SE QUEDAN          ${fmt(quedan.length)}  (el directorio real del grupo)`);
console.log(`  SE MARCARÍAN       ${fmt(sacar.length)}  ← estas son las que no son del grupo`);

const porEmpresa = new Map();
for (const r of sacar) {
  const es = [...(empresasPorCodigo.get((r.codigo ?? "").trim()) ?? [])].sort().join("+");
  porEmpresa.set(es, (porEmpresa.get(es) ?? 0) + 1);
}
console.log("\n  desglose por empresa de Switch a la que pertenecen:");
for (const [es, n] of [...porEmpresa].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${es.padEnd(38)} ${String(fmt(n)).padStart(6)}`);
}

const porDia = new Map();
for (const r of sacar) {
  const d = (r.created_at ?? "").slice(0, 10);
  porDia.set(d, (porDia.get(d) ?? 0) + 1);
}
console.log("\n  cuándo entraron (created_at):");
for (const [d, n] of [...porDia].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`    ${d.padEnd(38)} ${String(fmt(n)).padStart(6)}`);
}

// ── Los huérfanos: se QUEDAN, y hay que poder verlos para confirmarlo ────────
const huerfanos = quedan.filter((r) => {
  const cod = (r.codigo ?? "").trim();
  return cod && !conocidos.has(cod);
});
console.log(`\n  ⚠️ huérfanos que SE QUEDAN (Switch no conoce el código): ${huerfanos.length}`);
for (const r of huerfanos) console.log(`     ${String(r.codigo).padEnd(10)} ${r.nombre}`);

// ── Los nombres repetidos, que es de donde salió el doble conteo ─────────────
function repetidos(filas) {
  const porNombre = new Map();
  for (const r of filas) {
    const k = r.nombre_normalized;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(r);
  }
  return [...porNombre.entries()].filter(([, v]) => v.length > 1);
}
const dupHoy = repetidos(vivos);
const dupDespues = repetidos(quedan);
console.log("\n═══ NOMBRES REPETIDOS entre filas vivas (la causa del doble conteo) ═══");
console.log(`  hoy                ${dupHoy.length}`);
console.log(`  después de marcar  ${dupDespues.length}`);
console.log(
  "\n  🔴 Los que SOBREVIVEN no son un error: son códigos desfasados en el panel\n" +
    "     de Switch. Con el ranking unido por CÓDIGO no se confunden aunque se\n" +
    "     llamen igual — por eso hacían falta las dos cosas, no solo esta limpieza:",
);
for (const [nom, v] of dupDespues) {
  console.log(`     ${nom.padEnd(34)} ${v.map((r) => r.codigo).join(" · ")}`);
}

// ── El SQL, impreso pero NO ejecutado ────────────────────────────────────────
console.log(sacar.length === 0
  ? "\n✅ NADA QUE MARCAR — el directorio está limpio y el sync lo está manteniendo así."
  : "\n🔴 SE COLARON FILAS AJENAS. El SQL para marcarlas (este script NO lo ejecuta):\n");
if (sacar.length > 0) console.log(`-- Marca como borradas las ${fmt(sacar.length)} filas que no son del grupo.
-- Reversible: UPDATE clientes_master SET deleted = false WHERE deleted = true;
UPDATE clientes_master m
SET    deleted = true
WHERE  m.deleted = false
  AND  EXISTS (SELECT 1 FROM switch_clientes s WHERE s.codigo = m.codigo)
  AND  NOT EXISTS (
         SELECT 1 FROM switch_clientes s
         WHERE  s.codigo = m.codigo
           AND  s.empresa_key IN (${EMPRESAS_DEL_GRUPO.map((e) => `'${e}'`).join(", ")})
       );
-- Después: REFRESH MATERIALIZED VIEW clientes_empresa_12m_vw;`);

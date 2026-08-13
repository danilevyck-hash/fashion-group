// El ANTES y el DESPUÉS del cambio de fuente del gasto (mayor → Egresos Varios),
// empresa por empresa. SOLO LECTURA.
//
// 🔴 LO QUE ESTE SCRIPT TIENE QUE DEMOSTRAR SON DOS COSAS A LA VEZ:
//   1. que NINGUNA clave fuera de `gastos.*` y `semaforo[]` cambió de valor —
//      la Disponibilidad, las Ventas, la CXC, la CXP y el Inventario no se
//      tocan—, y
//   2. qué empresa gana un número y cuál cambia de color, para que Daniel lo
//      vea. Eso NO es una regresión: es el arreglo.
//
//   PORT=3186 npm run start   (en cada worktree: rama y origin/main)
//   for M in 2026-08 2026-07 2026-01; do
//     BASE=http://localhost:3187 MES=$M OUT=/tmp/vg-main-$M.json node scripts/_verif-vista-general-payload.mjs
//     BASE=http://localhost:3186 MES=$M OUT=/tmp/vg-rama-$M.json node scripts/_verif-vista-general-payload.mjs
//   done
//   node scripts/_verif-gasto-antes-despues.mjs

import { readFileSync } from "fs";

const MESES = (process.env.MESES ?? "2026-08,2026-07,2026-01").split(",");
const ANTES = process.env.ANTES ?? "/tmp/vg-main-%s.json";
const DESPUES = process.env.DESPUES ?? "/tmp/vg-rama-%s.json";

/** Objeto → mapa de rutas planas, para comparar clave por clave. */
const plano = (o, pre = "", out = new Map()) => {
  if (Array.isArray(o)) o.forEach((v, i) => plano(v, `${pre}[${i}]`, out));
  else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) plano(v, pre ? `${pre}.${k}` : k, out);
  } else out.set(pre, o);
  return out;
};

// Cambian en cada llamada por definición: no son datos.
const VOLATIL = new Set(["generadoEn", "ms"]);
const usd = (n) =>
  n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let fallo = false;

for (const mes of MESES) {
  const a = JSON.parse(readFileSync(ANTES.replace("%s", mes), "utf8"));
  const b = JSON.parse(readFileSync(DESPUES.replace("%s", mes), "utf8"));
  const A = plano(a), B = plano(b);

  const fuera = [];
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    if (VOLATIL.has(k.split(".").pop())) continue;
    if (JSON.stringify(A.get(k)) === JSON.stringify(B.get(k))) continue;
    // Lo ÚNICO que puede moverse es el gasto y lo que se deriva de él.
    if (!/^gastos\b/.test(k) && !/^semaforo\b/.test(k)) {
      fuera.push(`${k}: ${JSON.stringify(A.get(k))} → ${JSON.stringify(B.get(k))}`);
    }
  }

  console.log(`\n########## ${mes} ##########`);
  console.log(`${fuera.length === 0 ? "🟢" : "🔴"} claves cambiadas FUERA de gastos/semaforo: ${fuera.length}`);
  for (const f of fuera) console.log("   " + f);
  if (fuera.length > 0) fallo = true;

  for (const [label, x, y] of [
    ["Disponibilidad", a.disponibilidad?.total, b.disponibilidad?.total],
    ["Ventas", a.ventas?.total, b.ventas?.total],
    ["CXC", a.cxc?.total, b.cxc?.total],
    ["CXP", a.cxp?.total, b.cxp?.total],
    ["Inventario", a.inventario?.totalCosto, b.inventario?.totalCosto],
  ]) {
    const igual = JSON.stringify(x) === JSON.stringify(y);
    if (!igual) fallo = true;
    console.log(`   ${igual ? "🟢" : "🔴"} ${label.padEnd(15)} ${x} → ${y}`);
  }

  console.log(`\n   ${"empresa".padEnd(22)} ANTES (mayor)                    | DESPUÉS (egresos varios)`);
  const sa = new Map((a.semaforo ?? []).map((x) => [x.key, x]));
  const sb = new Map((b.semaforo ?? []).map((x) => [x.key, x]));
  for (const k of sb.keys()) {
    const x = sa.get(k) ?? {};
    const y = sb.get(k);
    console.log(
      `   ${String(y.name).padEnd(22)}` +
      `${usd(x.gasto).padStart(12)} ${usd(x.rentabilidad).padStart(12)} ${String(x.estado ?? "").padEnd(10)} |` +
      `${usd(y.gasto).padStart(12)} ${usd(y.rentabilidad).padStart(12)} ${String(y.estado).padEnd(10)} ${y.motivo ?? ""}`,
    );
  }
  console.log(`   empresas con gasto: ${a.gastos?.empresasConGasto} → ${b.gastos?.empresasConGasto}`);
}

process.exit(fallo ? 1 : 0);

/**
 * UN SOLO USO — borra la fila de $1,000,000,049.22 de switch_costo_diario que
 * Daniel aprobó eliminar el 27-jul-2026.
 *
 * Borra POR ID EXACTO (no por filtro): un `empresa_key=eq.X&fecha=eq.Y` mal
 * escrito se lleva por delante lo que no debe. El id se verifica antes.
 *
 *   confecciones_boston · 2026-07-14
 *   venta $493.00 · costo $1,000,000,049.22 · utilidad −$999,999,556.22
 *
 * No arrastra nada: el único lector de la tabla es la rama `dia_costo` de
 * `ventas_dashboard_prev_same_period`, acotada al año previo (2025), y el costo
 * que se ve en pantalla sale de `switch_articulo_diario` vía
 * `switch_costo_unificado_vw`. Verificado antes y después con
 * `scripts/_verif-costo-arrastre.mjs`. No hay ninguna vista materializada que
 * refrescar.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const ID = "d129ea90-abc5-4996-b75e-d144cfe85bdf";

// ── 1. Leer y VERIFICAR que es la fila correcta ──────────────────────────────
const antes = await (await fetch(`${URL_}/rest/v1/switch_costo_diario?select=*&id=eq.${ID}`, { headers: H })).json();
console.log("FILA A BORRAR:");
console.log(JSON.stringify(antes, null, 2));

if (antes.length !== 1) {
  console.error(`\n⛔ ABORTADO: esperaba 1 fila con ese id, encontré ${antes.length}.`);
  process.exit(1);
}
const f = antes[0];
if (
  f.empresa_key !== "confecciones_boston" ||
  f.fecha !== "2026-07-14" ||
  Number(f.costo_total) !== 1000000049.22
) {
  console.error("\n⛔ ABORTADO: la fila no es la aprobada. NO se borra nada.");
  process.exit(1);
}

// ── 2. Borrar ────────────────────────────────────────────────────────────────
const del = await fetch(`${URL_}/rest/v1/switch_costo_diario?id=eq.${ID}`, {
  method: "DELETE",
  headers: { ...H, Prefer: "return=representation" },
});
console.log(`\nDELETE → ${del.status}`);
console.log(await del.text());

// ── 3. Verificar que quedó borrada ───────────────────────────────────────────
const despues = await (await fetch(`${URL_}/rest/v1/switch_costo_diario?select=*&id=eq.${ID}`, { headers: H })).json();
console.log(`\nVERIFICACIÓN — filas con ese id después del borrado: ${despues.length}`);

const boston = await (
  await fetch(
    `${URL_}/rest/v1/switch_costo_diario?select=fecha,venta_total,costo_total&empresa_key=eq.confecciones_boston&fecha=gte.2026-07-01&order=fecha.asc`,
    { headers: H },
  )
).json();
const suma = boston.reduce((a, r) => a + Number(r.costo_total), 0);
console.log(`Julio de confecciones_boston: ${boston.length} días, costo total ${suma.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`¿Queda el 14-jul?  ${boston.some((r) => r.fecha === "2026-07-14") ? "SÍ ⛔" : "NO ✅"}`);

/**
 * READ-ONLY. ¿El selector de clientes encuentra "City Mall" y ofrece LAS DOS?
 *
 * 🔴 NO ESCRIBE NADA. Corre el MISMO `coincideBusqueda` que usa el navegador
 *    (y el endpoint) contra el universo REAL de `leerClientesDelGrupo()`.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-buscador-city-mall.ts
 */
import { leerClientesDelGrupo } from "../src/lib/clientes/directorio-cache";
import { coincideBusqueda } from "../src/lib/buscar-normalizado";

/** El mismo tope que muestra ClientePicker. */
const MAX_SUGERENCIAS = 8;

async function main() {
  const clientes = await leerClientesDelGrupo();
  console.log(`universo del grupo: ${clientes.length} clientes`);

  const CONSULTAS = [
    "City Mall",
    "city mall",
    "CITY MALL",
    "citymall",
    "city  mall",
    "Cíty Máll",
    "city",
    "american classics",
    "american classics store",
    "multifashion",
    "sporting shoes",
    "jerusalem",
  ];

  for (const q of CONSULTAS) {
    const hits = clientes.filter((c) => coincideBusqueda(q, [c.nombre, c.razon_social, c.codigo]));
    const visibles = hits.slice(0, MAX_SUGERENCIAS);
    const cortadas = hits.length - visibles.length;
    console.log(`\n"${q}" → ${hits.length} coincidencias${cortadas > 0 ? `  ⚠️ ${cortadas} NO SE VEN (tope ${MAX_SUGERENCIAS})` : ""}`);
    for (const c of visibles) console.log(`     ${(c.codigo ?? "").padEnd(7)} ${c.nombre}`);
    if (cortadas > 0) for (const c of hits.slice(MAX_SUGERENCIAS)) console.log(`     ✂️ ${(c.codigo ?? "").padEnd(7)} ${c.nombre}`);
  }

  // Lo que importa: con "City Mall" tienen que salir D-24 y D-25, y ANTES del tope.
  const hits = clientes.filter((c) => coincideBusqueda("City Mall", [c.nombre, c.razon_social, c.codigo]));
  const visibles = hits.slice(0, MAX_SUGERENCIAS).map((c) => (c.codigo ?? "").trim());
  console.log(`\n=== VEREDICTO ===`);
  console.log(`"City Mall" ofrece D-24 (David)      : ${visibles.includes("D-24") ? "SÍ" : "NO 🔴"}`);
  console.log(`"City Mall" ofrece D-25 (Paso Canoa) : ${visibles.includes("D-25") ? "SÍ" : "NO 🔴"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

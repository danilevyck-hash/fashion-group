/**
 * Escribe `supabase/migrations/<archivo>.sql` desde el módulo.
 *
 * El SQL de los contadores del hub se DERIVA de `estaALaVenta`; escribirlo a
 * mano sería tener dos definiciones de «a la venta». Este script imprime la
 * salida del módulo y el candado comprueba que el archivo del repo sea esa
 * salida exacta.
 *
 *   npx tsx scripts/_generar-migracion-contadores.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ARCHIVO_MIGRACION, migracionContadores } from "../src/lib/catalogo/contadores-migracion";

const destino = path.resolve(__dirname, "..", "supabase", "migrations", ARCHIVO_MIGRACION);
writeFileSync(destino, migracionContadores(), "utf8");
console.log(`✅ escrito: supabase/migrations/${ARCHIVO_MIGRACION}`);

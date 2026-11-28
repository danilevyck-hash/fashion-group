/**
 * VERIFICACIÓN READ-ONLY de la antigüedad del inventario (Vista general ›
 * Inventario, «Hasta 90 días / Más de 90 días», 27-nov-2026).
 *
 * Corre las MISMAS lecturas que la tarjeta (`leerInventarioValorizado` y
 * `leerAntiguedadInventario`) y muestra, para Fashion Group (las 6) y
 * Multifashion: hasta 90 · más de 90 · sin fecha, y que las tres suman el costo
 * de la tarjeta. Referencia del auditor (27-nov, sin descontar lo que Switch ya
 * no manda): FG 1.062.387 / 1.470.670 / 39.779 · MF 102.721 / 53.729 / 684.
 *
 *   npx tsx scripts/_verif-inventario-90-dias.ts
 */
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

(async () => {
  const { leerAntiguedadInventario, leerInventarioValorizado } = await import("../src/lib/inventario/leer");
  const { B2B_EMPRESA_KEYS } = await import("../src/lib/empresa-mapping");
  const { hoyPanama } = await import("../src/lib/fecha-panama");
  const { DIAS_INVENTARIO_NUEVO } = await import("../src/lib/ui/inventario-90-dias-2026-11");
  const empresas = [...B2B_EMPRESA_KEYS, "american_classic"];
  const [inv, ant] = await Promise.all([
    leerInventarioValorizado(Date.now(), empresas),
    leerAntiguedadInventario(hoyPanama(), DIAS_INVENTARIO_NUEVO, empresas),
  ]);
  const r = (n: number) => Math.round(n).toLocaleString("es-PA");
  const bloque = (nombre: string, keys: readonly string[]) => {
    let n = 0, v = 0, s = 0, c = 0;
    for (const k of keys) {
      const a = ant.get(k) ?? { nuevo: 0, viejo: 0, sinFecha: 0 };
      n += a.nuevo; v += a.viejo; s += a.sinFecha;
      c += inv.porEmpresa.find((e) => e.key === k)?.costo ?? 0;
    }
    const dif = Math.round((n + v + s - c) * 100) / 100;
    console.log(`${nombre}: hasta 90 ${r(n)} · más de 90 ${r(v)} · sin fecha ${r(s)} · costo tarjeta ${r(c)} · dif ${dif}`);
    if (Math.abs(dif) > 1) process.exitCode = 1;
  };
  bloque("Fashion Group", B2B_EMPRESA_KEYS);
  bloque("Multifashion", ["american_classic"]);
})().catch((e) => { console.error(e); process.exit(1); });

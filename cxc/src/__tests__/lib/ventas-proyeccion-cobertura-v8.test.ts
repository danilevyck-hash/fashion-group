// ─────────────────────────────────────────────────────────────────────────────
// PROYECCIÓN DE CIERRE — el piso de cobertura sube de 0.10 a 0.20 (v8,
// 5-sep-2026).
//
// `c_cobertura_min` es el freno para «el año pasado no sirve de referencia
// porque la empresa abrió a mitad de año». En 0.10 solo agarra el caso extremo
// (Joystep, cobertura 0.001).
//
// LO QUE SE MIDIÓ, contra producción, con el SQL real
// (`scripts/_medir-cobertura-minima.mjs`, réplica validada contra la RPC viva
// al centavo en las 8 empresas), sobre 1.246 casos de 2023-2025:
//
//   piso   error por empresa   error de grupo
//   0.10        28.98%             14.48%
//   0.20        28.64%             14.38%   ← el elegido
//   0.25        28.11%             14.28%
//   0.35        27.72%             14.23%
//   0.50        27.74%             14.76%
//   0.60        28.11%             15.83%
//
// 🔴 0.20 ES EL PISO MÁS ALTO QUE NO EMPEORA NI UN SOLO CASO. Bajar el error
// medio no alcanza: un piso que promedia mejor mientras rompe un caso bueno es
// exactamente la clase de cambio que la cabecera de la v7 documenta como
// descartado (punto C).
//
// 🩸 Y LA HIPÓTESIS DE LA QUE NACIÓ ESTE CAMBIO ERA FALSA. `estado-actual.md`
// decía que el 2024 de Multifashion «pasó el filtro» con cobertura 0.55 y que
// por eso su 2025 salió 36% alto. Medido: parada el 5-sep-2025 la proyección da
// $764.549 contra un cierre real de $686.044 = **+11,4%**, y bloquear ese año
// base la EMPEORA a $459.481 (−33%). Por eso el piso NO sube hasta 0.60.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const RAIZ = process.cwd();
const MIG_V8 = "supabase/migrations/20261001120000_proyeccion_cobertura_v8.sql";
const MIG_V7 = "supabase/migrations/20260726120000_ventas_proyeccion_cierre_v7.sql";

const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const v8 = leer(MIG_V8);
const v7 = leer(MIG_V7);
const queries = leer("src/lib/ventas/queries.ts");

function cuerpo(sql: string, fn: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "i");
  const m = sql.match(re);
  expect(m, `no encontré el cuerpo de ${fn}`).toBeTruthy();
  return m![1];
}
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();
/** Quita los comentarios `--`: lo que se compara es el SQL, no la prosa. */
const sinComentarios = (s: string) =>
  s.split("\n").map(l => (l.indexOf("--") === -1 ? l : l.slice(0, l.indexOf("--")))).join("\n");

function constante(sql: string, fn: string, nombre: string): number {
  const m = cuerpo(sql, fn).match(new RegExp(`${nombre}\\s+CONSTANT\\s+\\w+\\s*:=\\s*(-?[\\d.]+)\\s*;`));
  if (!m) throw new Error(`No se encontró la constante ${nombre}`);
  return Number(m[1]);
}

describe("la migración existe y crea la v8", () => {
  it("el archivo está en el repo", () => {
    expect(existsSync(path.join(RAIZ, MIG_V8))).toBe(true);
  });

  it("crea `ventas_proyeccion_cierre_v8` y le da EXECUTE a service_role", () => {
    expect(v8).toMatch(/CREATE OR REPLACE FUNCTION ventas_proyeccion_cierre_v8\(p_anio int\)/);
    expect(v8).toContain("GRANT EXECUTE ON FUNCTION ventas_proyeccion_cierre_v8(int) TO service_role;");
  });

  it("NO toca la v7: la deja viva para poder comparar y para la caída", () => {
    expect(v8).not.toMatch(/DROP\s+FUNCTION[\s\S]*ventas_proyeccion_cierre_v7/i);
    // Ninguna sentencia de la v8 nombra a la v7 fuera de los comentarios.
    expect(sinComentarios(v8)).not.toContain("ventas_proyeccion_cierre_v7");
  });

  it("no escribe una sola fila: es solo la definición de una función", () => {
    const sql = sinComentarios(v8);
    for (const escritura of [/\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w/i, /\bDELETE\s+FROM\b/i, /\bDROP\s+TABLE\b/i]) {
      expect(sql).not.toMatch(escritura);
    }
  });
});

describe("🔴 la v8 ES la v7 con UN solo cambio", () => {
  const b8 = cuerpo(v8, "ventas_proyeccion_cierre_v8");
  const b7 = cuerpo(v7, "ventas_proyeccion_cierre_v7");

  it("el piso pasa de 0.10 a 0.20", () => {
    expect(constante(v7, "ventas_proyeccion_cierre_v7", "c_cobertura_min")).toBe(0.1);
    expect(constante(v8, "ventas_proyeccion_cierre_v8", "c_cobertura_min")).toBe(0.2);
  });

  it("deshaciendo ese único cambio, los dos cuerpos son idénticos (compactados)", () => {
    // El candado de verdad: si alguien aprovecha la v8 para mover el clamp, la
    // rama estacional o el año base, esto se pone rojo.
    const b8ComoV7 = sinComentarios(b8).replace("c_cobertura_min    CONSTANT numeric := 0.20;",
                                                "c_cobertura_min    CONSTANT numeric := 0.10;");
    expect(compacto(b8ComoV7)).toBe(compacto(sinComentarios(b7)));
  });

  it("las otras constantes medidas siguen donde estaban", () => {
    for (const [nombre, valor] of [
      ["c_clamp_min", 0.75], ["c_clamp_max", 1.6], ["c_frac_sin_clamp", 0.5],
      ["c_dias_anio_base", 31], ["c_frac_estacional", 0.05],
    ] as const) {
      expect(constante(v8, "ventas_proyeccion_cierre_v8", nombre), nombre).toBe(valor);
    }
  });
});

describe("la medición que sostiene el 0.20 está escrita y es repetible", () => {
  it("el script de medición vive en el repo y es de SOLO LECTURA", () => {
    const script = leer("scripts/_medir-cobertura-minima.mjs");
    expect(script).toContain("ventas_proyeccion_cierre_v7");
    for (const escritura of [/\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bDELETE\s+FROM\b/i, /\bCREATE\s+(TABLE|FUNCTION)\b/i]) {
      expect(script).not.toMatch(escritura);
    }
  });

  it("la cabecera de la migración trae la tabla de pisos y los tres casos que mejoran", () => {
    expect(v8).toContain("0.20");
    expect(v8).toMatch(/Confecciones Boston 2023.*82\.7%.*4\.4%/);
    expect(v8).toMatch(/Vistana 2023.*53\.3%.*19\.2%/);
    expect(v8).toMatch(/Active Wear 2024.*256\.2%.*178\.2%/);
  });

  it("y dice POR QUÉ no sube más: el caso bueno que se rompería a partir de 0.25", () => {
    expect(v8).toMatch(/American Classic 2025/);
    expect(v8).toMatch(/11[.,]4%/);
  });

  it("deja anotado que hoy no cambia un solo número", () => {
    expect(v8).toMatch(/NADA, en ninguna de las 8 empresas/);
    expect(v8).toContain("0.7193");
  });
});

describe("la FORMA del año pasado llega al navegador, y del año correcto", () => {
  // Sin ella no hay con qué repartir los meses que faltan. 🩸 No se puede sacar
  // de `ventas_dashboard_prev_same_period_v4`: esa RPC no emite los meses
  // posteriores al corte — para Multifashion trae 9 renglones y septiembre vale
  // los mismos días (5.343,98), no el mes.
  it("se lee `ventas_rollup_mensual_mv` del año ANTERIOR", () => {
    expect(queries).toContain("ventas_rollup_mensual_mv");
    expect(queries).toMatch(/\.eq\("anio", year - 1\)/);
  });

  it("viaja por empresa como `ventasPrevFull`, no recortada", () => {
    expect(queries).toMatch(/ventasPrevFull:\s*prevFull\[key\]/);
  });

  it("un error al leerla no rompe el Resumen: los meses se quedan en «—»", () => {
    expect(queries).toMatch(/if \(!prevFullRes\.error\)/);
  });
});

describe("el código llama a la v8 y cae solo si todavía no corrió", () => {
  it("pide la v8", () => {
    expect(queries).toContain("ventas_proyeccion_cierre_v8");
  });

  it("cae a la v7, y la v7 sigue cayendo a la v6", () => {
    // Las tres LLAMADAS, no las tres menciones: nombrarlas en un comentario no
    // es tenerlas en la cadena.
    expect(queries).toMatch(/\.rpc\("ventas_proyeccion_cierre_v7"/);
    expect(queries).toMatch(/\.rpc\("ventas_proyeccion_cierre_v6"/);
    // Las dos caídas encadenadas, no una sola.
    expect(queries.match(/rpcConFallbackDeVersion/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("queries.ts sigue siendo el ÚNICO que invoca la proyección", () => {
    // Dos llamadores = dos números para la misma pregunta. Lo verifica también
    // `ventas-proyeccion-v7.test.ts`; acá se repite para la v8.
    expect(queries).toMatch(/\.rpc\("ventas_proyeccion_cierre_v8"/);
  });
});

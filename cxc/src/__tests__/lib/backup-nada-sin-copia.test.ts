// ═══════════════════════════════════════════════════════════════════════════
//   NADA QUE NO SE PUEDA VOLVER A CONSEGUIR SE QUEDA SIN COPIA.
//
//   El candado que faltaba el día que descubrimos que el módulo Asistencia
//   entero —6.081 marcaciones del reloj, append-only, irrecuperables— llevaba
//   meses fuera del respaldo.
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔑 El hueco no existió por descuido. Existió porque **nada avisaba**: una
// tabla nacía en una migración y el respaldo no se enteraba nunca. Medido el
// 5-sep-2026: 56 tablas respaldadas de 136, y afuera quedaban las marcaciones
// del reloj, los saldos de banco que escribe contabilidad a mano, la
// configuración de comisiones, los tres catálogos nuevos y hasta el catálogo de
// Reebok —que la documentación daba por respaldado y no lo estaba—.
//
// Las cuatro mitades del arreglo:
//
//   A. UNA TABLA NUEVA SIN CLASIFICAR PONE EL BUILD ROJO. Se leen los
//      `create table` de TODAS las migraciones: si una crea algo que
//      `src/lib/backup/tablas.ts` no clasificó, falla acá, antes de producción.
//
//   B. LO QUE NO SE PUEDE VOLVER A CONSEGUIR ESTÁ EN EL RESPALDO. Toda tabla
//      `personas` o `congelada` tiene que aparecer en DATASETS o en
//      SWITCH_DATASETS. Sacar una del route pone el build rojo.
//
//   C. NO SE RESPALDA UNA VISTA. Se recalculan; una vista en el respaldo es un
//      archivo que al restaurar choca con la vista que la migración recrea.
//
//   D. 🩸 LA PAGINACIÓN NO PUEDE SER SILENCIOSAMENTE INCOMPLETA. Toda tabla
//      respaldada cuya llave primaria no sea `id` tiene que estar en `ORDER_BY`
//      con SUS columnas: sin eso PostgREST puede saltear filas entre páginas y
//      el respaldo sale corto pareciendo completo. Nada más lo dice.
//
// La foto de producción (qué tablas existen y cuál es su PK) la verifica
// `src/__tests__/integration/backup-tablas-produccion.test.ts` contra la base
// de verdad; acá todo es puro y corre sin credenciales.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  CLASIFICACION,
  PK_QUE_NO_ES_ID,
  TABLAS_DE_MIGRACION_QUE_NO_EXISTEN,
  VISTAS,
  obligaRespaldo,
  tablasQueObliganRespaldo,
} from "@/lib/backup/tablas";

const RAIZ = path.resolve(__dirname, "../../..");
const ROUTE = fs.readFileSync(
  path.join(RAIZ, "src/app/api/cron/backup/route.ts"),
  "utf8",
);

/** Las tablas que el route respalda (los dos grupos juntos). */
const RESPALDADAS = new Set(
  [...ROUTE.matchAll(/\{\s*table:\s*"([a-z_0-9]+)"/g)].map((m) => m[1]),
);

/** El `ORDER_BY` del route, leído del archivo (no importable: el route arrastra
 *  Supabase y Next). */
function orderByDelRoute(): Record<string, string[]> {
  const bloque = ROUTE.match(/const ORDER_BY: Record<string, string\[\]> = \{([\s\S]*?)\n\};/);
  if (!bloque) throw new Error("no encontré ORDER_BY en el route del backup");
  const out: Record<string, string[]> = {};
  for (const m of bloque[1].matchAll(/^\s*([a-z_0-9]+):\s*\[([^\]]*)\]/gm)) {
    out[m[1]] = [...m[2].matchAll(/"([a-z_0-9]+)"/g)].map((c) => c[1]);
  }
  return out;
}

/** Todo `create table [if not exists] <nombre>` de las migraciones. */
function tablasCreadasEnMigraciones(): string[] {
  const dir = path.join(RAIZ, "supabase/migrations");
  const out = new Set<string>();
  for (const archivo of fs.readdirSync(dir)) {
    if (!archivo.endsWith(".sql")) continue;
    const sql = fs.readFileSync(path.join(dir, archivo), "utf8");
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z_0-9]*)"?/gi,
    )) {
      out.add(m[1].toLowerCase());
    }
  }
  // `create table if ...` mal partido por el regex, y los temporales de una
  // migración: se descartan por no ser identificadores de tabla reales.
  out.delete("if");
  return [...out].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
describe("A. una tabla nueva sin clasificar pone el build ROJO", () => {
  it("toda tabla creada por una migración está clasificada", () => {
    const sinClasificar = tablasCreadasEnMigraciones().filter(
      (t) =>
        CLASIFICACION[t] === undefined &&
        !TABLAS_DE_MIGRACION_QUE_NO_EXISTEN.includes(t),
    );
    expect(
      sinClasificar,
      `Tablas nuevas que nadie clasificó: ${sinClasificar.join(", ")}\n` +
        `Decidí qué se pierde si se pierde y agregalas a src/lib/backup/tablas.ts.\n` +
        `Si la escriben personas (o un aparato nuestro), va también al respaldo.`,
    ).toEqual([]);
  });

  it("la clasificación no repite una tabla en dos clases", () => {
    // CLASIFICACION es un objeto: un duplicado se pisaría en silencio. Se cuenta
    // contra la suma de los bloques.
    const bloques = fs.readFileSync(
      path.join(RAIZ, "src/lib/backup/tablas.ts"),
      "utf8",
    );
    const nombres = [
      ...bloques.matchAll(
        /export const (?:TABLAS_PERSONAS|TABLAS_CONGELADAS|TABLAS_SWITCH|TABLAS_BITACORA|TABLAS_RETIRADAS|VISTAS) = \[([\s\S]*?)\] as const;/g,
      ),
    ].flatMap((m) => [...m[1].matchAll(/"([a-z_0-9]+)"/g)].map((x) => x[1]));
    const repetidas = nombres.filter((t, i) => nombres.indexOf(t) !== i);
    expect(repetidas, `clasificadas dos veces: ${repetidas.join(", ")}`).toEqual([]);
    expect(nombres.length).toBe(Object.keys(CLASIFICACION).length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. lo que no se puede volver a conseguir está en el respaldo", () => {
  it("toda tabla `personas` o `congelada` está en el route", () => {
    const sinCopia = tablasQueObliganRespaldo().filter((t) => !RESPALDADAS.has(t));
    expect(
      sinCopia,
      `Tablas sin copia: ${sinCopia.join(", ")}\n` +
        `Si se pierden, se perdieron. Agregalas a DATASETS en\n` +
        `src/app/api/cron/backup/route.ts — o cambiales la clase, con motivo.`,
    ).toEqual([]);
  });

  it("las marcaciones del reloj están, y van PRIMERAS en su grupo", () => {
    // Son la única tabla de toda la base que nadie puede volver a mandar. Si la
    // corrida muriera a mitad, lo más valioso ya quedó subido — el mismo
    // criterio que switch_articulo_diario en el grupo switch.
    expect(RESPALDADAS.has("asistencia_marcaciones")).toBe(true);
    const orden = [...ROUTE.matchAll(/\{\s*table:\s*"([a-z_0-9]+)"/g)].map((m) => m[1]);
    const asistencia = orden.filter((t) => t.startsWith("asistencia_"));
    expect(asistencia[0]).toBe("asistencia_marcaciones");
  });

  it("cada tabla del route está clasificada (y ninguna es `retirada`)", () => {
    for (const tabla of RESPALDADAS) {
      const clase = CLASIFICACION[tabla];
      expect(clase, `${tabla} se respalda y no está clasificada`).toBeDefined();
      expect(clase, `${tabla} está marcada como retirada y se sigue respaldando`).not.toBe(
        "retirada",
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. no se respalda una vista", () => {
  it("ninguna vista ni materializada está en el route", () => {
    const coladas = (VISTAS as readonly string[]).filter((v) => RESPALDADAS.has(v));
    expect(coladas, `vistas en el respaldo: ${coladas.join(", ")}`).toEqual([]);
  });

  it("ninguna vista obliga respaldo", () => {
    for (const v of VISTAS) expect(obligaRespaldo(v)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. la paginación no puede quedar incompleta en silencio", () => {
  const ORDER_BY = orderByDelRoute();

  it("toda tabla respaldada con PK distinta de `id` tiene su ORDER_BY", () => {
    const rotas: string[] = [];
    for (const tabla of RESPALDADAS) {
      const pk = PK_QUE_NO_ES_ID[tabla];
      if (!pk) continue; // PK = id → el default alcanza
      const orden = ORDER_BY[tabla];
      if (!orden || orden.join(",") !== pk.join(",")) {
        rotas.push(`${tabla} (PK ${pk.join("+")}, ORDER_BY ${orden?.join("+") ?? "ausente"})`);
      }
    }
    expect(
      rotas,
      `Paginación NO determinista — el respaldo sale corto y parece completo:\n` +
        rotas.map((r) => `  · ${r}`).join("\n"),
    ).toEqual([]);
  });

  it("no sobra ningún ORDER_BY (una tabla con PK `id` no lo necesita)", () => {
    const sobran = Object.keys(ORDER_BY).filter((t) => !PK_QUE_NO_ES_ID[t]);
    expect(sobran, `ORDER_BY de más: ${sobran.join(", ")}`).toEqual([]);
  });
});

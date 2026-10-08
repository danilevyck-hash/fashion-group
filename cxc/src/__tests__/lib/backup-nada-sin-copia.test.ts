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
//   D. 🩸 LA PAGINACIÓN NO PUEDE ROMPERSE NI SER SILENCIOSAMENTE INCOMPLETA.
//      El respaldo ordena cada tabla por `columnasDeOrden()` (su PK real). Se
//      leen las migraciones: si una tabla respaldada no tiene esa columna, o su
//      PK no es la declarada, el build se pone ROJO. El 8-oct-2026 entró
//      `mk_proveedor_alias` (PK `alias_normalizado`, sin `id`) y el respaldo
//      pidió `id` → 500.
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
  columnasDeOrden,
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

/** Columnas y PK de cada tabla según las migraciones (`create table` +
 *  `alter table … add column`). Una tabla creada desde el panel no aparece. */
type Esquema = { columnas: Set<string>; pk?: string[]; creada?: boolean };
function esquemaDeMigraciones(): Map<string, Esquema> {
  const dir = path.join(RAIZ, "supabase/migrations");
  const out = new Map<string, Esquema>();
  const de = (t: string) => {
    if (!out.has(t)) out.set(t, { columnas: new Set() });
    return out.get(t)!;
  };
  for (const archivo of fs.readdirSync(dir).sort()) {
    if (!archivo.endsWith(".sql")) continue;
    const sql = fs.readFileSync(path.join(dir, archivo), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z_0-9]*)"?\s*\(/gi,
    )) {
      // Cuerpo hasta el paréntesis que cierra, cortado por comas de nivel 0.
      let nivel = 1, i = m.index! + m[0].length, parte = "";
      const partes: string[] = [];
      for (; i < sql.length && nivel > 0; i++) {
        const c = sql[i];
        if (c === "(") nivel++;
        if (c === ")") nivel--;
        if (nivel === 1 && c === ",") { partes.push(parte); parte = ""; } else if (nivel > 0) parte += c;
      }
      partes.push(parte);
      const t = de(m[1].toLowerCase());
      t.creada = true;
      for (const p of partes.map((x) => x.trim())) {
        const pkCompuesta = p.match(/^(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]*)\)/i);
        if (pkCompuesta) { t.pk = pkCompuesta[1].split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase()); continue; }
        if (/^(constraint|unique|check|foreign|exclude|like)\b/i.test(p)) continue;
        const col = p.match(/^"?([a-z_][a-z_0-9]*)"?\s/i);
        if (!col) continue;
        t.columnas.add(col[1].toLowerCase());
        if (/\bprimary\s+key\b/i.test(p)) t.pk = [col[1].toLowerCase()];
      }
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_][a-z_0-9]*)"?([^;]*)/gi,
    )) {
      for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z_0-9]*)"?/gi)) {
        de(m[1].toLowerCase()).columnas.add(c[1].toLowerCase());
      }
    }
  }
  // Las que solo aparecen en un `alter table` nacieron en el panel: no se sabe
  // su estructura entera, así que no se juzgan acá.
  for (const [t, e] of out) if (!e.creada) out.delete(t);
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
describe("D. la paginación no puede romperse ni quedar incompleta en silencio", () => {
  const ESQUEMA = esquemaDeMigraciones();

  it("el parser de migraciones ve la tabla del 8-oct como es", () => {
    // Si esto falla, el parser se rompió y el resto de D no prueba nada.
    expect(ESQUEMA.get("mk_proveedor_alias")?.pk).toEqual(["alias_normalizado"]);
    expect(ESQUEMA.get("mk_proveedor_alias")?.columnas.has("id")).toBe(false);
    expect(ESQUEMA.get("pedidos_linea_bulto")?.pk).toEqual([
      "empresa_key", "pedido_switch_id", "codigo_barra_id", "bulto",
    ]);
  });

  it("toda tabla respaldada tiene la columna por la que el respaldo la lee", () => {
    const rotas: string[] = [];
    for (const tabla of RESPALDADAS) {
      const t = ESQUEMA.get(tabla);
      if (!t) continue; // creada desde el panel: la mira el test de integración
      const faltan = columnasDeOrden(tabla).filter((c) => !t.columnas.has(c));
      if (faltan.length) rotas.push(`${tabla}: ordena por ${faltan.join("+")} y no la tiene`);
    }
    expect(
      rotas,
      `El respaldo va a fallar en estas tablas:\n` +
        rotas.map((r) => `  · ${r}`).join("\n") +
        `\nDeclárale su PK real en PK_QUE_NO_ES_ID (src/lib/backup/tablas.ts).`,
    ).toEqual([]);
  });

  it("toda tabla respaldada se ordena por su PK de verdad", () => {
    const rotas: string[] = [];
    for (const tabla of RESPALDADAS) {
      const pk = ESQUEMA.get(tabla)?.pk;
      if (!pk) continue;
      const orden = columnasDeOrden(tabla);
      if (orden.join(",") !== pk.join(",")) {
        rotas.push(`${tabla} (PK ${pk.join("+")}, se ordena por ${orden.join("+")})`);
      }
    }
    expect(
      rotas,
      `Paginación NO determinista — el respaldo sale corto y parece completo:\n` +
        rotas.map((r) => `  · ${r}`).join("\n"),
    ).toEqual([]);
  });

  it("el route no tiene una lista de orden propia (una sola fuente)", () => {
    expect(ROUTE).not.toMatch(/const ORDER_BY/);
    expect(ROUTE).toMatch(/columnasDeOrden\(table\)/);
  });
});

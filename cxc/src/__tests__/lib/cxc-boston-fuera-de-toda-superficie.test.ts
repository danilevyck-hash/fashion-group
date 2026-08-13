/**
 * CANDADO — el CXC del GRUPO no muestra Boston en NINGUNA superficie.
 *
 * ─── LA REGLA, dicha por Daniel (12-ago-2026), textual ───────────────────────
 *   "debe de ser cxc de fashion group y otro aparte de boston, no deben de ni
 *    convivir juntos. cxc de fashion group si debe de convivir con todo el
 *    sistema por guias, marketing, clientes, ventas, ect, ect, eso quiero que
 *    este muy claro."
 *
 * ─── POR QUÉ ESTE ARCHIVO Y NO UN TEST MÁS EN `boston-no-se-mezcla` ─────────
 * `boston-no-se-mezcla.test.ts` protege superficies NOMBRADAS a mano: abre
 * `20260728120000_aging_grupo_y_boston_aparte.sql` por su nombre y verifica 6
 * rutas de una lista literal. Eso caza lo que ya se conoce y **no puede cazar lo
 * que se agregue mañana** — que es exactamente cómo se escapó el bug del 12-ago:
 *
 *   La migración del 28-jul le puso el filtro a la VISTA `switch_estadocuenta_aging`
 *   y **se olvidó de su MV**, `switch_estadocuenta_aging_mv`, que era una COPIA
 *   verbatim de su cuerpo. La MV es lo que lee `/api/cxc/aging`. Medido en
 *   producción: VIEW 211 filas / 0 de Boston · **MV 593 filas / 382 de Boston**.
 *
 * Por eso acá NO hay listas de objetos ni de archivos: son dos BARRIDOS que
 * recorren TODO lo que hay y exigen que cada cosa que toca la cartera se declare.
 * Un objeto SQL nuevo, o una consulta nueva, nace vigilado.
 *
 *   BARRIDO 1 (SQL) — recorre `supabase/migrations/` entera, arma la definición
 *   FINAL de cada VIEW / MATERIALIZED VIEW / FUNCTION, y exige que todo lo que
 *   lea `switch_estadocuenta` esté acotado: o excluye a las empresas de cartera
 *   aparte, o es solo-Boston, o es por-empresa, o DERIVA de un objeto ya seguro.
 *
 *   BARRIDO 2 (TypeScript) — recorre `src/` y exige que toda lectura de la TABLA
 *   BASE `switch_estadocuenta` acote por `empresa_key` en la misma cadena.
 *
 * Las excepciones existen, pero son EXPLÍCITAS y con motivo escrito: agregar una
 * es una decisión que se lee en el diff, no un olvido en silencio.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACIONES = path.join(RAIZ, "supabase/migrations");
const SRC = path.join(RAIZ, "src");

/** La tabla donde conviven los saldos de las 6 del grupo Y los de Boston. */
const TABLA_BASE = "switch_estadocuenta";

const CARTERA_APARTE = [...empresasCarteraAparte()].sort();
const GRUPO = [...B2B_EMPRESA_KEYS] as readonly string[];

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de lectura
// ─────────────────────────────────────────────────────────────────────────────

function migracionesOrdenadas(): { archivo: string; sql: string }[] {
  return fs
    .readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .sort() // el nombre empieza con el timestamp → orden cronológico
    .map((archivo) => ({ archivo, sql: fs.readFileSync(path.join(MIGRACIONES, archivo), "utf8") }));
}

/** Quita comentarios `--` para que un ejemplo en la documentación no cuente
 *  como código (ni como filtro que no existe). */
function sinComentarios(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function archivosTs(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      archivosTs(p, acc);
    } else if (/\.tsx?$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

/** Comentarios de TS/JS fuera: `//`, `/* … *\/`. */
function sinComentariosTs(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// BARRIDO 1 — todos los objetos SQL
// ─────────────────────────────────────────────────────────────────────────────

interface ObjetoSql {
  nombre: string;
  tipo: "view" | "materialized view" | "function";
  cuerpo: string;
  archivo: string;
}

/**
 * Arma la definición FINAL (la última que gana) de cada VIEW / MV / FUNCTION del
 * repo. Recorre las migraciones en orden cronológico: una redefinición pisa a la
 * anterior y un DROP la saca.
 */
function objetosSqlFinales(): Map<string, ObjetoSql> {
  const vivos = new Map<string, ObjetoSql>();

  for (const { archivo, sql } of migracionesOrdenadas()) {
    const limpio = sinComentarios(sql);

    // DROPs primero no sirve: pueden venir antes o después dentro del archivo.
    // Se procesa en el orden en que aparecen usando un solo barrido de índices.
    const eventos: { pos: number; fn: () => void }[] = [];

    // CREATE [OR REPLACE] [MATERIALIZED] VIEW <nombre> AS <cuerpo>;
    const reVista = /CREATE\s+(?:OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)\s+AS/gi;
    for (let m = reVista.exec(limpio); m; m = reVista.exec(limpio)) {
      const nombre = m[2].replace(/"/g, "").replace(/^public\./, "");
      const tipo = m[1] ? ("materialized view" as const) : ("view" as const);
      const desde = m.index + m[0].length;
      // El cuerpo de una vista no lleva `;` propio: termina en el primero.
      const fin = limpio.indexOf(";", desde);
      const cuerpo = limpio.slice(desde, fin === -1 ? undefined : fin);
      const pos = m.index;
      eventos.push({ pos, fn: () => vivos.set(nombre, { nombre, tipo, cuerpo, archivo }) });
    }

    // CREATE [OR REPLACE] FUNCTION <nombre>(...) ... AS $tag$ <cuerpo> $tag$;
    const reFn = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_."]+)\s*\(/gi;
    for (let m = reFn.exec(limpio); m; m = reFn.exec(limpio)) {
      const nombre = m[1].replace(/"/g, "").replace(/^public\./, "");
      const resto = limpio.slice(m.index);
      const dq = /AS\s+\$([a-zA-Z0-9_]*)\$/i.exec(resto);
      if (!dq) continue;
      const inicio = dq.index + dq[0].length;
      const cierre = resto.indexOf(`$${dq[1]}$`, inicio);
      const cuerpo = resto.slice(inicio, cierre === -1 ? undefined : cierre);
      const pos = m.index;
      eventos.push({ pos, fn: () => vivos.set(nombre, { nombre, tipo: "function", cuerpo, archivo }) });
    }

    // DROP [MATERIALIZED] VIEW / DROP FUNCTION
    const reDrop = /DROP\s+(?:MATERIALIZED\s+)?(?:VIEW|FUNCTION)\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
    for (let m = reDrop.exec(limpio); m; m = reDrop.exec(limpio)) {
      const nombre = m[1].replace(/"/g, "").replace(/^public\./, "");
      const pos = m.index;
      eventos.push({ pos, fn: () => vivos.delete(nombre) });
    }

    for (const e of eventos.sort((a, b) => a.pos - b.pos)) e.fn();
  }

  return vivos;
}

/** Las keys que aparecen entre comillas dentro de un `IN (...)` / `NOT IN (...)`. */
function keysDe(lista: string): string[] {
  return [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** ¿El cuerpo EXCLUYE a todas las empresas de cartera aparte? */
function excluyeCarteraAparte(cuerpo: string): boolean {
  for (const m of cuerpo.matchAll(/empresa_key\s+NOT\s+IN\s*\(([^)]*)\)/gi)) {
    const keys = keysDe(m[1]);
    if (CARTERA_APARTE.every((k) => keys.includes(k))) return true;
  }
  for (const m of cuerpo.matchAll(/empresa_key\s*(?:<>|!=)\s*'([^']+)'/gi)) {
    if (CARTERA_APARTE.length === 1 && m[1] === CARTERA_APARTE[0]) return true;
  }
  return false;
}

/** ¿El cuerpo se acota a un conjunto que NO incluye ninguna cartera aparte?
 *  (la pestaña de Boston es el caso simétrico y también es válido: es SOLO
 *  Boston, o sea que tampoco mezcla). */
function acotadoAUnConjunto(cuerpo: string): boolean {
  for (const m of cuerpo.matchAll(/empresa_key\s+IN\s*\(([^)]*)\)/gi)) {
    const keys = keysDe(m[1]);
    if (keys.length === 0) continue;
    const soloGrupo = keys.every((k) => GRUPO.includes(k));
    const soloAparte = keys.every((k) => CARTERA_APARTE.includes(k));
    if (soloGrupo || soloAparte) return true;
  }
  for (const m of cuerpo.matchAll(/empresa_key\s*=\s*'([^']+)'/gi)) {
    if (GRUPO.includes(m[1]) || CARTERA_APARTE.includes(m[1])) return true;
  }
  return false;
}

/** RPC que recibe la empresa por parámetro: quien la llama decide, y esos
 *  llamadores los cubre el barrido de TypeScript. */
function parametrizadaPorEmpresa(cuerpo: string): boolean {
  return /empresa_key\s*=\s*p_[a-z_]*empresa/i.test(cuerpo);
}

/** ¿Lee la TABLA BASE (donde conviven grupo y Boston)? `\b` no matchea contra
 *  `switch_estadocuenta_aging` porque `_` es carácter de palabra. */
function leeTablaBase(cuerpo: string): boolean {
  return new RegExp(`\\b${TABLA_BASE}\\b`).test(cuerpo);
}

/**
 * Objetos SQL que leen la cartera SIN acotar y que están permitidos, cada uno
 * con el motivo escrito. Agregar una entrada acá es una decisión visible en el
 * diff — que es todo el punto.
 */
const SQL_PERMITIDOS: Record<string, string> = {
  switch_estadocuenta_tipos_sin_clasificar:
    "vista de DIAGNÓSTICO de calidad del dato: cuenta tipo_comprobante por empresa " +
    "y agrupa POR empresa_key, así que Boston sale identificada en su propia fila, " +
    "nunca sumada al grupo. No es una superficie del CXC.",
  switch_estadocuenta_dias_anomalo:
    "vista de DIAGNÓSTICO (días fuera de bucket), también agrupada POR empresa_key. " +
    "No suma cartera.",
  switch_ultimo_pago_cliente_v2:
    "el grano es (empresa_key, cliente_switch_id): NO agrega entre empresas, así que " +
    "no puede sumar la plata de dos carteras en una cifra. Quién puede aparecer lo " +
    "deciden los dos consumidores, y los dos acotan (ver el barrido de TypeScript y " +
    "boston-no-se-mezcla.test.ts).",
};

describe("BARRIDO 1 — ningún objeto SQL suma la cartera de Boston con la del grupo", () => {
  const objetos = objetosSqlFinales();

  it("el barrido encuentra los objetos que ya sabemos que existen (si no, no está barriendo nada)", () => {
    // Sin esto, un parser roto devolvería 0 objetos y TODOS los tests de abajo
    // pasarían en verde sin haber mirado una sola línea de SQL.
    expect(objetos.has("switch_estadocuenta_aging")).toBe(true);
    expect(objetos.has("switch_estadocuenta_aging_mv")).toBe(true);
    expect(objetos.has("switch_estadocuenta_aging_boston")).toBe(true);
    expect(objetos.has("home_dashboard_summary")).toBe(true);
  });

  it("todo objeto SQL que toca la cartera está acotado (o declarado como excepción)", () => {
    // Un objeto es SEGURO si: excluye la cartera aparte · se acota a un conjunto
    // de un solo lado · recibe la empresa por parámetro · o NO toca la tabla base
    // (o sea, DERIVA de un objeto que ya resolvió la pregunta).
    const seguro = (o: ObjetoSql): boolean =>
      excluyeCarteraAparte(o.cuerpo) ||
      acotadoAUnConjunto(o.cuerpo) ||
      parametrizadaPorEmpresa(o.cuerpo) ||
      !leeTablaBase(o.cuerpo);

    const culpables = [...objetos.values()]
      .filter((o) => leeTablaBase(o.cuerpo))
      .filter((o) => !seguro(o))
      .filter((o) => !(o.nombre in SQL_PERMITIDOS))
      .map((o) => `${o.tipo} ${o.nombre} (${o.archivo})`);

    expect(
      culpables,
      "Estos objetos SQL leen switch_estadocuenta sin acotar por empresa. La cartera de " +
        "confecciones_boston NO es del grupo y no puede sumarse con la suya. Agregá el " +
        "filtro, o —si de verdad tiene que leer las dos— declarálo en SQL_PERMITIDOS con " +
        "el motivo escrito.",
    ).toEqual([]);
  });

  it("las excepciones declaradas siguen existiendo (nada de permisos zombis)", () => {
    for (const nombre of Object.keys(SQL_PERMITIDOS)) {
      expect(objetos.has(nombre), `${nombre} ya no existe: sacálo de SQL_PERMITIDOS`).toBe(true);
    }
  });
});

describe("BARRIDO 1b — la MV del aging es la vista MATERIALIZADA, no una copia", () => {
  const objetos = objetosSqlFinales();
  const mv = objetos.get("switch_estadocuenta_aging_mv")!;
  const vista = objetos.get("switch_estadocuenta_aging")!;

  it("la vista del grupo excluye a confecciones_boston", () => {
    expect(excluyeCarteraAparte(vista.cuerpo)).toBe(true);
  });

  it("la MV NO lee la tabla base: selecciona DE la vista", () => {
    // ESTE es el test que caza el bug del 12-ago-2026 y, sobre todo, el que
    // impide que vuelva. Ponerle el `NOT IN` a una copia del cuerpo arregla HOY
    // y deja el mismo defecto para mañana: dos cuerpos SQL que hay que acordarse
    // de tocar juntos. Materializando la vista, la MV hereda TODO —el filtro de
    // empresa, los buckets, el signo defensivo— por construcción.
    expect(
      leeTablaBase(mv.cuerpo),
      "switch_estadocuenta_aging_mv volvió a leer switch_estadocuenta directo. Tiene que " +
        "salir de switch_estadocuenta_aging (la vista ES la definición de 'cartera del " +
        "grupo'); si copia su cuerpo, el próximo cambio en la vista la deja atrás otra vez.",
    ).toBe(false);
    expect(mv.cuerpo).toMatch(/\bswitch_estadocuenta_aging\b/);
  });

  it("la MV conserva `materializado_en` (la frescura que muestra el CXC)", () => {
    expect(mv.cuerpo).toMatch(/materializado_en/);
  });

  it("la vista de Boston trae SOLO a Boston", () => {
    const boston = objetos.get("switch_estadocuenta_aging_boston")!;
    expect(boston.cuerpo).toMatch(/empresa_key\s*=\s*'confecciones_boston'/);
    expect(excluyeCarteraAparte(boston.cuerpo)).toBe(false); // es lo contrario: solo Boston
  });

  it("la lista excluida en el SQL es EXACTAMENTE empresasCarteraAparte()", () => {
    const m = /empresa_key\s+NOT\s+IN\s*\(([^)]*)\)/i.exec(vista.cuerpo);
    expect(m).not.toBeNull();
    expect(keysDe(m![1]).sort()).toEqual(CARTERA_APARTE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BARRIDO 2 — toda lectura de la tabla base en TypeScript acota por empresa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Archivos que leen/escriben `switch_estadocuenta` SIN acotar por empresa y que
 * están permitidos, con el motivo. Son los que trabajan sobre la tabla como
 * ALMACÉN (el sync la escribe para las 7 empresas), no como cartera del grupo.
 */
const TS_PERMITIDOS: Record<string, string> = {
  "src/lib/switch-api/sync-empresa.ts":
    "es el SYNC: escribe y reconcilia la tabla empresa por empresa (incluida Boston, " +
    "que sí tiene estadoCuenta:true). Acotarlo al grupo dejaría a Boston sin cargar.",
  "src/lib/switch-api/sync-estadocuenta-web.ts":
    "el sync de la cartera de Boston por el reporte WEB. Es de Boston a propósito.",
};

function leeTablaBaseEnTs(src: string): boolean {
  return new RegExp(`from\\(["']${TABLA_BASE}["']\\)`).test(src);
}

/** ¿La consulta acota por empresa en la MISMA cadena? */
function acotaPorEmpresaEnTs(src: string): boolean {
  const i = src.search(new RegExp(`from\\(["']${TABLA_BASE}["']\\)`));
  if (i === -1) return false;
  // Todas las lecturas del archivo tienen que acotar, no solo la primera.
  const trozos = src.split(new RegExp(`from\\(["']${TABLA_BASE}["']\\)`)).slice(1);
  return trozos.every((t) => /\.(in|eq)\(\s*["']empresa_key["']/.test(t.slice(0, 600)));
}

describe("BARRIDO 2 — toda lectura de switch_estadocuenta en la app acota por empresa", () => {
  const archivos = archivosTs(SRC)
    .map((abs) => ({ rel: path.relative(RAIZ, abs), src: sinComentariosTs(fs.readFileSync(abs, "utf8")) }))
    .filter((f) => leeTablaBaseEnTs(f.src));

  it("el barrido encuentra archivos (si no, no está barriendo nada)", () => {
    expect(archivos.length).toBeGreaterThan(4);
    const rels = archivos.map((a) => a.rel);
    expect(rels).toContain("src/app/api/cxc-summary/route.ts");
    expect(rels).toContain("src/lib/integrity-checks.ts");
  });

  it("ninguna consulta lee la tabla base sin decir de qué empresa", () => {
    const culpables = archivos
      .filter((f) => !(f.rel in TS_PERMITIDOS))
      .filter((f) => !acotaPorEmpresaEnTs(f.src))
      .map((f) => f.rel);

    expect(
      culpables,
      "Estos archivos leen switch_estadocuenta sin acotar por empresa_key. En esa tabla " +
        "conviven las 6 del grupo y confecciones_boston: una consulta sin filtro le " +
        "contesta al grupo con datos de Boston. Agregá .in(\"empresa_key\", " +
        "CXC_GRUPO_EMPRESA_KEYS) —o .eq() si es por empresa—, o declarálo en TS_PERMITIDOS.",
    ).toEqual([]);
  });

  it("las excepciones declaradas siguen leyendo la tabla (nada de permisos zombis)", () => {
    const rels = new Set(archivos.map((a) => a.rel));
    for (const rel of Object.keys(TS_PERMITIDOS)) {
      expect(rels.has(rel), `${rel} ya no lee switch_estadocuenta: sacálo de TS_PERMITIDOS`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA OTRA MITAD DE LA REGLA — el CXC del grupo NO se aísla de más
// ─────────────────────────────────────────────────────────────────────────────

describe("el CXC del grupo SÍ convive con el resto del sistema", () => {
  // Daniel dijo DOS cosas, y la segunda es tan regla como la primera: "cxc de
  // fashion group si debe de convivir con todo el sistema por guias, marketing,
  // clientes, ventas". Aislar el CXC "por las dudas" también sería un error, y
  // es un error fácil de cometer justo después de arreglar una fuga.
  it("las 6 empresas del grupo son EXACTAMENTE las que llevan cartera", () => {
    expect([...B2B_EMPRESA_KEYS].sort()).toEqual(
      ["active_shoes", "active_wear", "fashion_shoes", "fashion_wear", "joystep", "vistana"],
    );
  });

  it("ninguna de las 6 está en la lista de cartera aparte", () => {
    for (const k of B2B_EMPRESA_KEYS) expect(CARTERA_APARTE).not.toContain(k);
  });

  it("la vista del grupo NO se acota a una sola empresa ni pierde a joystep", () => {
    const vista = objetosSqlFinales().get("switch_estadocuenta_aging")!;
    // Si alguien "endureciera" la vista con un IN de las 6, joystep (que ya se
    // perdió una vez de una lista paralela y costó $15.262) volvería a poder
    // caerse en silencio. La vista excluye; no enumera.
    expect(acotadoAUnConjunto(vista.cuerpo)).toBe(false);
    expect(excluyeCarteraAparte(vista.cuerpo)).toBe(true);
  });

  it("los módulos que conviven con el CXC siguen leyendo las 6 (clientes, ventas, búsqueda, guías)", () => {
    const conviven = [
      "src/app/clientes/[codigo]/page.tsx",
      "src/app/api/clientes/[codigo]/route.ts",
      "src/app/api/search/route.ts",
      "src/app/api/dashboard/vista-general/route.ts",
    ];
    for (const rel of conviven) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      expect(
        /B2B_EMPRESA_KEYS|CXC_GRUPO_EMPRESA_KEYS|switch_estadocuenta_aging/.test(src),
        `${rel} dejó de mirar la cartera del grupo — el CXC no puede quedar aislado del resto`,
      ).toBe(true);
    }
  });
});

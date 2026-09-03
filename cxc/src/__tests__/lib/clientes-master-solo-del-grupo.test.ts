// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — `clientes_master` es el directorio del GRUPO, y NADIE lo une por NOMBRE
//
// ─── LO QUE PASÓ, medido contra producción el 2-sep-2026 ─────────────────────
//
// Ventas › Clientes publicaba el DOBLE de la venta real de 21 clientes:
//     City Mall David · Vistana · 2026 →  la app $227.872,28  ·  Switch $113.936,14
// El total del ranking decía $7.911.210,10 contra $5.357.597,39 reales:
// **$2,55 millones de venta que no existió**, durante cinco semanas.
//
// DOS defectos encadenados, y hacen falta los DOS arreglos:
//
//   1. 🔴 LA RAÍZ — BOSTON ESTABA ADENTRO. El 28-jul-2026 a las 07:01 UTC,
//      `sync-clientes-master` metió 4.910 clientes de Confecciones Boston en
//      `clientes_master`. Excluía `american_classic` y SOLO a `american_classic`.
//      La tabla NO tiene columna `empresa_key` —una fila por CÓDIGO, compartida
//      por las 6 del grupo—, así que adentro un cliente de Boston es
//      INDISTINGUIBLE de uno del grupo. Eso viola el invariante 🔴 más fuerte del
//      repo (`docs/postmortems/boston-cxc.md`): *"Boston NUNCA se mezcla con el
//      CXC del grupo — ni una fila, ni un total, ni un export, ni un badge"*.
//      Daniel, textual: *"Boston es estricto para ver sus ventas y tiene hasta su
//      propio CXC, no quiero que se mezcle en mi grupo"*.
//
//   2. EL MÉTODO — LAS VISTAS UNÍAN POR NOMBRE.
//         LEFT JOIN clientes_master mc ON mc.nombre_normalized = a.cliente_norm
//      Un LEFT JOIN contra una tabla que puede tener el mismo nombre en dos filas
//      no "elige una": DEVUELVE LAS DOS, y el SUM de abajo cuenta la factura dos
//      veces. 46 nombres repetidos entre filas vivas, 24 mezclando grupo y Boston.
//
// ─── 🔑 POR QUÉ SE PROHÍBE EL JOIN Y NO LOS NOMBRES REPETIDOS ────────────────
//
// Es la pregunta que decide este archivo, y la respuesta está MEDIDA:
// **un nombre repetido NO es un error; unir por él, sí.**
//
//   · Sacando a Boston quedan 3 nombres repetidos ENTRE clientes del propio
//     grupo — `CITY MODA CHORRERA` (D-30/D-26), `METRO SHOES PANAMA SA`
//     (D-103/D-173), `EL MACHETAZO SAN MIGUELITO` (D-171/D-101). Son códigos
//     desfasados en el panel de Switch, un hecho del dato, no un bug nuestro.
//     Un test que fallara por ellos estaría rojo hoy y para siempre, y terminaría
//     silenciado — que es la peor clase de candado.
//   · Un test de DATOS falla (o pasa) por razones que ningún cambio de código
//     causó, así que no protege ninguna ruta de código.
//   · El join, en cambio, es ESTRUCTURAL: se ve en el SQL, se caza en el build,
//     y caza la PRÓXIMA superficie antes de que se publique. 🩸 Y hace falta que
//     cace la próxima: este mismo bug se parchó DOS veces —Directorio (#387) y
//     buscador ⌘K (#388), los dos el 30-jul-2026— y las dos veces se arregló la
//     pantalla que alguien notó, sin mirar la tercera.
//
// (Si Daniel quiere VER los nombres repetidos, el lugar es un check de
//  `/admin/data-health`, que avisa sin poner el build rojo. No es este archivo.)
//
// ─── QUÉ VIGILA ─────────────────────────────────────────────────────────────
//   BARRIDO 1 (SQL) — arma la definición FINAL de cada VIEW / MV / FUNCTION del
//     repo y exige que ninguna una la TABLA `clientes_master` por
//     `nombre_normalized`. Un objeto SQL nuevo nace vigilado.
//   BARRIDO 2 (TS)  — ninguna consulta de `src/` filtra `clientes_master` por
//     `nombre_normalized`.
//   CONDUCTA        — se llama al sync REAL con supabase doblado y se cuenta qué
//     pidió y qué escribió: que la lista contenga las 6 no prueba que la consulta
//     las use.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Dobles: se capturan la CONSULTA que sale y el PAYLOAD que entra.
// ─────────────────────────────────────────────────────────────────────────────

interface ConsultaCapturada {
  tabla: string;
  in?: { columna: string; valores: string[] };
  neq?: { columna: string; valor: string };
  order?: string;
}

const consultas: ConsultaCapturada[] = [];
const upserts: Array<Record<string, unknown>>[] = [];

/** Grabador con la forma de un query builder de supabase-js. */
function grabador(tabla: string) {
  const q: ConsultaCapturada = { tabla };
  consultas.push(q);
  const chain = {
    select: () => chain,
    in: (columna: string, valores: string[]) => {
      q.in = { columna, valores: [...valores] };
      return chain;
    },
    neq: (columna: string, valor: string) => {
      q.neq = { columna, valor };
      return chain;
    },
    eq: () => chain,
    order: (columna: string) => {
      q.order = columna;
      return chain;
    },
    range: () => chain,
    upsert: (filas: Array<Record<string, unknown>>) => {
      upserts.push(filas);
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => grabador(tabla) },
}));

/** Filas del espejo de Switch que el sync va a "leer". El doble de
 *  `leerTodoPaginado` corre el callback REAL (para que la consulta quede
 *  grabada) y devuelve solo lo que la consulta habría dejado pasar. */
const ESPEJO_SWITCH = [
  { empresa_key: "vistana",             codigo: "D-24",  nombre: "City Mall David",  razonsocial: null, identificacion: null, raw_data: null, synced_at: null },
  { empresa_key: "fashion_wear",        codigo: "D-24",  nombre: "City Mall David",  razonsocial: null, identificacion: null, raw_data: null, synced_at: null },
  { empresa_key: "joystep",             codigo: "D-1",   nombre: "A-Amani SA",       razonsocial: null, identificacion: null, raw_data: null, synced_at: null },
  // 🔴 Los dos que NO pueden entrar nunca.
  { empresa_key: "confecciones_boston", codigo: "83",    nombre: "CITY MALL DAVID",  razonsocial: null, identificacion: null, raw_data: null, synced_at: null },
  { empresa_key: "american_classic",    codigo: "12345", nombre: "Cliente ACS",      razonsocial: null, identificacion: null, raw_data: null, synced_at: null },
];

vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async (
    _etiqueta: string,
    hacerConsulta: (pedirCount: boolean, from: number, to: number) => unknown,
  ) => {
    hacerConsulta(true, 0, 999);
    const q = consultas[consultas.length - 1];
    return ESPEJO_SWITCH.filter((f) => {
      if (q?.in) return q.in.valores.includes(f[q.in.columna as "empresa_key"]);
      if (q?.neq) return f[q.neq.columna as "empresa_key"] !== q.neq.valor;
      return true;
    });
  },
}));

import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";
import { EMPRESAS_DEL_GRUPO } from "@/lib/clientes/mundos";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACIONES = path.join(RAIZ, "supabase/migrations");
const SRC = path.join(RAIZ, "src");

const TABLA = "clientes_master";
const COLUMNA_NOMBRE = "nombre_normalized";

/** La vista 1-a-1 que SÍ puede resolver por nombre: es el único resolvedor. */
const RESOLVEDOR = "clientes_master_por_nombre_unico_vw";

// ─────────────────────────────────────────────────────────────────────────────
// Lectura de migraciones (mismo motor que `cxc-boston-fuera-de-toda-superficie`)
// ─────────────────────────────────────────────────────────────────────────────

const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");

function migracionesOrdenadas(): { archivo: string; sql: string }[] {
  return fs
    .readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .sort() // el nombre empieza con el timestamp → orden cronológico
    .map((archivo) => ({ archivo, sql: fs.readFileSync(path.join(MIGRACIONES, archivo), "utf8") }));
}

interface ObjetoSql {
  nombre: string;
  tipo: "view" | "materialized view" | "function";
  cuerpo: string;
  archivo: string;
}

/** La definición FINAL (la última que gana) de cada VIEW / MV / FUNCTION. */
function objetosSqlFinales(): Map<string, ObjetoSql> {
  const vivos = new Map<string, ObjetoSql>();

  for (const { archivo, sql } of migracionesOrdenadas()) {
    const limpio = sinComentarios(sql);
    const eventos: { pos: number; fn: () => void }[] = [];

    const reVista =
      /CREATE\s+(?:OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)\s+AS/gi;
    for (let m = reVista.exec(limpio); m; m = reVista.exec(limpio)) {
      const nombre = m[2].replace(/"/g, "").replace(/^public\./, "");
      const tipo = m[1] ? ("materialized view" as const) : ("view" as const);
      const desde = m.index + m[0].length;
      const fin = limpio.indexOf(";", desde);
      const cuerpo = limpio.slice(desde, fin === -1 ? undefined : fin);
      const pos = m.index;
      eventos.push({ pos, fn: () => vivos.set(nombre, { nombre, tipo, cuerpo, archivo }) });
    }

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

/**
 * Los JOIN contra la TABLA `clientes_master` (nunca contra el resolvedor 1-a-1,
 * que es OTRO nombre) y la condición `ON …` de cada uno.
 *
 * `\b` no alcanza para separar `clientes_master` de
 * `clientes_master_por_nombre_unico_vw` porque `_` es carácter de palabra: hace
 * falta el negative lookahead.
 */
function condicionesDeJoinAClientesMaster(cuerpo: string): string[] {
  const re = new RegExp(
    String.raw`JOIN\s+${TABLA}(?![a-zA-Z0-9_])\s+(?:AS\s+)?[a-zA-Z0-9_]*\s*\bON\b([\s\S]*?)(?=\bJOIN\b|\bWHERE\b|\bGROUP\b|\bORDER\b|\bUNION\b|\bLIMIT\b|\)\s*(?:,|AS\b|$)|$)`,
    "gi",
  );
  return [...cuerpo.matchAll(re)].map((m) => m[1]);
}

// ═════════════════════════════════════════════════════════════════════════════
describe("BARRIDO 1 (SQL) — ningún objeto vivo une clientes_master por nombre", () => {
  const objetos = objetosSqlFinales();

  it("el barrido encuentra los objetos que ya sabemos que existen", () => {
    // Sin esto, un parser roto devolvería 0 objetos y todo lo de abajo pasaría
    // en verde sin haber mirado una sola línea de SQL.
    expect(objetos.has("clientes_empresa_12m_vw")).toBe(true);
    expect(objetos.has("clientes_agregado_12m_vw")).toBe(true);
    expect(objetos.has("clientes_anio")).toBe(true);
    expect(objetos.has(RESOLVEDOR)).toBe(true);
  });

  it("el barrido sabe reconocer el defecto (si no, no está mirando el ON)", () => {
    // El propio detector, probado contra el SQL exacto que causó el bug y contra
    // el que lo arregla. Un barrido que no distingue los dos no sirve de nada.
    const roto = "FROM a LEFT JOIN clientes_master mc ON mc.nombre_normalized = a.cliente_norm AND mc.deleted = false";
    const sano = `FROM a LEFT JOIN ${RESOLVEDOR} mc ON mc.nombre_normalized = a.cliente_norm`;
    const porCodigo = "FROM a LEFT JOIN clientes_master m ON m.codigo = a.cliente_codigo AND m.deleted = false";

    expect(condicionesDeJoinAClientesMaster(roto).join(" ")).toContain(COLUMNA_NOMBRE);
    expect(condicionesDeJoinAClientesMaster(sano)).toHaveLength(0);
    expect(condicionesDeJoinAClientesMaster(porCodigo).join(" ")).not.toContain(COLUMNA_NOMBRE);
  });

  it("ninguna VIEW / MV / FUNCTION viva joinea clientes_master por nombre_normalized", () => {
    const culpables: string[] = [];
    for (const obj of objetos.values()) {
      for (const on of condicionesDeJoinAClientesMaster(obj.cuerpo)) {
        if (on.includes(COLUMNA_NOMBRE)) {
          culpables.push(`${obj.tipo} ${obj.nombre} (${obj.archivo})`);
        }
      }
    }
    expect(
      culpables,
      `Estos objetos unen ${TABLA} por ${COLUMNA_NOMBRE}, que MULTIPLICA filas ` +
        `cuando dos clientes se llaman igual. Resuelve por ${RESOLVEDOR}, que es ` +
        `1-a-1 por construcción.\n  · ${culpables.join("\n  · ")}`,
    ).toEqual([]);
  });

  it("el resolvedor es 1-a-1 POR CONSTRUCCIÓN, no por suerte", () => {
    // Es lo único que hace segura a la vista: agrupa por la MISMA columna con la
    // que se joinea y descarta los nombres ambiguos. Sin el HAVING, la vista
    // devolvería una fila por nombre igual — pero eligiendo un dueño arbitrario
    // para la plata de dos homónimos.
    const cuerpo = objetos.get(RESOLVEDOR)?.cuerpo ?? "";
    expect(cuerpo).toMatch(new RegExp(`GROUP\\s+BY\\s+[a-z0-9_.]*${COLUMNA_NOMBRE}`, "i"));
    expect(cuerpo).toMatch(/HAVING\s+COUNT\s*\(\s*\*\s*\)\s*=\s*1/i);
    expect(cuerpo).toMatch(/deleted\s*=\s*false/i);
  });

  it("los dos rankings resuelven el nombre por el resolvedor, y el código por codigo", () => {
    // Las dos mitades del arreglo, cada una en su lugar: el fallback por NOMBRE
    // va contra la vista 1-a-1; la ficha del cliente (nombre, whatsapp, id) sale
    // de `clientes_master` por CÓDIGO, que es único y nunca multiplicó nada.
    for (const nombre of ["clientes_empresa_12m_vw", "clientes_anio"]) {
      const cuerpo = objetos.get(nombre)?.cuerpo ?? "";
      expect(cuerpo, nombre).toContain(RESOLVEDOR);
      expect(
        condicionesDeJoinAClientesMaster(cuerpo).join(" "),
        `${nombre}: el join a ${TABLA} tiene que ser por codigo`,
      ).toContain("codigo");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("BARRIDO 2 (TS) — ninguna consulta de la app matchea clientes_master por nombre", () => {
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

  /** Comentarios fuera: este repo ya pagó cuatro veces el candado que se cumple
   *  con su propia explicación. */
  const sinComentariosTs = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("nadie hace .eq/.in/.ilike sobre nombre_normalized de clientes_master", () => {
    const culpables: string[] = [];
    for (const archivo of archivosTs(SRC)) {
      const codigo = sinComentariosTs(fs.readFileSync(archivo, "utf8"));
      // La cadena de consulta arranca en `.from("clientes_master")` y termina
      // donde termina la sentencia: se mira ese tramo, no el archivo entero
      // (`nombre_normalized` es una columna de otras 3 tablas del sistema).
      const re = /\.from\(\s*["']clientes_master["']\s*\)([\s\S]{0,600}?);/g;
      for (const m of codigo.matchAll(re)) {
        if (new RegExp(String.raw`\.(eq|in|ilike|like|match)\(\s*["']${COLUMNA_NOMBRE}["']`).test(m[1])) {
          culpables.push(path.relative(RAIZ, archivo));
        }
      }
    }
    expect(
      culpables,
      `Estas consultas buscan en ${TABLA} por ${COLUMNA_NOMBRE}: pueden traer DOS ` +
        `clientes distintos que se llaman igual. Busca por \`codigo\`.\n  · ${culpables.join("\n  · ")}`,
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("CONDUCTA — el sync solo deja entrar a las 6 del grupo", () => {
  beforeEach(() => {
    consultas.length = 0;
    upserts.length = 0;
  });

  it("pide switch_clientes acotado a EMPRESAS_DEL_GRUPO, por INCLUSIÓN", async () => {
    await syncClientesMaster();
    const lectura = consultas.find((c) => c.tabla === "switch_clientes");
    expect(lectura, "el sync ni siquiera leyó switch_clientes").toBeDefined();
    // 🔴 Por INCLUSIÓN y no por exclusión: si mañana entra una empresa nueva al
    // sistema, el default seguro es que NO contamine el directorio. Un `.neq()`
    // la dejaría entrar sola — que es exactamente cómo entró Boston.
    expect(lectura?.in?.columna).toBe("empresa_key");
    expect([...(lectura?.in?.valores ?? [])].sort()).toEqual([...EMPRESAS_DEL_GRUPO].sort());
    expect(lectura?.neq, "no puede quedar un `.neq()` (excluir NO es incluir)").toBeUndefined();
  });

  it("la lista del sync es la misma que la del resto del sistema", () => {
    expect([...EMPRESAS_DEL_GRUPO].sort()).toEqual([...B2B_EMPRESA_KEYS].sort());
  });

  it("ni un cliente de Boston llega al upsert — ni siquiera uno homónimo", async () => {
    // `CITY MALL DAVID` existe en las dos: `D-24` en el grupo y `83` en Boston.
    // Es el par exacto que duplicó $227.872,28 en el ranking.
    await syncClientesMaster();
    const escritos = upserts.flat();
    const codigos = escritos.map((f) => f.codigo);
    expect(codigos).toContain("D-24");
    expect(codigos).not.toContain("83");
    expect(codigos).not.toContain("12345");
  });

  it("no quedan dos filas con el mismo nombre_normalized en lo que se escribe", async () => {
    // La consecuencia observable de todo lo anterior, dicha como la ve el
    // ranking: dos filas vivas con el mismo nombre son las que se fanean.
    await syncClientesMaster();
    const nombres = upserts.flat().map((f) => f.nombre_normalized);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});

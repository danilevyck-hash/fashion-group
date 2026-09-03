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
// ─── 🔑 LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO ───────────────────────────────
//
// Daniel, textual: *"se debería de usar el código del cliente, ya que todos los
// D-24 por ejemplo son de City Mall across mis 6 empresas"*. Medido: de los 147
// códigos del grupo, **138 aparecen en las 6 empresas con el MISMO nombre**, 2 en
// cinco y 7 en una sola. **Uno solo significa cosas distintas según la empresa, y
// no es un cliente: `TCKCTA`, el mostrador** (ver su describe más abajo).
//
// El camino, sin un solo nombre de por medio:
//     switch_facturas (empresa_key, cliente_switch_id)
//        └─→ switch_clientes (empresa_key, cliente_switch_id) → codigo
//             └─→ clientes_master.codigo   (índice ÚNICO)
// El par `(empresa_key, cliente_switch_id)` es único por construcción: **no puede
// multiplicar una factura**, ni hoy ni cuando dos clientes se llamen igual.
//
// 🔴 **NO HAY FALLBACK POR NOMBRE, y la decisión está MEDIDA.** Un camino muerto
// es una trampa. De las 8.181 facturas que el ranking mira, 370 (4,52%) traen un
// `cliente_switch_id` viejo que no cruza el puente; valen $3.817,74 de 2026
// (0,07%) y **caen a «Otros clientes» con fallback y sin él** — los 3 únicos con
// plata no están en `switch_clientes` NI en `clientes_master`, así que ningún
// fallback podía darles código. Lo único que el fallback lograba de verdad era
// **rotular ventas del grupo con códigos de BOSTON** (`NIPMAR SA` → `390`).
//
// ─── Por qué se prohíbe el JOIN y no los nombres repetidos ──────────────────
//
// **Un nombre repetido NO es un error; unir por él, sí.** Quedan 3 homónimos
// legítimos entre clientes del propio grupo (`CITY MODA CHORRERA` D-30/D-26,
// `METRO SHOES PANAMA SA` D-103/D-173, `EL MACHETAZO SAN MIGUELITO` D-171/D-101):
// son códigos desfasados en el panel de Switch, un hecho del dato. Un test que
// fallara por ellos estaría rojo para siempre y terminaría silenciado — la peor
// clase de candado. Además un test de DATOS falla o pasa por razones que ningún
// cambio de código causó, así que no protege ninguna ruta. El join es
// ESTRUCTURAL: se ve en el SQL, se caza en el build, y caza la PRÓXIMA superficie
// 🩸 — que hace falta: este bug se parchó DOS veces (Directorio #387 y buscador
// ⌘K #388, los dos el 30-jul-2026) arreglando la pantalla que alguien notó.
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
import { EMPRESAS_DEL_GRUPO, esMostrador, CODIGO_MOSTRADOR } from "@/lib/clientes/mundos";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACIONES = path.join(RAIZ, "supabase/migrations");
const SRC = path.join(RAIZ, "src");

const TABLA = "clientes_master";
const COLUMNA_NOMBRE = "nombre_normalized";

/** El puente: la ÚNICA fuente del código de un cliente. */
const PUENTE = "switch_clientes";

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
  });

  it("el barrido sabe reconocer el defecto (si no, no está mirando el ON)", () => {
    // El propio detector, probado contra el SQL exacto que causó el bug y contra
    // el que lo arregla. Un barrido que no distingue los dos no sirve de nada.
    const roto = "FROM a LEFT JOIN clientes_master mc ON mc.nombre_normalized = a.cliente_norm AND mc.deleted = false";
    const puente = `FROM a LEFT JOIN ${PUENTE} sc ON sc.empresa_key = a.empresa_key AND sc.cliente_switch_id = a.cliente_switch_id`;
    const porCodigo = "FROM a LEFT JOIN clientes_master m ON m.codigo = a.cliente_codigo AND m.deleted = false";

    expect(condicionesDeJoinAClientesMaster(roto).join(" ")).toContain(COLUMNA_NOMBRE);
    expect(condicionesDeJoinAClientesMaster(puente)).toHaveLength(0);
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
        `cuando dos clientes se llaman igual. El código sale del PUENTE ` +
        `${PUENTE} por (empresa_key, cliente_switch_id), que es único.\n  · ${culpables.join("\n  · ")}`,
    ).toEqual([]);
  });

  it("los dos rankings sacan el código del PUENTE, por (empresa, id)", () => {
    // El par (empresa_key, cliente_switch_id) es único por construcción: por eso
    // este camino no puede multiplicar una factura. Se exige que las DOS ramas
    // —la del grupo y la de Boston/Multifashion— lo usen: la rama no-B2B era la
    // única que resolvía solo por nombre, y es la que traía clientes de Boston.
    for (const nombre of ["clientes_empresa_12m_vw", "clientes_anio"]) {
      const cuerpo = objetos.get(nombre)?.cuerpo ?? "";
      const puentes = [
        ...cuerpo.matchAll(
          /JOIN\s+switch_clientes\s+(?:AS\s+)?[a-zA-Z0-9_]*\s*ON[\s\S]{0,220}?cliente_switch_id/gi,
        ),
      ];
      expect(puentes.length, `${nombre}: faltan puentes por (empresa, id)`).toBeGreaterThanOrEqual(2);
      for (const p of puentes) {
        expect(p[0], `${nombre}: un puente sin empresa_key mezclaría empresas`).toContain("empresa_key");
      }
    }
  });

  it("el único join a clientes_master es por `codigo`, que tiene índice único", () => {
    // La ficha del cliente (nombre, whatsapp, id) sale de `clientes_master` por
    // CÓDIGO. Es la parte que nunca multiplicó nada y la que se conserva.
    for (const nombre of ["clientes_empresa_12m_vw", "clientes_anio"]) {
      const cuerpo = objetos.get(nombre)?.cuerpo ?? "";
      const ons = condicionesDeJoinAClientesMaster(cuerpo);
      expect(ons.length, `${nombre}: no joinea clientes_master`).toBeGreaterThan(0);
      for (const on of ons) expect(on, nombre).toContain("codigo");
    }
  });

  it("no queda ningún camino por NOMBRE — ni el resolvedor 1-a-1 que se descartó", () => {
    // 🩸 Hubo un diseño intermedio con una vista `..._por_nombre_unico_vw` que se
    // ABSTENÍA ante un nombre ambiguo. Era un buen parche mientras el nombre era
    // la única llave; con el código de por medio es DEUDA — un camino muerto que
    // alguien va a volver a usar. No puede reaparecer.
    for (const nombre of ["clientes_empresa_12m_vw", "clientes_anio"]) {
      const cuerpo = objetos.get(nombre)?.cuerpo ?? "";
      expect(cuerpo, `${nombre} volvió a mirar el nombre`).not.toContain(COLUMNA_NOMBRE);
    }
    expect(objetos.has("clientes_master_por_nombre_unico_vw")).toBe(false);
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

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 LA PLATA DE BOSTON SUMA; SUS CLIENTES NO SE VEN", () => {
  // Daniel, textual (2-sep-2026): *"solo se queda CXC de Boston en su tab, sin
  // que toque ni se mezcle con los otros. Déjalo en Vista General"* y *"Boston
  // también quiero verlos en ventas-resumen"*.
  //
  // 🔑 ES LA LÍNEA FINA DE TODO ESTE ASUNTO, y es fácil pasarse de largo:
  // sacar a Boston del DIRECTORIO es correcto; sacarlo de los TOTALES sería
  // borrarle $463.898,47 (el 7,4% de la venta de 2026) a la Vista General.
  // Medido en producción DESPUÉS de la limpieza: sigue ahí.
  const objetos = objetosSqlFinales();

  it("los objetos que suman VENTA no excluyen a Boston", () => {
    for (const nombre of ["ventas_dashboard_summary", "ventas_rollup_mensual_mv"]) {
      const obj = objetos.get(nombre);
      // Se EXIGE encontrarlo: un `continue` acá volvería el candado vacío el día
      // que alguien renombre el objeto, y pasaría en verde sin mirar nada.
      expect(obj, `${nombre} no aparece en las migraciones`).toBeDefined();
      expect(
        obj!.cuerpo,
        `${nombre} empezó a excluir a Boston: eso le borra el 7,4% de la venta a Vista General`,
      ).not.toMatch(/confecciones_boston/i);
    }
  });

  it("los objetos que suman VENTA tampoco miran clientes_master", () => {
    // Si un total empezara a depender del directorio, limpiarlo movería plata.
    // Hoy no lo miran, y por eso la limpieza de 4.914 filas no movió un centavo.
    for (const nombre of ["ventas_dashboard_summary", "ventas_rollup_mensual_mv"]) {
      const obj = objetos.get(nombre);
      expect(obj, `${nombre} no aparece en las migraciones`).toBeDefined();
      expect(obj!.cuerpo, `${nombre} empezó a depender del directorio`).not.toContain(TABLA);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("TCKCTA — el único código que miente, y no puede juntar seis mostradores", () => {
  // El mostrador se llama distinto en cada empresa: `CONTADO` en active_shoes/
  // active_wear/joystep, `VENTAS` en fashion_wear/vistana y `VENTAS LOCA` en
  // fashion_shoes. De los 147 códigos del grupo es el ÚNICO que no nombra al
  // mismo cliente en las 6 — por eso el sistema lo identifica SIEMPRE por código
  // (`esMostrador`), nunca por nombre.
  const objetos = objetosSqlFinales();

  it("el grano de los dos rankings es (cliente, EMPRESA), así que TCKCTA da como mucho una fila POR empresa", () => {
    // 🔑 Esto es lo que impide que el join por código junte los seis mostradores
    // en una fila sola que no es ningún cliente. No es suerte: es el GROUP BY.
    // Medido después del cambio: 1 sola fila TCKCTA en todo el payload.
    for (const nombre of ["clientes_empresa_12m_vw", "clientes_anio"]) {
      const cuerpo = objetos.get(nombre)?.cuerpo ?? "";
      // TODOS los GROUP BY que agrupan por cliente_key, no "alguno": basta que
      // UNO se olvide de la empresa para que ESA cuenta junte los seis
      // mostradores. Lo mismo vale para los DISTINCT que arman los pares.
      const grupos = [...cuerpo.matchAll(/(?:GROUP\s+BY|SELECT\s+DISTINCT)\s+([^\n;]*cliente_key[^\n;]*)/gi)];
      expect(grupos.length, `${nombre}: no se encontró ningún GROUP BY por cliente_key`)
        .toBeGreaterThanOrEqual(3);
      for (const g of grupos) {
        expect(g[1], `${nombre}: este agrupamiento se olvidó de la empresa → "${g[1].trim()}"`)
          .toMatch(/empresa/i);
      }
    }
  });

  it("el mostrador se reconoce por CÓDIGO en el código de la app, no por nombre", () => {
    // `esMostrador` compara contra `CODIGO_MOSTRADOR`. Comparar por nombre sería
    // un colador: son tres nombres distintos, y uno de ellos viene truncado.
    expect(esMostrador("TCKCTA")).toBe(true);
    expect(esMostrador("tckcta")).toBe(true);
    expect(esMostrador("CONTADO")).toBe(false);
    expect(esMostrador("VENTAS LOCA")).toBe(false);
    expect(CODIGO_MOSTRADOR).toBe("TCKCTA");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("LA FICHA POR DIRECCIÓN — /api/clientes/[codigo] es solo del grupo", () => {
  // 🩸 Daniel: *"la ficha de cliente por dirección se va. El directorio por
  // dentro se va."* El GET SERVÍA y el PATCH DEJABA EDITAR las 4.915 fichas de
  // Boston: los dos miraban solo `deleted = false` y ninguno pasaba por la puerta
  // de mundo — la única que filtraba era la página SSR. Marcar las filas como
  // borradas cerró la puerta HOY; el guard la cierra SIEMPRE.
  const RUTAS = [
    "src/app/api/clientes/[codigo]/route.ts",
    "src/app/api/clientes/[codigo]/historial-mensual/route.ts",
  ];

  it("las tres puertas (GET, PATCH e historial) preguntan por el mundo", () => {
    const guards = RUTAS.flatMap((rel) => {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8").replace(/\/\/[^\n]*/g, "");
      return [...src.matchAll(/esCodigoDelGrupo\(/g)].map(() => rel);
    });
    expect(guards.length, "falta un guard de mundo en la ficha").toBeGreaterThanOrEqual(3);
    for (const rel of RUTAS) expect(guards, rel).toContain(rel);
  });

  it("un código ajeno contesta 404, no 403 — el 403 sería un oráculo", () => {
    // Distinguir "no existe" de "existe pero es de Boston" confirmaría desde
    // afuera qué códigos hay en la cartera de Boston. Las dos ramas dicen lo
    // mismo, y eso se lee en el archivo.
    const src = fs.readFileSync(path.join(RAIZ, RUTAS[0]), "utf8").replace(/\/\/[^\n]*/g, "");
    const bloques = [...src.matchAll(/esCodigoDelGrupo\([\s\S]{0,220}?status:\s*(\d+)/g)];
    expect(bloques.length).toBeGreaterThanOrEqual(2);
    for (const b of bloques) expect(b[1]).toBe("404");
  });

  it("el guard falla ABIERTO: esconder de más es peor que mostrar de más", () => {
    // Los tres defaults de `soloClientesDelGrupo`, que `esCodigoDelGrupo` copia:
    // consulta caída, código vacío y código que Switch no conoce → se queda.
    // Sin esto, un hipo de la base escondería el Directorio entero.
    const src = fs.readFileSync(path.join(RAIZ, "src/lib/clientes/mundos.ts"), "utf8");
    const fn = /export async function esCodigoDelGrupo[\s\S]*?\n}/.exec(src)?.[0] ?? "";
    expect(fn, "no se encontró esCodigoDelGrupo").not.toBe("");
    expect(fn).toMatch(/if\s*\(!cod\)\s*return true/);
    expect(fn).toMatch(/if\s*\(error[\s\S]{0,20}\)\s*return true/);
    expect(fn).toMatch(/length\s*===\s*0\)\s*return true/);
  });
});

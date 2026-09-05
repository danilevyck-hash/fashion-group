// ═══════════════════════════════════════════════════════════════════════════
//   CANDADO — el directorio de clientes de Boston vive en su rincón, y ahí se
//   queda.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LO QUE VINO A ARREGLAR ──────────────────────────────────────────────────
// `switch_clientes` de `confecciones_boston` llevaba **37 días congelado**: sus
// 4.915 filas tenían todas el mismo `synced_at` (30-jul-2026 06:31:07). El único
// escritor del directorio vivía dentro del sync de estado de cuenta por API, y
// ese camino para Boston está vetado —4.912 llamadas HTTP, 54 min medidos contra
// un techo de 800 s—. El cron semanal `/api/cron/sync-clientes-boston` lo trae.
//
// ── 🔴 LO QUE NO PUEDE PASAR NUNCA ──────────────────────────────────────────
// Daniel, textual: *«los clientes de Boston no quiero que toquen los de Fashion
// Group… no quiero volver a pasar por el mismo error»*. El error tiene fecha: el
// 28-jul-2026 entraron 4.910 clientes de Boston a `clientes_master` y durante
// cinco semanas el ranking de Ventas publicó **$2,55 millones de venta que no
// existió**. `clientes_master` no tiene `empresa_key` —una fila por CÓDIGO— así
// que adentro un cliente de Boston es indistinguible de uno del grupo.
//
// Este archivo fija TRES cosas, y las tres son de conducta, no de intención:
//   A. El sync escribe UNA tabla (`switch_clientes`) y SOLO filas de Boston.
//   B. Nadie del camino nuevo nombra `clientes_master`, y el directorio del
//      grupo sigue teniendo un solo escritor, que pide por INCLUSIÓN.
//   C. Una corrida a medias NO marca a nadie como ausente. Es lo único de todo
//      el sync que puede hacer daño, y por eso tiene dos guardas.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ─── Doble de Supabase que graba TODO lo que se escribe ──────────────────────
interface Escritura {
  tabla: string;
  op: "upsert" | "update" | "delete" | "insert";
  filas: Array<Record<string, unknown>>;
  eq: Array<[string, unknown]>;
}
const escrituras: Escritura[] = [];
/** Pares (tabla, empresa) que la alerta B fue a mirar. */
const lecturas: Array<{ tabla: string; empresaKey: unknown }> = [];
/** Qué contesta `ultimaEscritura` en la prueba de la alerta B. */
let ultimaEscrituraIso: string | null = null;
/** Cuántas filas dice tener hoy `switch_clientes` para Boston (guarda del piso). */
let conocidos: number | null = 4915;

function grabador(tabla: string) {
  const q: Escritura = { tabla, op: "upsert", filas: [], eq: [] };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: (c: string, v: unknown) => {
      q.eq.push([c, v]);
      return chain;
    },
    in: self,
    not: self,
    order: self,
    range: self,
    limit: self,
    maybeSingle: () => {
      lecturas.push({ tabla, empresaKey: q.eq.find(([c]) => c === "empresa_key")?.[1] });
      return Promise.resolve({
        data: ultimaEscrituraIso === null ? null : { synced_at: ultimaEscrituraIso },
        error: null,
      });
    },
    // `select(..., { head: true }).eq(...)` termina en un await sobre la cadena:
    // por eso la cadena es "thenable" y resuelve el conteo.
    then: (resolver: (v: { count: number | null; error: unknown }) => unknown) =>
      Promise.resolve(
        conocidos === null
          ? { count: null, error: { message: "no se pudo contar" } }
          : { count: conocidos, error: null },
      ).then(resolver),
    upsert: (filas: Array<Record<string, unknown>>) => {
      q.op = "upsert";
      q.filas = filas;
      escrituras.push(q);
      return Promise.resolve({ error: null });
    },
    update: (fila: Record<string, unknown>) => {
      q.op = "update";
      q.filas = [fila];
      escrituras.push(q);
      return chain; // el código real sigue con .eq(...).not(...) y luego awaitea
    },
    insert: (fila: Record<string, unknown>) => {
      q.op = "insert";
      q.filas = [fila];
      escrituras.push(q);
      return Promise.resolve({ error: null });
    },
    delete: () => {
      q.op = "delete";
      escrituras.push(q);
      return Promise.resolve({ error: null });
    },
  });
  return chain as never;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => grabador(tabla) },
}));

// La fila de `switch_sync_log` no es lo que se está probando.
vi.mock("@/lib/switch-api/sync-log", () => ({
  createSwitchSyncLog: vi.fn(async () => "log-1"),
  finishSwitchSyncLog: vi.fn(async () => undefined),
}));

/** Lo que "Switch" contesta en cada test. */
let paginas: Array<{ clientes: unknown[]; paginacion: { total: number } }> = [];
vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    listClientes: async ({ paginaActual }: { paginaActual: number }) =>
      paginas[paginaActual - 1] ?? { clientes: [], paginacion: { total: 0 } },
  }),
}));

import {
  syncClientesBoston,
  EMPRESA_CLIENTES_APARTE,
  PISO_DIRECTORIO,
} from "@/lib/switch-api/sync-clientes-boston";
import { TABLAS_VIGILADAS, evaluarTablaQuieta } from "@/lib/alertas/silencio-de-datos";
import { medirTablasQuietas } from "@/lib/alertas/silencio-de-datos-io";
import {
  SWITCH_CRON_ENTRADAS,
  SEPARACION_MINIMA_MIN,
  distanciaCircularMin,
  cronStaleThresholdHours,
} from "@/lib/cron-telemetry";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");

/** N clientes falsos, con id y código propios. */
const clientesFalsos = (n: number, desde = 1) =>
  Array.from({ length: n }, (_, i) => ({
    id: desde + i,
    codigo: String(desde + i),
    nombre: `Cliente Boston ${desde + i}`,
    razonsocial: null,
    email: null,
    identificacion: null,
    telefono: null,
    celular: null,
  }));

/** Switch contesta `total` clientes repartidos en páginas de `porPagina`. */
function switchContesta(total: number, porPagina = 50, totalReportado = total) {
  paginas = [];
  for (let i = 0; i < total; i += porPagina) {
    paginas.push({
      clientes: clientesFalsos(Math.min(porPagina, total - i), i + 1),
      paginacion: { total: totalReportado },
    });
  }
}

beforeEach(() => {
  escrituras.length = 0;
  lecturas.length = 0;
  ultimaEscrituraIso = null;
  conocidos = 4915;
  paginas = [];
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A. el sync escribe UNA tabla, y solo filas de Boston", () => {
  it("todo lo que escribe va a switch_clientes", async () => {
    switchContesta(4915);
    await syncClientesBoston({ triggeredBy: "manual" });
    const tablas = [...new Set(escrituras.map((e) => e.tabla))];
    expect(
      tablas,
      `el sync escribió en tablas que no le tocan: ${tablas.join(", ")}`,
    ).toEqual(["switch_clientes"]);
  });

  it("cada fila upserted lleva empresa_key = confecciones_boston", async () => {
    switchContesta(4915);
    await syncClientesBoston({ triggeredBy: "manual" });
    const filas = escrituras.filter((e) => e.op === "upsert").flatMap((e) => e.filas);
    expect(filas.length).toBe(4915);
    const empresas = [...new Set(filas.map((f) => f.empresa_key))];
    expect(empresas).toEqual([EMPRESA_CLIENTES_APARTE]);
    expect(EMPRESA_CLIENTES_APARTE).toBe("confecciones_boston");
  });

  it("toda escritura queda acotada por empresa_key a Boston", async () => {
    switchContesta(4915);
    await syncClientesBoston({ triggeredBy: "manual" });
    // Los UPDATE de la marca de ausentes son los únicos que tocan filas que ya
    // están: si alguno se olvidara del `.eq("empresa_key", …)` barrería las 6
    // del grupo.
    for (const e of escrituras.filter((x) => x.op === "update")) {
      const filtro = e.eq.find(([c]) => c === "empresa_key");
      expect(filtro, `un UPDATE sin acotar por empresa: ${JSON.stringify(e)}`).toBeDefined();
      expect(filtro?.[1]).toBe("confecciones_boston");
    }
  });

  it("nunca borra: el directorio es acumulativo", async () => {
    switchContesta(4915);
    await syncClientesBoston({ triggeredBy: "manual" });
    expect(escrituras.some((e) => e.op === "delete")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. el directorio del GRUPO no se toca", () => {
  const ARCHIVOS_DEL_CAMINO = [
    "src/lib/switch-api/sync-clientes-boston.ts",
    "src/lib/switch-api/clientes-directorio.ts",
    "src/app/api/cron/sync-clientes-boston/route.ts",
  ];

  /** Comentarios fuera: un candado no se cumple con su propia explicación. */
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("ningún archivo del camino nuevo nombra clientes_master", () => {
    const culpables = ARCHIVOS_DEL_CAMINO.filter((rel) =>
      sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8")).includes("clientes_master"),
    );
    expect(
      culpables,
      `El camino de Boston nombra el directorio del GRUPO: ${culpables.join(", ")}.\n` +
        `Boston NUNCA entra a clientes_master — ya costó $2,55 millones de venta inventada.`,
    ).toEqual([]);
  });

  it("`clientes_master` sigue teniendo un solo escritor en toda la app", () => {
    const escritores: string[] = [];
    for (const archivo of archivosTs(SRC)) {
      const codigo = sinComentarios(fs.readFileSync(archivo, "utf8"));
      const re = /\.from\(\s*["']clientes_master["']\s*\)([\s\S]{0,600}?);/g;
      for (const m of codigo.matchAll(re)) {
        if (/\.(upsert|insert|update|delete)\(/.test(m[1])) {
          escritores.push(path.relative(RAIZ, archivo));
        }
      }
    }
    // Los DOS de siempre, y ninguno más: el sync (que pide por inclusión de las
    // 6 del grupo) y el PATCH de la ficha por dirección (que antes de escribir
    // pregunta `esCodigoDelGrupo()` y contesta 404 a lo ajeno).
    expect([...new Set(escritores)].sort()).toEqual([
      "src/app/api/clientes/[codigo]/route.ts",
      "src/lib/switch-api/sync-clientes-master.ts",
    ]);
  });

  it("el sync del grupo sigue pidiendo por INCLUSIÓN, no excluyendo a Boston", () => {
    const codigo = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/switch-api/sync-clientes-master.ts"), "utf8"),
    );
    expect(codigo).toMatch(/\.in\(\s*["']empresa_key["']/);
    expect(
      /\.neq\(\s*["']empresa_key["']/.test(codigo),
      "excluir NO es incluir: así entró Boston la primera vez",
    ).toBe(false);
  });

  it("el cron de Boston no aparece en ningún camino del grupo", () => {
    // Nadie lo llama desde la reconciliación ni desde un colateral del grupo:
    // su único disparador es su propia entrada de vercel.json.
    const llamadores: string[] = [];
    for (const archivo of archivosTs(SRC)) {
      if (archivo.includes("sync-clientes-boston")) continue;
      const codigo = sinComentarios(fs.readFileSync(archivo, "utf8"));
      if (codigo.includes("syncClientesBoston")) llamadores.push(path.relative(RAIZ, archivo));
    }
    expect(llamadores).toEqual([]);
  });

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
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. una corrida a medias NO marca a nadie como ausente", () => {
  /** Los UPDATE que apagan clientes (`activo: false`). Son los únicos peligrosos. */
  const marcasDeAusente = () =>
    escrituras.filter((e) => e.op === "update" && e.filas[0]?.activo === false);

  it("corrida sana: escribe todo y sí marca ausentes", async () => {
    switchContesta(4915);
    const r = await syncClientesBoston({ triggeredBy: "manual" });
    expect(r.ok).toBe(true);
    expect(r.escritos).toBe(4915);
    expect(r.marcoAusentes).toBe(true);
    expect(marcasDeAusente().length).toBe(1);
  });

  it("Switch contesta VACÍO: no se escribe nada y la corrida es un error", async () => {
    switchContesta(0);
    const r = await syncClientesBoston({ triggeredBy: "manual" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("cero clientes");
    expect(escrituras, "una respuesta vacía no puede escribir NI marcar").toEqual([]);
  });

  it("la lista viene INCOMPLETA: escribe lo que llegó y no marca a nadie", async () => {
    // Switch dice que hay 4.915 pero solo entrega 2 páginas y corta.
    paginas = [
      { clientes: clientesFalsos(50, 1), paginacion: { total: 4915 } },
      { clientes: clientesFalsos(50, 51), paginacion: { total: 4915 } },
      { clientes: [], paginacion: { total: 4915 } },
    ];
    const r = await syncClientesBoston({ triggeredBy: "manual" });
    expect(r.ok).toBe(true);
    expect(r.escritos).toBe(100);
    expect(r.marcoAusentes).toBe(false);
    expect(marcasDeAusente()).toEqual([]);
    expect(r.nota).toBeTruthy();
  });

  it("la lista ENCOGIÓ por debajo del piso: escribe, pero no marca", async () => {
    // Switch contesta coherentemente consigo mismo —lista "completa"— pero con
    // la mitad de los clientes. El guard de vacío no la ve y la cobertura cuadra:
    // es el caso que se ve sano y no lo está.
    const mitad = Math.floor(4915 * PISO_DIRECTORIO) - 1;
    switchContesta(mitad, 50, mitad);
    const r = await syncClientesBoston({ triggeredBy: "manual" });
    expect(r.ok).toBe(true);
    expect(r.escritos).toBe(mitad);
    expect(r.marcoAusentes).toBe(false);
    expect(marcasDeAusente()).toEqual([]);
    expect(r.nota).toContain("ausente");
  });

  it("justo POR ENCIMA del piso sí marca (el piso no apaga la vigilancia entera)", async () => {
    const apenas = Math.floor(4915 * PISO_DIRECTORIO) + 1;
    switchContesta(apenas, 50, apenas);
    const r = await syncClientesBoston({ triggeredBy: "manual" });
    expect(r.marcoAusentes).toBe(true);
  });

  it("no se puede contar lo que ya había: tampoco marca", async () => {
    // `clientesConocidos` devuelve null ante un error de lectura. Sin saber
    // contra qué comparar, la guarda del piso no puede opinar: se calla.
    conocidos = null;
    switchContesta(4915);
    const r = await syncClientesBoston({ triggeredBy: "manual" });
    expect(r.marcoAusentes).toBe(false);
  });

  it("dry-run: no escribe una sola fila", async () => {
    switchContesta(4915);
    const r = await syncClientesBoston({ triggeredBy: "manual", dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.traidos).toBe(4915);
    expect(escrituras).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. y ahora SÍ se vigila (el 37 no puede volver a pasar)", () => {
  const entrada = TABLAS_VIGILADAS.find((t) => t.tabla === "switch_clientes");

  it("la alerta B mira el directorio de clientes, y solo el de Boston", () => {
    expect(
      entrada,
      "nadie vigila switch_clientes: es exactamente el hueco que dejó 37 días de silencio",
    ).toBeDefined();
    expect(entrada?.columna).toBe("synced_at"); // CUÁNDO escribimos, no la fecha del dato
    expect(
      entrada?.empresas,
      "sin acotar a Boston, el umbral semanal taparía seis días de silencio del grupo",
    ).toEqual(["confecciones_boston"]);
  });

  it("el umbral es SEMANAL: aguanta una semana sana y no aguanta una corrida perdida", () => {
    const cfg = entrada!;
    const ahora = Date.parse("2026-09-06T10:00:00.000Z"); // domingo, pasada de las 10:00
    const haceHoras = (h: number) => new Date(ahora - h * 3_600_000).toISOString();

    // Sano: lo más viejo que llega a estar el dato es ~155 h (sábado 18:00).
    expect(evaluarTablaQuieta(cfg, "confecciones_boston", haceHoras(155), ahora)).toBeNull();
    // Una corrida perdida: el domingo siguiente a las 10:00 son 171 h. Avisa.
    const h = evaluarTablaQuieta(cfg, "confecciones_boston", haceHoras(171), ahora);
    expect(h, "una semana entera sin el directorio no puede pasar callada").not.toBeNull();
    expect(h?.modulo).toBe("Confecciones Boston");
  });

  it("«nunca tuvo datos» no alerta ni una vez", () => {
    const ahora = Date.parse("2026-09-06T10:00:00.000Z");
    expect(evaluarTablaQuieta(entrada!, "confecciones_boston", null, ahora)).toBeNull();
  });

  it("el recorrido real pregunta por Boston y por NADIE más de esa tabla", async () => {
    ultimaEscrituraIso = new Date(Date.now() - 3 * 3_600_000).toISOString();
    await medirTablasQuietas(Date.now());
    const delDirectorio = lecturas.filter((l) => l.tabla === "switch_clientes");
    expect(delDirectorio.length, "no fue a mirar el directorio").toBeGreaterThan(0);
    expect([...new Set(delDirectorio.map((l) => l.empresaKey))]).toEqual([
      "confecciones_boston",
    ]);
  });

  it("el cron está en el cronograma de sesión única, y a ≥15 min de los otros de Boston", () => {
    const mia = SWITCH_CRON_ENTRADAS.find((e) => e.cron === "sync-clientes-boston");
    expect(mia, "el cron no está en el cronograma: nada protege la sesión única").toBeDefined();
    expect(mia?.diaSemana, "es SEMANAL (domingos)").toBe(0);
    expect(mia?.empresas).toEqual(["confecciones_boston"]);

    const vecinas = SWITCH_CRON_ENTRADAS.filter(
      (e) => e !== mia && e.empresas.includes("confecciones_boston"),
    );
    expect(vecinas.length, "Boston tiene otros crons; si no, este test no mide nada").toBeGreaterThan(0);
    for (const v of vecinas) {
      const d = distanciaCircularMin(mia!.hhmmUtc, v.hhmmUtc);
      expect(d, `${v.cron} (${v.hhmmUtc}) queda a ${d} min`).toBeGreaterThanOrEqual(
        SEPARACION_MINIMA_MIN,
      );
    }
  });

  it("un cron SEMANAL no puede llevar el umbral de staleness diario", () => {
    // Con 26 h, el vigía lo daría por caído todos los lunes. Con 8 días, solo
    // cuando de verdad se perdió una corrida.
    const semanales = SWITCH_CRON_ENTRADAS.filter((e) => e.diaSemana !== undefined).map(
      (e) => e.cron,
    );
    expect(semanales).toContain("sync-clientes-boston");
    for (const cron of semanales) {
      expect(
        cronStaleThresholdHours(cron),
        `${cron} corre una vez por semana y su umbral es de ${cronStaleThresholdHours(cron)} h`,
      ).toBeGreaterThanOrEqual(7 * 24);
    }
  });
});

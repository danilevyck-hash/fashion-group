// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — un cliente que Switch dejó de mandar deja de OFRECERSE, no de existir
//
// ─── EL DEFECTO, medido el 4-sep-2026 ────────────────────────────────────────
//
// Cuando Switch borra un cliente, `switch_clientes` SÍ lo nota: sync-empresa
// marca `activo=false` + `ausente_desde`, con guard de lista completa. Pero
// `clientes_master` —el directorio que lee el ClientePicker de Guías, Cheques
// y compañía— se refrescaba con un upsert puro que NUNCA marcaba lo que dejó
// de llegar: un cliente entraba al directorio PARA SIEMPRE. Medido contra
// producción: 147 códigos del grupo, 2 con activo=false en las 6 empresas
// (D-30 «City Moda Chorrera», el duplicado que confundió a Daniel, y D-135
// «Rey Store (Aguas)») — y los dos se seguían ofreciendo en cada selector.
//
// ─── LO APROBADO POR DANIEL (textual: «APROBADO») ────────────────────────────
//
//   · Deja de ofrecerse al buscar (Guías, Cheques, pedidos de catálogo…) pero
//     NO se borra: guías y facturas viejas siguen mostrando su nombre normal.
//   · La ficha sí lo muestra, con «Ya no está en Switch» y desde cuándo.
//   · Ausente = NINGUNA de las 6 empresas del grupo lo manda. Vivo en una
//     sola → sigue vivo.
//   · Si Switch lo manda de nuevo, se desmarca solo.
//
// ─── 🔴 LA PROTECCIÓN (la parte importante) ──────────────────────────────────
//
// Una corrida FALLIDA o VACÍA no marca a NADIE — si no, un fallo de Switch
// vaciaría el directorio. Las capas: (1) `activo=false` solo lo escribe
// sync-empresa con una lista de Switch COMPLETA y no vacía; (2) si la lectura
// de `switch_clientes` falla, el sync devuelve ok:false sin escribir la marca;
// (3) sin datos de `activo` (DDL pendiente) la pasada entera se omite;
// (4) el freno MAX_FRACCION_AUSENTES: un "ausente masivo" es un dato roto
// aguas arriba, no una purga real, y no marca a nadie.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Dobles: se graba TODO lo que se escribe sobre clientes_master.
// ─────────────────────────────────────────────────────────────────────────────

interface Escritura {
  tabla: string;
  op: "upsert" | "update" | "delete";
  valores?: Record<string, unknown>;
  in?: { columna: string; valores: string[] };
  is?: { columna: string; valor: unknown };
  not?: { columna: string; operador: string; valor: unknown };
}

const escrituras: Escritura[] = [];
/** Códigos que "ya están marcados" en el clientes_master simulado. */
let marcadosEnMaster = new Set<string>();

function cadenaUpdate(tabla: string, valores: Record<string, unknown>) {
  const e: Escritura = { tabla, op: "update", valores };
  escrituras.push(e);
  const chain = {
    in(columna: string, vals: string[]) {
      e.in = { columna, valores: [...vals] };
      return chain;
    },
    is(columna: string, valor: unknown) {
      e.is = { columna, valor };
      return chain;
    },
    not(columna: string, operador: string, valor: unknown) {
      e.not = { columna, operador, valor };
      return chain;
    },
    select(_col: string) {
      const codes = e.in?.valores ?? [];
      // El `.is("ausente_desde", null)` solo alcanza filas SIN marca; el
      // `.not(... is null)` solo alcanza filas CON marca. Igual que Postgres.
      const matched = e.is
        ? codes.filter((c) => !marcadosEnMaster.has(c))
        : codes.filter((c) => marcadosEnMaster.has(c));
      return Promise.resolve({ data: matched.map((codigo) => ({ codigo })), error: null });
    },
  };
  return chain;
}

function fromDoble(tabla: string) {
  const selectChain: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order", "range"]) {
    selectChain[m] = () => selectChain;
  }
  return {
    ...selectChain,
    upsert(filas: unknown[]) {
      escrituras.push({ tabla, op: "upsert", valores: { filas: (filas as unknown[]).length } });
      return Promise.resolve({ error: null });
    },
    update(valores: Record<string, unknown>) {
      return cadenaUpdate(tabla, valores);
    },
    delete() {
      escrituras.push({ tabla, op: "delete" });
      const chain = { in: () => chain, eq: () => chain, then: (r: (x: unknown) => void) => r({ error: null }) };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => fromDoble(tabla) },
}));

interface FilaEspejo {
  empresa_key: string;
  codigo: string;
  nombre: string;
  razonsocial: null;
  identificacion: null;
  raw_data: null;
  synced_at: null;
  activo?: boolean;
  ausente_desde?: string | null;
}

/** Lo que la "lectura" de switch_clientes va a devolver — o tirar. */
let espejo: FilaEspejo[] | "falla" = [];

vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => {
    if (espejo === "falla") throw new Error("timeout leyendo switch_clientes");
    return espejo;
  },
}));

import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";
import {
  esCodigoAusente,
  fechaAusenteDesde,
  esOfrecible,
  sinAusentesDeSwitch,
  MAX_FRACCION_AUSENTES,
} from "@/lib/clientes/ausentes";

const GRUPO = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

const fila = (
  empresa: string,
  codigo: string,
  extra: Partial<FilaEspejo> = {},
): FilaEspejo => ({
  empresa_key: empresa,
  codigo,
  nombre: `Cliente ${codigo}`,
  razonsocial: null,
  identificacion: null,
  raw_data: null,
  synced_at: null,
  ...extra,
});

/** N códigos vivos (una fila por código, activo true) para que el freno del
 *  10% no tape los casos chicos. */
const vivosDeRelleno = (n: number): FilaEspejo[] =>
  Array.from({ length: n }, (_, i) => fila("vistana", `D-${100 + i}`, { activo: true }));

const marcas = () =>
  escrituras.filter((e) => e.tabla === "clientes_master" && e.op === "update" && e.is);
const revives = () =>
  escrituras.filter((e) => e.tabla === "clientes_master" && e.op === "update" && e.not);
const deletes = () => escrituras.filter((e) => e.op === "delete");

beforeEach(() => {
  escrituras.length = 0;
  marcadosEnMaster = new Set();
  espejo = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// La regla pura
// ─────────────────────────────────────────────────────────────────────────────

describe("la regla pura (lib/clientes/ausentes)", () => {
  it("ausente = TODAS las filas dicen activo === false", () => {
    expect(esCodigoAusente([{ activo: false }, { activo: false }])).toBe(true);
    expect(esCodigoAusente([{ activo: false }, { activo: true }])).toBe(false);
  });

  it("sin dato de activo NO es ausente (null, undefined, sin filas)", () => {
    expect(esCodigoAusente([])).toBe(false);
    expect(esCodigoAusente([{}])).toBe(false);
    expect(esCodigoAusente([{ activo: null }])).toBe(false);
    expect(esCodigoAusente([{ activo: false }, { activo: null }])).toBe(false);
  });

  it("la fecha es la MÁS RECIENTE: cuando la última empresa lo dejó de mandar", () => {
    expect(
      fechaAusenteDesde([
        { activo: false, ausente_desde: "2026-07-24T05:48:23Z" },
        { activo: false, ausente_desde: "2026-08-13T05:40:36Z" },
        { activo: false, ausente_desde: null },
      ]),
    ).toBe("2026-08-13T05:40:36Z");
    expect(fechaAusenteDesde([{ activo: false }])).toBeNull();
  });

  it("ofrecible = sin marca; sinAusentesDeSwitch filtra sin mutar", () => {
    const lista = [
      { codigo: "D-24", ausente_desde: null },
      { codigo: "D-30", ausente_desde: "2026-08-13T05:41:34Z" },
    ];
    expect(esOfrecible(lista[0])).toBe(true);
    expect(esOfrecible(lista[1])).toBe(false);
    const filtrada = sinAusentesDeSwitch(lista);
    expect(filtrada.map((c) => c.codigo)).toEqual(["D-24"]);
    expect(lista).toHaveLength(2); // el original queda intacto
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El sync: marca, no marca, revive — y nunca borra
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el sync marca al ausente de las 6 — y NUNCA borra", () => {
  it("ausente en las 6 → marca con la fecha de la ÚLTIMA empresa", async () => {
    espejo = [
      ...vivosDeRelleno(19),
      ...GRUPO.map((emp, i) =>
        fila(emp, "D-30", { activo: false, ausente_desde: `2026-08-1${i}T05:00:00Z` }),
      ),
    ];
    const r = await syncClientesMaster();
    expect(r.ok).toBe(true);
    expect(r.ausentes).toEqual(["D-30"]);
    expect(r.ausentes_marcados).toBe(1);

    const [marca, ...resto] = marcas();
    expect(resto).toHaveLength(0);
    expect(marca.in).toEqual({ columna: "codigo", valores: ["D-30"] });
    // la más reciente de las 6, no la primera
    expect(marca.valores).toEqual({ ausente_desde: "2026-08-15T05:00:00Z" });
    // solo filas todavía sin marca: la fecha que ve la ficha es estable
    expect(marca.is).toEqual({ columna: "ausente_desde", valor: null });
    // 🔴 se MARCA, jamás se borra: guías y facturas viejas necesitan la fila
    expect(deletes()).toHaveLength(0);
  });

  it("ausente en 5 pero vivo en 1 → NO se marca (sigue vivo)", async () => {
    espejo = [
      ...vivosDeRelleno(19),
      ...GRUPO.slice(0, 5).map((emp) => fila(emp, "D-135", { activo: false, ausente_desde: "2026-08-13T05:40:36Z" })),
      fila("joystep", "D-135", { activo: true }),
    ];
    const r = await syncClientesMaster();
    expect(r.ok).toBe(true);
    expect(r.ausentes).toEqual([]);
    expect(marcas()).toHaveLength(0);
    // y como vivo, entra a la lista de revivir (por si tenía marca vieja)
    expect(revives()[0]?.in?.valores).toContain("D-135");
  });

  it("si Switch lo manda de nuevo, se desmarca SOLO", async () => {
    marcadosEnMaster = new Set(["D-30"]);
    espejo = [...vivosDeRelleno(10), fila("vistana", "D-30", { activo: true })];
    const r = await syncClientesMaster();
    expect(r.ok).toBe(true);
    const [revive] = revives();
    expect(revive.valores).toEqual({ ausente_desde: null });
    expect(revive.in?.valores).toContain("D-30");
    expect(revive.not).toEqual({ columna: "ausente_desde", operador: "is", valor: null });
    expect(r.revividos).toBe(1);
  });
});

describe("🔴 la protección: una corrida mala no marca a NADIE", () => {
  it("la lectura de switch_clientes FALLA → ok:false y CERO escrituras", async () => {
    espejo = "falla";
    const r = await syncClientesMaster();
    expect(r.ok).toBe(false);
    // y dice QUÉ falló — disfrazar un fallo de "espejo vacío" le esconde al
    // caller (cron / reconciliación) que hay algo que arreglar
    expect(r.error).toContain("timeout");
    expect(escrituras).toHaveLength(0);
  });

  it("el espejo viene VACÍO → ok:false y CERO escrituras", async () => {
    espejo = [];
    const r = await syncClientesMaster();
    expect(r.ok).toBe(false);
    expect(r.error).toContain("vacío");
    expect(escrituras).toHaveLength(0);
  });

  it("sin datos de `activo` (DDL 20260723110000 pendiente) → la pasada se omite", async () => {
    espejo = GRUPO.map((emp) => fila(emp, "D-24")); // ni un boolean de activo
    const r = await syncClientesMaster();
    expect(r.ok).toBe(true); // el refresco fiscal sigue andando
    expect(r.marca_ausentes_omitida).toContain("activo");
    expect(marcas()).toHaveLength(0);
    expect(revives()).toHaveLength(0);
  });

  it(`el freno: más del ${MAX_FRACCION_AUSENTES * 100}% "ausente" es un dato roto, no una purga — no marca`, async () => {
    // 10 códigos, 5 "ausentes": jamás pasó ni cerca en producción (2 de 147).
    espejo = [
      ...vivosDeRelleno(5),
      ...["D-1", "D-2", "D-3", "D-4", "D-5"].map((c) =>
        fila("vistana", c, { activo: false, ausente_desde: "2026-08-13T05:00:00Z" }),
      ),
    ];
    const r = await syncClientesMaster();
    expect(r.ok).toBe(true);
    expect(r.ausentes).toHaveLength(5); // se REPORTA…
    expect(r.ausentes_marcados).toBe(0); // …pero no se marca
    expect(r.marca_ausentes_omitida).toContain("freno");
    expect(marcas()).toHaveLength(0);
    expect(revives()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Las superficies: quién filtra y quién NO (estático, contra el fuente)
// ─────────────────────────────────────────────────────────────────────────────

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("las superficies que ofrecen filtran; las que nombran, no", () => {
  it("la puerta única (`leerClientesDelGrupo`) excluye ausentes POR DEFAULT — Guías, Cheques y el candado de atar quedan cubiertos sin tocar cada caller", () => {
    const cache = leer("src/lib/clientes/directorio-cache.ts");
    expect(cache).toContain("datos.then(sinAusentesDeSwitch)");
    expect(cache).toContain("incluirAusentes");
  });

  it("el selector de pedidos de catálogo (switch_clientes) solo ofrece activos", () => {
    const route = leer("src/app/api/catalogo/[marca]/clientes-switch/route.ts");
    expect(route).toContain('.eq("activo", true)');
  });

  it("el buscador del ClientePicker filtra lo ofrecible en los DOS caminos (caché local y fallback al servidor)", () => {
    const hook = leer("src/lib/hooks/useBusquedaClientes.ts");
    expect(hook).toContain(".filter(esOfrecible)");
    expect(hook).toContain("sinAusentesDeSwitch(Array.isArray(data.clientes)");
  });

  it("🔴 el mapa código→nombre de las guías viejas NO filtra: el nombre sigue saliendo", () => {
    const hook = leer("src/lib/hooks/useBusquedaClientes.ts");
    const desde = hook.indexOf("export function useNombresDeClientes");
    const hasta = hook.indexOf("export function useClientesDelGrupo");
    const cuerpo = hook.slice(desde, hasta);
    expect(cuerpo).not.toContain("esOfrecible");
    expect(cuerpo).not.toContain("sinAusentesDeSwitch");
  });

  it("el directorio (/api/clientes) viaja CON ausentes — de ahí salen la lista con rótulo y los nombres viejos", () => {
    const route = leer("src/app/api/clientes/route.ts");
    expect(route).toContain("leerClientesDelGrupo(provincia, { incluirAusentes: true })");
  });
});

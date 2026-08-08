// ============================================================================
// CANDADO — el inventario de mobiliario se descuenta en PIEZAS, y VUELVE.
//
// Lo que defiende, punto por punto (son los que Daniel pidió por escrito):
//   1. Registrar una entrega DESCUENTA del inventario, en piezas.
//   2. Los BULTOS no tocan el stock. Cambiar sólo los bultos no mueve nada.
//   3. EDITAR devuelve lo que sobra (bajar de 150 a 100 devuelve 50).
//   4. BORRAR devuelve todo.
//   5. Ejecutar DOS VECES no descuenta ni devuelve dos veces.
//   6. El stock puede quedar NEGATIVO — se permite a propósito.
//
// Corre contra un doble EN MEMORIA de PostgREST: `inventario.ts` se ejecuta
// de verdad, con sus queries reales, y el doble las resuelve como lo haría la
// base (incluido el CASCADE de los renglones al borrar la entrega). Testear
// el cálculo aparte no habría probado nada: el bug que importa vive en el
// orden de las operaciones, no en la aritmética.
//
// El doble también sabe fingir que la columna `bultos` NO existe (la
// migración la corre Daniel a mano): así se verifica que la entrega se guarda
// igual y el stock se descuenta igual.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Doble de PostgREST ──────────────────────────────────────────────────────
type Fila = Record<string, unknown>;

interface Estado {
  tablas: Record<string, Fila[]>;
  /** false = la migración 20260808160000 todavía no corrió. */
  soportaBultos: boolean;
  seq: number;
}

const estado: Estado = { tablas: {}, soportaBultos: true, seq: 0 };

function nuevoId(pref: string): string {
  estado.seq += 1;
  return `${pref}-${String(estado.seq).padStart(4, "0")}`;
}

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private filtros: Array<(f: Fila) => boolean> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Fila[] = [];
  private devolver = false;
  private limite: number | null = null;

  constructor(private tabla: string) {}

  private get filas(): Fila[] {
    estado.tablas[this.tabla] ??= [];
    return estado.tablas[this.tabla];
  }

  select(_cols?: string) {
    if (this.op === "select") this.op = "select";
    this.devolver = true;
    return this;
  }
  insert(rows: Fila | Fila[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(row: Fila) {
    this.op = "update";
    this.payload = [row];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filtros.push((f) => String(f[col]) === String(val));
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals.map(String));
    this.filtros.push((f) => set.has(String(f[col])));
    return this;
  }
  is(col: string, val: unknown) {
    this.filtros.push((f) => (val === null ? f[col] == null : f[col] === val));
    return this;
  }
  not(col: string, _op: string, val: unknown) {
    this.filtros.push((f) => (val === null ? f[col] != null : f[col] !== val));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.limite = n;
    return this;
  }

  private aplicar(): Fila[] {
    return this.filas.filter((f) => this.filtros.every((p) => p(f)));
  }

  /** Columna que la migración pendiente no tendría. */
  private columnaProhibida(row: Fila): string | null {
    if (!estado.soportaBultos && "bultos" in row) return "bultos";
    if (!estado.soportaBultos && "foto_path" in row) return "foto_path";
    return null;
  }

  private ejecutar(): { data: unknown; error: unknown } {
    if (this.op === "insert") {
      for (const row of this.payload) {
        const mala = this.columnaProhibida(row);
        if (mala) {
          return {
            data: null,
            error: {
              code: "PGRST204",
              message: `Could not find the '${mala}' column`,
            },
          };
        }
      }
      const creadas = this.payload.map((row) => ({
        id: nuevoId(this.tabla),
        created_at: "2026-08-08T00:00:00Z",
        ...row,
      }));
      this.filas.push(...creadas);
      return { data: this.devolver ? creadas : null, error: null };
    }

    if (this.op === "update") {
      const row = this.payload[0] ?? {};
      const mala = this.columnaProhibida(row);
      if (mala) {
        return {
          data: null,
          error: {
            code: "PGRST204",
            message: `Could not find the '${mala}' column`,
          },
        };
      }
      const afectadas = this.aplicar();
      for (const f of afectadas) Object.assign(f, row);
      return { data: this.devolver ? afectadas : null, error: null };
    }

    if (this.op === "delete") {
      const afectadas = this.aplicar();
      const ids = new Set(afectadas.map((f) => String(f.id)));
      estado.tablas[this.tabla] = this.filas.filter(
        (f) => !ids.has(String(f.id)),
      );
      // CASCADE real: borrar una entrega se lleva sus renglones.
      if (this.tabla === "mk_entregas_muebles") {
        estado.tablas.mk_entrega_items = (
          estado.tablas.mk_entrega_items ?? []
        ).filter((f) => !ids.has(String(f.entrega_id)));
      }
      return { data: this.devolver ? afectadas : null, error: null };
    }

    let out = this.aplicar();
    if (this.limite !== null) out = out.slice(0, this.limite);
    return { data: out, error: null };
  }

  async single() {
    const r = this.ejecutar();
    if (r.error) return { data: null, error: r.error };
    const filas = (r.data as Fila[]) ?? [];
    if (filas.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "no single" } };
    }
    return { data: filas[0], error: null };
  }
  async maybeSingle() {
    const r = this.ejecutar();
    if (r.error) return { data: null, error: r.error };
    const filas = (r.data as Fila[]) ?? [];
    return { data: filas[0] ?? null, error: null };
  }
  then<A, B>(
    onOk?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onErr?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.ejecutar()).then(onOk, onErr);
  }
}

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (tabla: string) => new Consulta(tabla),
    // La RPC `mk_ajustar_stock_producto` NO existe en las migraciones del
    // repo: en producción falla y el código cae al camino leer+escribir. El
    // doble reproduce eso, que es el camino que corre de verdad.
    rpc: async () => ({
      data: null,
      error: { code: "42883", message: "function does not exist" },
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: null,
          error: { message: "sin storage en el test" },
        }),
      }),
    },
  },
}));

import {
  createEntrega,
  deleteEntrega,
  listProductos,
  updateEntrega,
} from "@/lib/marketing/inventario";

// ── Semilla ─────────────────────────────────────────────────────────────────
const PROD_NORTE = "prod-norte";
const PROD_PANEL = "prod-panel";
const MARCA = "marca-tommy";
const PROYECTO = "proy-1";

function sembrar(soportaBultos = true) {
  estado.seq = 0;
  estado.soportaBultos = soportaBultos;
  estado.tablas = {
    mk_inventario_productos: [
      {
        id: PROD_NORTE,
        nombre: "Norte colgador",
        precio: 66,
        stock_total: 200,
        foto_path: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: PROD_PANEL,
        nombre: "Paneles",
        precio: 130,
        stock_total: 50,
        foto_path: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    mk_marcas: [
      { id: MARCA, tipo: "externa", empresa_codigo: "fashion_wear" },
    ],
    mk_proyectos: [{ id: PROYECTO, anulado_en: null }],
    mk_entregas_muebles: [],
    mk_entrega_items: [],
  };
}

function stock(productoId: string): number {
  const f = (estado.tablas.mk_inventario_productos ?? []).find(
    (p) => p.id === productoId,
  );
  return Number(f?.stock_total ?? NaN);
}

const marcas = [{ marcaId: MARCA, porcentaje: 100 }];

beforeEach(() => sembrar());

// ── 1 y 2. Descuenta piezas; los bultos no tocan nada ───────────────────────

describe("registrar una entrega descuenta PIEZAS", () => {
  it("150 piezas en 5 bultos sacan 150, no 5", async () => {
    await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150, bultos: 5 }],
    });
    expect(stock(PROD_NORTE)).toBe(50); // 200 − 150
    expect(stock(PROD_NORTE)).not.toBe(195); // lo que daría descontar bultos
  });

  it("el caso textual de Daniel: 30 en 1 bulto y 20 en 1 bulto", async () => {
    // Mismos bultos, distintas piezas → distinto descuento.
    await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 30, bultos: 1 }],
    });
    expect(stock(PROD_NORTE)).toBe(170);

    await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 20, bultos: 1 }],
    });
    expect(stock(PROD_NORTE)).toBe(150);
  });

  it("los bultos SE GUARDAN (si no, el dato se perdería)", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150, bultos: 5 }],
    });
    expect(e.items[0].bultos).toBe(5);
  });

  it("sin bultos anotados descuenta igual y guarda null (no 0)", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 40 }],
    });
    expect(stock(PROD_NORTE)).toBe(160);
    expect(e.items[0].bultos).toBeNull();
  });

  it("cambiar SÓLO los bultos no mueve el inventario", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150, bultos: 5 }],
    });
    const antes = stock(PROD_NORTE);
    await updateEntrega(e.id, {
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150, bultos: 9 }],
    });
    expect(stock(PROD_NORTE)).toBe(antes);
  });
});

// ── 3. Editar devuelve el stock ─────────────────────────────────────────────

describe("EDITAR una entrega devuelve el stock que sobra", () => {
  it("bajar de 150 a 100 devuelve 50", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150, bultos: 5 }],
    });
    expect(stock(PROD_NORTE)).toBe(50);

    await updateEntrega(e.id, {
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 100, bultos: 4 }],
    });
    expect(stock(PROD_NORTE)).toBe(100); // 200 − 100
  });

  it("subir de 100 a 180 descuenta sólo la diferencia", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 100 }],
    });
    await updateEntrega(e.id, {
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 180 }],
    });
    expect(stock(PROD_NORTE)).toBe(20); // 200 − 180, no 200 − 100 − 180
  });

  it("sacar un producto del renglón le devuelve TODO lo suyo", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [
        { productoId: PROD_NORTE, cantidad: 100 },
        { productoId: PROD_PANEL, cantidad: 10 },
      ],
    });
    expect(stock(PROD_PANEL)).toBe(40);

    await updateEntrega(e.id, {
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 100 }],
    });
    expect(stock(PROD_PANEL)).toBe(50); // devuelto entero
    expect(stock(PROD_NORTE)).toBe(100); // intacto
  });
});

// ── 4. Borrar devuelve el stock ─────────────────────────────────────────────

describe("BORRAR una entrega devuelve todo el stock", () => {
  it("el inventario vuelve exactamente a como estaba", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [
        { productoId: PROD_NORTE, cantidad: 150, bultos: 5 },
        { productoId: PROD_PANEL, cantidad: 20, bultos: 2 },
      ],
    });
    expect(stock(PROD_NORTE)).toBe(50);
    expect(stock(PROD_PANEL)).toBe(30);

    await deleteEntrega(e.id);
    expect(stock(PROD_NORTE)).toBe(200);
    expect(stock(PROD_PANEL)).toBe(50);
  });
});

// ── 5. Idempotencia: dos veces no cuenta dos veces ──────────────────────────

describe("ejecutar dos veces NO descuenta ni devuelve dos veces", () => {
  it("guardar la MISMA edición dos veces deja el stock igual", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150 }],
    });
    const payload = {
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 100 }],
    };
    await updateEntrega(e.id, payload);
    const despuesDeLaPrimera = stock(PROD_NORTE);
    await updateEntrega(e.id, payload);
    expect(stock(PROD_NORTE)).toBe(despuesDeLaPrimera);
    expect(stock(PROD_NORTE)).toBe(100);
  });

  it("borrar dos veces NO devuelve el stock dos veces", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150 }],
    });
    await deleteEntrega(e.id);
    expect(stock(PROD_NORTE)).toBe(200);
    await deleteEntrega(e.id); // reintento, doble clic, retry de la red
    expect(stock(PROD_NORTE)).toBe(200);
    expect(stock(PROD_NORTE)).not.toBe(350);
  });

  it("borrar después de editar devuelve lo que la entrega tenía AL FINAL", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150 }],
    });
    await updateEntrega(e.id, {
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 60 }],
    });
    expect(stock(PROD_NORTE)).toBe(140);
    await deleteEntrega(e.id);
    expect(stock(PROD_NORTE)).toBe(200);
  });
});

// ── 6. El negativo se permite, a propósito ──────────────────────────────────

describe("el stock puede quedar NEGATIVO", () => {
  it("entregar más de lo que hay NO se bloquea", async () => {
    await expect(
      createEntrega({
        proyectoId: PROYECTO,
        marcas,
        items: [{ productoId: PROD_PANEL, cantidad: 70 }],
      }),
    ).resolves.toBeTruthy();
    expect(stock(PROD_PANEL)).toBe(-20); // 50 − 70
  });

  it("y desde el negativo se puede volver: borrar la entrega lo restaura", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_PANEL, cantidad: 70 }],
    });
    expect(stock(PROD_PANEL)).toBe(-20);
    await deleteEntrega(e.id);
    expect(stock(PROD_PANEL)).toBe(50);
  });
});

// ── cols-opcionales: sin la migración corrida ───────────────────────────────

describe("sin la migración 20260808160000 corrida", () => {
  beforeEach(() => sembrar(false));

  it("la entrega se guarda igual y el stock se descuenta igual", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150, bultos: 5 }],
    });
    expect(e.items).toHaveLength(1);
    expect(stock(PROD_NORTE)).toBe(50);
    // Los bultos no se guardaron (no hay dónde), y eso se ve como "no anotado".
    expect(e.items[0].bultos).toBeNull();
  });

  it("editar y borrar siguen devolviendo el stock", async () => {
    const e = await createEntrega({
      proyectoId: PROYECTO,
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 150 }],
    });
    await updateEntrega(e.id, {
      marcas,
      items: [{ productoId: PROD_NORTE, cantidad: 100 }],
    });
    expect(stock(PROD_NORTE)).toBe(100);
    await deleteEntrega(e.id);
    expect(stock(PROD_NORTE)).toBe(200);
  });

  it("la lista de productos no se cae por la foto que no existe", async () => {
    const ps = await listProductos();
    expect(ps).toHaveLength(2);
    expect(ps[0].foto_url).toBeNull();
  });
});

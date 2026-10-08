// ============================================================================
// 🔴 CANDADO — «Excluir de este cierre» (8-oct-2026).
//
// Daniel quiere dejar un gasto fuera de un cierre para que pase al siguiente.
// Lo que se cuida, de punta a punta, contra una base EN MEMORIA:
//   · el gasto excluido NO entra al ZIP del período cerrado ni suma a su total;
//   · aparece en el período siguiente (el abierto nuevo);
//   · el gasto NO cambia: ni su fila, ni su marca; solo su asignación a período;
//   · el total que devuelve el cierre es el del ZIP del cerrado, al centavo.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

type Fila = Record<string, unknown>;
const tablas: Record<string, Fila[]> = {};
let siguienteId = 0;

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private filtros: Array<(f: Fila) => boolean> = [];
  private op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  private payload: Fila[] = [];
  private patch: Fila = {};
  private uno: "single" | "maybe" | null = null;
  private onConflict: string[] = [];
  constructor(private tabla: string) {}
  select() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtros.push((f) => f[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filtros.push((f) => f[c] !== v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    const s = new Set(vs);
    this.filtros.push((f) => s.has(f[c]));
    return this;
  }
  is(c: string, v: unknown) {
    this.filtros.push((f) => (v === null ? f[c] == null : f[c] === v));
    return this;
  }
  update(p: Fila) {
    this.op = "update";
    this.patch = p;
    return this;
  }
  insert(r: Fila | Fila[]) {
    this.op = "insert";
    this.payload = Array.isArray(r) ? r : [r];
    return this;
  }
  upsert(r: Fila | Fila[], o?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(r) ? r : [r];
    this.onConflict = String(o?.onConflict ?? "").split(",").filter(Boolean);
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  single() {
    this.uno = "single";
    return this;
  }
  maybeSingle() {
    this.uno = "maybe";
    return this;
  }
  private correr(): { data: unknown; error: unknown } {
    const t = (tablas[this.tabla] ??= []);
    const pasa = (f: Fila) => this.filtros.every((p) => p(f));
    let filas: Fila[];
    if (this.op === "insert") {
      filas = this.payload.map((r) => ({ id: `nuevo-${++siguienteId}`, ...r }));
      t.push(...filas);
    } else if (this.op === "upsert") {
      filas = [];
      for (const r of this.payload) {
        if (t.some((f) => this.onConflict.every((c) => f[c] === r[c]))) continue; // ignoreDuplicates
        t.push({ ...r });
        filas.push(r);
      }
    } else if (this.op === "update") {
      filas = t.filter(pasa);
      for (const f of filas) Object.assign(f, this.patch);
    } else if (this.op === "delete") {
      filas = t.filter(pasa);
      tablas[this.tabla] = t.filter((f) => !pasa(f));
    } else {
      filas = t.filter(pasa);
    }
    const data = filas.map((f) => ({ ...f }));
    if (this.uno) return { data: data[0] ?? null, error: this.uno === "single" && !data[0] ? { message: "0 filas" } : null };
    return { data, error: null };
  }
  then<A, B>(ok?: (v: { data: unknown; error: unknown }) => A | PromiseLike<A>, bad?: (r: unknown) => B | PromiseLike<B>) {
    return Promise.resolve(this.correr()).then(ok, bad);
  }
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => new Consulta(t),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  },
}));

import { cerrarCobro } from "@/app/api/marketing/cobros/cerrar-cobro";
import { buildZipDeMarca, resumenDeUnCobro } from "@/lib/marketing/zip-marca";

const M_TH = "m-th";
const ABIERTO = "per-th";

function fact(id: string, total: number, extra: Fila = {}): Fila {
  return {
    id,
    proyecto_id: null,
    numero_factura: id.toUpperCase(),
    fecha_factura: "2026-09-10",
    proveedor: "Impresora Comercial",
    concepto: `concepto ${id}`,
    subtotal: total,
    total,
    impulsadora_id: null,
    impulsadora_mes: null,
    periodo_desde: null,
    periodo_hasta: null,
    anulado_en: null,
    tienda_codigo: "D-170",
    se_reporta: true,
    pct_a_la_marca: null,
    ...extra,
  };
}

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  tablas.mk_marcas = [{ id: M_TH, nombre: "Tommy Hilfiger", codigo: "TH", empresa_codigo: "fashion_wear" }];
  tablas.mk_periodos = [
    { id: ABIERTO, proveedor_key: "TH", nombre: "Desde el 11 ago 2026", estado: "abierto", reporte: null, cerrado_en: null },
  ];
  tablas.mk_proyectos = [];
  tablas.clientes_master = [{ codigo: "D-170", nombre: "Nova Lux, S.A." }];
  tablas.mk_facturas = [fact("f1", 1000), fact("f2", 2140, { pct_a_la_marca: 50 }), fact("f3", 300)];
  tablas.mk_factura_marcas = ["f1", "f2", "f3"].map((id) => ({ factura_id: id, marca_id: M_TH, porcentaje: 100 }));
  tablas.mk_entregas_muebles = [];
  // f1 y f2 ya asignadas al período abierto (así nacen al registrarse); f3 sin asignación.
  tablas.mk_periodo_documentos = [
    { periodo_id: ABIERTO, proveedor_key: "TH", tipo: "factura", documento_id: "f1" },
    { periodo_id: ABIERTO, proveedor_key: "TH", tipo: "factura", documento_id: "f2" },
  ];
  tablas.mk_adjuntos = [];
});

describe("🔴 Excluir de este cierre", () => {
  it("lo excluido no entra al ZIP del cerrado, no suma, y pasa al período siguiente", async () => {
    const antes = await resumenDeUnCobro({ marcaCodigo: "TH" });
    expect(antes.total).toBe(2370); // 1000 + 1070 (mitad) + 300
    const facturasAntes = JSON.stringify(tablas.mk_facturas);

    const r = await cerrarCobro({
      marcaCodigo: "TH",
      periodoId: ABIERTO,
      excluidos: ["factura:f2"],
      cerradoPor: "Daniel",
      ahoraISO: "2026-10-08T15:00:00Z",
      hoy: "2026-10-08",
    });

    // El cierre lleva solo lo incluido, y dice el número de su ZIP.
    expect(r.total).toBe(1300);
    expect(r.excluidos).toBe(1);
    const zipCerrado = await buildZipDeMarca({ marcaCodigo: "TH", periodoId: ABIERTO });
    expect(zipCerrado.total).toBe(1300);
    expect(zipCerrado.gastos).toBe(2);

    // Lo excluido sigue abierto, en el período nuevo.
    const nuevo = await resumenDeUnCobro({ marcaCodigo: "TH" });
    expect(nuevo.periodoId).toBe(r.siguiente.id);
    expect(nuevo.lineas.map((l) => l.documentoId)).toEqual(["f2"]);
    expect(nuevo.total).toBe(1070);
    expect(tablas.mk_periodo_documentos).toContainEqual(
      expect.objectContaining({ periodo_id: r.siguiente.id, tipo: "factura", documento_id: "f2" }),
    );

    // El gasto no cambió ni una letra.
    expect(JSON.stringify(tablas.mk_facturas)).toBe(facturasAntes);
  });

  it("sin exclusiones, el cierre lleva todo lo que decía el ZIP abierto", async () => {
    const antes = await resumenDeUnCobro({ marcaCodigo: "TH" });
    const r = await cerrarCobro({ marcaCodigo: "TH", periodoId: ABIERTO, excluidos: [], cerradoPor: "Daniel", hoy: "2026-10-08" });
    expect(r.total).toBe(antes.total);
    expect((await buildZipDeMarca({ marcaCodigo: "TH", periodoId: ABIERTO })).total).toBe(antes.total);
  });

  it("no deja cerrar un cobro vacío: si se excluye todo, no se toca nada", async () => {
    await expect(
      cerrarCobro({
        marcaCodigo: "TH",
        periodoId: ABIERTO,
        excluidos: ["factura:f1", "factura:f2", "factura:f3"],
        cerradoPor: "Daniel",
      }),
    ).rejects.toThrow(/al menos un gasto/);
    expect(tablas.mk_periodos[0].estado).toBe("abierto");
    expect(tablas.mk_periodo_documentos).toHaveLength(2);
  });
});

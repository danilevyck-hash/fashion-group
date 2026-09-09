/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANSPORTISTAS — LO QUE EL SERVIDOR HACE DE VERDAD (9-sep-2026)
 *
 * El barrido de texto de `guias-transportistas.test.ts` ve que las palabras
 * estén; esto ve la CONDUCTA, con la base fingida:
 *
 *   · el repetido se rechaza con 409 y NO se inserta nada;
 *   · el que estaba QUITADO revive su fila — nunca se crea una segunda;
 *   · quitar es un UPDATE firmado, jamás un DELETE;
 *   · y el GET pelado sigue devolviendo el ARRAY tal cual, que es lo que el
 *     formulario de guías lee desde el 26-may-2026.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/** Lo que la base «tiene» y lo que se le pidió, para poder mirarlo. */
let filas: { id: string; nombre: string; activo: boolean }[] = [];
let operaciones: { tabla: string; op: string; datos?: unknown }[] = [];

/** Un encadenado fingido: recuerda la operación y se resuelve como la real. */
function constructor(tabla: string) {
  let op = "select";
  let datos: unknown;
  const encadenado: Record<string, unknown> = {};
  const devolver = () => encadenado;
  for (const m of ["eq", "order", "range", "limit"]) encadenado[m] = devolver;
  encadenado.select = () => encadenado;
  encadenado.insert = (d: unknown) => { op = "insert"; datos = d; operaciones.push({ tabla, op, datos }); return encadenado; };
  encadenado.update = (d: unknown) => { op = "update"; datos = d; operaciones.push({ tabla, op, datos }); return encadenado; };
  encadenado.delete = () => { op = "delete"; operaciones.push({ tabla, op }); return encadenado; };
  encadenado.single = () => Promise.resolve({ data: { id: "nuevo" }, error: null });
  // Un `await` sobre el encadenado: lo que devolvería PostgREST.
  encadenado.then = (r: (v: unknown) => unknown) => {
    if (op === "select") return Promise.resolve({ data: filas, error: null, count: filas.length }).then(r);
    return Promise.resolve({ data: [{ id: "x" }], error: null }).then(r);
  };
  return encadenado;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => constructor(tabla) },
}));

// `vi.mock` se iza por encima de los imports, así que el módulo se lleva la
// base fingida aunque esta línea esté arriba del todo.
import {
  agregarTransportista,
  desactivarTransportista,
  leerTransportistasActivos,
} from "@/lib/guias/transportistas-server";

beforeEach(() => {
  operaciones = [];
  filas = [
    { id: "r", nombre: "RedNblue", activo: true },
    { id: "b", nombre: "Boston", activo: true },
  ];
});

describe("🔴 el repetido no entra", () => {
  it("«REDNBLUE» se rechaza con 409 y NO se inserta nada", async () => {
    const r = await agregarTransportista("REDNBLUE", "angela");
    expect(r).toEqual({ ok: false, status: 409, error: "Ese transportista ya está en la lista" });
    expect(operaciones.filter((o) => o.op === "insert")).toEqual([]);
  });

  it("« Red N Blue » tampoco, aunque el texto sea distinto", async () => {
    const r = await agregarTransportista(" Red N Blue ", "angela");
    expect(r.ok).toBe(false);
    expect(operaciones.filter((o) => o.op === "insert")).toEqual([]);
  });

  it("🔴 CONTROL — uno PARECIDO sí entra: son dos transportistas distintos", async () => {
    const r = await agregarTransportista("RedNbleu", "angela");
    expect(r.ok).toBe(true);
    const alta = operaciones.find((o) => o.op === "insert");
    expect(alta?.datos).toEqual({ nombre: "RedNbleu", creado_por: "angela" });
  });

  it("uno nuevo entra, firmado por quien lo agregó", async () => {
    const r = await agregarTransportista("Transportes Chiriquí", "andrea");
    expect(r).toEqual({ ok: true, id: "nuevo", revivido: false });
    expect(operaciones.find((o) => o.op === "insert")?.datos).toEqual({
      nombre: "Transportes Chiriquí",
      creado_por: "andrea",
    });
  });
});

describe("🔴 el que vuelve REVIVE su fila, no crea una segunda", () => {
  beforeEach(() => {
    filas = [
      { id: "r", nombre: "RedNblue", activo: true },
      { id: "m", nombre: "Mojica", activo: false }, // quitado en su día
    ];
  });

  it("se revive con un UPDATE sobre la MISMA fila, y sin insertar", async () => {
    const r = await agregarTransportista("Mojica", "angela");
    expect(r).toEqual({ ok: true, id: "m", revivido: true });
    expect(operaciones.filter((o) => o.op === "insert")).toEqual([]);
    const upd = operaciones.find((o) => o.op === "update");
    expect(upd?.datos).toEqual({ activo: true, desactivado_por: null, desactivado_en: null });
  });

  it("revive aunque se escriba distinto: «MOJICA»", async () => {
    const r = await agregarTransportista("MOJICA", "angela");
    expect(r.ok && r.revivido).toBe(true);
  });
});

describe("🔴 quitar es soft delete firmado", () => {
  it("escribe activo=false + quién y cuándo, y NUNCA borra", async () => {
    const r = await desactivarTransportista("m", "daniel");
    expect(r).toEqual({ ok: true });
    expect(operaciones.filter((o) => o.op === "delete")).toEqual([]);
    const upd = operaciones.find((o) => o.op === "update")?.datos as Record<string, unknown>;
    expect(upd.activo).toBe(false);
    expect(upd.desactivado_por).toBe("daniel");
    expect(typeof upd.desactivado_en).toBe("string");
  });

  it("🩸 no toca ni una guía", async () => {
    await desactivarTransportista("m", "daniel");
    expect(operaciones.filter((o) => o.tabla !== "transportistas")).toEqual([]);
  });
});

describe("⚠️ el GET pelado no cambia de forma", () => {
  it("devuelve las filas tal cual — es lo que lee el formulario", async () => {
    expect(await leerTransportistasActivos()).toEqual(filas);
  });
});

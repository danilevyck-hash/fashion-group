/**
 * 🔴 EL DÍA COMPLETO SE ARREGLA EN LA FILA, SIN ABRIR UNA VENTANA (19-sep-2026).
 *
 * 🩸 Hasta hoy: una ventana por cada marca que falta, y para cambiar una hora ya
 * corregida había que **deshacer primero y volver a escribir el motivo**.
 * Medido contra producción: 232 correcciones sobre 141 días de 33 personas;
 * **58 días necesitaron 2, 3 o hasta 7 ventanas**; **58 correcciones se
 * anularon** y **44 de ellas fueron seguidas de otra del mismo día en menos de
 * 10 minutos** — o sea, deshacer-para-reescribir.
 *
 * Lo que este candado exige, bloque por bloque:
 *
 *   A. La regla pura: nada se aplica solo, y lo que cambió se escribe.
 *   B. Reemplazar es ANULAR + ESCRIBIR, nunca pisar.
 *   C. El motivo es obligatorio, y el botón apagado dice qué falta.
 *   D. El servidor valida TODO antes de escribir NADA.
 *   E. La marcación del reloj no se edita ni se borra (barrido, y el de la ruta nueva).
 *   F. Control: con el interruptor apagado, la pantalla es la de antes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  EDITAR_EL_DIA,
  GUARDAR_EL_DIA,
  casillasDelDia,
  claveMarca,
  claveVacia,
  faltaParaGuardarElDia,
  planDelDia,
  resumenDelPlan,
  textoGuardado,
  type CasillaDelDia,
  type EscritoEnCasilla,
} from "@/lib/asistencia/editar-el-dia";
import type { CorreccionVisible } from "@/lib/asistencia/correcciones";

const RAIZ = process.cwd();

function correccion(p: Partial<CorreccionVisible>): CorreccionVisible {
  return {
    id: "c1", hora: "08:00:00", relojHora: "08:10:00", agregada: false,
    quitada: false, motivo: "llegó antes", creadaPor: "yulissa", creadaEn: "2026-09-01T12:00:00Z",
    ...p,
  };
}

const escritoDe = (o: Record<string, EscritoEnCasilla>) =>
  new Map<string, EscritoEnCasilla>(Object.entries(o));

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA PURA — nada se aplica solo
// ─────────────────────────────────────────────────────────────────────────────

describe("A · nada se aplica solo", () => {
  const dia = {
    marcas: ["08:04:11", "12:01:00", "13:00:00", "17:30:02"],
    marcasIds: ["m1", "m2", "m3", "m4"],
    correcciones: [] as CorreccionVisible[],
  };

  it("un día sin tocar nada no produce ni un cambio", () => {
    const plan = planDelDia(casillasDelDia(dia), new Map());
    expect(plan.cambios).toEqual([]);
    expect(plan.invalidas).toEqual([]);
  });

  it("escribir la MISMA hora que ya valía tampoco es un cambio", () => {
    const plan = planDelDia(
      casillasDelDia(dia),
      escritoDe({ [claveMarca(0)]: { hora: "08:04:11" } }),
    );
    expect(plan.cambios).toEqual([]);
  });

  it("un hueco que sigue vacío no agrega nada", () => {
    const corto = { marcas: ["08:00:00"], marcasIds: ["m1"], correcciones: [] };
    const plan = planDelDia(
      casillasDelDia(corto),
      escritoDe({ [claveVacia(1)]: { hora: "" }, [claveVacia(2)]: { hora: "" } }),
    );
    expect(plan.cambios).toEqual([]);
  });

  it("vaciar una casilla que tenía hora NO borra la marca: quitar es otra cosa", () => {
    const plan = planDelDia(
      casillasDelDia(dia),
      escritoDe({ [claveMarca(0)]: { hora: "" } }),
    );
    expect(plan.cambios).toEqual([]);
  });

  it("las CUATRO marcas se arreglan de una vez, en un solo plan", () => {
    const plan = planDelDia(
      casillasDelDia(dia),
      escritoDe({
        [claveMarca(0)]: { hora: "08:00:00" },
        [claveMarca(1)]: { hora: "12:00:00" },
        [claveMarca(2)]: { hora: "13:05:00" },
        [claveMarca(3)]: { hora: "17:30:00" },
      }),
    );
    expect(plan.cambios).toHaveLength(4);
    expect(plan.cambios.every((c) => c.tipo === "corregir")).toBe(true);
    expect(plan.cambios.map((c) => c.marcacionId)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("un hueco escrito es AGREGAR, sin marcación detrás", () => {
    const corto = { marcas: ["08:00:00"], marcasIds: ["m1"], correcciones: [] };
    const plan = planDelDia(
      casillasDelDia(corto),
      escritoDe({ [claveVacia(3)]: { hora: "17:00" } }),
    );
    expect(plan.cambios).toEqual([
      { clave: "v3", tipo: "agregar", marcacionId: null, reemplaza: null, hora: "17:00:00" },
    ]);
  });

  it("quitar exige una marcación del RELOJ; sobre una agregada a mano no hace nada", () => {
    const conAgregada = {
      marcas: ["08:00:00", "17:00:00"],
      marcasIds: [null, "m2"],
      correcciones: [correccion({ id: "cA", hora: "08:00:00", relojHora: null, agregada: true })],
    };
    const plan = planDelDia(
      casillasDelDia(conAgregada),
      escritoDe({ [claveMarca(0)]: { hora: "", quitar: true }, [claveMarca(1)]: { hora: "", quitar: true } }),
    );
    expect(plan.cambios).toEqual([
      { clave: "m1", tipo: "quitar", marcacionId: "m2", reemplaza: null, hora: null },
    ]);
  });

  it("una hora que no sirve se DICE, no se descarta en silencio", () => {
    const plan = planDelDia(casillasDelDia(dia), escritoDe({ [claveMarca(0)]: { hora: "99:99" } }));
    expect(plan.cambios).toEqual([]);
    expect(plan.invalidas).toEqual(["m0"]);
  });

  it("los segundos del reloj se conservan cuando solo se mueve el minuto", () => {
    // El selector del iPhone devuelve "HH:MM": corregir 08:04:11 a 08:04 no
    // puede volverla 08:04:00 — es la regla de `completarSegundos`.
    const plan = planDelDia(casillasDelDia(dia), escritoDe({ [claveMarca(0)]: { hora: "08:04" } }));
    expect(plan.cambios).toEqual([]);
    const otro = planDelDia(casillasDelDia(dia), escritoDe({ [claveMarca(0)]: { hora: "08:05" } }));
    expect(otro.cambios[0].hora).toBe("08:05:00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. REEMPLAZAR ES ANULAR + ESCRIBIR — editar es editar, sin deshacer previo
// ─────────────────────────────────────────────────────────────────────────────

describe("B · editar una hora ya corregida no pide deshacer antes", () => {
  const conCorreccion = {
    marcas: ["08:00:00", "17:00:00"],
    marcasIds: ["m1", "m2"],
    correcciones: [correccion({ id: "cVieja", hora: "08:00:00", relojHora: "08:14:22" })],
  };

  it("la casilla sabe cuál es su corrección viva y cuál era la hora del reloj", () => {
    const [c0] = casillasDelDia(conCorreccion);
    expect(c0.correccionId).toBe("cVieja");
    expect(c0.relojHora).toBe("08:14:22");
  });

  it("cambiar esa hora trae `reemplaza` con la corrección vieja", () => {
    const plan = planDelDia(
      casillasDelDia(conCorreccion),
      escritoDe({ [claveMarca(0)]: { hora: "08:05:00" } }),
    );
    expect(plan.cambios).toEqual([
      { clave: "m0", tipo: "corregir", marcacionId: "m1", reemplaza: "cVieja", hora: "08:05:00" },
    ]);
  });

  it("quitar una marca YA corregida también anula la corrección vieja", () => {
    const plan = planDelDia(
      casillasDelDia(conCorreccion),
      escritoDe({ [claveMarca(0)]: { hora: "", quitar: true } }),
    );
    expect(plan.cambios).toEqual([
      { clave: "m0", tipo: "quitar", marcacionId: "m1", reemplaza: "cVieja", hora: null },
    ]);
  });

  it("re-escribir una marca AGREGADA a mano sigue siendo agregar, reemplazando la suya", () => {
    const conAgregada = {
      marcas: ["08:00:00"],
      marcasIds: [null],
      correcciones: [correccion({ id: "cAdd", hora: "08:00:00", relojHora: null, agregada: true })],
    };
    const plan = planDelDia(
      casillasDelDia(conAgregada),
      escritoDe({ [claveMarca(0)]: { hora: "08:30:00" } }),
    );
    expect(plan.cambios).toEqual([
      { clave: "m0", tipo: "agregar", marcacionId: null, reemplaza: "cAdd", hora: "08:30:00" },
    ]);
  });

  it("una marcación QUITADA no aparece como casilla: se deshace desde su línea", () => {
    const conQuitada = {
      marcas: ["08:00:00"],
      marcasIds: ["m1"],
      correcciones: [correccion({ id: "cQ", hora: "14:23:39", relojHora: "14:23:39", quitada: true })],
    };
    const casillas = casillasDelDia(conQuitada);
    expect(casillas).toHaveLength(1);
    expect(casillas[0].correccionId).toBeNull();
  });

  it("🔴 una corrección QUITADA no se le presta a la marca que quedó con su misma hora", () => {
    // 🩸 Dos marcas del mismo segundo (el reloj las duplica) y una de ellas
    // quitada: buscar por HORA sin mirar `quitada` le pegaría la corrección de
    // la muerta a la viva, y editar esa hora anularía la corrección equivocada.
    const gemelas = {
      marcas: ["14:23:39"],
      marcasIds: ["m2"],
      correcciones: [correccion({ id: "cQ", hora: "14:23:39", relojHora: "14:23:39", quitada: true })],
    };
    const [c0] = casillasDelDia(gemelas);
    expect(c0.correccionId).toBeNull();
    expect(c0.relojHora).toBe("14:23:39");
    const plan = planDelDia([c0], escritoDe({ [claveMarca(0)]: { hora: "14:25" } }));
    expect(plan.cambios[0].reemplaza).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. EL MOTIVO ES OBLIGATORIO, Y EL BOTÓN APAGADO DICE QUÉ FALTA
// ─────────────────────────────────────────────────────────────────────────────

describe("C · el porqué sigue siendo obligatorio", () => {
  const dia = { marcas: ["08:00:00"], marcasIds: ["m1"], correcciones: [] };
  const conCambio = planDelDia(casillasDelDia(dia), escritoDe({ [claveMarca(0)]: { hora: "08:30" } }));

  it("con cambios y sin motivo no se guarda, y se dice qué falta", () => {
    expect(faltaParaGuardarElDia(conCambio, "")).toBe("Falta: el porqué");
    expect(faltaParaGuardarElDia(conCambio, "   ")).toBe("Falta: el porqué");
  });

  it("con cambios y motivo, se puede guardar", () => {
    expect(faltaParaGuardarElDia(conCambio, "olvidó marcar")).toBeNull();
  });

  it("sin cambios no hay nada que hacer, y tampoco se guarda", () => {
    const vacio = planDelDia(casillasDelDia(dia), new Map());
    expect(faltaParaGuardarElDia(vacio, "lo que sea")).toBe("Todavía no cambiaste nada");
  });

  it("una hora que no sirve FRENA el guardado antes que nada", () => {
    const malo = planDelDia(casillasDelDia(dia), escritoDe({ [claveMarca(0)]: { hora: "25:00" } }));
    expect(faltaParaGuardarElDia(malo, "un motivo")).toBe("Hay una hora que no sirve");
  });

  it("el resumen dice QUÉ se va a escribir antes de escribirlo", () => {
    const grande = {
      marcas: ["08:00:00", "12:00:00", "13:00:00"],
      marcasIds: ["m1", "m2", "m3"],
      correcciones: [],
    };
    const plan = planDelDia(
      casillasDelDia(grande),
      escritoDe({
        [claveMarca(0)]: { hora: "08:10" },
        [claveMarca(1)]: { hora: "12:10" },
        [claveMarca(2)]: { hora: "", quitar: true },
        [claveVacia(3)]: { hora: "17:00" },
      }),
    );
    expect(resumenDelPlan(plan)).toBe("2 horas corregidas · 1 agregada · 1 quitada");
    expect(textoGuardado(plan)).toContain("Listo, guardado");
    expect(resumenDelPlan({ cambios: [], invalidas: [] })).toBeNull();
  });

  it("el botón dice «Guardar el día», en español neutro", () => {
    expect(GUARDAR_EL_DIA).toBe("Guardar el día");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. EL SERVIDOR VALIDA TODO ANTES DE ESCRIBIR NADA
// ─────────────────────────────────────────────────────────────────────────────

const escrituras: Array<{ op: string; payload: unknown }> = [];
const marcaciones: Record<string, { id: string; empleadoCodigo: string; ocurrioEn: string }> = {
  m1: { id: "m1", empleadoCodigo: "16", ocurrioEn: "2026-09-01T13:04:11.000Z" }, // 08:04:11 Panamá
  m2: { id: "m2", empleadoCodigo: "16", ocurrioEn: "2026-09-01T22:30:02.000Z" }, // 17:30:02 Panamá
};

vi.mock("@/lib/asistencia/guard", async () => {
  const real = await vi.importActual<typeof import("@/lib/asistencia/guard")>("@/lib/asistencia/guard");
  return { ...real, requireAsistencia: () => ({ role: "admin", userName: "yulissa" }) };
});

// 🔴 24-sep-2026: la ruta también sabe de la ENTRADA AUTORIZADA, por su propio
// I/O. Aquí no hay ninguna: se contesta «no hay» y las escrituras se anotan.
vi.mock("@/lib/asistencia/entrada-autorizada-server", () => ({
  leerEntradaVivaDelDia: async () => ({ entrada: null, faltaMigracion: false }),
  crearEntradaAutorizada: async (e: unknown) => {
    escrituras.push({ op: "crear-entrada", payload: e });
    return { ok: true as const, id: `entrada-${escrituras.length}` };
  },
  anularEntradaAutorizada: async (id: string, quien: string) => {
    escrituras.push({ op: "anular-entrada", payload: { id, quien } });
    return { ok: true as const, id };
  },
}));

vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerMarcacion: async (id: string) => marcaciones[id] ?? null,
  crearCorreccion: async (c: unknown) => {
    escrituras.push({ op: "crear", payload: c });
    return { ok: true as const, id: `nueva-${escrituras.length}` };
  },
  anularCorreccion: async (id: string, quien: string) => {
    escrituras.push({ op: "anular", payload: { id, quien } });
    return { ok: true as const, id };
  },
}));

async function postDia(body: unknown) {
  const { POST } = await import("@/app/api/asistencia/correcciones/dia/route");
  const req = {
    json: async () => body,
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as Parameters<typeof POST>[0];
  const res = await POST(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("D · el servidor valida todo antes de escribir nada", () => {
  beforeEach(() => { escrituras.length = 0; });

  it("sin motivo: 400 y CERO escrituras", async () => {
    const r = await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "  ",
      cambios: [{ clave: "m0", tipo: "corregir", marcacionId: "m1", hora: "08:00:00" }],
    });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("una sola hora mala tumba el pedido ENTERO, sin escribir la buena", async () => {
    const r = await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "olvidó marcar",
      cambios: [
        { clave: "m0", tipo: "corregir", marcacionId: "m1", hora: "08:00:00" },
        { clave: "m1", tipo: "corregir", marcacionId: "m2", hora: "no es una hora" },
      ],
    });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("quitar sin marcación se rechaza: solo se quita lo que el reloj registró", async () => {
    const r = await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "marca de más",
      cambios: [{ clave: "v1", tipo: "quitar", marcacionId: null, hora: null }],
    });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("la misma marcación dos veces se rechaza: el único parcial no admite dos vivas", async () => {
    const r = await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "doble",
      cambios: [
        { clave: "m0", tipo: "corregir", marcacionId: "m1", hora: "08:00:00" },
        { clave: "m9", tipo: "corregir", marcacionId: "m1", hora: "08:30:00" },
      ],
    });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("un cuerpo sin cambios no escribe nada", async () => {
    const r = await postDia({ codigo: "16", fecha: "2026-09-01", motivo: "x", cambios: [] });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("🔴 el día y la persona salen de la MARCACIÓN, nunca del navegador", async () => {
    const r = await postDia({
      // El navegador miente: otra persona y otro día (otra quincena).
      codigo: "999", fecha: "2026-08-15", motivo: "olvidó marcar",
      cambios: [{ clave: "m0", tipo: "corregir", marcacionId: "m1", hora: "08:00:00" }],
    });
    expect(r.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].payload).toMatchObject({
      empleadoCodigo: "16",
      fecha: "2026-09-01",
      hora: "08:00:00",
      motivo: "olvidó marcar",
      creadaPor: "yulissa",
    });
  });

  it("🔴 reemplazar ANULA primero y escribe después — en ese orden", async () => {
    const r = await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "el reloj se adelantó",
      cambios: [{ clave: "m0", tipo: "corregir", marcacionId: "m1", reemplaza: "cVieja", hora: "08:00:00" }],
    });
    expect(r.status).toBe(200);
    expect(escrituras.map((e) => e.op)).toEqual(["anular", "crear"]);
    expect(escrituras[0].payload).toEqual({ id: "cVieja", quien: "yulissa" });
  });

  it("quitar viaja con `quita: true` y SIN hora; corregir no manda la columna", async () => {
    await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "marca de más",
      cambios: [
        { clave: "m0", tipo: "corregir", marcacionId: "m1", hora: "08:00:00" },
        { clave: "m1", tipo: "quitar", marcacionId: "m2", hora: null },
      ],
    });
    const [corregir, quitar] = escrituras.map((e) => e.payload as Record<string, unknown>);
    expect(corregir.quita).toBeUndefined();
    expect(quitar).toMatchObject({ marcacionId: "m2", hora: null, quita: true });
  });

  it("agregar una marca que el reloj no registró usa el código y el día del cuerpo", async () => {
    await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "olvidó marcar",
      cambios: [{ clave: "v3", tipo: "agregar", marcacionId: null, hora: "17:00:00" }],
    });
    expect(escrituras[0].payload).toMatchObject({
      marcacionId: null, empleadoCodigo: "16", fecha: "2026-09-01", hora: "17:00:00",
    });
  });

  it("UN solo motivo para todo el día: las cuatro correcciones llevan el mismo", async () => {
    await postDia({
      codigo: "16", fecha: "2026-09-01", motivo: "se fue de comisión",
      cambios: [
        { clave: "m0", tipo: "corregir", marcacionId: "m1", hora: "08:00:00" },
        { clave: "m1", tipo: "corregir", marcacionId: "m2", hora: "17:00:00" },
        { clave: "v1", tipo: "agregar", marcacionId: null, hora: "12:00:00" },
      ],
    });
    const motivos = escrituras.map((e) => (e.payload as { motivo?: string }).motivo);
    expect(new Set(motivos)).toEqual(new Set(["se fue de comisión"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LA MARCACIÓN DEL RELOJ NO SE EDITA NI SE BORRA — barrido sobre lo nuevo
// ─────────────────────────────────────────────────────────────────────────────

describe("E · la ruta nueva no toca la tabla del reloj", () => {
  const RUTA = "src/app/api/asistencia/correcciones/dia/route.ts";
  const MODULO = "src/lib/asistencia/editar-el-dia.ts";

  it("los dos archivos existen (si no, este bloque no miró nada)", () => {
    expect(fs.existsSync(path.join(RAIZ, RUTA))).toBe(true);
    expect(fs.existsSync(path.join(RAIZ, MODULO))).toBe(true);
  });

  it("ni un .update(), .delete() o .upsert() sobre asistencia_marcaciones", () => {
    for (const f of [RUTA, MODULO]) {
      const texto = fs.readFileSync(path.join(RAIZ, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      for (const prohibido of [".update(", ".delete(", ".upsert(", "supabaseServer"]) {
        expect(texto.includes(prohibido), `${f} → ${prohibido}`).toBe(false);
      }
      expect(texto.includes("asistencia_marcaciones"), `${f} nombra la tabla del reloj`).toBe(false);
    }
  });

  it("el módulo puro no escribe: no importa la base ni hace fetch", () => {
    // ⚠️ Sin comentarios: un candado que se cumple a sí mismo desde su propia
    // cabecera («sin `new Date()`») no está mirando el código.
    const texto = fs.readFileSync(path.join(RAIZ, MODULO), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(texto).not.toContain("supabase");
    expect(texto).not.toContain("fetch(");
    expect(texto).not.toContain("new Date(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. CONTROL — el interruptor y la ventana de antes siguen existiendo
// ─────────────────────────────────────────────────────────────────────────────

describe("F · control", () => {
  it("el interruptor existe y hoy está PRENDIDO", () => {
    expect(EDITAR_EL_DIA).toBe(true);
  });

  it("apagado, el Reporte sigue teniendo la ventana de antes", () => {
    const reporte = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/ReporteTab.tsx"), "utf8");
    expect(reporte).toContain("CorregirMarcacionModal");
    expect(reporte).toContain("EDITAR_EL_DIA");
    expect(fs.existsSync(path.join(RAIZ, "src/app/asistencia/CorregirMarcacionModal.tsx"))).toBe(true);
  });

  it("«Deshacer» sigue existiendo para lo ya guardado", () => {
    const reporte = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/ReporteTab.tsx"), "utf8");
    expect(reporte).toContain("deshacerCorreccion");
    expect(reporte).toContain('method: "DELETE"');
  });
});

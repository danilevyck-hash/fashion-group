/* ─────────────────────────────────────────────────────────────────────────────
 * CORREGIR UNA MARCACIÓN SIN TOCAR LA MARCACIÓN — los candados.
 *
 * 🔴 EL CANDADO PRINCIPAL ES EL PRIMER BLOQUE: ningún camino de la app puede
 * hacer UPDATE ni DELETE sobre `asistencia_marcaciones`. Es un BARRIDO ESTÁTICO
 * sobre todo `src/` (sin listas de archivos que se puedan quedar viejas) más un
 * test de CONDUCTA que ejecuta la ruta de verdad y mira qué se escribió.
 *
 * ⚠️ El barrido BORRA LOS COMENTARIOS primero. Un candado que se cumple a sí
 * mismo con su propia explicación es peor que no tener candado: da permiso para
 * romper. (Este repo ya se quemó con eso — ver la nota de `revalidateOnFocus`
 * en CLAUDE.md.)
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  aplicarCorrecciones,
  contarCorrecciones,
  fechaValida,
  horaPanamaConSegundos,
  instantePanama,
  llaveDia,
  motivoValido,
  normalizarHora,
  normalizarMotivo,
  type Correccion,
} from "@/lib/asistencia/correcciones";
import { armarReporte, diaPanama, type Marcacion } from "@/lib/asistencia/reporte";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 1. LA MARCACIÓN DEL RELOJ NO SE EDITA NI SE BORRA — barrido estático
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = path.join(process.cwd(), "src");
const TABLA = "asistencia_marcaciones";

function archivosTs(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Los tests hablan DE la regla; no son un camino de la app.
      if (e.name === "__tests__") continue;
      archivosTs(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** El código SIN comentarios. Ver la nota del encabezado. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("🔴 ningún camino de la app edita ni borra la marcación del reloj", () => {
  const archivos = archivosTs(RAIZ);

  it("el barrido encuentra archivos y encuentra la tabla (si no, no miró nada)", () => {
    expect(archivos.length).toBeGreaterThan(200);
    const conTabla = archivos.filter((f) => sinComentarios(fs.readFileSync(f, "utf8")).includes(TABLA));
    // Hoy son 6 rutas/librerías que la LEEN. El número no importa; que haya
    // alguna, sí: un parser roto devolvería 0 y todo pasaría en verde.
    expect(conTabla.length).toBeGreaterThan(0);
  });

  it("ni un .update(), .delete() o .upsert() encadenado a asistencia_marcaciones", () => {
    const culpables: string[] = [];
    for (const f of archivos) {
      const codigo = sinComentarios(fs.readFileSync(f, "utf8"));
      if (!codigo.includes(TABLA)) continue;
      // Se mira la CADENA que arranca en `.from("asistencia_marcaciones")`: lo
      // que venga después, hasta el final de la sentencia, es lo que se le hace.
      const re = new RegExp(`\\.from\\(\\s*["'\`]${TABLA}["'\`]\\s*\\)([\\s\\S]{0,600})`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(codigo))) {
        // Hasta el `;` que cierra la sentencia (o 600 caracteres).
        const cadena = m[1].split(";")[0];
        for (const prohibido of [".update(", ".delete(", ".upsert("]) {
          // ⚠️ `.upsert(… ignoreDuplicates: true)` del INGEST es la única forma
          // de upsert admitida: NUNCA pisa una fila, la ignora. Es lo que hace
          // idempotente el repaso nocturno del reloj.
          if (!cadena.includes(prohibido)) continue;
          if (prohibido === ".upsert(" && /ignoreDuplicates\s*:\s*true/.test(cadena)) continue;
          culpables.push(`${path.relative(RAIZ, f)} → ${prohibido}`);
        }
      }
    }
    expect(culpables).toEqual([]);
  });

  it("la migración de las correcciones ata la llave con RESTRICT, no con CASCADE", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260813150000_asistencia_correcciones.sql"),
      "utf8",
    );
    expect(sql).toMatch(/REFERENCES\s+asistencia_marcaciones\(id\)\s+ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
    // El motivo obligatorio de verdad: NOT NULL deja pasar "" y "   ".
    expect(sql).toMatch(/motivo\s+text NOT NULL CHECK \(btrim\(motivo\) <> ''\)/);
    // La firma, también obligatoria: sin ella "todos pueden" es "nadie sabe".
    expect(sql).toMatch(/creada_por\s+text NOT NULL CHECK \(btrim\(creada_por\) <> ''\)/);
    // Deshacer no borra: hay columnas de anulación y ningún DELETE.
    expect(sql).toContain("anulada_en");
    expect(sql).not.toMatch(/DELETE FROM asistencia_correcciones/i);
  });

  it("ninguna migración intenta borrar o vaciar asistencia_marcaciones", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const malas: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/--.*$/gm, "");
      // ⚠️ La tabla tiene que venir JUSTO detrás de la orden. Con un comodín
      // en el medio, un `DELETE FROM asistencia_dispositivos … WHERE NOT EXISTS
      // (SELECT 1 FROM asistencia_marcaciones …)` —que existe y es legítimo—
      // daba falso positivo: un candado que grita por lo que no es, se apaga.
      const re = new RegExp(
        `(DROP TABLE|TRUNCATE|DELETE FROM)\\s+(IF EXISTS\\s+)?(ONLY\\s+)?${TABLA}\\b`,
        "i",
      );
      if (re.test(sql)) malas.push(f);
    }
    expect(malas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EL MOTIVO ES OBLIGATORIO
// ─────────────────────────────────────────────────────────────────────────────

describe("el motivo es obligatorio", () => {
  it("vacío no sirve", () => {
    expect(motivoValido("")).toBe(false);
  });
  it("solo espacios TAMPOCO sirve — es lo que teclea quien quiere saltarse el campo", () => {
    expect(motivoValido("   ")).toBe(false);
    expect(motivoValido("\t\n  ")).toBe(false);
  });
  it("null, undefined y un número no sirven", () => {
    expect(motivoValido(null)).toBe(false);
    expect(motivoValido(undefined)).toBe(false);
    expect(motivoValido(7)).toBe(false);
  });
  it("un texto de verdad sí", () => {
    expect(motivoValido("se le dañó el carro, avisó")).toBe(true);
  });
  it("se guarda sin espacios de sobra y acotado", () => {
    expect(normalizarMotivo("  se le dañó el carro  ")).toBe("se le dañó el carro");
    expect(normalizarMotivo("x".repeat(500)).length).toBe(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LA HORA Y LA FECHA
// ─────────────────────────────────────────────────────────────────────────────

describe("la hora se entiende como la escribe una persona", () => {
  it("8:00 · 08:00 · 8:00:00 son la misma", () => {
    expect(normalizarHora("8:00")).toBe("08:00:00");
    expect(normalizarHora("08:00")).toBe("08:00:00");
    expect(normalizarHora("8:00:00")).toBe("08:00:00");
  });
  it("conserva los SEGUNDOS: el módulo mide al segundo desde el 13-ago-2026", () => {
    expect(normalizarHora("17:04:30")).toBe("17:04:30");
  });
  it("lo que no es una hora del día se rechaza", () => {
    for (const mala of ["", "  ", "25:00", "8:60", "8:00:60", "ocho", "8", "8:0", "-1:00"]) {
      expect(normalizarHora(mala)).toBeNull();
    }
  });
  it("una fecha que no existe se rechaza", () => {
    expect(fechaValida("2026-08-07")).toBe(true);
    expect(fechaValida("2026-02-31")).toBe(false);
    expect(fechaValida("2026-13-01")).toBe(false);
    expect(fechaValida("7-8-2026")).toBe(false);
  });
});

describe("Panamá es UTC−5 fijo, y el ida y vuelta es exacto", () => {
  it("08:00 de Panamá vuelve como 08:00", () => {
    const iso = instantePanama("2026-08-07", "08:00:00");
    expect(iso).toBe("2026-08-07T13:00:00.000Z");
    expect(horaPanamaConSegundos(iso)).toBe("08:00:00");
    expect(diaPanama(iso)).toBe("2026-08-07");
  });
  it("las 23:59 de Panamá siguen siendo del mismo día, no del siguiente", () => {
    const iso = instantePanama("2026-08-07", "23:59:59");
    expect(diaPanama(iso)).toBe("2026-08-07");
    expect(horaPanamaConSegundos(iso)).toBe("23:59:59");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. APLICAR — la corrección manda, y la marcación no se toca
// ─────────────────────────────────────────────────────────────────────────────

const CORR = (p: Partial<Correccion>): Correccion => ({
  id: "c1",
  marcacionId: null,
  empleadoCodigo: "26",
  fecha: "2026-08-07",
  hora: "08:00:00",
  motivo: "se le dañó el carro, avisó",
  creadaPor: "Daniel",
  creadaEn: "2026-08-13T18:00:00.000Z",
  ...p,
});

const M = (id: string, hora: string, codigo = "26"): Marcacion & { id: string } => ({
  id,
  empleado_codigo: codigo,
  empleado_nombre: null,
  ocurrio_en: instantePanama("2026-08-07", hora),
});

describe("aplicar correcciones", () => {
  it("pisa la hora de la marcación corregida y deja las demás intactas", () => {
    const marcaciones = [M("m1", "08:47:12"), M("m2", "12:00:00")];
    const { marcaciones: efectivas } = aplicarCorrecciones(marcaciones, [
      CORR({ marcacionId: "m1", hora: "08:00:00" }),
    ]);
    expect(horaPanamaConSegundos(efectivas[0].ocurrio_en)).toBe("08:00:00");
    expect(horaPanamaConSegundos(efectivas[1].ocurrio_en)).toBe("12:00:00");
  });

  it("🔴 NO MUTA la marcación que recibe: la fila original queda como estaba", () => {
    const original = M("m1", "08:47:12");
    const antes = original.ocurrio_en;
    aplicarCorrecciones([original], [CORR({ marcacionId: "m1", hora: "08:00:00" })]);
    expect(original.ocurrio_en).toBe(antes);
  });

  it("guarda la hora del RELOJ al lado, para poder mostrar las dos", () => {
    const { porDia } = aplicarCorrecciones(
      [M("m1", "08:47:12")],
      [CORR({ marcacionId: "m1", hora: "08:00:00" })],
    );
    const v = porDia.get(llaveDia("26", "2026-08-07"))!;
    expect(v).toHaveLength(1);
    expect(v[0].relojHora).toBe("08:47:12");
    expect(v[0].hora).toBe("08:00:00");
    expect(v[0].agregada).toBe(false);
    expect(v[0].motivo).toBe("se le dañó el carro, avisó");
    expect(v[0].creadaPor).toBe("Daniel");
  });

  it("AGREGA la marcación que el reloj nunca registró, y la marca como agregada", () => {
    const { marcaciones: efectivas, porDia } = aplicarCorrecciones(
      [M("m1", "08:00:00")],
      [CORR({ id: "c9", marcacionId: null, hora: "17:00:00" })],
    );
    expect(efectivas).toHaveLength(2);
    const agregada = efectivas.find((m) => !m.id)!;
    expect(horaPanamaConSegundos(agregada.ocurrio_en)).toBe("17:00:00");
    expect(agregada.empleado_codigo).toBe("26");
    const v = porDia.get(llaveDia("26", "2026-08-07"))!;
    expect(v.find((x) => x.id === "c9")!.agregada).toBe(true);
    expect(v.find((x) => x.id === "c9")!.relojHora).toBeNull();
  });

  it("🔴 una corrección NO puede mover una marcación a otro día", () => {
    // La corrección dice otra fecha (dato viejo o manipulado). El día tiene que
    // salir de la MARCACIÓN: mover horas de día es mover plata de quincena.
    const { marcaciones: efectivas, porDia } = aplicarCorrecciones(
      [M("m1", "08:47:12")],
      [CORR({ marcacionId: "m1", fecha: "2026-09-30", hora: "08:00:00" })],
    );
    expect(diaPanama(efectivas[0].ocurrio_en)).toBe("2026-08-07");
    expect(porDia.has(llaveDia("26", "2026-09-30"))).toBe(false);
    expect(porDia.has(llaveDia("26", "2026-08-07"))).toBe(true);
  });

  it("una corrección de una marcación que no está en el rango se ignora", () => {
    const { marcaciones: efectivas, porDia } = aplicarCorrecciones(
      [M("m1", "08:00:00")],
      [CORR({ marcacionId: "otra-que-no-esta", hora: "09:00:00" })],
    );
    expect(efectivas).toHaveLength(1);
    expect(horaPanamaConSegundos(efectivas[0].ocurrio_en)).toBe("08:00:00");
    expect(porDia.size).toBe(0);
  });

  it("sin correcciones no toca NADA: la lista sale igual", () => {
    const marcaciones = [M("m1", "08:00:00"), M("m2", "17:00:00")];
    const { marcaciones: efectivas, porDia } = aplicarCorrecciones(marcaciones, []);
    expect(efectivas).toEqual(marcaciones);
    expect(porDia.size).toBe(0);
  });

  it("cuenta lo que hay para el aviso de arriba de la tabla", () => {
    const { porDia } = aplicarCorrecciones(
      [M("m1", "08:47:12"), M("m2", "12:00:00", "8")],
      [
        CORR({ id: "a", marcacionId: "m1", hora: "08:00:00" }),
        CORR({ id: "b", marcacionId: null, hora: "17:00:00" }),
        CORR({ id: "c", marcacionId: null, empleadoCodigo: "8", hora: "17:30:00" }),
      ],
    );
    expect(contarCorrecciones(porDia)).toEqual({ correcciones: 3, dias: 2, agregadas: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 5. EL CANDADO DE LA PLATA — la corrección cambia el pago, y SOLO el suyo
// ─────────────────────────────────────────────────────────────────────────────

const HORARIOS = [
  { empleado_codigo: "26", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
  { empleado_codigo: "8", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
];

function reporteDe(marcaciones: Marcacion[], correcciones: Correccion[] = []) {
  const efectivas = aplicarCorrecciones(marcaciones, correcciones);
  return armarReporte({
    marcaciones: efectivas.marcaciones,
    horarios: HORARIOS,
    justificaciones: [],
    feriados: new Map(),
    desde: "2026-08-07",
    hasta: "2026-08-07",
    correccionesPorDia: efectivas.porDia,
  });
}

/** Andrea llegó 8:47:12 (tarde) y se fue 17:00. Otra persona, día normal. */
const DIA_DE_DOS_PERSONAS = () => [
  M("m1", "08:47:12"), M("m2", "12:00:00"), M("m3", "12:30:00"), M("m4", "17:00:00"),
  M("o1", "08:00:00", "8"), M("o2", "12:00:00", "8"), M("o3", "12:30:00", "8"), M("o4", "17:00:00", "8"),
];

describe("🔴 la corrección llega al pago, y solo al de esa persona", () => {
  it("sin corrección: Andrea llega tarde 47,2 minutos", () => {
    const [a] = reporteDe(DIA_DE_DOS_PERSONAS()).filter((p) => p.codigo === "26");
    expect(a.resumen.minutosTarde).toBeCloseTo(47.2, 4);
  });

  it("con la corrección a las 8:00, la tardanza desaparece", () => {
    const r = reporteDe(DIA_DE_DOS_PERSONAS(), [CORR({ marcacionId: "m1", hora: "08:00:00" })]);
    const a = r.find((p) => p.codigo === "26")!;
    expect(a.resumen.minutosTarde).toBe(0);
    expect(a.resumen.tiempoNoTrabajadoMin).toBe(0);
  });

  it("🔴 y NO le toca un minuto a NADIE MÁS", () => {
    const sin = reporteDe(DIA_DE_DOS_PERSONAS()).find((p) => p.codigo === "8")!;
    const con = reporteDe(DIA_DE_DOS_PERSONAS(), [
      CORR({ marcacionId: "m1", hora: "08:00:00" }),
    ]).find((p) => p.codigo === "8")!;
    expect(con.resumen).toEqual(sin.resumen);
    expect(con.dias).toEqual(sin.dias);
  });

  it("🔴 DESHACERLA devuelve el número original, al segundo", () => {
    // Deshacer = la corrección deja de estar viva, o sea no llega hasta acá.
    const antes = reporteDe(DIA_DE_DOS_PERSONAS()).find((p) => p.codigo === "26")!;
    const corregido = reporteDe(DIA_DE_DOS_PERSONAS(), [
      CORR({ marcacionId: "m1", hora: "08:00:00" }),
    ]).find((p) => p.codigo === "26")!;
    const deshecho = reporteDe(DIA_DE_DOS_PERSONAS(), []).find((p) => p.codigo === "26")!;

    expect(corregido.resumen.minutosTarde).not.toBe(antes.resumen.minutosTarde);
    expect(deshecho.resumen).toEqual(antes.resumen);
    expect(deshecho.dias).toEqual(antes.dias);
  });

  it("agregar la salida que faltaba deja de contar el día como incompleto", () => {
    // Un día con 3 marcas: el más común de los mal marcados (97 en producción).
    const tres = [M("m1", "08:00:00"), M("m2", "12:00:00"), M("m3", "12:30:00")];
    const sin = reporteDe(tres).find((p) => p.codigo === "26")!;
    expect(sin.dias[0].revisar).toBe(true);
    expect(sin.dias[0].marcas).toHaveLength(3);

    const con = reporteDe(tres, [CORR({ marcacionId: null, hora: "17:00:00" })])
      .find((p) => p.codigo === "26")!;
    expect(con.dias[0].revisar).toBe(false);
    expect(con.dias[0].marcas).toHaveLength(4);
    expect(con.dias[0].salida).toBe("17:00:00");
    // Y la marca agregada no tiene id de reloj: es lo que la distingue.
    expect(con.dias[0].marcasIds[3]).toBeNull();
    expect(con.dias[0].marcasIds[0]).toBe("m1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 6. SIN CORRECCIÓN NO SE MUEVE NINGÚN NÚMERO
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 sin corrección, el motor da exactamente lo de siempre", () => {
  it("el mapa de correcciones NO entra en ninguna cuenta", () => {
    // Se le pasa un mapa LLENO de correcciones sobre marcaciones que ya vienen
    // aplicadas. Si el motor usara el mapa para calcular algo, este test se
    // caería: la única diferencia admitida está en los campos informativos.
    const marcaciones = DIA_DE_DOS_PERSONAS();
    const conMapa = armarReporte({
      marcaciones,
      horarios: HORARIOS,
      justificaciones: [],
      feriados: new Map(),
      desde: "2026-08-07",
      hasta: "2026-08-07",
      correccionesPorDia: new Map([
        [llaveDia("26", "2026-08-07"), [
          { id: "x", hora: "08:47:12", relojHora: "09:99:99", agregada: false,
            motivo: "m", creadaPor: "q", creadaEn: "2026-08-13T00:00:00Z" },
        ]],
      ]),
    });
    const sinMapa = armarReporte({
      marcaciones,
      horarios: HORARIOS,
      justificaciones: [],
      feriados: new Map(),
      desde: "2026-08-07",
      hasta: "2026-08-07",
    });

    for (let i = 0; i < sinMapa.length; i++) {
      const a = { ...conMapa[i].resumen } as Record<string, unknown>;
      const b = { ...sinMapa[i].resumen } as Record<string, unknown>;
      delete a.diasCorregidos; delete a.correcciones;
      delete b.diasCorregidos; delete b.correcciones;
      expect(a).toEqual(b);
      for (let d = 0; d < sinMapa[i].dias.length; d++) {
        const { correcciones: _c1, ...dA } = conMapa[i].dias[d];
        const { correcciones: _c2, ...dB } = sinMapa[i].dias[d];
        expect(dA).toEqual(dB);
      }
    }
  });

  it("el resumen cuenta los días corregidos", () => {
    const r = reporteDe(DIA_DE_DOS_PERSONAS(), [CORR({ marcacionId: "m1", hora: "08:00:00" })]);
    expect(r.find((p) => p.codigo === "26")!.resumen.diasCorregidos).toBe(1);
    expect(r.find((p) => p.codigo === "26")!.resumen.correcciones).toBe(1);
    expect(r.find((p) => p.codigo === "8")!.resumen.diasCorregidos).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 7. LA RUTA — conducta, con supabase mockeado. Qué se escribe DE VERDAD.
// ─────────────────────────────────────────────────────────────────────────────

const escrituras: Array<{ tabla: string; op: string; payload: unknown }> = [];

vi.mock("@/lib/supabase-server", () => {
  const cadena = (tabla: string) => {
    const api: Record<string, unknown> = {};
    const devolver = () => api;
    for (const m of ["select", "eq", "is", "order", "range", "gte", "lte"]) api[m] = devolver;
    api.insert = (payload: unknown) => {
      escrituras.push({ tabla, op: "insert", payload });
      return api;
    };
    api.update = (payload: unknown) => {
      escrituras.push({ tabla, op: "update", payload });
      return api;
    };
    api.delete = () => {
      escrituras.push({ tabla, op: "delete", payload: null });
      return api;
    };
    api.upsert = (payload: unknown) => {
      escrituras.push({ tabla, op: "upsert", payload });
      return api;
    };
    api.single = async () => ({ data: { id: "nueva" }, error: null });
    api.maybeSingle = async () => ({
      data:
        tabla === "asistencia_marcaciones"
          ? { id: "m1", empleado_codigo: "26", ocurrio_en: instantePanama("2026-08-07", "08:47:12") }
          : { id: "c1" },
      error: null,
    });
    return api;
  };
  return { supabaseServer: { from: (t: string) => cadena(t) } };
});

vi.mock("@/lib/requireRole", async () => {
  const real = await vi.importActual<typeof import("@/lib/requireRole")>("@/lib/requireRole");
  return {
    ...real,
    requireRole: () => ({ role: "contabilidad", userId: "u1", userName: "Angela", sessionToken: "t" }),
  };
});

async function pedir(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/asistencia/correcciones/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://x/api/asistencia/correcciones", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

describe("🔴 la ruta de correcciones — conducta", () => {
  beforeEach(() => { escrituras.length = 0; });
  afterEach(() => { vi.clearAllMocks(); });

  it("sin motivo NO guarda nada", async () => {
    const r = await pedir({ marcacionId: "m1", hora: "08:00", motivo: "" });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("con el motivo en espacios TAMPOCO guarda nada", async () => {
    const r = await pedir({ marcacionId: "m1", hora: "08:00", motivo: "    " });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("con hora inválida no guarda nada", async () => {
    const r = await pedir({ marcacionId: "m1", hora: "25:00", motivo: "algo" });
    expect(r.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("🔴 al guardar NO se toca asistencia_marcaciones: solo se INSERTA la corrección", async () => {
    const r = await pedir({ marcacionId: "m1", hora: "8:00", motivo: "se le dañó el carro" });
    expect(r.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].tabla).toBe("asistencia_correcciones");
    expect(escrituras[0].op).toBe("insert");
    // Ni un update/delete/upsert sobre la tabla del reloj, pase lo que pase.
    expect(escrituras.filter((e) => e.tabla === "asistencia_marcaciones")).toEqual([]);
  });

  it("🔴 la FIRMA no se puede omitir: sale de la sesión, no del cuerpo", async () => {
    await pedir({ marcacionId: "m1", hora: "8:00", motivo: "x", creadaPor: "Otro" });
    const p = escrituras[0].payload as Record<string, unknown>;
    expect(p.creada_por).toBe("Angela");
  });

  it("🔴 el día y la persona salen de la MARCACIÓN, no del cuerpo", async () => {
    await pedir({
      marcacionId: "m1", hora: "8:00", motivo: "x",
      codigo: "999", fecha: "2026-12-25",
    });
    const p = escrituras[0].payload as Record<string, unknown>;
    expect(p.empleado_codigo).toBe("26");
    expect(p.fecha).toBe("2026-08-07");
  });

  it("agregar una marcación sí toma persona y fecha del cuerpo, y las valida", async () => {
    await pedir({ codigo: "26", fecha: "2026-08-07", hora: "17:00", motivo: "olvidó marcar" });
    const p = escrituras[0].payload as Record<string, unknown>;
    expect(p.marcacion_id).toBeNull();
    expect(p.empleado_codigo).toBe("26");
    expect(p.fecha).toBe("2026-08-07");
    expect(p.hora).toBe("17:00:00");

    escrituras.length = 0;
    const mala = await pedir({ codigo: "26", fecha: "2026-02-31", hora: "17:00", motivo: "x" });
    expect(mala.status).toBe(400);
    expect(escrituras).toEqual([]);
  });

  it("🔴 DESHACER anula, NO borra — y deja la firma de quién lo hizo", async () => {
    const { DELETE } = await import("@/app/api/asistencia/correcciones/route");
    const { NextRequest } = await import("next/server");
    escrituras.length = 0;
    const res = await DELETE(new NextRequest("http://x/api/asistencia/correcciones?id=c1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].tabla).toBe("asistencia_correcciones");
    expect(escrituras[0].op).toBe("update");
    const p = escrituras[0].payload as Record<string, unknown>;
    expect(p.anulada_por).toBe("Angela");
    expect(typeof p.anulada_en).toBe("string");
    // No se toca ni la hora ni el motivo: el rastro de la corrección queda.
    expect(p).not.toHaveProperty("hora");
    expect(p).not.toHaveProperty("motivo");
    expect(escrituras.filter((e) => e.op === "delete")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. QUIÉN PUEDE — todos los roles de Asistencia, y siempre queda la firma
// ─────────────────────────────────────────────────────────────────────────────

describe("quién puede corregir", () => {
  it("la ruta usa la MISMA lista de roles que el resto de Asistencia", () => {
    const src = fs.readFileSync(
      path.join(RAIZ, "app/api/asistencia/correcciones/route.ts"),
      "utf8",
    );
    const codigo = sinComentarios(src);
    expect(codigo).toContain("asistenciaRoles()");
    // Nada de una lista escrita a mano: es la forma del bug que este repo ya
    // pagó (los roles de Asistencia repetidos en siete archivos).
    expect(codigo).not.toMatch(/\[\s*["']admin["']\s*,/);
  });

  it("las tres rutas de correcciones exigen sesión", () => {
    const codigo = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "app/api/asistencia/correcciones/route.ts"), "utf8"),
    );
    expect((codigo.match(/requireRole\(req, asistenciaRoles\(\)\)/g) ?? []).length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 9. LA CORRECCIÓN LLEGA AL PAGO — el barrido que lo exige
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la planilla y el reporte aplican las correcciones", () => {
  for (const ruta of ["app/api/asistencia/planilla/route.ts", "app/api/asistencia/reporte/route.ts"]) {
    it(`${ruta} lee las correcciones y las aplica antes de calcular`, () => {
      const codigo = sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));
      expect(codigo).toContain("leerCorrecciones(");
      expect(codigo).toContain("aplicarCorrecciones(");
      // Y lo que entra al motor son las EFECTIVAS, no la lista cruda: si se le
      // pasara `marcaciones`, corregir una hora no cambiaría un centavo.
      expect(codigo).toMatch(/marcaciones:\s*(efectivas\.marcaciones|visibles)/);
      // El `id` tiene que venir en el select, o ninguna corrección se ata.
      expect(codigo).toMatch(/"id, empleado_codigo, empleado_nombre, ocurrio_en"/);
    });
  }
});

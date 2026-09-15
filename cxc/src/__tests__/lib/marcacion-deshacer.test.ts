/**
 * DESHACER LA ÚLTIMA MARCA — DOS MINUTOS (14-sep-2026).
 *
 * Daniel probó el reloj del teléfono y marcó la SALIDA cinco minutos después de
 * la entrada, por error de dedo. Eligió DOS minutos sobre diez y sobre «hasta
 * la siguiente marca»: con una ventana larga alguien podría borrar su entrada a
 * media tarde y volver a marcarla a otra hora, y eso ya no es deshacer un error
 * sino cambiar su hora de llegada.
 *
 * 🔴 LO QUE ESTE CANDADO PROTEGE:
 *   A. a los 2 minutos ya no se puede;
 *   B. deshacer NO toca la marcación: la quita con una corrección ENCIMA;
 *   C. solo alcanza a la ÚLTIMA, y solo si salió del teléfono;
 *   D. nadie deshace la de otra persona — el código sale de la sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  MOTIVO_DESHACER,
  VENTANA_DESHACER_MS,
  cuentaRegresiva,
  dentroDeLaVentana,
  queSeDeshace,
  queSePuedeDeshacer,
  restanMs,
  rotuloDeshacer,
  type MarcaGuardada,
} from "@/lib/marcacion/deshacer";
import { aplicarCorrecciones, type Correccion } from "@/lib/asistencia/correcciones";

const RAIZ = path.join(process.cwd(), "src");
const AHORA = "2026-09-15T23:06:00.000Z";
const hace = (segundos: number) => new Date(Date.parse(AHORA) - segundos * 1000).toISOString();

const TELEFONO = (id: string, ocurrioEn: string): MarcaGuardada => ({
  id, ocurrioEn, dispositivo: "telefono",
});
const RELOJ = (id: string, ocurrioEn: string): MarcaGuardada => ({
  id, ocurrioEn, dispositivo: "reloj cboston",
});

// ─────────────────────────────────────────────────────────────────────────────
// A. DOS MINUTOS
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 A. la ventana son DOS minutos", () => {
  it("dos minutos y no diez", () => {
    expect(VENTANA_DESHACER_MS).toBe(2 * 60_000);
  });

  it("al minuto y medio se puede; a los dos minutos y un segundo, no", () => {
    expect(dentroDeLaVentana(hace(90), AHORA)).toBe(true);
    expect(dentroDeLaVentana(hace(119), AHORA)).toBe(true);
    expect(dentroDeLaVentana(hace(121), AHORA)).toBe(false);
    expect(dentroDeLaVentana(hace(3600), AHORA)).toBe(false);
  });

  it("el botón dice cuánto le queda", () => {
    expect(cuentaRegresiva(restanMs(hace(13), AHORA))).toBe("1:47");
    expect(cuentaRegresiva(0)).toBe("0:00");
  });

  it("🔑 un reloj adelantado NO estira la ventana más allá de dos minutos", () => {
    // Una marca «del futuro» (el teléfono tres horas adelante) arranca la
    // ventana entera, no tres horas de botón puesto.
    expect(restanMs("2026-09-16T02:06:00.000Z", AHORA)).toBe(VENTANA_DESHACER_MS);
  });

  it("basura no abre ninguna ventana", () => {
    expect(restanMs("no es una fecha", AHORA)).toBe(0);
    expect(dentroDeLaVentana(hace(10), "tampoco")).toBe(false);
  });

  it("el rótulo dice QUÉ se deshace", () => {
    expect(rotuloDeshacer("entrada")).toBe("Deshacer la entrada");
    expect(rotuloDeshacer("salida")).toBe("Deshacer la salida");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. SOLO LA ÚLTIMA, Y SOLO SI SALIÓ DEL TELÉFONO
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 C. qué se puede deshacer", () => {
  it("el caso de Daniel: entrada y salida seguidas, se deshace la SALIDA", () => {
    const r = queSePuedeDeshacer([TELEFONO("m1", hace(300)), TELEFONO("m2", hace(20))], AHORA);
    expect(r).toMatchObject({ id: "m2", tipo: "salida" });
  });

  it("con una sola marca del día, lo que se deshace es la ENTRADA", () => {
    expect(queSePuedeDeshacer([TELEFONO("m1", hace(20))], AHORA)).toMatchObject({
      id: "m1", tipo: "entrada",
    });
  });

  it("🔴 nunca una marca anterior: solo la última", () => {
    // La entrada es de hace 5 minutos: fuera de ventana. La última es la salida.
    const r = queSePuedeDeshacer([TELEFONO("m1", hace(300)), TELEFONO("m2", hace(20))], AHORA);
    expect(r!.id).toBe("m2");
    // Y si la última ya venció, no se ofrece la anterior «por si acaso».
    expect(queSePuedeDeshacer([TELEFONO("m1", hace(600)), TELEFONO("m2", hace(300))], AHORA)).toBeNull();
  });

  it("🔴 el teléfono NO deshace lo que marcó el reloj de la tienda", () => {
    expect(queSePuedeDeshacer([RELOJ("r1", hace(20))], AHORA)).toBeNull();
    // Y con la del reloj última, tampoco alcanza a la del teléfono de antes.
    expect(queSePuedeDeshacer([TELEFONO("m1", hace(40)), RELOJ("r1", hace(20))], AHORA)).toBeNull();
  });

  it("sin marcas no hay nada que deshacer", () => {
    expect(queSePuedeDeshacer([], AHORA)).toBeNull();
  });
});

describe("las dos fuentes de la pantalla: lo guardado y lo que espera señal", () => {
  it("lo que todavía no salió del teléfono también se deshace", () => {
    const r = queSeDeshace({
      servidor: null,
      pendientes: [{ eventoId: "e1", tipo: "salida", horaTelefono: hace(30) }],
      ahoraServidorIso: AHORA,
      ahoraTelefonoIso: AHORA,
    });
    expect(r).toMatchObject({ donde: "telefono", eventoId: "e1", tipo: "salida" });
  });

  it("entre las dos gana la que tiene más ventana por delante — la más nueva", () => {
    const r = queSeDeshace({
      servidor: { ocurrioEn: hace(90), tipo: "entrada" },
      pendientes: [{ eventoId: "e1", tipo: "salida", horaTelefono: hace(10) }],
      ahoraServidorIso: AHORA,
      ahoraTelefonoIso: AHORA,
    });
    expect(r).toMatchObject({ donde: "telefono", eventoId: "e1" });
  });

  it("🔑 cada una se mide con SU reloj: el del teléfono no vence lo guardado", () => {
    // El teléfono está tres horas atrasado. Lo guardado (hace 30 s, reloj del
    // servidor) se sigue pudiendo deshacer; lo pendiente, medido con el reloj
    // del teléfono, también. Mezclarlos daría cualquier cosa.
    const treHorasAntes = new Date(Date.parse(AHORA) - 3 * 3600_000).toISOString();
    const r = queSeDeshace({
      servidor: { ocurrioEn: hace(30), tipo: "salida" },
      pendientes: [],
      ahoraServidorIso: AHORA,
      ahoraTelefonoIso: treHorasAntes,
    });
    expect(r).toMatchObject({ donde: "servidor", tipo: "salida" });
  });

  it("pasados los dos minutos no hay botón", () => {
    expect(
      queSeDeshace({
        servidor: { ocurrioEn: hace(300), tipo: "salida" },
        pendientes: [{ eventoId: "e1", tipo: "entrada", horaTelefono: hace(400) }],
        ahoraServidorIso: AHORA,
        ahoraTelefonoIso: AHORA,
      }),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. DESHACER NO ES BORRAR — el motor
// ─────────────────────────────────────────────────────────────────────────────

const CORR = (x: Partial<Correccion>): Correccion => ({
  id: "c1", marcacionId: "m1", empleadoCodigo: "2", fecha: "2026-09-15",
  hora: "", motivo: MOTIVO_DESHACER, creadaPor: "Ana Trejos",
  creadaEn: "2026-09-15T23:06:00.000Z", ...x,
});

describe("🔴 B. la marcación quitada deja de contar, y NO se borra", () => {
  const marcaciones = [
    { id: "m1", empleado_codigo: "2", empleado_nombre: null, ocurrio_en: "2026-09-15T13:45:00.000Z" },
    { id: "m2", empleado_codigo: "2", empleado_nombre: null, ocurrio_en: "2026-09-15T13:50:00.000Z" },
  ];

  it("la marcación con `quita` NO entra a la lista que va al motor", () => {
    const { marcaciones: efectivas } = aplicarCorrecciones(marcaciones, [
      CORR({ marcacionId: "m2", quita: true }),
    ]);
    expect(efectivas.map((m) => m.id)).toEqual(["m1"]);
  });

  it("pero SE DICE: queda anotada en el día, con su hora y quién la quitó", () => {
    const { porDia } = aplicarCorrecciones(marcaciones, [CORR({ marcacionId: "m2", quita: true })]);
    const [v] = porDia.get("2|2026-09-15")!;
    expect(v.quitada).toBe(true);
    expect(v.hora).toBe("08:50:00");
    expect(v.relojHora).toBe("08:50:00");
    expect(v.creadaPor).toBe("Ana Trejos");
    expect(v.motivo).toBe(MOTIVO_DESHACER);
  });

  it("🔴 el arreglo que entra NO se toca: la fila de la base queda igual", () => {
    const copia = JSON.parse(JSON.stringify(marcaciones));
    aplicarCorrecciones(marcaciones, [CORR({ marcacionId: "m2", quita: true })]);
    expect(marcaciones).toEqual(copia);
  });

  it("CONTROL: sin `quita`, la corrección de hora sigue funcionando igual", () => {
    const { marcaciones: efectivas, porDia } = aplicarCorrecciones(marcaciones, [
      CORR({ marcacionId: "m2", hora: "18:04:00" }),
    ]);
    expect(efectivas.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(porDia.get("2|2026-09-15")![0].quitada).toBe(false);
  });

  it("una corrección con `quita` y sin marcación NO agrega una hora inventada", () => {
    const { marcaciones: efectivas } = aplicarCorrecciones(marcaciones, [
      CORR({ marcacionId: null, quita: true, hora: "" }),
    ]);
    expect(efectivas).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA MIGRACIÓN
// ─────────────────────────────────────────────────────────────────────────────

describe("la migración es aditiva y ata las dos columnas", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261128120000_marcacion_deshacer.sql"),
    "utf8",
  );

  it("agrega `quita` con default y afloja `hora`, sin tocar ninguna fila", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS quita boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/ALTER COLUMN hora DROP NOT NULL/);
    expect(sql).not.toMatch(/\bUPDATE\s+asistencia_correcciones/i);
  });

  it("🔴 no toca `asistencia_marcaciones`: ninguna sentencia la nombra", () => {
    // ⚠️ El COMMENT sí la nombra, y a propósito: explica que esa tabla NO se
    // toca. Lo que se barre son las SENTENCIAS.
    const sinComentarios = sql.replace(/--.*$/gm, "").replace(/COMMENT ON[\s\S]*?;/g, " ");
    expect(sinComentarios).not.toMatch(/asistencia_marcaciones/);
    expect(sql).not.toMatch(/(ALTER TABLE|DROP TABLE|TRUNCATE|DELETE FROM|UPDATE)\s+(IF EXISTS\s+)?(ONLY\s+)?asistencia_marcaciones\b/i);
  });

  it("quitar exige una marcación de verdad y no admite hora", () => {
    expect(sql).toMatch(/quita IS TRUE\s+AND hora IS NULL\s+AND marcacion_id IS NOT NULL/);
    expect(sql).toMatch(/quita IS FALSE AND hora IS NOT NULL/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. LA RUTA — conducta, con la base mockeada
// ─────────────────────────────────────────────────────────────────────────────

let marcasEnLaBase: Array<{ id: string; ocurrio_en: string; dispositivo: string }> = [];
let quitadasEnLaBase: Array<{ marcacion_id: string }> = [];
const escrituras: Array<{ tabla: string; op: string; payload: unknown }> = [];

vi.mock("@/lib/supabase-server", () => {
  const cadena = (tabla: string) => {
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "range", "gte", "lte", "limit"]) {
      api[m] = () => api;
    }
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
    api.single = async () => ({ data: { id: "corr-nueva" }, error: null });
    api.maybeSingle = async () => ({
      data:
        tabla === "fg_users" ? { empleado_codigo: "2" }
        : tabla === "asistencia_personas" ? { nombre: "ANA TREJOS" }
        : null,
      error: null,
    });
    (api as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(
        tabla === "asistencia_marcaciones" ? { data: marcasEnLaBase, error: null }
        : tabla === "asistencia_correcciones" ? { data: quitadasEnLaBase, error: null }
        : { data: [], error: null },
      ).then(ok);
    return api;
  };
  return { supabaseServer: { from: (t: string) => cadena(t) } };
});

vi.mock("@/lib/marcacion/acceso", async () => {
  const real = await vi.importActual<typeof import("@/lib/marcacion/acceso")>("@/lib/marcacion/acceso");
  return {
    ...real,
    requireMarcacion: () => ({
      role: "marcacion", userId: "u1", userName: "Ana Trejos",
      sessionToken: "t", modules: ["marcacion"],
    }),
  };
});

async function deshacer() {
  const { POST } = await import("@/app/api/marcacion/deshacer/route");
  const { NextRequest } = await import("next/server");
  const res = await POST(new NextRequest("http://x/api/marcacion/deshacer", { method: "POST" }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("🔴 D. la ruta de deshacer", () => {
  beforeEach(() => {
    escrituras.length = 0;
    quitadasEnLaBase = [];
    marcasEnLaBase = [
      { id: "m1", ocurrio_en: new Date(Date.now() - 300_000).toISOString(), dispositivo: "telefono" },
      { id: "m2", ocurrio_en: new Date(Date.now() - 20_000).toISOString(), dispositivo: "telefono" },
    ];
  });

  it("quita la última con una corrección firmada, y NO toca la marcación", async () => {
    const r = await deshacer();
    expect(r.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].tabla).toBe("asistencia_correcciones");
    expect(escrituras[0].op).toBe("insert");
    const p = escrituras[0].payload as Record<string, unknown>;
    expect(p.marcacion_id).toBe("m2");
    expect(p.quita).toBe(true);
    expect(p.hora).toBeNull();
    expect(p.motivo).toBe(MOTIVO_DESHACER);
    // 🔴 Queda dicho quién la deshizo: ella misma, con su usuario.
    expect(p.creada_por).toBe("Ana Trejos");
    // Y el código NO viene del teléfono: sale de la sesión → `fg_users`.
    expect(p.empleado_codigo).toBe("2");
    // Ni un update/delete/upsert sobre la tabla del reloj, pase lo que pase.
    expect(escrituras.filter((e) => e.tabla === "asistencia_marcaciones")).toEqual([]);
  });

  it("🔴 pasados los dos minutos NO escribe nada y dice qué hacer", async () => {
    marcasEnLaBase = [
      { id: "m1", ocurrio_en: new Date(Date.now() - 600_000).toISOString(), dispositivo: "telefono" },
    ];
    const r = await deshacer();
    expect(r.status).toBe(409);
    expect(String(r.json.error)).toContain("dos minutos");
    expect(String(r.json.error)).toContain("Roxana");
    expect(escrituras).toEqual([]);
  });

  it("🔴 lo que marcó el reloj de la tienda no se deshace desde el teléfono", async () => {
    marcasEnLaBase = [
      { id: "r1", ocurrio_en: new Date(Date.now() - 20_000).toISOString(), dispositivo: "reloj cboston" },
    ];
    const r = await deshacer();
    expect(r.status).toBe(409);
    expect(escrituras).toEqual([]);
  });

  it("una marca ya deshecha no se puede volver a deshacer: la anterior ya venció", async () => {
    quitadasEnLaBase = [{ marcacion_id: "m2" }];
    const r = await deshacer();
    expect(r.status).toBe(409);
    expect(escrituras).toEqual([]);
  });

  it("🔴 sin la migración corrida NO se ofrece el botón: se rechazaría", async () => {
    const { leerMarcasDeLaQuincena } = await import("@/lib/marcacion/estado-server");
    const { supabaseServer } = await import("@/lib/supabase-server");
    const real = supabaseServer.from;
    // La columna `quita` no existe todavía: la lectura de las quitadas falla.
    (supabaseServer as { from: unknown }).from = (t: string) => {
      const api = (real as (t: string) => Record<string, unknown>)(t);
      if (t === "asistencia_correcciones") {
        (api as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({
            data: null,
            error: { code: "42703", message: "column asistencia_correcciones.quita does not exist" },
          }).then(ok);
      }
      return api;
    };
    try {
      const { deshacer } = await leerMarcasDeLaQuincena("2", "2026-09-15");
      expect(deshacer).toBeNull();
    } finally {
      (supabaseServer as { from: unknown }).from = real;
    }
  });

  it("contesta el estado nuevo, para que la pantalla se redibuje sin pedir nada más", async () => {
    const r = await deshacer();
    expect(r.json.ok).toBe(true);
    expect(r.json).toHaveProperty("boton");
    expect(r.json).toHaveProperty("dias");
    expect(String(r.json.aviso)).toContain("Puedes marcar de nuevo");
  });
});

describe("🔴 la ruta de deshacer no tiene forma de borrar una marcación", () => {
  it("el archivo no nombra `asistencia_marcaciones` ni un delete", () => {
    const ruta = fs.readFileSync(path.join(RAIZ, "app/api/marcacion/deshacer/route.ts"), "utf8");
    const sinComentarios = ruta.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(sinComentarios).not.toContain("asistencia_marcaciones");
    expect(sinComentarios).not.toMatch(/\.delete\(|\.update\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL REPORTE CONTABA MAL DOS COSAS — el candado (13-ago-2026)
//
// Los dos hallazgos salieron de mirar producción, y los dos ensucian la lectura
// del cuadro que Daniel usa para decidir a quién llamarle la atención:
//
//   (a) MOSTRABA A LOS DADOS DE BAJA. Daniel apareció en su propio reporte de
//       "quién marca mal" después de darse de baja — textual: *"ya te dije q
//       eliminares a DANIEL LEVY"*.
//       🔑 LA REGLA NO ES "ESCONDER A LOS INACTIVOS". Quien trabajó en julio y
//       se fue en agosto TIENE que seguir saliendo en el reporte de julio, o la
//       planilla de julio deja de cuadrar con el reporte de julio y el mes ya
//       pagado se vuelve inauditable. La pregunta correcta es *¿estaba
//       trabajando durante ESTE rango?*.
//
//   (b) CONTABA EL DÍA EN CURSO COMO DÍA MAL MARCADO. Medido el 13-ago-2026 a
//       las ~15:00: **27 de 32 personas tenían 3 marcas** —entraron, almorzaron,
//       volvieron y todavía no se habían ido— y las 27 contaban como error.
//       Toda la oficina en rojo, todas las tardes. Del 1 al 12 de agosto eso
//       inflaba el porcentaje de días mal marcados del **17% al 26%**.
//
// 🔴 TODOS LOS CASOS DE ACÁ EJECUTAN LA CONDUCTA: se llama al motor REAL y a la
// ruta REAL y se mira qué sale. Ninguno busca texto en un archivo — en este repo
// ya fallaron TRES candados por leer sus propios comentarios.
//
// 🔴 Y EL INVARIANTE QUE MÁS PESA: la PLANILLA no puede moverse un centavo. Lo
// garantiza la forma del cambio, no una promesa — `diaEnCurso` es opcional y la
// planilla no lo pasa, así que sin él el motor se comporta EXACTAMENTE como
// antes. Hay casos abajo que lo prueban en las dos direcciones.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { hoyPanama } from "@/lib/fecha-panama";
import { trabajaEnRango, codigosFueraDeRango, type Vigencia } from "@/lib/asistencia/vigencia";

// ── Ayudantes ────────────────────────────────────────────────────────────────

const HOY = "2026-08-13";     // jueves
const AYER = "2026-08-12";    // miércoles

/** Una marca real: la hora que la persona pasó por el reloj, en hora Panamá. */
const marca = (codigo: string, dia: string, hhmmss: string): Marcacion => ({
  empleado_codigo: codigo,
  empleado_nombre: null,
  ocurrio_en: `${dia}T${hhmmss}-05:00`,
});

/** El día típico A MEDIAS: entró, salió a almorzar y volvió. Faltó irse. */
const tresMarcas = (codigo: string, dia: string): Marcacion[] => [
  marca(codigo, dia, "08:00:00"),
  marca(codigo, dia, "12:00:00"),
  marca(codigo, dia, "12:30:00"),
];

/** El día completo: las 4 marcas. */
const cuatroMarcas = (codigo: string, dia: string): Marcacion[] => [
  ...tresMarcas(codigo, dia),
  marca(codigo, dia, "17:00:00"),
];

function correr(opts: {
  marcaciones: Marcacion[];
  desde: string;
  hasta: string;
  diaEnCurso?: string | null;
}) {
  return armarReporte({
    marcaciones: opts.marcaciones,
    horarios: [],
    justificaciones: [],
    feriados: new Map(),
    desde: opts.desde,
    hasta: opts.hasta,
    diaEnCurso: opts.diaEnCurso,
  });
}

const dia = (personas: ReturnType<typeof correr>, fecha: string) =>
  personas[0].dias.find((d) => d.fecha === fecha)!;

// ─────────────────────────────────────────────────────────────────────────────
// (b) EL DÍA QUE NO TERMINÓ
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 un día que no terminó NO es un día mal marcado", () => {
  it("3 marcas HOY no se cuentan como error", () => {
    const p = correr({ marcaciones: tresMarcas("26", HOY), desde: HOY, hasta: HOY, diaEnCurso: HOY });
    const d = dia(p, HOY);
    expect(d.marcas).toHaveLength(3);
    expect(d.enCurso).toBe(true);
    expect(d.revisar).toBe(false);
    expect(p[0].resumen.diasARevisar).toBe(0);
  });

  it("🔴 y el día en curso va APARTE, nunca sumado a los errores", () => {
    const p = correr({ marcaciones: tresMarcas("26", HOY), desde: HOY, hasta: HOY, diaEnCurso: HOY });
    expect(p[0].resumen.diasEnCurso).toBe(1);
    expect(p[0].resumen.diasARevisar).toBe(0);
  });

  it("las MISMAS 3 marcas, un día que YA terminó, sí se cuentan", () => {
    const p = correr({ marcaciones: tresMarcas("26", AYER), desde: AYER, hasta: AYER, diaEnCurso: HOY });
    const d = dia(p, AYER);
    expect(d.enCurso).toBe(false);
    expect(d.revisar).toBe(true);
    expect(p[0].resumen.diasARevisar).toBe(1);
  });

  it("🩸 EL CASO DE PRODUCCIÓN: 27 con 3 marcas hoy → 0 errores, no 27", () => {
    // Medido el 13-ago-2026 a las ~15:00 sobre 32 personas: 27 con 3 marcas.
    const codigos = Array.from({ length: 27 }, (_, i) => `p${i}`);
    const marcaciones = codigos.flatMap((c) => tresMarcas(c, HOY));
    const p = correr({ marcaciones, desde: HOY, hasta: HOY, diaEnCurso: HOY });
    expect(p).toHaveLength(27);
    expect(p.reduce((a, x) => a + x.resumen.diasARevisar, 0)).toBe(0);
    // Sin el arreglo, esto daba 27. Es la mutación que este caso caza.
    expect(p.reduce((a, x) => a + x.resumen.diasEnCurso, 0)).toBe(27);
  });

  it("🔑 pero las MARCAS SE VEN y los minutos SE CALCULAN igual", () => {
    // Se suspende el veredicto, no la medición: quien pida el día de hoy tiene
    // que ver sus marcas. Entra 8:30 → 30 minutos tarde, día en curso o no.
    const tarde = [marca("26", HOY, "08:30:00"), marca("26", HOY, "12:00:00"), marca("26", HOY, "12:30:00")];
    const p = correr({ marcaciones: tarde, desde: HOY, hasta: HOY, diaEnCurso: HOY });
    const d = dia(p, HOY);
    expect(d.marcas).toEqual(["08:30:00", "12:00:00", "12:30:00"]);
    expect(d.entrada).toBe("08:30:00");
    expect(d.tardeMin).toBe(30);
    expect(p[0].resumen.minutosTarde).toBe(30);
    expect(p[0].resumen.diasTrabajados).toBe(1);
  });

  it("y esos minutos NO se le achacan a un día mal marcado", () => {
    const tarde = [marca("26", HOY, "08:30:00"), marca("26", HOY, "12:00:00"), marca("26", HOY, "12:30:00")];
    const p = correr({ marcaciones: tarde, desde: HOY, hasta: HOY, diaEnCurso: HOY });
    // `minutosTardeDeDiasARevisar` es lo que la pantalla usa para avisar "mira
    // esto antes de descontar". Con el día en curso adentro, avisaría siempre.
    expect(p[0].resumen.minutosTardeDeDiasARevisar).toBe(0);
    expect(p[0].resumen.minutosTarde).toBe(30);
  });

  it("🔴 HOY SIN MARCAS NO ES UNA AUSENCIA: a las 8:59 nadie faltó todavía", () => {
    // La persona tiene marcas ayer (para existir en el reporte) y ninguna hoy.
    const p = correr({
      marcaciones: cuatroMarcas("26", AYER),
      desde: AYER, hasta: HOY, diaEnCurso: HOY,
    });
    const d = dia(p, HOY);
    expect(d.marcas).toHaveLength(0);
    expect(d.enCurso).toBe(true);
    expect(d.ausente).toBe(false);
    expect(p[0].resumen.ausenciasSinJustificar).toBe(0);
  });

  it("el MISMO día sin marcas, ya terminado, sí es una ausencia", () => {
    const p = correr({
      marcaciones: cuatroMarcas("26", "2026-08-11"),
      desde: "2026-08-11", hasta: AYER, diaEnCurso: HOY,
    });
    expect(dia(p, AYER).ausente).toBe(true);
    expect(p[0].resumen.ausenciasSinJustificar).toBe(1);
  });
});

describe("⚠️ el BORDE: un rango que termina antes de hoy no tiene día en curso", () => {
  it("ningún día del rango pasado queda marcado como en curso", () => {
    const p = correr({
      marcaciones: [...tresMarcas("26", "2026-08-10"), ...cuatroMarcas("26", "2026-08-11")],
      desde: "2026-08-10", hasta: "2026-08-11",
      // `diaEnCurso` se pasa SIEMPRE; el rango es el que decide si aplica.
      diaEnCurso: HOY,
    });
    expect(p[0].dias.every((d) => !d.enCurso)).toBe(true);
    expect(p[0].resumen.diasEnCurso).toBe(0);
    // Y el 10, con 3 marcas, sigue siendo un error: es un día terminado.
    expect(p[0].resumen.diasARevisar).toBe(1);
  });

  it("🔴 pedir EXPLÍCITAMENTE el día de hoy muestra las marcas sin contarlas como error", () => {
    const p = correr({ marcaciones: tresMarcas("26", HOY), desde: HOY, hasta: HOY, diaEnCurso: HOY });
    expect(p).toHaveLength(1);
    expect(dia(p, HOY).marcas).toHaveLength(3);
    expect(p[0].resumen.diasARevisar).toBe(0);
  });
});

describe('🔴 "hoy" es el día-calendario de PANAMÁ (UTC−5), no el de UTC', () => {
  it("a las 11 de la noche de Panamá el día TODAVÍA no cambió", () => {
    // 2026-08-14T03:30Z = 13-ago 22:30 en Panamá. En UTC pelado el día ya saltó.
    const instante = new Date("2026-08-14T03:30:00Z");
    expect(hoyPanama(instante)).toBe("2026-08-13");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-08-14"); // lo que NO se usa
  });

  it("🩸 y con el día de UTC el reporte se equivocaría TODAS LAS NOCHES", () => {
    // Con "hoy" = 14-ago, el día 13 —que sigue corriendo— vuelve a contarse
    // como error, que es exactamente el bug que este arreglo elimina.
    const enCursoUtc = new Date("2026-08-14T03:30:00Z").toISOString().slice(0, 10);
    const conUtc = correr({ marcaciones: tresMarcas("26", HOY), desde: HOY, hasta: HOY, diaEnCurso: enCursoUtc });
    expect(conUtc[0].resumen.diasARevisar).toBe(1); // ← el bug

    const conPanama = correr({
      marcaciones: tresMarcas("26", HOY), desde: HOY, hasta: HOY,
      diaEnCurso: hoyPanama(new Date("2026-08-14T03:30:00Z")),
    });
    expect(conPanama[0].resumen.diasARevisar).toBe(0); // ← lo correcto
  });

  it("a las 00:30 de Panamá el día ya es el nuevo", () => {
    expect(hoyPanama(new Date("2026-08-14T05:30:00Z"))).toBe("2026-08-14");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PLANILLA NO SE MUEVE — por construcción, no por promesa
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 sin `diaEnCurso`, el motor da EXACTAMENTE lo de siempre", () => {
  const marcaciones = [
    ...tresMarcas("26", HOY),
    ...cuatroMarcas("26", AYER),
    ...tresMarcas("27", "2026-08-11"),
  ];
  const base = { marcaciones, desde: "2026-08-11", hasta: HOY };

  it("el día de hoy con 3 marcas VUELVE a contar como error (lo que ve la planilla)", () => {
    const p = correr(base); // sin diaEnCurso: es como llama la planilla
    const yo = p.find((x) => x.codigo === "26")!;
    expect(yo.dias.find((d) => d.fecha === HOY)!.revisar).toBe(true);
    expect(yo.dias.every((d) => d.enCurso === false)).toBe(true);
    expect(yo.resumen.diasEnCurso).toBe(0);
  });

  it("`undefined` y `null` se comportan igual: no hay día en curso", () => {
    const sin = correr(base);
    const nulo = correr({ ...base, diaEnCurso: null });
    const indef = correr({ ...base, diaEnCurso: undefined });
    expect(JSON.stringify(nulo)).toBe(JSON.stringify(sin));
    expect(JSON.stringify(indef)).toBe(JSON.stringify(sin));
  });

  it("🔑 y TODO lo que la planilla lee es idéntico con y sin el parámetro, salvo el juicio", () => {
    // Se comparan campo por campo los números que entran al pago: minutos,
    // horas trabajadas, extras. Lo único que puede diferir es `revisar`,
    // `enCurso`, `ausente` y los contadores que salen de ellos — y la planilla
    // no los usa para calcular dinero (usa `clasificarDia`/`medirHoras`).
    const sin = correr(base);
    const con = correr({ ...base, diaEnCurso: HOY });
    for (const [i, p] of sin.entries()) {
      const q = con[i];
      expect(q.codigo).toBe(p.codigo);
      for (const [j, d] of p.dias.entries()) {
        const e = q.dias[j];
        expect(e.fecha).toBe(d.fecha);
        expect(e.marcas).toEqual(d.marcas);
        expect(e.entrada).toBe(d.entrada);
        expect(e.salida).toBe(d.salida);
        expect(e.tardeMin).toBe(d.tardeMin);
        expect(e.excesoAlmuerzoMin).toBe(d.excesoAlmuerzoMin);
        expect(e.salidaTempranaMin).toBe(d.salidaTempranaMin);
        expect(e.extraMin).toBe(d.extraMin);
        expect(e.trabajadoMin).toBe(d.trabajadoMin);
      }
      expect(q.resumen.minutosTarde).toBe(p.resumen.minutosTarde);
      expect(q.resumen.excesoAlmuerzoMin).toBe(p.resumen.excesoAlmuerzoMin);
      expect(q.resumen.salidaTempranaMin).toBe(p.resumen.salidaTempranaMin);
      expect(q.resumen.extraMin).toBe(p.resumen.extraMin);
      expect(q.resumen.tiempoNoTrabajadoMin).toBe(p.resumen.tiempoNoTrabajadoMin);
      expect(q.resumen.diasTrabajados).toBe(p.resumen.diasTrabajados);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) QUIÉN SALE: EL QUE ESTABA TRABAJANDO EN EL RANGO
// ─────────────────────────────────────────────────────────────────────────────

const vig = (over: Partial<Vigencia> = {}): Vigencia => ({
  fechaIngreso: null, fechaSalida: null, motivoSalida: null, ...over,
});

describe("🔴 la regla NO es esconder a los inactivos: es mostrar a quien trabajaba", () => {
  const daniel = vig({ fechaSalida: "2026-08-05", motivoSalida: "otro" });

  it("quien se fue ANTES del rango no sale", () => {
    expect(trabajaEnRango(daniel, "2026-08-06", "2026-08-13")).toBe(false);
  });

  it("🔑 pero quien se fue en agosto SÍ SALE en el reporte de JULIO", () => {
    // Si no saliera, la planilla de julio y el reporte de julio no cuadrarían.
    expect(trabajaEnRango(daniel, "2026-07-01", "2026-07-31")).toBe(true);
  });

  it("y sigue saliendo en el rango en que se fue, hasta su último día", () => {
    expect(trabajaEnRango(daniel, "2026-08-01", "2026-08-13")).toBe(true);
  });

  it("quien entró DESPUÉS del rango tampoco sale de ese rango", () => {
    const nuevo = vig({ fechaIngreso: "2026-08-10" });
    expect(trabajaEnRango(nuevo, "2026-07-01", "2026-07-31")).toBe(false);
    expect(trabajaEnRango(nuevo, "2026-08-01", "2026-08-13")).toBe(true);
  });

  it("⚠️ sin ficha nadie se esconde: falla ABIERTO", () => {
    expect(trabajaEnRango(null, "2026-08-01", "2026-08-13")).toBe(true);
    expect(trabajaEnRango(undefined, "2026-08-01", "2026-08-13")).toBe(true);
    // Y un código sin fila en el mapa nunca entra al conjunto de excluidos.
    const fuera = codigosFueraDeRango(new Map([["1", daniel]]), "2026-08-06", "2026-08-13");
    expect([...fuera]).toEqual(["1"]);
    expect(fuera.has("99")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA RUTA — conducta. Se llama al handler REAL y se mira qué devuelve.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que la base "tiene". Cada caso lo cambia antes de pedir el reporte. */
const db = {
  marcaciones: [] as Array<Record<string, unknown>>,
  personas: [] as Array<Record<string, unknown>>,
};

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userId: "u1", userName: "Daniel", sessionToken: "t" }),
}));

vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => db.marcaciones,
}));

vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerCorrecciones: async () => ({ correcciones: [], faltaMigracion: false }),
}));

vi.mock("@/lib/asistencia/config-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/asistencia/config-server")>(
    "@/lib/asistencia/config-server",
  );
  return {
    ...real,
    leerReglas: async () => ({ reglas: {}, faltaMigracion: false }),
    leerDirectorio: async () => ({
      directorio: { codigos: () => [] as string[], etiqueta: (c: string) => c },
      faltaMigracion: false,
    }),
    leerPersonas: async () => ({
      filas: db.personas,
      faltaMigracion: false,
      faltaColumnasBajas: false,
      faltaColumnaServicioProfesional: false,
    }),
  };
});

vi.mock("@/lib/supabase-server", () => {
  const vacio = { data: [] as unknown[], error: null };
  const cadena = () => {
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "range"]) api[m] = () => api;
    // `await` sobre la cadena: PostgREST devuelve {data, error}.
    (api as { then: unknown }).then = (res: (v: unknown) => unknown) => res(vacio);
    return api;
  };
  return { HAS_SERVICE_ROLE: true, supabaseServer: { from: () => cadena() } };
});

async function pedirReporte(desde: string, hasta: string) {
  const { GET } = await import("@/app/api/asistencia/reporte/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(`http://x/api/asistencia/reporte?desde=${desde}&hasta=${hasta}`);
  const res = await GET(req);
  return { status: res.status, json: (await res.json()) as Record<string, never> };
}

describe("🔴 la RUTA del reporte — conducta contra el handler real", () => {
  beforeEach(() => {
    db.marcaciones = [];
    db.personas = [];
  });
  afterEach(() => { vi.clearAllMocks(); });

  const fila = (codigo: string, over: Record<string, unknown> = {}) => ({
    empleado_codigo: codigo, nombre: `P${codigo}`, salario_mensual: 800,
    jornada_semanal: 48, empresa: "vistana",
    fecha_ingreso: null, fecha_salida: null, motivo_salida: null,
    ...over,
  });

  const marcasDb = (codigo: string, dia: string, horas: string[]) =>
    horas.map((h, i) => ({
      id: `${codigo}-${dia}-${i}`, empleado_codigo: codigo, empleado_nombre: null,
      ocurrio_en: `${dia}T${h}-05:00`,
    }));

  it("🩸 el dado de baja NO sale en el reporte de después de irse", async () => {
    db.personas = [
      fila("1", { fecha_salida: "2026-07-20", motivo_salida: "otro" }), // DANIEL
      fila("2"),
    ];
    db.marcaciones = [
      ...marcasDb("1", "2026-08-03", ["08:00:00", "12:00:00", "12:30:00"]),
      ...marcasDb("2", "2026-08-03", ["08:00:00", "12:00:00", "12:30:00", "17:00:00"]),
    ];
    const r = await pedirReporte("2026-08-01", "2026-08-12");
    expect(r.status).toBe(200);
    const codigos = (r.json.personas as unknown as Array<{ codigo: string }>).map((p) => p.codigo);
    expect(codigos).toEqual(["2"]);
    // Y se DICE que se sacó a alguien: una persona que desaparece sin
    // explicación se lee como un dato que falta.
    expect(r.json.fueraDelRango).toBe(1);
  });

  it("🔑 pero SÍ sale en el reporte del mes en que trabajó", async () => {
    db.personas = [fila("1", { fecha_salida: "2026-07-20", motivo_salida: "otro" })];
    db.marcaciones = marcasDb("1", "2026-07-06", ["08:00:00", "12:00:00", "12:30:00", "17:00:00"]);
    const r = await pedirReporte("2026-07-01", "2026-07-15");
    const codigos = (r.json.personas as unknown as Array<{ codigo: string }>).map((p) => p.codigo);
    expect(codigos).toEqual(["1"]);
    expect(r.json.fueraDelRango).toBe(0);
  });

  it("⚠️ sin fichas (migración sin correr) NO se esconde a nadie", async () => {
    db.personas = [];
    db.marcaciones = marcasDb("1", "2026-08-03", ["08:00:00", "12:00:00"]);
    const r = await pedirReporte("2026-08-01", "2026-08-12");
    expect((r.json.personas as unknown as unknown[]).length).toBe(1);
    expect(r.json.fueraDelRango).toBe(0);
  });

  it("🔴 la ruta le pasa al motor el día de PANAMÁ, no el de UTC", async () => {
    // 23:30 de Panamá del 13-ago: en UTC ya es 14. Se congela el reloj y se
    // pide un rango que llega hasta el 13. Si la ruta usara UTC, el día 13
    // volvería a contarse como error.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T04:30:00Z")); // 13-ago 23:30 Panamá
    try {
      db.personas = [fila("1")];
      db.marcaciones = marcasDb("1", "2026-08-13", ["08:00:00", "12:00:00", "12:30:00"]);
      const r = await pedirReporte("2026-08-13", "2026-08-13");
      expect(r.json.diaEnCurso).toBe("2026-08-13");
      const p = r.json.personas as unknown as Array<{
        resumen: { diasARevisar: number; diasEnCurso: number };
        dias: Array<{ fecha: string; enCurso: boolean; revisar: boolean }>;
      }>;
      expect(p[0].resumen.diasARevisar).toBe(0);
      expect(p[0].resumen.diasEnCurso).toBe(1);
      expect(p[0].dias[0].enCurso).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un rango que YA cerró no anuncia ningún día en curso", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:00:00Z"));
    try {
      db.personas = [fila("1")];
      db.marcaciones = marcasDb("1", "2026-08-10", ["08:00:00", "12:00:00", "12:30:00"]);
      const r = await pedirReporte("2026-08-01", "2026-08-11");
      expect(r.json.diaEnCurso).toBe(null);
      const p = r.json.personas as unknown as Array<{ resumen: { diasARevisar: number } }>;
      expect(p[0].resumen.diasARevisar).toBe(1); // el 10 sigue siendo un error
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL REPARTO LLEGA AL PAGO — CONDUCTA, no barrido de texto
//
// La contadora, textual (27-ago-2026): *"El salario de Julio es 1000 y están
// divididos en dos empresas. 800 en Vistana… Los otros 200 están en Fashion
// Wear. Aquí es servicios profesionales y es aquí donde se le pagan las horas
// extras. En ambas empresas su rata por hora es 5.77"*.
//
// 🩸 POR QUÉ ESTE ARCHIVO Y NO UN TEST DEL MOTOR. El motor ya está cubierto en
// `asistencia-reparto.test.ts`. El bug que ESTE archivo caza es el de la
// JUNTURA: que la ruta lea la tabla y le pase el reparto al motor. Es
// exactamente el modo de fallo que este módulo ya pagó —«la planilla NO pasaba
// `diaEnCurso`, el Reporte sí»—, y ningún test del motor lo puede ver.
//
// Y tampoco sirve un `grep` sobre `route.ts`: en este repo un barrido ya se
// cumplió CUATRO veces con el comentario que explicaba el cambio. Acá se LLAMA
// a la ruta real y se miran los dólares que salieron.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { MIGRACION_REPARTO, type FilaReparto } from "@/lib/asistencia/reparto";

const JULIO = "11";

/** Lo que `leerRepartos()` va a contestar en cada caso. */
let REPARTO: { filas: FilaReparto[] } = { filas: [] };
/** Si está puesto, `leerRepartos()` LANZA con este mensaje (la base falló). */
let REPARTO_ERROR: string | null = null;

const BUENO: FilaReparto[] = [
  { empleado_codigo: JULIO, empresa: "vistana", salario_mensual: "800.00", paga_seguros: true, paga_horas_extra: false, orden: 0 },
  { empleado_codigo: JULIO, empresa: "fashion_wear", salario_mensual: "200.00", paga_seguros: false, paga_horas_extra: true, orden: 1 },
];

vi.mock("@/lib/requireRole", () => ({
  requireRole: (_r: unknown, roles: string[]) =>
    roles.includes("admin")
      ? { role: "admin", userName: "Daniel", userId: "1", sessionToken: "t" }
      : NextResponse.json({ error: "Sin permiso." }, { status: 403 }),
}));

const HORARIOS = [
  { empleado_codigo: JULIO, entrada: "08:00:00", salida: "17:00:00", almuerzo_minutos: 30 },
  { empleado_codigo: "7", entrada: "08:00:00", salida: "17:00:00", almuerzo_minutos: 30 },
];
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (t: string) => {
      const res = t === "asistencia_horarios" ? HORARIOS : [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lte", "order", "in"]) q[m] = () => q;
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data: res, error: null });
      return q;
    },
  },
}));

// Un día REAL: entra 08:00 y sale 18:00 (hora de Panamá) → hay hora extra.
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => [
    { id: "m1", empleado_codigo: JULIO, empleado_nombre: "JULIO GARAY", ocurrio_en: "2026-08-03T13:00:00.000Z" },
    { id: "m2", empleado_codigo: JULIO, empleado_nombre: "JULIO GARAY", ocurrio_en: "2026-08-03T23:00:00.000Z" },
    { id: "m3", empleado_codigo: "7", empleado_nombre: "ANGELA GARCIA", ocurrio_en: "2026-08-03T13:00:00.000Z" },
    { id: "m4", empleado_codigo: "7", empleado_nombre: "ANGELA GARCIA", ocurrio_en: "2026-08-03T22:00:00.000Z" },
  ],
}));
vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerCorrecciones: async () => ({ correcciones: [], porDia: new Map(), faltaTabla: true }),
}));
vi.mock("@/lib/asistencia/aprobaciones-server", () => ({
  // 🔑 El día de Julio viene APROBADO, así que sus extras se pagan — que es el
  // estado en el que se midieron los números de la contadora. Historia: hasta
  // el 3-sep-2026 esto contestaba `faltaTabla: true` y con eso NO se exigía
  // aprobación; la tolerancia se retiró y el candado está siempre puesto, así
  // que ahora el doble aprueba el día en vez de apagar el candado.
  leerAprobaciones: async () => ({
    filas: [{ codigo: JULIO, fecha: "2026-08-03", aprobado: true, minutosVistos: 60, por: "Contabilidad", cuando: "2026-08-04T12:00:00.000Z" }],
  }),
}));
vi.mock("@/lib/asistencia/planilla-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  leerManuales: async () => ({ porCodigo: new Map(), faltaMigracion: false }),
}));
vi.mock("@/lib/asistencia/config-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  leerReglas: async () => {
    const { REGLAS_DEFAULT } = await import("@/lib/asistencia/config");
    return { reglas: REGLAS_DEFAULT, faltaMigracion: false };
  },
  leerPersonas: async () => ({
    filas: [
      {
        empleado_codigo: JULIO, nombre: "JULIO GARAY", salario_mensual: "1000.00",
        jornada_semanal: 40, empresa: "vistana", activo: true,
        servicio_profesional: false, paga_seguros: true, no_marca_reloj: false,
      },
      {
        empleado_codigo: "7", nombre: "ANGELA GARCIA", salario_mensual: "600.00",
        jornada_semanal: 40, empresa: "vistana", activo: true,
        servicio_profesional: false, paga_seguros: true, no_marca_reloj: false,
      },
    ],
    faltaMigracion: false, faltaColumnasBajas: false,
    faltaColumnaServicioProfesional: false, faltaColumnaPagaSeguros: false,
    faltaColumnaNoMarcaReloj: false, faltaColumnaBaseSeguros: false,
    faltaColumnasSaldoVacaciones: false,
  }),
  leerJustificaciones: async () => ({ filas: [] }),
  leerVacaciones: async () => ({ filas: [] }),
  leerRepartos: async () => {
    if (REPARTO_ERROR) throw new Error(REPARTO_ERROR);
    return REPARTO;
  },
}));

const pedir = (empresa: string | null, extra = "") =>
  new NextRequest(
    `http://localhost/api/asistencia/planilla?desde=2026-08-01&hasta=2026-08-15`
    + `${empresa ? `&empresa=${empresa}` : ""}${extra}`,
  );

interface Linea {
  codigo: string;
  empresa: string | null;
  salarioMensual: number | null;
  parte: { empresa: string; salarioMensual: number; llevaHorasExtra: boolean } | null;
  dinero: {
    rataHora: number; salarioQuincenal: number; extraDiurno: number; extraNocturno: number;
    seguroSocial: number; seguroEducativo: number; totalBruto: number; netoPagar: number;
  } | null;
}

async function cuadro(empresa: string | null, extra = "") {
  const { GET } = await import("@/app/api/asistencia/planilla/route");
  const res = await GET(pedir(empresa, extra));
  expect(res.status).toBe(200);
  return (await res.json()) as {
    lineas: Linea[];
    aprobaciones: Array<{ gente: Array<{ codigo: string; empresa: string | null; empresaEtiqueta: string | null }> }> | null;
    avisos: { faltaMigracionReparto: string | null; avisoRepartoRechazado: string | null; repartosRechazados: unknown[] };
  };
}

const deJulio = (ls: Linea[]) => ls.filter((l) => l.codigo === JULIO);

beforeEach(() => { REPARTO = { filas: [] }; REPARTO_ERROR = null; });

describe("🔴 con el reparto cargado, JULIO sale en las DOS empresas", () => {
  beforeEach(() => { REPARTO = { filas: BUENO }; });

  it("Vistana: $400,00 de sueldo, SIN extras, con seguros", async () => {
    const j = await cuadro("vistana");
    const [l] = deJulio(j.lineas);
    expect(l).toBeDefined();
    expect(l.empresa).toBe("vistana");
    expect(l.parte).toMatchObject({ empresa: "vistana", salarioMensual: 800, llevaHorasExtra: false });
    expect(l.dinero!.salarioQuincenal).toBe(400);
    expect(l.dinero!.extraDiurno + l.dinero!.extraNocturno).toBe(0);
    // 🔑 Acá NO se fijan los $39,00 y $5,00 de la contadora: en este doble la
    // persona marcó UN día de once, así que su bruto trae las ausencias del
    // resto. Los montos exactos se prueban con las horas REALES de producción
    // en `asistencia-reparto.test.ts`. Lo que ESTA ruta tiene que probar es
    // que los seguros se CALCULARON de este lado y no del otro.
    expect(l.dinero!.seguroSocial).not.toBe(0);
    expect(l.dinero!.seguroEducativo).not.toBe(0);
  });

  it("Fashion Wear: $100,00 de sueldo, CON las horas extra, SIN seguros", async () => {
    const j = await cuadro("fashion_wear");
    const [l] = deJulio(j.lineas);
    expect(l).toBeDefined();
    expect(l.empresa).toBe("fashion_wear");
    expect(l.parte).toMatchObject({ empresa: "fashion_wear", salarioMensual: 200, llevaHorasExtra: true });
    expect(l.dinero!.salarioQuincenal).toBe(100);
    expect(l.dinero!.extraDiurno + l.dinero!.extraNocturno).toBeGreaterThan(0);
    expect(l.dinero!.seguroSocial).toBe(0);
    expect(l.dinero!.seguroEducativo).toBe(0);
  });

  it("🔴 LA RATA ES LA MISMA EN LAS DOS: $5,77, del sueldo COMPLETO", async () => {
    const v = deJulio((await cuadro("vistana")).lineas)[0];
    const f = deJulio((await cuadro("fashion_wear")).lineas)[0];
    expect(v.dinero!.rataHora).toBe(5.77);
    expect(f.dinero!.rataHora).toBe(5.77);
    // Y el salario de la LÍNEA sigue siendo el completo: es de donde sale la rata.
    expect(v.salarioMensual).toBe(1000);
    expect(f.salarioMensual).toBe(1000);
  });

  it("no aparece en el cuadro de una empresa que no es suya", async () => {
    expect(deJulio((await cuadro("confecciones_boston")).lineas)).toHaveLength(0);
  });

  it("🔴 el BRUTO TOTAL no se mueve: el reparto no crea ni destruye plata bruta", async () => {
    const conReparto = [
      deJulio((await cuadro("vistana")).lineas)[0],
      deJulio((await cuadro("fashion_wear")).lineas)[0],
    ];
    REPARTO = { filas: [] };
    const entero = deJulio((await cuadro("vistana")).lineas)[0];
    const suma = Math.round((conReparto[0].dinero!.totalBruto + conReparto[1].dinero!.totalBruto) * 100) / 100;
    expect(suma).toBe(entero.dinero!.totalBruto);
  });

  it("⛔ NADIE MÁS se mueve un centavo", async () => {
    const conReparto = (await cuadro("vistana")).lineas.find((l) => l.codigo === "7")!;
    REPARTO = { filas: [] };
    const sin = (await cuadro("vistana")).lineas.find((l) => l.codigo === "7")!;
    expect(JSON.stringify(conReparto)).toBe(JSON.stringify(sin));
  });

  it("🔑 Aprobaciones dice FASHION WEAR: es donde caen sus horas extra", async () => {
    // Sin `empresa` en la URL, como pide la pestaña Aprobaciones: se aprueba a
    // la PERSONA, no a la empresa. Ahí Julio tiene DOS líneas y la que manda es
    // la que paga las extras.
    const j = await cuadro(null, "&aprobaciones=1");
    const gente = (j.aprobaciones ?? []).flatMap((d) => d.gente).filter((g) => g.codigo === JULIO);
    expect(gente.length).toBeGreaterThan(0);
    for (const g of gente) {
      expect(g.empresa).toBe("fashion_wear");
      expect(g.empresaEtiqueta).toBe("Fashion Wear");
    }
  });
});

describe("🔴 un reparto que NO cuadra se rechaza ENTERO, y se DICE", () => {
  it("vuelve a UNA sola línea, con el sueldo entero y sus seguros", async () => {
    REPARTO = {
      filas: [BUENO[0], { ...BUENO[1], salario_mensual: "100.00" }],
    };
    const v = await cuadro("vistana");
    const ls = deJulio(v.lineas);
    expect(ls).toHaveLength(1);
    expect(ls[0].parte).toBeNull();
    expect(ls[0].dinero!.salarioQuincenal).toBe(500);
    expect(ls[0].dinero!.seguroSocial).toBeGreaterThan(0);
    expect(deJulio((await cuadro("fashion_wear")).lineas)).toHaveLength(0);
  });

  it("🔴 el aviso NOMBRA a la persona y el motivo — rechazar sí, esconder no", async () => {
    REPARTO = {
      filas: [BUENO[0], { ...BUENO[1], salario_mensual: "100.00" }],
    };
    const j = await cuadro("vistana");
    expect(j.avisos.avisoRepartoRechazado).toContain("JULIO GARAY");
    expect(j.avisos.avisoRepartoRechazado).toContain("$900.00");
    expect(j.avisos.repartosRechazados).toHaveLength(1);
  });

  it("con el reparto bueno NO se avisa nada", async () => {
    REPARTO = { filas: BUENO };
    const j = await cuadro("vistana");
    expect(j.avisos.avisoRepartoRechazado).toBeNull();
    expect(j.avisos.repartosRechazados).toHaveLength(0);
  });
});

// ⚠️ CAMBIÓ DE DIRECCIÓN EL 3-SEP-2026 (tolerancia a la DDL retirada). Hasta
// ese día, «sin la migración corrida» la planilla salía con Julio en UNA sola
// línea, el sueldo entero, y el aviso nombraba el archivo. La tabla existe
// desde 20260901120000; hoy si el reparto no se puede leer, la PLANILLA NO
// SALE — un cuadro que pague a Julio entero en Vistana porque un timeout
// devolvió el mismo código es plata mal pagada con la pantalla tranquila.
describe("🔴 SI EL REPARTO NO SE PUEDE LEER, la planilla NO sale", () => {
  it("un error de la base es 500 con el mensaje, no «la planilla de siempre»", async () => {
    REPARTO_ERROR = "Could not find the table 'public.asistencia_reparto_empresa' in the schema cache";
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const res = await GET(pedir("vistana"));
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error?: string; lineas?: unknown };
    expect(j.error).toContain("asistencia_reparto_empresa");
    expect(j.lineas).toBeUndefined();
  });

  it("con la tabla leída el aviso (que ya es constante) es null", async () => {
    REPARTO = { filas: BUENO };
    const j = await cuadro("vistana");
    expect(j.avisos.faltaMigracionReparto).toBeNull();
    expect(MIGRACION_REPARTO).toContain("20260901120000");
  });
});

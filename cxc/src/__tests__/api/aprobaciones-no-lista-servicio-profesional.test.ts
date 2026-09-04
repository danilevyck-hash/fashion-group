// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA LISTA DE APROBACIONES NO OFRECE AL SERVICIO PROFESIONAL — CONDUCTA
//
// Daniel, 3-sep-2026, textual: *«yulisa marca pero no deberia de calcular ya
// que es salario fijo, es solo para ver sus tardanzas y ausencias»*.
//
// La lista de la pestaña Aprobaciones sale de `/api/asistencia/planilla`
// (`?aprobaciones=1`). Hasta ese día Yulissa (código 26, servicio profesional)
// aparecía ahí con sus 0,72 h y Julio podía «aprobar» horas que la planilla
// nunca iba a pagar. Acá se LLAMA a la ruta real con dos personas que salieron
// a la misma hora —una normal y una servicio profesional— y se mira quién sale.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

vi.mock("@/lib/requireRole", () => ({
  requireRole: (_r: unknown, roles: string[]) =>
    roles.includes("admin")
      ? { role: "admin", userName: "Daniel", userId: "1", sessionToken: "t", modules: ["asistencia"] }
      : NextResponse.json({ error: "Sin permiso." }, { status: 403 }),
}));

const HORARIOS = [
  { empleado_codigo: "11", entrada: "08:00:00", salida: "17:00:00", almuerzo_minutos: 30 },
  { empleado_codigo: "26", entrada: "08:00:00", salida: "17:00:00", almuerzo_minutos: 30 },
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

// Las dos entran 08:00 y salen 18:00 (Panamá): una hora extra cada una.
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => [
    { id: "m1", empleado_codigo: "11", empleado_nombre: "", ocurrio_en: "2026-08-03T13:00:00.000Z" },
    { id: "m2", empleado_codigo: "11", empleado_nombre: "", ocurrio_en: "2026-08-03T23:00:00.000Z" },
    { id: "m3", empleado_codigo: "26", empleado_nombre: "", ocurrio_en: "2026-08-03T13:00:00.000Z" },
    { id: "m4", empleado_codigo: "26", empleado_nombre: "", ocurrio_en: "2026-08-03T23:00:00.000Z" },
  ],
}));
vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerCorrecciones: async () => ({ correcciones: [], porDia: new Map(), faltaTabla: true }),
}));
// 🔑 Yulissa tiene un día APROBADO de antes: tiene que ignorarse, no borrarse.
vi.mock("@/lib/asistencia/aprobaciones-server", () => ({
  leerAprobaciones: async () => ({
    filas: [{ codigo: "26", fecha: "2026-08-03", aprobado: true, minutosVistos: 60, por: "Julio", cuando: null }],
    faltaTabla: false,
  }),
}));
vi.mock("@/lib/asistencia/planilla-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  leerManuales: async () => ({ porCodigo: new Map(), faltaMigracion: false }),
}));
vi.mock("@/lib/asistencia/aprobador-empresa-server", () => ({
  leerAlcanceAprobador: async () => ({ empresas: null }),
}));
vi.mock("@/lib/asistencia/prestamos-planilla-server", () => ({
  leerPrestamosDeQuincena: async () => ({ fichas: [] }),
  leerAprobacionesPrestamo: async () => ({ porCodigo: new Map() }),
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
        empleado_codigo: "11", nombre: "JULIO GARAY", salario_mensual: 1000,
        jornada_semanal: 48, empresa: "vistana", activo: true, servicio_profesional: false,
      },
      {
        empleado_codigo: "26", nombre: "YULISSA JUAREZ", salario_mensual: null,
        jornada_semanal: null, empresa: "vistana", activo: true, servicio_profesional: true,
      },
    ],
    faltaMigracion: false, faltaColumnasBajas: false,
    faltaColumnaServicioProfesional: false, faltaColumnaBaseSeguros: false,
  }),
  leerJustificaciones: async () => ({ filas: [], faltaTabla: false }),
  leerVacaciones: async () => ({ filas: [], faltaTabla: false }),
  leerRepartos: async () => ({ filas: [], faltaTabla: false }),
}));

const pedir = () =>
  new NextRequest("http://localhost/api/asistencia/planilla?desde=2026-08-01&hasta=2026-08-15&aprobaciones=1");

describe("🔴 GET /api/asistencia/planilla?aprobaciones=1 — el servicio profesional no se ofrece", () => {
  it("Julio (normal) sale con su hora; Yulissa (servicio profesional) NO está en la lista", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const res = await GET(pedir());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(Array.isArray(j.aprobaciones)).toBe(true);
    const codigos = (j.aprobaciones as Array<{ gente: Array<{ codigo: string }> }>)
      .flatMap((d) => d.gente.map((g) => g.codigo));
    expect(codigos).toContain("11");
    expect(codigos).not.toContain("26");
    // CONTROL: el día existe y trae a Julio con sus 60 minutos.
    expect(j.aprobaciones[0].fecha).toBe("2026-08-03");
    expect(j.aprobaciones[0].gente[0].minutos).toBeCloseTo(60, 6);
  });

  it("🔴 y en el cuadro: Yulissa sin aviso de extras, sin extras, CON su fila y sus horas de asistencia", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = await (await GET(pedir())).json();
    const codigosAviso = (j.avisos.extraSinAprobar as Array<{ codigo: string }>).map((e) => e.codigo);
    expect(codigosAviso).toEqual(["11"]);
    const y = (j.lineas as Array<Record<string, unknown>>).find((l) => l.codigo === "26")!;
    expect(y).toBeTruthy();
    expect(y.fueraDePlanilla).toBe(true);
    expect(y.extraMedido).toBeNull();
    expect(y.extraNoAprobada).toBeNull();
    const h = y.horas as Record<string, number>;
    expect(h.extraDiurnoMin).toBe(0);
    expect(h.extraNocturnoMin).toBe(0);
    // Sigue en el cuadro con su día trabajado: la asistencia se le mide.
    expect(h.diasTrabajados).toBe(1);
    // Julio, en cambio, tiene sus 60 minutos sin aprobar (el día aprobado era de Yulissa).
    const jl = (j.lineas as Array<Record<string, unknown>>).find((l) => l.codigo === "11")!;
    expect((jl.extraNoAprobada as { minutos: number }).minutos).toBeCloseTo(60, 6);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * CONDUCTA DEL SERVIDOR DE PRÉSTAMOS — lo que la pantalla no puede garantizar.
 *
 * Cuatro cosas, y las cuatro son plata:
 *
 *   1. 🔴 **El tope guarda PENDIENTE y avisa a Daniel** — y lo pendiente no
 *      suma al saldo. El daño de mercancía **nunca** se frena.
 *   2. 🔴 **El freno de duplicados mira concepto + fecha, NUNCA la nota.**
 *      🩸 Medido: 18 filas vivas escritas «DEDUCCION QUINCENAL », «DEDUCCION DE
 *      QUINCENA», «DESCUENTO QUINCENAL »… burlaban el freno viejo porque
 *      `ilike` no ignora los acentos. El candado estaba apagado y nadie lo
 *      sabía.
 *   3. Un pago no puede exceder lo que **ESA cuenta** debe.
 *   4. 🔴 **Solo Daniel aprueba**: rol admin **y** que sea él. Hay dos admins.
 *
 * Fechas FIJAS: el reloj se congela con `vi.setSystemTime`.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-prestamos-tope";
  // 5-sep-2026, 18:00 UTC = 13:00 en Panamá. Reloj congelado.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T18:00:00Z"));
});
afterAll(() => { vi.useRealTimers(); process.env.SESSION_SECRET = SECRET_PREV; });

// ── Andamiaje: una base de datos de mentira, con lo justo ────────────────────
interface FilaMov {
  id?: string;
  empleado_id?: string;
  fecha?: string;
  concepto?: string;
  monto?: number | string;
  estado?: string;
  deleted?: boolean | null;
  cuenta?: string | null;
  origen_pago?: string | null;
  notas?: string | null;
}

const db = {
  movimientos: [] as FilaMov[],
  ficha: { nombre: "ANGELA GARCIA", empresa: "Vistana International", empleado_codigo: "7" } as Record<string, unknown> | null,
  salario: 800 as number | null,
  insertado: null as Record<string, unknown> | null,
  updates: [] as Array<{ tabla: string; patch: Record<string, unknown> }>,
};

function tabla(nombre: string) {
  const q: Record<string, unknown> = {};
  const self = {
    select: () => self,
    insert: (row: Record<string, unknown>) => { db.insertado = row; return self; },
    update: (patch: Record<string, unknown>) => { db.updates.push({ tabla: nombre, patch }); return self; },
    eq: (col: string, val: unknown) => { q[col] = val; return self; },
    neq: () => self,
    or: () => self,
    limit: () => self,
    order: () => self,
    single: () => Promise.resolve(resolver(nombre, q, true)),
    maybeSingle: () => Promise.resolve(resolver(nombre, q, true)),
    then: (fn: (v: unknown) => unknown) => Promise.resolve(resolver(nombre, q, false)).then(fn),
  };
  return self;
}

function resolver(nombre: string, q: Record<string, unknown>, uno: boolean) {
  if (nombre === "prestamos_movimientos") {
    if (db.insertado) { const d = { id: "nuevo", ...db.insertado }; db.insertado = null; return { data: d, error: null }; }
    const filas = db.movimientos.filter((m) => !q.empleado_id || m.empleado_id === q.empleado_id);
    return { data: uno ? (filas[0] ?? null) : filas, error: null };
  }
  if (nombre === "prestamos_empleados") return { data: db.ficha, error: null };
  if (nombre === "asistencia_personas") return { data: { salario_mensual: db.salario }, error: null };
  return { data: uno ? null : [], error: null };
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (n: string) => tabla(n) },
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));

const telegramas: string[] = [];
vi.mock("@/lib/alertas/canal", () => ({
  enviarNegocioPrivado: vi.fn(async (t: string) => { telegramas.push(t); return true; }),
  enviarNegocio: vi.fn(async () => true),
  enviarSistema: vi.fn(async () => true),
}));

const { POST } = await import("@/app/api/prestamos/movimientos/route");
const { POST: DECIDIR, GET: LISTAR } = await import("@/app/api/prestamos/pendientes/route");

function pedir(url: string, body: unknown, role = "contabilidad", userName = "Contabilidad") {
  const cookie = signSession({ role, userId: "u1", userName, sessionToken: "t1", modules: ["prestamos"] });
  return new NextRequest(`https://fashiongr.com${url}`, {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db.movimientos = [];
  db.ficha = { nombre: "ANGELA GARCIA", empresa: "Vistana International", empleado_codigo: "7" };
  db.salario = 800;
  db.insertado = null;
  db.updates = [];
  telegramas.length = 0;
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 el tope: un sueldo mensual", () => {
  it("por debajo del tope entra APROBADO y no molesta a nadie", async () => {
    db.movimientos = [{ id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 100, estado: "aprobado" }];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-05", concepto: "Préstamo", monto: 200,
    }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.estado).toBe("aprobado");
    expect(j.pendiente).toBe(false);
    expect(telegramas).toHaveLength(0);
  });

  it("🔴 por encima se guarda PENDIENTE, se dice por qué y le llega a Daniel", async () => {
    db.movimientos = [{ id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 700, estado: "aprobado" }];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-05", concepto: "Préstamo", monto: 200,
    }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.estado).toBe("pendiente_aprobacion");
    expect(j.pendiente).toBe(true);
    expect(j.avisoTope).toContain("necesita aprobación de Daniel");
    // 🔴 Al chat PRIVADO, con trato de negocio (sin el prefijo de sistema).
    expect(telegramas).toHaveLength(1);
    expect(telegramas[0]).toContain("ANGELA GARCIA");
    expect(telegramas[0]).not.toContain("SISTEMA");
  });

  it("🔴 SIN SUELDO CARGADO el tope es $500 — no «sin tope»", async () => {
    db.salario = null;
    db.movimientos = [{ id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 450, estado: "aprobado" }];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-05", concepto: "Préstamo", monto: 100,
    }));
    expect((await res.json()).estado).toBe("pendiente_aprobacion");
  });

  it("🔴 EL DAÑO DE MERCANCÍA NUNCA SE FRENA — ya se perdió, no anotarla no la devuelve", async () => {
    db.movimientos = [{ id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 5000, estado: "aprobado" }];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-05", concepto: "Responsabilidad por daño", monto: 900,
    }));
    const j = await res.json();
    expect(j.estado).toBe("aprobado");
    expect(j.cuenta).toBe("dano");
    expect(telegramas).toHaveLength(0);
  });

  it("🔴 el tope mira la deuda TOTAL: un daño viejo cuenta para frenar un préstamo", async () => {
    db.movimientos = [
      { id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 400, estado: "aprobado" },
      { id: "b", empleado_id: "e1", fecha: "2026-02-01", concepto: "Responsabilidad por daño", monto: 350, estado: "aprobado" },
    ];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-05", concepto: "Préstamo", monto: 100,
    }));
    // 400 + 350 + 100 = 850 > 800. Con solo la cuenta de préstamo habría pasado.
    expect((await res.json()).estado).toBe("pendiente_aprobacion");
  });

  it("🔴 lo PENDIENTE no cuenta como deuda para el tope siguiente: no se entregó", async () => {
    db.movimientos = [
      { id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 700, estado: "pendiente_aprobacion" },
    ];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-05", concepto: "Préstamo", monto: 100,
    }));
    expect((await res.json()).estado).toBe("aprobado");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 el freno de duplicados mira concepto + fecha, NUNCA la nota", () => {
  // 🩸 Las grafías medidas en producción que burlaban el freno viejo.
  const NOTAS_QUE_BURLABAN = [
    "DEDUCCION QUINCENAL ",
    "DEDUCCION QUINCENAL",
    "DEDUCCION DE QUINCENA",
    "DESCUENTO QUINCENAL ",
    "Pago quincenal",
    null,
  ];

  for (const notas of NOTAS_QUE_BURLABAN) {
    it(`🩸 un pago ya registrado con la nota ${JSON.stringify(notas)} FRENA el segundo`, async () => {
      db.movimientos = [
        { id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 500, estado: "aprobado" },
        { id: "b", empleado_id: "e1", fecha: "2026-09-01", concepto: "Pago", monto: 50, estado: "aprobado", notas },
      ];
      const res = await POST(pedir("/api/prestamos/movimientos", {
        empleado_id: "e1", fecha: "2026-09-03", concepto: "Pago", monto: 50,
      }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("ya tiene el descuento de esta quincena");
    });
  }

  it("un pago de OTRO ORIGEN no se frena: es plata distinta a propósito", async () => {
    db.movimientos = [
      { id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 500, estado: "aprobado" },
      { id: "b", empleado_id: "e1", fecha: "2026-09-01", concepto: "Pago", monto: 50, estado: "aprobado" },
    ];
    // ROXANA: «quincenal 50.00 y vacaciones 400.00» — dos pagos el mismo mes.
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-03", concepto: "Pago", monto: 400, origen_pago: "Vacaciones",
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).origen_pago).toBe("Vacaciones");
  });

  it("un pago de la quincena ANTERIOR no frena el de ésta", async () => {
    db.movimientos = [
      { id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 500, estado: "aprobado" },
      { id: "b", empleado_id: "e1", fecha: "2026-08-15", concepto: "Pago", monto: 50, estado: "aprobado" },
    ];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-03", concepto: "Pago", monto: 50,
    }));
    expect(res.status).toBe(200);
  });

  it("🔑 el descuento del DAÑO no tapa el del préstamo: son dos cuentas", async () => {
    db.movimientos = [
      { id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 500, estado: "aprobado" },
      { id: "d", empleado_id: "e1", fecha: "2026-02-01", concepto: "Responsabilidad por daño", monto: 200, estado: "aprobado" },
      { id: "b", empleado_id: "e1", fecha: "2026-09-01", concepto: "Pago", monto: 20, estado: "aprobado", cuenta: "dano" },
    ];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-03", concepto: "Pago", monto: 50, cuenta: "prestamo",
    }));
    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("un pago no puede exceder lo que ESA cuenta debe", () => {
  it("el sobrante de una cuenta no cubre la otra", async () => {
    db.movimientos = [
      { id: "a", empleado_id: "e1", fecha: "2026-01-01", concepto: "Préstamo", monto: 500, estado: "aprobado" },
      { id: "d", empleado_id: "e1", fecha: "2026-02-01", concepto: "Responsabilidad por daño", monto: 30, estado: "aprobado" },
    ];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-03", concepto: "Pago", monto: 100, cuenta: "dano",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("daño de mercancía: $30.00");
  });

  it("🔑 sin decir la cuenta, el pago baja la MÁS VIEJA", async () => {
    db.movimientos = [
      { id: "d", empleado_id: "e1", fecha: "2026-01-01", concepto: "Responsabilidad por daño", monto: 200, estado: "aprobado" },
      { id: "a", empleado_id: "e1", fecha: "2026-06-01", concepto: "Préstamo", monto: 500, estado: "aprobado" },
    ];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-03", concepto: "Pago", monto: 50,
    }));
    expect((await res.json()).cuenta).toBe("dano");
  });

  it("y se puede CAMBIAR: quien registra elige", async () => {
    db.movimientos = [
      { id: "d", empleado_id: "e1", fecha: "2026-01-01", concepto: "Responsabilidad por daño", monto: 200, estado: "aprobado" },
      { id: "a", empleado_id: "e1", fecha: "2026-06-01", concepto: "Préstamo", monto: 500, estado: "aprobado" },
    ];
    const res = await POST(pedir("/api/prestamos/movimientos", {
      empleado_id: "e1", fecha: "2026-09-03", concepto: "Pago", monto: 50, cuenta: "prestamo",
    }));
    expect((await res.json()).cuenta).toBe("prestamo");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 solo Daniel aprueba", () => {
  beforeEach(() => {
    db.movimientos = [
      { id: "p1", empleado_id: "e1", fecha: "2026-09-01", concepto: "Préstamo", monto: 200, estado: "pendiente_aprobacion" },
    ];
  });

  it("Contabilidad NO puede aprobar", async () => {
    const res = await DECIDIR(pedir("/api/prestamos/pendientes", { id: "p1", accion: "aprobar" }, "contabilidad", "Contabilidad"));
    expect(res.status).toBe(403);
    expect(db.updates).toHaveLength(0);
  });

  it("⚠️ el OTRO admin tampoco: hay dos, y esto lo decide una persona", async () => {
    const res = await DECIDIR(pedir("/api/prestamos/pendientes", { id: "p1", accion: "aprobar" }, "admin", "alberto"));
    expect(res.status).toBe(403);
    expect(db.updates).toHaveLength(0);
  });

  it("Daniel sí, y al aprobar el movimiento pasa a contar (entra a la quincena en curso)", async () => {
    const res = await DECIDIR(pedir("/api/prestamos/pendientes", { id: "p1", accion: "aprobar" }, "admin", "daniel"));
    expect(res.status).toBe(200);
    expect(db.updates).toEqual([{ tabla: "prestamos_movimientos", patch: { estado: "aprobado" } }]);
  });

  it("rechazar lo elimina (soft delete), no lo deja esperando para siempre", async () => {
    const res = await DECIDIR(pedir("/api/prestamos/pendientes", { id: "p1", accion: "rechazar" }, "admin", "daniel"));
    expect(res.status).toBe(200);
    expect(db.updates).toEqual([{ tabla: "prestamos_movimientos", patch: { deleted: true } }]);
  });

  it("🔴 pero Contabilidad LO VE — esconderlo es el error que costó $700", async () => {
    const cookie = signSession({ role: "contabilidad", userId: "u1", userName: "Contabilidad", sessionToken: "t1", modules: ["prestamos"] });
    const req = new NextRequest("https://fashiongr.com/api/prestamos/pendientes", { headers: { cookie: `cxc_session=${cookie}` } });
    const res = await LISTAR(req);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.items).toHaveLength(1);
    expect(j.items[0].monto).toBe(200);
    // Lo ve, pero no lo puede tocar.
    expect(j.puedeDecidir).toBe(false);
  });
});

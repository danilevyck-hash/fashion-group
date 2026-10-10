// @vitest-environment node
//
// 🔴 CANDADO — ALTA Y BAJA DE QUIEN MARCA, EN UNA SOLA PASADA (9-oct-2026).
// Daniel: «hoy agregué una, pero mañana puedo necesitar eliminarla y crear
// otra». Lo que se cuida aquí, contra una base de mentira con las DOS reglas
// de la de verdad (la ficha tiene que existir; un colaborador, un usuario):
//   · el alta con acceso crea ficha + horario + usuario + vínculo;
//   · un código repetido se frena y no pisa nada;
//   · el campo «Colaborador» de Usuarios vincula y quita el vínculo;
//   · dar de baja desactiva el usuario (y sin la casilla, no);
//   · una ficha de baja no puede marcar, aunque su usuario siga activo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AVISO_CONTRASENA_REPETIDA } from "@/lib/auth/contrasena-en-uso";

type Fila = Record<string, unknown>;
const db: Record<string, Fila[]> = {};
let rol = "admin";
const marcasGuardadas: unknown[] = [];

/** Las dos reglas que la base de verdad hace cumplir sobre el vínculo. */
function restriccion(t: string, nueva: Fila, vieja: Fila | null) {
  if (t === "asistencia_personas" && !vieja && db[t].some((r) => r.empleado_codigo === nueva.empleado_codigo)) {
    return { code: "23505", message: 'duplicate key value violates unique constraint "asistencia_personas_pkey"' };
  }
  if (t === "fg_users" && nueva.empleado_codigo != null) {
    if (!db.asistencia_personas.some((p) => p.empleado_codigo === nueva.empleado_codigo)) {
      return { code: "23503", message: 'violates foreign key constraint "fg_users_empleado_codigo_fkey"' };
    }
    if (db.fg_users.some((u) => u !== vieja && u.empleado_codigo === nueva.empleado_codigo)) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "fg_users_empleado_codigo_uniq"' };
    }
  }
  return null;
}

function tabla(t: string) {
  const filtros: ((r: Fila) => boolean)[] = [];
  let op: { tipo: "select" | "insert" | "update" | "upsert"; datos?: Fila; clave?: string } = { tipo: "select" };
  let tope: number | undefined;
  const correr = (): { data: Fila[] | null; error: { code?: string; message: string } | null } => {
    const filas = (db[t] ??= []);
    if (op.tipo === "insert") {
      const fila: Fila = t === "fg_users" ? { id: crypto.randomUUID(), active: true, ...op.datos } : { ...op.datos };
      const err = restriccion(t, fila, null);
      if (err) return { data: null, error: err };
      filas.push(fila);
      return { data: [fila], error: null };
    }
    if (op.tipo === "upsert") {
      const k = op.clave!;
      const i = filas.findIndex((r) => r[k] === op.datos![k]);
      if (i >= 0) filas[i] = { ...filas[i], ...op.datos }; else filas.push({ ...op.datos });
      return { data: [op.datos!], error: null };
    }
    const sel = filas.filter((r) => filtros.every((f) => f(r)));
    if (op.tipo === "update") {
      for (const r of sel) {
        const err = restriccion(t, { ...r, ...op.datos }, r);
        if (err) return { data: null, error: err };
        Object.assign(r, op.datos);
      }
      return { data: sel, error: null };
    }
    return { data: tope ? sel.slice(0, tope) : sel, error: null };
  };
  const b = {
    select: () => b,
    insert: (d: Fila) => { op = { tipo: "insert", datos: d }; return b; },
    update: (d: Fila) => { op = { tipo: "update", datos: d }; return b; },
    upsert: (d: Fila, o: { onConflict: string }) => { op = { tipo: "upsert", datos: d, clave: o.onConflict }; return b; },
    eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return b; },
    neq: (c: string, v: unknown) => { filtros.push((r) => r[c] !== v); return b; },
    limit: (n: number) => { tope = n; return b; },
    order: () => b,
    maybeSingle: async () => { const r = correr(); return { data: r.data?.[0] ?? null, error: r.error }; },
    single: async () => {
      const r = correr();
      return r.data?.[0] ? { data: r.data[0], error: null } : { data: null, error: r.error ?? { message: "sin filas" } };
    },
    then: (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(correr()).then(ok, mal),
  };
  return b;
}

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => tabla(t) }, HAS_SERVICE_ROLE: true }));
const sesion = () => ({ role: rol, userId: "u-admin", userName: "daniel" });
vi.mock("@/lib/asistencia/guard", () => ({ requireAsistencia: () => sesion() }));
vi.mock("@/lib/require-auth", () => ({ requireAuth: () => null }));
vi.mock("@/lib/asistencia/alcance-boston-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  rechazarFueraDeAlcance: async () => null,
}));
vi.mock("@/lib/asistencia/config-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  leerTrabajaAfuera: async () => new Set<string>(),
  leerReponeTardanza: async () => new Set<string>(),
}));
// La ruta de marcar, con lo de afuera apagado (igual que `quinta-marca-rechazada`).
vi.mock("@/lib/marcacion/acceso", () => ({
  requireMarcacion: () => ({ role: "marcacion", userId: "u-siney", userName: "siney" }),
  leerEmpleadoCodigo: async () => "307",
}));
vi.mock("@/lib/marcacion/selfie-servidor", () => ({
  subirSelfie: async (p: string) => ({ path: p, achicada: true }),
  borrarSelfies: async () => undefined,
}));
vi.mock("@/lib/asistencia/guardar-marcaciones", () => ({
  guardarMarcaciones: async (filas: unknown[]) => { marcasGuardadas.push(...filas); return { error: null }; },
}));
vi.mock("@/lib/asistencia/mismo-aparato-io", () => ({ revisarMismoAparato: async () => undefined }));
vi.mock("@/lib/marcacion/lugar-al-marcar", () => ({ lugarTextoDeLaMarca: async () => null }));
vi.mock("@/lib/marcacion/estado-server", () => ({
  armarEstadoDeLaPantalla: async () => ({ codigo: "307" }),
  leerMarcasDeLaQuincena: async () => ({ quincena: { desde: "", hasta: "" }, marcas: [] }),
  marcaYaGuardada: async () => false,
  nombreDeLaFicha: async () => "Siney Suyem",
}));

async function pedir(ruta: string, metodo: "POST" | "PUT", cuerpo: unknown) {
  const mod = (await import(`@/app/api/${ruta}/route`)) as Record<string, (r: unknown) => Promise<Response>>;
  const { NextRequest } = await import("next/server");
  return mod[metodo](new NextRequest(`http://x/api/${ruta}`, {
    method: metodo, body: JSON.stringify(cuerpo), headers: { "Content-Type": "application/json" },
  }));
}

const FICHA = { nombre: "María Pérez", salarioMensual: 650, jornadaSemanal: 48, empresa: "american_classic" };
const ficha = (codigo: string) => db.asistencia_personas.find((p) => p.empleado_codigo === codigo);
const usuario = (name: string) => db.fg_users.find((u) => u.name === name);
const hoyPanama = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const diasDesdeHoy = (n: number) => new Date(Date.now() - 5 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  rol = "admin";
  marcasGuardadas.length = 0;
  const bcrypt = (await import("bcryptjs")).default;
  db.asistencia_personas = [
    { empleado_codigo: "305", nombre: "Angel Pizza", empresa: "american_classic", salario_mensual: 700, fecha_salida: null },
    { empleado_codigo: "307", nombre: "Siney Suyem", empresa: "american_classic", salario_mensual: 650, fecha_salida: null },
  ];
  db.fg_users = [
    { id: "u-siney", name: "siney", role: "marcacion", active: true, empleado_codigo: "307", password: await bcrypt.hash("siney123", 4) },
    { id: "u-angel", name: "angel", role: "bodega", active: true, empleado_codigo: null, password: await bcrypt.hash("angel123", 4), modulos_override: ["guias", "marcacion"] },
    { id: "u-admin", name: "daniel", role: "admin", active: true, empleado_codigo: null, password: await bcrypt.hash("jefe123", 4) },
  ];
  db.user_sessions = [{ id: "s1", user_name: "siney", revoked: false }];
  db.asistencia_horarios = [];
});

describe("🔴 el alta con acceso crea ficha + horario + usuario + vínculo", () => {
  it("una sola pasada: la ficha, su horario y su usuario de Marcación vinculado", async () => {
    const res = await pedir("asistencia/configuracion", "PUT", {
      ...FICHA, codigo: "308", alta: true, accesoMarcacion: { password: "maria2026" },
    });
    expect(res.status).toBe(200);
    expect(ficha("308")?.nombre).toBe("María Pérez");
    const u = usuario("María Pérez")!;
    expect(u.role).toBe("marcacion");
    expect(u.empleado_codigo).toBe("308");
    expect(u.active).toBe(true);
    // El mismo hash de la pantalla de Usuarios: bcrypt, nunca la contraseña a la vista.
    expect(String(u.password)).toMatch(/^\$2[ab]\$/);

    const { cuerpoDelHorario } = await import("@/lib/asistencia/alta-colaborador");
    const { horarioDeAlta } = await import("@/lib/asistencia/alta-colaborador");
    const rh = await pedir("asistencia/horarios", "PUT", cuerpoDelHorario("308", "María Pérez", horarioDeAlta("american_classic"), true));
    expect(rh.status).toBe(200);
    const h = db.asistencia_horarios.find((x) => x.empleado_codigo === "308")!;
    expect(h.entrada).toBe("08:00");
    expect(h.almuerzo_minutos).toBe(60); // Multifashion
    expect(h.dias_laborables).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("🔴 una contraseña que ya usa otra persona frena TODO: ni ficha ni usuario", async () => {
    const res = await pedir("asistencia/configuracion", "PUT", {
      ...FICHA, codigo: "308", alta: true, accesoMarcacion: { password: "siney123" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(AVISO_CONTRASENA_REPETIDA);
    expect(ficha("308")).toBeUndefined();
    expect(db.fg_users).toHaveLength(3);
  });

  it("🔴 crear usuarios sigue siendo del administrador: contabilidad no lo hace desde la ficha", async () => {
    rol = "contabilidad";
    const res = await pedir("asistencia/configuracion", "PUT", {
      ...FICHA, codigo: "308", alta: true, accesoMarcacion: { password: "maria2026" },
    });
    expect(res.status).toBe(403);
    expect(ficha("308")).toBeUndefined();
    expect(db.fg_users).toHaveLength(3);
  });

  it("sin el interruptor, el alta crea solo la ficha", async () => {
    const res = await pedir("asistencia/configuracion", "PUT", { ...FICHA, codigo: "308", alta: true });
    expect(res.status).toBe(200);
    expect(ficha("308")).toBeTruthy();
    expect(db.fg_users).toHaveLength(3);
  });
});

describe("🔴 un código repetido se frena y no pisa nada", () => {
  it("alta con el código de Siney: 409, lo dice con su nombre y la ficha queda igual", async () => {
    const antes = JSON.stringify(ficha("307"));
    const res = await pedir("asistencia/configuracion", "PUT", {
      ...FICHA, codigo: "307", alta: true, accesoMarcacion: { password: "maria2026" },
    });
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toContain("El código 307 ya es de Siney Suyem");
    expect(j.error).toContain("No se guardó nada");
    expect(JSON.stringify(ficha("307"))).toBe(antes);
    expect(db.fg_users).toHaveLength(3);
  });

  it("editar la ficha de siempre (sin `alta`) sigue guardando", async () => {
    const res = await pedir("asistencia/configuracion", "PUT", { ...FICHA, nombre: "Siney Suyem R.", codigo: "307" });
    expect(res.status).toBe(200);
    expect(ficha("307")?.nombre).toBe("Siney Suyem R.");
  });

  it("la serie de la empresa: mayor código numérico + 1, o nada", async () => {
    const { siguienteDeLaSerie } = await import("@/lib/asistencia/alta-colaborador");
    expect(siguienteDeLaSerie(["2", "3", "301", "307", "305"])).toBe("308");
    expect(siguienteDeLaSerie(["V-EG"])).toBeNull();
    expect(siguienteDeLaSerie([])).toBeNull();
  });
});

describe("🔴 Usuarios › «Colaborador» vincula y quita el vínculo, para cualquier rol", () => {
  it("vincula a un bodega con su ficha, y lo deja igual si el campo no viaja", async () => {
    expect((await pedir("admin/users", "PUT", { id: "u-angel", empleado_codigo: "305" })).status).toBe(200);
    expect(usuario("angel")?.empleado_codigo).toBe("305");
    expect((await pedir("admin/users", "PUT", { id: "u-angel", name: "angel" })).status).toBe(200);
    expect(usuario("angel")?.empleado_codigo).toBe("305");
  });

  it("quita el vínculo con `null`", async () => {
    await pedir("admin/users", "PUT", { id: "u-angel", empleado_codigo: "305" });
    expect((await pedir("admin/users", "PUT", { id: "u-angel", empleado_codigo: null })).status).toBe(200);
    expect(usuario("angel")?.empleado_codigo).toBeNull();
  });

  it("🔴 lo que la base rechaza se dice en palabras: ficha con otro usuario, ficha que no existe", async () => {
    const ocupado = await pedir("admin/users", "PUT", { id: "u-angel", empleado_codigo: "307" });
    expect(ocupado.status).toBe(409);
    expect((await ocupado.json()).error).toContain("ya está vinculado a otro usuario");
    const fantasma = await pedir("admin/users", "PUT", { id: "u-angel", empleado_codigo: "999" });
    expect(fantasma.status).toBe(409);
    expect((await fantasma.json()).error).toContain("no tiene ficha en Asistencia");
    expect(usuario("angel")?.empleado_codigo).toBeNull();
  });

  it("«Nuevo usuario» nace vinculado", async () => {
    const res = await pedir("admin/users", "POST", { name: "angel2", password: "otra456", role: "bodega", empleado_codigo: "305" });
    expect(res.status).toBe(200);
    expect(usuario("angel2")?.empleado_codigo).toBe("305");
  });
});

describe("🔴 dar de baja desactiva el usuario en la misma pasada", () => {
  const BAJA = { ...FICHA, nombre: "Siney Suyem", codigo: "307", fechaSalida: "2026-10-09", motivoSalida: "renuncia" };

  it("con la casilla: usuario inactivo y sin sesiones; nada se borra", async () => {
    const res = await pedir("asistencia/configuracion", "PUT", { ...BAJA, desactivarUsuario: true });
    expect(res.status).toBe(200);
    expect((await res.json()).usuarioDesactivado).toBe("siney");
    expect(ficha("307")?.fecha_salida).toBe("2026-10-09");
    expect(usuario("siney")?.active).toBe(false);
    expect(usuario("siney")?.empleado_codigo).toBe("307");
    expect(db.user_sessions[0].revoked).toBe(true);
    expect(db.asistencia_personas).toHaveLength(2);
    expect(db.fg_users).toHaveLength(3);
  });

  it("sin la casilla, el usuario queda como estaba", async () => {
    expect((await pedir("asistencia/configuracion", "PUT", BAJA)).status).toBe(200);
    expect(usuario("siney")?.active).toBe(true);
  });

  it("la casilla sin fecha de salida no desactiva a nadie", async () => {
    await pedir("asistencia/configuracion", "PUT", { ...FICHA, nombre: "Siney Suyem", codigo: "307", desactivarUsuario: true });
    expect(usuario("siney")?.active).toBe(true);
  });
});

describe("🔴 una ficha de baja no puede marcar, aunque su usuario siga activo", () => {
  async function marcar() {
    const f = new FormData();
    f.set("eventoId", crypto.randomUUID());
    f.set("tipo", "entrada");
    f.set("sinSenal", "0");
    f.set("lat", "8.98"); f.set("lng", "-79.52"); f.set("precisionM", "10");
    f.set("selfie", new File([new Uint8Array([1, 2, 3])], "s.jpg", { type: "image/jpeg" }));
    const { POST } = await import("@/app/api/marcacion/route");
    const { NextRequest } = await import("next/server");
    return POST(new NextRequest("http://x/api/marcacion", { method: "POST", body: f }));
  }

  it("de baja desde ayer: 409, se le dice, y no se guarda la marca", async () => {
    ficha("307")!.fecha_salida = diasDesdeHoy(-1);
    const res = await marcar();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Tu ficha de colaborador está inactiva desde el");
    expect(marcasGuardadas).toHaveLength(0);
  });

  it("su último día todavía marca, y una ficha activa también", async () => {
    ficha("307")!.fecha_salida = hoyPanama();
    expect((await marcar()).status).toBe(200);
    ficha("307")!.fecha_salida = null;
    expect((await marcar()).status).toBe(200);
    expect(marcasGuardadas).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CONDUCTA: cerrar la quincena congela LO QUE LA RUTA CALCULA, no lo que
//    mandó el navegador — y dos rangos que se pisan NO se escriben los dos.
//
// La regla pura vive en `lib/asistencia-planilla-guardada.test.ts`. Este archivo
// prueba la JUNTURA, que es donde este módulo ya se quemó dos veces (la Planilla
// no le pasaba `diaEnCurso` al motor; la ruta de aprobaciones escribía sin mirar
// la empresa): un test de la función pura NUNCA ve eso.
//
// Se llama a los handlers REALES con cookie FIRMADA y se mira QUÉ se escribió.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session-cookie";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-planilla-guardada"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

// ── LA BASE DE MENTIRA ───────────────────────────────────────────────────────

interface FilaCab { [k: string]: unknown; id: string; empresa: string; desde: string; hasta: string; estado: string }

const db = { cabeceras: [] as FilaCab[], lineas: [] as Record<string, unknown>[] };
/** El orden real de las escrituras. Es lo que prueba que la cabecera no nazca viva. */
const ops: string[] = [];
let faltaTabla = false;
let errorAjeno: { code: string; message: string } | null = null;
let errorEnLineas: { code: string; message: string } | null = null;
/** Un error SOLO al escribir la cabecera (el EXCLUDE de la base es de escritura). */
let errorAlEscribir: { code: string; message: string } | null = null;

function ejecutar(tabla: string, q: Consulta) {
  if (faltaTabla) {
    return Promise.resolve({
      data: null,
      error: { code: "PGRST205", message: `Could not find the table 'public.${tabla}' in the schema cache` },
    });
  }
  if (errorAjeno) return Promise.resolve({ data: null, error: errorAjeno });

  const filas = tabla === "asistencia_planilla_guardada" ? db.cabeceras : db.lineas;
  const casa = (f: Record<string, unknown>) =>
    Object.entries(q._filtros).every(([c, v]) => String(f[c] ?? "") === String(v));

  if ((q._op === "insert" || q._op === "update") && errorAlEscribir
      && tabla === "asistencia_planilla_guardada") {
    return Promise.resolve({ data: null, error: errorAlEscribir });
  }
  if (q._op === "insert") {
    if (tabla === "asistencia_planilla_guardada_linea" && errorEnLineas) {
      return Promise.resolve({ data: null, error: errorEnLineas });
    }
    const lote = Array.isArray(q._payload) ? q._payload : [q._payload];
    ops.push(`insert:${tabla}:${lote.length}`);
    for (const f of lote as Record<string, unknown>[]) filas.push({ ...f } as FilaCab);
    return Promise.resolve({ data: null, error: null });
  }
  if (q._op === "update") {
    const tocadas = filas.filter(casa);
    ops.push(`update:${tabla}:${String((q._payload as Record<string, unknown>).estado ?? "")}`);
    for (const f of tocadas) Object.assign(f, q._payload);
    return Promise.resolve({ data: tocadas.map((f) => ({ id: f.id })), error: null });
  }
  const sel = filas.filter(casa);
  const pagina = sel.slice(q._desde ?? 0, (q._hasta ?? sel.length - 1) + 1);
  return Promise.resolve({ data: pagina, error: null, count: q._count ? sel.length : null });
}

interface Consulta {
  _op: "select" | "insert" | "update";
  _filtros: Record<string, string>;
  _payload: unknown;
  _count: boolean;
  _desde?: number;
  _hasta?: number;
  [k: string]: unknown;
}

function consulta(tabla: string): Consulta {
  const q: Consulta = {
    _op: "select", _filtros: {}, _payload: null, _count: false,
    select(_c: string, opts?: { count?: string }) { q._count = !!opts?.count; return q; },
    eq(col: string, val: unknown) { q._filtros[col] = String(val); return q; },
    order() { return q; },
    range(a: number, b: number) { q._desde = a; q._hasta = b; return q; },
    insert(payload: unknown) { q._op = "insert"; q._payload = payload; return q; },
    update(payload: unknown) { q._op = "update"; q._payload = payload; return q; },
    then(res: unknown, rej: unknown) {
      return ejecutar(tabla, q).then(res as never, rej as never);
    },
  };
  return q;
}

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: { from: (tabla: string) => consulta(tabla) },
}));

// ── EL CÁLCULO DE LA PLANILLA (la ruta REAL, acá simulada) ───────────────────
//
// Se simula porque montar el motor entero —marcaciones, correcciones,
// justificaciones, repartos, préstamos— en un test de esta ruta probaría el
// motor, que ya tiene sus propios candados. Lo que ESTE archivo prueba es qué
// hace la ruta nueva CON lo que ese cálculo devuelve.

const LINEA_CALCULADA = {
  codigo: "40", etiqueta: "KEVIN LUBO", nombre: "KEVIN LUBO",
  empresa: "vistana", empresaEtiqueta: "Vistana International",
  salarioMensual: 523.47, jornadaSemanal: 48,
  horas: {
    extraDiurnoMin: 40, extraNocturnoMin: 0, extraNoAprobadaMin: 0, excedenteMin: 0,
    domingoMin: 0, feriadoMin: 0, tardanzaMin: 15.75, tardanzaGraveMin: 0,
    tardanzaGraveDias: 0, ausenciaMin: 480, ausenciaDias: 1, ausenciaJustificadaDias: 0,
    vacacionesYaPagadasMin: 0, vacacionesYaPagadasDias: 0, vacacionesDias: 0,
    sabadoMin: 0, diasTrabajados: 11, diasARevisar: 0,
    tardanzaDeDiasARevisarMin: 0, jornadaDiariaMin: 480,
  },
  faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true, baseSeguros: null,
  noMarcaReloj: false, parte: null, decidirAMano: null, quincenalReferencia: null,
  extraMedido: { minutos: 40, diurnoMin: 40, nocturnoMin: 0, monto: 12.58 },
  extraAprobada: true,
  dinero: {
    rataHora: 3.02, valorMinuto: 0.05033333333333333, salarioQuincenal: 261.74,
    extraDiurno: 12.58, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
    ausencias: 24.16, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 24.16,
    vacacionesYaPagadas: 0, tardanzas: 0.79, totalBruto: 249.37, baseSeguros: null,
    seguroSocial: 24.31, seguroEducativo: 3.12, isr: 0, prestamo: 50, terceros: 0,
    mercancia: 10, totalDeducciones: 87.43, otrosServicios: 0, netoPagar: 161.94,
  },
  manuales: { isr: 0, prestamo: 50, terceros: 0, mercancia: 10, otrosServicios: 0 },
};

/** Lo que devuelve el cálculo. Se puede torcer para probar los guards. */
let cuadro: Record<string, unknown> = {};
function cuadroPorDefecto() {
  return {
    empresa: "vistana",
    periodo: { desde: "2026-08-01", hasta: "2026-08-15", claveManuales: "2026-08-1", factorBase: 1 },
    lineas: [JSON.parse(JSON.stringify(LINEA_CALCULADA))],
    // Lo que el módulo de Préstamos propone descontar. Vacío = nada pendiente.
    prestamos: [] as Record<string, unknown>[],
  };
}

vi.mock("@/app/api/asistencia/planilla/route", () => ({
  GET: async () => NextResponse.json(cuadro),
}));

const { GET, POST, PATCH } = await import("@/app/api/asistencia/planilla-guardada/route");
// El I/O, para probar los frenos que la ruta ya tapa por delante: sin esto, el
// candado de la base se puede borrar y ningún test se entera (lo destapó el
// verificador de mutaciones).
const { reabrirPlanilla } = await import("@/lib/asistencia/planilla-guardada-server");

// ── LA COOKIE ────────────────────────────────────────────────────────────────

function cookieDe(rol: string, usuario: string) {
  return signSession({
    role: rol, userId: "u1", userName: usuario, sessionToken: "t1",
    modules: rol === "gerente_boston" ? ["boston", "catalogos"] : ["asistencia"],
  });
}

function pedir(metodo: "POST" | "PATCH", rol: string, usuario: string, body: unknown) {
  return new NextRequest("https://fashiongr.com/api/asistencia/planilla-guardada", {
    method: metodo,
    headers: { cookie: `cxc_session=${cookieDe(rol, usuario)}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function leer(rol: string, usuario: string, qs: string) {
  return new NextRequest(`https://fashiongr.com/api/asistencia/planilla-guardada?${qs}`, {
    headers: { cookie: `cxc_session=${cookieDe(rol, usuario)}` },
  });
}

/** Una quincena YA cerrada en la base de mentira. */
function yaCerrada(over: Partial<FilaCab> = {}): FilaCab {
  const f: FilaCab = {
    id: "vieja-1", empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15",
    quincena: "2026-08-1", version: 1, estado: "cerrada", cerrada_por: "Angela",
    cerrada_en: "2026-08-16T10:00:00Z", reabierta_por: null, reabierta_en: null,
    motivo_reabrir: null, personas: 1, total_bruto: 249.37, total_deducciones: 87.43,
    total_neto: 161.94, factor_base: 1, ...over,
  };
  db.cabeceras.push(f);
  db.lineas.push({ id: 1, planilla_id: f.id, empleado_codigo: "40", neto_pagar: 161.94 });
  return f;
}

beforeEach(() => {
  db.cabeceras.length = 0;
  db.lineas.length = 0;
  ops.length = 0;
  faltaTabla = false;
  errorAjeno = null;
  errorEnLineas = null;
  errorAlEscribir = null;
  cuadro = cuadroPorDefecto();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 se congela lo que la ruta CALCULA, no lo que mandó el navegador", () => {
  const CUERPO = { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" };

  it("guarda, y los montos son los del cálculo", async () => {
    const r = await POST(pedir("POST", "contabilidad", "Contabilidad", CUERPO));
    expect(r.status).toBe(200);
    expect(db.cabeceras.length).toBe(1);
    expect(db.lineas.length).toBe(1);
    expect(db.lineas[0].neto_pagar).toBe(161.94);
    expect(db.lineas[0].tardanza_min).toBe(15.75);
    expect(db.lineas[0].empleado_codigo).toBe("40");
    expect(db.cabeceras[0].estado).toBe("cerrada");
    expect(db.cabeceras[0].version).toBe(1);
    expect(db.cabeceras[0].total_neto).toBe(161.94);
  });

  it("🔴 un cuerpo con MONTOS adentro no cambia ni un centavo de lo cerrado", async () => {
    // El modo de fallo que esto tapa: cualquiera con el módulo escribiendo el
    // sueldo que quiera en el registro de lo que se pagó.
    const r = await POST(pedir("POST", "contabilidad", "Contabilidad", {
      ...CUERPO,
      lineas: [{ codigo: "40", dinero: { netoPagar: 999999, totalBruto: 999999 } }],
      totales: { totalNeto: 999999 },
      netoPagar: 999999,
    }));
    expect(r.status).toBe(200);
    expect(db.lineas[0].neto_pagar).toBe(161.94);
    expect(db.cabeceras[0].total_neto).toBe(161.94);
  });

  it("🔴 la FIRMA sale de la sesión, no del cuerpo", async () => {
    const r = await POST(pedir("POST", "admin", "daniel", { ...CUERPO, guardada_por: "OTRO", usuario: "OTRO" }));
    expect(r.status).toBe(200);
    expect(db.cabeceras[0].cerrada_por).toBe("daniel");
  });

  it("🩸 la cabecera NACE `cerrando` y se cierra DESPUÉS de los renglones", async () => {
    // Sin esto, una cabecera `guardada` sin renglones se lee como «se pagó $0».
    await POST(pedir("POST", "admin", "daniel", CUERPO));
    expect(ops).toEqual([
      "insert:asistencia_planilla_guardada:1",
      "insert:asistencia_planilla_guardada_linea:1",
      "update:asistencia_planilla_guardada:cerrada",
    ]);
  });

  it("🔴 si los renglones fallan, el cuadro NO queda `cerrada`", async () => {
    errorEnLineas = { code: "23502", message: "null value in column violates not-null" };
    const r = await POST(pedir("POST", "admin", "daniel", CUERPO));
    expect(r.status).toBe(500);
    expect(db.cabeceras[0].estado).toBe("cerrando");
    expect(db.lineas.length).toBe(0);
  });

  it("se congelan TAMBIÉN las horas, no solo la plata", async () => {
    await POST(pedir("POST", "admin", "daniel", CUERPO));
    const l = db.lineas[0];
    expect(l.extra_diurno_min).toBe(40);
    expect(l.ausencia_min).toBe(480);
    expect(l.dias_trabajados).toBe(11);
    expect(l.jornada_diaria_min).toBe(480);
  });

  it("una quincena por su clave da el MISMO rango", async () => {
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", quincena: "2026-08-1" }));
    expect(r.status).toBe(200);
    expect(db.cabeceras[0].desde).toBe("2026-08-01");
    expect(db.cabeceras[0].hasta).toBe("2026-08-15");
    expect(db.cabeceras[0].quincena).toBe("2026-08-1");
  });

  it("🔴 si el cuadro que vuelve NO es de la empresa pedida, no se guarda nada", async () => {
    // La otra ruta FUERZA la empresa (David, aprobador acotado). Congelar como
    // «Vistana» un cuadro de las tres empresas sería inventar una planilla.
    cuadro = { ...cuadroPorDefecto(), empresa: null };
    const r = await POST(pedir("POST", "contabilidad", "Contabilidad", CUERPO));
    expect(r.status).toBe(409);
    expect(db.cabeceras.length).toBe(0);
    expect(db.lineas.length).toBe(0);
  });

  it("⚠️ un período sin gente no se guarda: bloquearía el rango con un $0", async () => {
    cuadro = { ...cuadroPorDefecto(), lineas: [] };
    const r = await POST(pedir("POST", "admin", "daniel", CUERPO));
    expect(r.status).toBe(400);
    expect(db.cabeceras.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el solapamiento — nadie pagado dos veces por el mismo día", () => {
  it("guardar 10-20 con 1-15 ya guardada se RECHAZA y no escribe NADA", async () => {
    yaCerrada();
    const r = await POST(pedir("POST", "admin", "daniel", {
      empresa: "vistana", desde: "2026-08-10", hasta: "2026-08-20",
    }));
    expect(r.status).toBe(409);
    expect(db.cabeceras.length).toBe(1);
    expect(db.lineas.length).toBe(1);
    const j = await r.json();
    expect(j.error).toContain("dos veces");
    expect(j.solapadas[0].id).toBe("vieja-1");
  });

  it("🔑 el freno corta ANTES de escribir: no queda ni una cabecera a medias", async () => {
    yaCerrada();
    await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-08-15", hasta: "2026-08-31" }));
    expect(ops).toEqual([]);
  });

  it("la quincena de al lado (16-31) SÍ se guarda", async () => {
    yaCerrada();
    cuadro = {
      empresa: "vistana",
      periodo: { desde: "2026-08-16", hasta: "2026-08-31", claveManuales: "2026-08-2", factorBase: 1 },
      lineas: [JSON.parse(JSON.stringify(LINEA_CALCULADA))],
    };
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", quincena: "2026-08-2" }));
    expect(r.status).toBe(200);
    expect(db.cabeceras.length).toBe(2);
  });

  it("⚠️ OTRA EMPRESA con los mismos días se guarda: es otra planilla", async () => {
    yaCerrada({ id: "vieja-boston", empresa: "confecciones_boston" });
    const r = await POST(pedir("POST", "admin", "daniel", {
      empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15",
    }));
    expect(r.status).toBe(200);
    expect(db.cabeceras.filter((c) => c.empresa === "vistana").length).toBe(1);
  });

  it("🔴 una REABIERTA no bloquea: se vuelve a guardar el mismo rango", async () => {
    yaCerrada({ estado: "reabierta", reabierta_por: "daniel", reabierta_en: "2026-08-20T10:00:00Z", motivo_reabrir: "se corrigió una marcación" });
    const r = await POST(pedir("POST", "admin", "daniel", {
      empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15",
    }));
    expect(r.status).toBe(200);
    // La vieja SIGUE ahí: reabrir no borra, y guardar de nuevo tampoco.
    expect(db.cabeceras.length).toBe(2);
    expect(db.cabeceras[0].estado).toBe("reabierta");
  });

  it("el EXCLUDE de la base (dos guardados a la vez) se traduce a 409", async () => {
    // Se llega acá cuando el chequeo previo no alcanza porque otro guardó en el
    // medio. La base es el ÚLTIMO freno, no el único.
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" }));
    expect(r.status).toBe(200);
    errorAlEscribir = { code: "23P01", message: 'conflicting key value violates exclusion constraint "asistencia_planilla_guardada_sin_solape"' };
    const r2 = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-08-05", hasta: "2026-08-20" }));
    expect(r2.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 reabrir NO borra", () => {
  it("cambia el estado, firma quién y deja los renglones intactos", async () => {
    yaCerrada();
    const r = await PATCH(pedir("PATCH", "contabilidad", "Contabilidad", { id: "vieja-1", motivo: "faltó una corrección" }));
    expect(r.status).toBe(200);
    expect(db.cabeceras.length).toBe(1);
    expect(db.lineas.length).toBe(1);
    expect(db.cabeceras[0].estado).toBe("reabierta");
    expect(db.cabeceras[0].reabierta_por).toBe("Contabilidad");
    expect(db.cabeceras[0].reabierta_en).toBeTruthy();
    expect(db.cabeceras[0].motivo_reabrir).toBe("faltó una corrección");
    // 🔴 Y la firma de quien la guardó NO se toca.
    expect(db.cabeceras[0].cerrada_por).toBe("Angela");
  });

  it("🔴 SIN MOTIVO no se reabre, y no se escribe nada", async () => {
    yaCerrada();
    const r = await PATCH(pedir("PATCH", "admin", "daniel", { id: "vieja-1" }));
    expect(r.status).toBe(400);
    expect(db.cabeceras[0].estado).toBe("cerrada");
    expect(ops).toEqual([]);
  });

  it("🩸 un motivo de puros espacios tampoco — es lo que teclea quien se lo saltea", async () => {
    yaCerrada();
    const r = await PATCH(pedir("PATCH", "admin", "daniel", { id: "vieja-1", motivo: "   " }));
    expect(r.status).toBe(400);
    expect(db.cabeceras[0].estado).toBe("cerrada");
  });

  it("⚠️ reabrir dos veces NO pisa la firma de la primera", async () => {
    yaCerrada();
    await PATCH(pedir("PATCH", "admin", "daniel", { id: "vieja-1", motivo: "se corrigió una marcación" }));
    const r = await PATCH(pedir("PATCH", "contabilidad", "Contabilidad", { id: "vieja-1", motivo: "otra vez" }));
    expect(r.status).toBe(409);
    // 🔴 La firma y el motivo de la PRIMERA reapertura quedan intactos.
    expect(db.cabeceras[0].reabierta_por).toBe("daniel");
    expect(db.cabeceras[0].motivo_reabrir).toBe("se corrigió una marcación");
  });

  // 🩸 ESTE CASO FALTABA y lo destapó el verificador de mutaciones: la ruta
  // rechaza la segunda reapertura ANTES de escribir, así que borrarle al UPDATE
  // su `.eq("estado", "guardada")` pasaba todos los tests. Y ese `.eq` es el
  // único freno cuando dos personas aprietan el botón a la vez: sin él, la
  // segunda pisa la firma de la primera y el rastro dice que reabrió quien no
  // reabrió. Se llama al I/O DERECHO, sin la ruta por delante.
  it("🔴 el UPDATE mismo se niega a reabrir lo que ya está reabierto", async () => {
    yaCerrada({ estado: "reabierta", reabierta_por: "daniel", reabierta_en: "2026-08-20T10:00:00Z", motivo_reabrir: "se corrigió una marcación" });
    const r = await reabrirPlanilla("vieja-1", "Contabilidad", "otra vez");
    expect(r.ok).toBe(false);
    expect(r.yaReabierta).toBe(true);
    expect(db.cabeceras[0].reabierta_por).toBe("daniel");
    expect(db.cabeceras[0].motivo_reabrir).toBe("se corrigió una marcación");
  });

  it("una que no existe da 404 y no escribe", async () => {
    const r = await PATCH(pedir("PATCH", "admin", "daniel", { id: "no-existe", motivo: "x" }));
    expect(r.status).toBe(404);
    expect(ops).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ CAMBIÓ DE DIRECCIÓN EL 3-SEP-2026 (tolerancia a la DDL retirada). Hasta
// ese día este bloque se llamaba «SIN la migración corrida (patrón
// cols-opcionales)»: con PGRST205 guardar contestaba 503 con el nombre del
// archivo, leer contestaba 200 vacío con el aviso, y reabrir 503. Las dos
// tablas existen desde 20260904120000; hoy ese código es un error como
// cualquier otro y las tres puertas contestan 500 con el mensaje — leer
// «vacío» ante un error dejaría pasar el freno del solapamiento (doble pago).
describe("🔴 un PGRST205 ya no es «falta la migración»: es un error, y se ve", () => {
  it("guardar contesta 500 con el mensaje, sin aviso tranquilizador, y nadie cree que guardó", async () => {
    faltaTabla = true;
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" }));
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.ok).toBeUndefined();
    expect(j.aviso).toBeUndefined();
    expect(j.error).toContain("asistencia_planilla_guardada");
    expect(db.cabeceras.length).toBe(0);
  });

  it("🔴 leer TAMBIÉN revienta: «no hay nada cerrado» ante un error abre el doble pago", async () => {
    faltaTabla = true;
    const r = await GET(leer("admin", "daniel", "empresa=vistana&desde=2026-08-01&hasta=2026-08-15"));
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.cerrada).toBeUndefined();
    expect(j.aviso).toBeUndefined();
    expect(j.error).toContain("asistencia_planilla_guardada");
  });

  it("y leer UNA por id, lo mismo", async () => {
    faltaTabla = true;
    const r = await GET(leer("admin", "daniel", "id=vieja-1"));
    expect(r.status).toBe(500);
    expect((await r.json()).aviso).toBeUndefined();
  });

  it("reabrir revienta en vez de avisar", async () => {
    faltaTabla = true;
    const r = await PATCH(pedir("PATCH", "admin", "daniel", { id: "vieja-1", motivo: "x" }));
    expect(r.status).toBe(500);
    expect((await r.json()).aviso).toBeUndefined();
  });

  // 🩸 EL CASO QUE ESTE REPO YA PAGÓ: tragarse CUALQUIER error como «falta la
  // tabla» convierte un permiso, un timeout o un RLS en un aviso tranquilizador,
  // y el problema real se queda sin que nadie lo mire.
  it("🔴 un error que NO es «falta la tabla» NO degrada: revienta", async () => {
    errorAjeno = { code: "42501", message: "permission denied for table asistencia_planilla_guardada" };
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" }));
    expect(r.status).toBe(500);
    expect(db.cabeceras.length).toBe(0);
  });

  // 🩸 Y OTRO QUE FALTABA, del mismo verificador: el error de la LECTURA se
  // atrapa antes, así que el `esTablaFaltante` de la ESCRITURA se podía cambiar
  // por `true` sin que nada se cayera. Ahí el modo de fallo es el peor: un RLS
  // que rechaza el INSERT se leería como «falta correr el archivo», Daniel lo
  // correría, y la planilla seguiría sin guardarse. (Desde el 3-sep-2026 ya no
  // hay `esTablaFaltante` en la escritura; el test se queda como candado.)
  it("🔴 tampoco degrada cuando el error es de la ESCRITURA, no de la lectura", async () => {
    errorAlEscribir = { code: "42501", message: "permission denied for table asistencia_planilla_guardada" };
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" }));
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.aviso).toBeUndefined();
    expect(db.cabeceras.length).toBe(0);
  });

  it("⚠️ y un timeout tampoco, ni siquiera nombrando la tabla", async () => {
    errorAjeno = { code: "57014", message: "canceling statement due to statement timeout" };
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" }));
    expect(r.status).toBe(500);
    expect(db.cabeceras.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("quién entra", () => {
  const CUERPO = { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" };

  it("🔴 `bodega` (Julio) NO guarda: recibe la planilla SIN dinero a propósito", async () => {
    const r = await POST(pedir("POST", "bodega", "Bodega", CUERPO));
    expect(r.status).toBe(403);
    expect(db.cabeceras.length).toBe(0);
  });

  it("🔴 `gerente_boston` (David) tampoco: sus sueldos se recortan en el servidor", async () => {
    const r = await POST(pedir("POST", "gerente_boston", "david", { ...CUERPO, empresa: "confecciones_boston" }));
    expect(r.status).toBe(403);
    expect(db.cabeceras.length).toBe(0);
  });

  it("un vendedor no entra ni a leer", async () => {
    expect((await POST(pedir("POST", "vendedor", "rey", CUERPO))).status).toBe(403);
    expect((await GET(leer("vendedor", "rey", "empresa=vistana"))).status).toBe(403);
    expect((await PATCH(pedir("PATCH", "vendedor", "rey", { id: "vieja-1", motivo: "x" }))).status).toBe(403);
  });

  it("🔴 la SECRETARIA no cierra: genera y mira, pero no firma un pago", async () => {
    const r = await POST(pedir("POST", "secretaria", "Andrea", CUERPO));
    expect(r.status).toBe(403);
    expect(db.cabeceras.length).toBe(0);
    // …pero SÍ puede mirar lo cerrado.
    yaCerrada();
    const g = await GET(leer("secretaria", "Andrea", "empresa=vistana&desde=2026-08-01&hasta=2026-08-15"));
    expect(g.status).toBe(200);
    expect((await g.json()).cerrada.id).toBe("vieja-1");
  });

  it("🔴 y tampoco reabre", async () => {
    yaCerrada();
    const r = await PATCH(pedir("PATCH", "secretaria", "Andrea", { id: "vieja-1", motivo: "porque sí" }));
    expect(r.status).toBe(403);
    expect(db.cabeceras[0].estado).toBe("cerrada");
  });

  it("⚠️ contabilidad SIN el módulo en su override no entra (el agujero del 31-ago)", async () => {
    const cookie = signSession({
      role: "contabilidad", userId: "u1", userName: "Contabilidad", sessionToken: "t1",
      modules: ["prestamos", "proveedores", "ventas"],
    });
    const req = new NextRequest("https://fashiongr.com/api/asistencia/planilla-guardada", {
      method: "POST",
      headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
      body: JSON.stringify(CUERPO),
    });
    expect((await POST(req)).status).toBe(403);
    expect(db.cabeceras.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que llega se valida", () => {
  it("una empresa que no es del reloj se rechaza", async () => {
    const r = await POST(pedir("POST", "admin", "daniel", {
      empresa: "american_classic", desde: "2026-08-01", hasta: "2026-08-15",
    }));
    expect(r.status).toBe(400);
    expect(db.cabeceras.length).toBe(0);
  });

  it("sin empresa se rechaza", async () => {
    const r = await POST(pedir("POST", "admin", "daniel", { desde: "2026-08-01", hasta: "2026-08-15" }));
    expect(r.status).toBe(400);
  });

  it("una fecha que no existe se rechaza", async () => {
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2026-02-31", hasta: "2026-03-05" }));
    expect(r.status).toBe(400);
  });

  it("un rango de diez años se rechaza", async () => {
    const r = await POST(pedir("POST", "admin", "daniel", { empresa: "vistana", desde: "2016-01-01", hasta: "2026-01-01" }));
    expect(r.status).toBe(400);
    expect(db.cabeceras.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("leer lo guardado", () => {
  it("dice cuál está guardada para ese rango y cuáles lo pisan", async () => {
    yaCerrada();
    const r = await GET(leer("admin", "daniel", "empresa=vistana&desde=2026-08-01&hasta=2026-08-15"));
    const j = await r.json();
    expect(j.cerrada.id).toBe("vieja-1");
    expect(j.cerrada.cerradaPor).toBe("Angela");
    expect(j.estado).toBe("cerrada");
    expect(j.solapadas).toEqual([]);

    const r2 = await GET(leer("admin", "daniel", "empresa=vistana&desde=2026-08-10&hasta=2026-08-20"));
    const j2 = await r2.json();
    expect(j2.cerrada).toBeNull();
    expect(j2.estado).toBe("cerrada");
    expect(j2.solapadas.length).toBe(1);
  });

  it("🔴 el historial trae también las reabiertas: lo que se pagó se sigue viendo", async () => {
    yaCerrada({ id: "v1", estado: "reabierta", reabierta_por: "daniel", reabierta_en: "2026-08-20T10:00:00Z" });
    const r = await GET(leer("admin", "daniel", "empresa=vistana"));
    const j = await r.json();
    expect(j.historial.length).toBe(1);
    expect(j.historial[0].estado).toBe("reabierta");
    expect(j.historial[0].reabiertaPor).toBe("daniel");
    expect(j.cerrada).toBeNull();
  });

  it("por id devuelve los renglones CONGELADOS, sin recalcular", async () => {
    yaCerrada();
    const r = await GET(leer("admin", "daniel", "id=vieja-1"));
    const j = await r.json();
    expect(j.cabecera.id).toBe("vieja-1");
    expect(j.lineas.length).toBe(1);
    expect(j.lineas[0].neto_pagar).toBe(161.94);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 sin aprobar NO se cierra — es un freno, no un aviso", () => {
  const CUERPO = { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" };

  it("🔴 horas extra sin aprobar: 409, con el nombre y la pestaña, y NADA escrito", async () => {
    const c = cuadroPorDefecto();
    (c.lineas[0] as Record<string, unknown>).extraAprobada = false;
    cuadro = c;
    const r = await POST(pedir("POST", "contabilidad", "Contabilidad", CUERPO));
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toContain("No se puede cerrar");
    expect(j.error).toContain("KEVIN LUBO");
    expect(j.error).toContain("Aprobaciones");
    expect(j.frenos[0].tipo).toBe("horas-extra");
    expect(j.frenos[0].personas).toBe(1);
    // 🔴 Y no se escribió NI la cabecera: el freno corta antes de tocar la base.
    expect(ops).toEqual([]);
    expect(db.cabeceras.length).toBe(0);
  });

  it("🔴 un préstamo sin aprobar también frena", async () => {
    const c = cuadroPorDefecto();
    c.prestamos = [{
      codigo: "9", etiqueta: "LUIS ARROYO", empresa: "vistana", empresaEtiqueta: "Vistana",
      nombrePrestamos: "LUIS ADRIAN ARROYO", cuota: 50, saldo: 700, sugerido: 50,
      origen: "cuota", aprobado: false, por: null, cuando: null, montoVisto: null, enCasilla: 0,
    }];
    cuadro = c;
    const r = await POST(pedir("POST", "admin", "daniel", CUERPO));
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toContain("LUIS ARROYO");
    expect(j.error).toContain("$50.00");
    expect(db.cabeceras.length).toBe(0);
  });

  it("⚠️ un préstamo YA aprobado no frena: se cierra normal", async () => {
    const c = cuadroPorDefecto();
    c.prestamos = [{
      codigo: "9", etiqueta: "LUIS ARROYO", empresa: "vistana", empresaEtiqueta: "Vistana",
      nombrePrestamos: "LUIS ADRIAN ARROYO", cuota: 50, saldo: 700, sugerido: 50,
      origen: "cuota", aprobado: true, por: "daniel", cuando: "2026-08-16", montoVisto: 50, enCasilla: 50,
    }];
    cuadro = c;
    const r = await POST(pedir("POST", "admin", "daniel", CUERPO));
    expect(r.status).toBe(200);
    expect(db.cabeceras[0].estado).toBe("cerrada");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 versiones, no ediciones", () => {
  it("reabrir y volver a cerrar deja DOS filas: la v1 con sus montos y la v2", async () => {
    const CUERPO = { empresa: "vistana", desde: "2026-08-01", hasta: "2026-08-15" };
    await POST(pedir("POST", "admin", "daniel", CUERPO));
    const v1 = db.cabeceras[0].id;
    expect(db.cabeceras[0].version).toBe(1);

    await PATCH(pedir("PATCH", "admin", "daniel", { id: v1, motivo: "la contadora corrigió una marcación" }));
    // El cálculo cambia (una corrección movió el neto): la v2 tiene que traer
    // el número NUEVO y la v1 conservar el viejo.
    const c = cuadroPorDefecto();
    (c.lineas[0] as { dinero: Record<string, number> }).dinero.netoPagar = 175.5;
    cuadro = c;
    const r = await POST(pedir("POST", "admin", "daniel", CUERPO));
    expect(r.status).toBe(200);

    expect(db.cabeceras.length).toBe(2);
    const vieja = db.cabeceras.find((x) => x.id === v1)!;
    const nueva = db.cabeceras.find((x) => x.id !== v1)!;
    expect(vieja.estado).toBe("reabierta");
    expect(vieja.version).toBe(1);
    expect(vieja.total_neto).toBe(161.94);
    expect(nueva.version).toBe(2);
    expect(nueva.total_neto).toBe(175.5);
    // 🔴 Los renglones de la v1 siguen enteros: nunca se pierde lo que se pagó.
    expect(db.lineas.filter((l) => l.planilla_id === v1).length).toBe(1);
    expect(db.lineas.filter((l) => l.planilla_id === v1)[0].neto_pagar).toBe(161.94);
    expect(db.lineas.length).toBe(2);
  });
});

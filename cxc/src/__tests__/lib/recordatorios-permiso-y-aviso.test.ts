// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS — CONDUCTA: quién entra, y qué sale por Telegram.
//
// 🔴 Estos NO son barridos de texto: llaman a los handlers REALES de las rutas
// con cookies FIRMADAS y miran el status y lo que se escribió, y corren
// `runChequesAlert` de verdad y leen el mensaje que se mandó. Que una lista de
// roles CONTENGA "admin" no prueba que la ruta deje entrar a admin, y que un
// archivo NOMBRE `construirAvisoRecordatorios` no prueba que el aviso salga.
//
// Daniel, a la pregunta de quién los ve: ***"admin y secre"***.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SESSION_SECRET ||= "test-secret-para-firmar-sesiones";

// ─── Doble de Supabase: despacha por tabla ───────────────────────────────────
const filasCheques = vi.fn();
const filasRecordatorios = vi.fn();
const heartbeat = vi.fn();
/** Lo último que se INSERTÓ o se ACTUALIZÓ en `recordatorios`. */
let escrito: Record<string, unknown> | null = null;
let filtrosRec: Record<string, unknown> = {};

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => {
      if (tabla === "cron_heartbeats") {
        const hb = { select: () => hb, eq: () => hb, maybeSingle: () => heartbeat() } as Record<string, unknown>;
        return hb;
      }
      if (tabla === "recordatorios") {
        const rec = {
          select: () => rec,
          eq: (col: string, val: unknown) => { filtrosRec[col] = val; return rec; },
          order: () => rec,
          range: async () => filasRecordatorios(),
          insert: (campos: Record<string, unknown>) => { escrito = campos; return rec; },
          update: (campos: Record<string, unknown>) => { escrito = campos; return rec; },
          single: async () => ({ data: { id: "nuevo", ...(escrito ?? {}) }, error: null }),
          maybeSingle: async () => ({ data: { id: "nuevo", ...(escrito ?? {}) }, error: null }),
        } as Record<string, unknown>;
        return rec;
      }
      // Cheques: filtra de verdad, igual que el doble de `cheques-aviso-*`.
      const ch = {
        select: () => ch,
        eq: () => ch,
        gte: () => ch,
        lte: () => ch,
        order: async () => filasCheques(),
      } as Record<string, unknown>;
      return ch;
    },
  },
}));

const enviado = vi.fn();
vi.mock("@/lib/alertas/canal", () => ({
  enviarNegocio: (texto: string) => { enviado(texto); return Promise.resolve(true); },
}));

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { GET as GET_RECS, POST as POST_REC } from "@/app/api/recordatorios/route";
import { PUT as PUT_REC, DELETE as DELETE_REC } from "@/app/api/recordatorios/[id]/route";
import { runChequesAlert } from "@/lib/cheques-alert";
import { SYSTEM_ROLE_KEYS } from "@/lib/modules";
import { RECORDATORIOS_ROLES } from "@/lib/recordatorios/roles";

const UUID = "11111111-2222-4333-8444-555555555555";

function pedido(rol: string | null, metodo = "GET", body?: unknown, url = "http://localhost/api/recordatorios") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (rol) {
    headers.cookie = `cxc_session=${signSession({ role: rol, userId: "u1", userName: "Daniel", sessionToken: "s1" })}`;
  }
  return new NextRequest(url, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
}

const CUERPO_OK = { fecha: "2026-08-24", texto: "Recordar cobrar" };

/** El instante REAL de las 9:15 a.m. de Panamá (14:15 UTC) de esa fecha. */
const nueveQuince = (ymd: string) => new Date(`${ymd}T14:15:00.000Z`);

const filaRec = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  fecha: "2026-08-24",
  texto: "Recordar cobrar",
  cliente: null,
  cliente_codigo: null,
  repeticion: "una_vez",
  creado_por: "Daniel",
  created_at: "2026-08-24T14:00:00.000Z",
  ...over,
});

const cheque = (cliente: string, fecha: string, monto = 1000) => ({
  cliente, empresa: "vistana", monto, fecha_deposito: fecha, vendedor: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  escrito = null;
  filtrosRec = {};
  heartbeat.mockResolvedValue({ data: null, error: null });
  filasCheques.mockResolvedValue({ data: [], error: null });
  filasRecordatorios.mockResolvedValue({ data: [], error: null, count: 0 });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 PERMISO, ROL POR ROL — "admin y secre", con cookies FIRMADAS', () => {
  const PUEDEN = ["admin", "secretaria"];
  const NO_PUEDEN = SYSTEM_ROLE_KEYS.filter((r) => !PUEDEN.includes(r));

  it("los roles del sistema son los 6 de siempre, y hay 4 que NO entran", () => {
    // Si mañana aparece un rol nuevo, este test lo mete solo en la vuelta de
    // abajo: la lista no se escribe a mano.
    expect(NO_PUEDEN.length).toBeGreaterThanOrEqual(4);
    expect([...RECORDATORIOS_ROLES]).toEqual(PUEDEN);
  });

  for (const rol of PUEDEN) {
    it(`${rol} SÍ entra: lee (200) y guarda (200)`, async () => {
      filasRecordatorios.mockResolvedValue({ data: [filaRec()], error: null, count: 1 });
      const get = await GET_RECS(pedido(rol));
      expect(get.status).toBe(200);
      expect((await get.json()).recordatorios).toHaveLength(1);

      const post = await POST_REC(pedido(rol, "POST", CUERPO_OK));
      expect(post.status).toBe(200);
      expect(escrito).toMatchObject({ texto: "Recordar cobrar", fecha: "2026-08-24" });
    });
  }

  for (const rol of NO_PUEDEN) {
    it(`${rol} recibe 403 en las CUATRO puertas (leer, crear, editar, borrar)`, async () => {
      const r = [
        await GET_RECS(pedido(rol)),
        await POST_REC(pedido(rol, "POST", CUERPO_OK)),
        await PUT_REC(pedido(rol, "PUT", CUERPO_OK, `http://localhost/api/recordatorios/${UUID}`), { params: { id: UUID } }),
        await DELETE_REC(pedido(rol, "DELETE", undefined, `http://localhost/api/recordatorios/${UUID}`), { params: { id: UUID } }),
      ];
      expect(r.map((x) => x.status)).toEqual([403, 403, 403, 403]);
      expect(escrito, "un rol sin permiso no puede haber escrito nada").toBeNull();
    });
  }

  it("SIN cookie no entra nadie", async () => {
    expect((await GET_RECS(pedido(null))).status).toBe(403);
    expect((await POST_REC(pedido(null, "POST", CUERPO_OK))).status).toBe(403);
  });

  it("una cookie con la firma ROTA no entra (el 403 prueba algo)", async () => {
    const buena = signSession({ role: "admin", userId: "u", userName: "n", sessionToken: "s" });
    const rota = new NextRequest("http://localhost/api/recordatorios", {
      headers: { cookie: `cxc_session=${buena.slice(0, -3)}xxx` },
    });
    expect((await GET_RECS(rota)).status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que la ruta ESCRIBE de verdad", () => {
  it("el cliente y la repetición viajan cuando los hay", async () => {
    await POST_REC(pedido("admin", "POST", {
      ...CUERPO_OK,
      cliente: "City Mall Paso Canoa",
      cliente_codigo: "D-25",
      repeticion: "mensual",
    }));
    expect(escrito).toMatchObject({
      cliente: "City Mall Paso Canoa",
      cliente_codigo: "D-25",
      repeticion: "mensual",
    });
  });

  it("🔴 sin cliente se escribe NULL, no cadena vacía", async () => {
    await POST_REC(pedido("admin", "POST", CUERPO_OK));
    expect(escrito).toMatchObject({ cliente: null, cliente_codigo: null, repeticion: "una_vez" });
  });

  it("la firma sale de la SESIÓN, nunca del cuerpo", async () => {
    await POST_REC(pedido("secretaria", "POST", { ...CUERPO_OK, creado_por: "Otro" }));
    expect(escrito).toMatchObject({ creado_por: "Daniel" });
  });

  it("sin texto o sin fecha, 400 y NO se escribe nada", async () => {
    for (const cuerpo of [{ fecha: "2026-08-24", texto: "   " }, { fecha: "", texto: "x" }, { fecha: "2026-02-31", texto: "x" }]) {
      escrito = null;
      const res = await POST_REC(pedido("admin", "POST", cuerpo));
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
      expect((await res.json()).error).toContain("Falta:");
      expect(escrito).toBeNull();
    }
  });

  it("borrar es SOFT DELETE — nunca un DELETE de verdad", async () => {
    const res = await DELETE_REC(
      pedido("admin", "DELETE", undefined, `http://localhost/api/recordatorios/${UUID}`),
      { params: { id: UUID } },
    );
    expect(res.status).toBe(200);
    expect(escrito).toEqual({ deleted: true });
    expect(filtrosRec).toMatchObject({ id: UUID, deleted: false });
  });

  it("un id que no es uuid se rechaza antes de tocar la base", async () => {
    const res = await PUT_REC(
      pedido("admin", "PUT", CUERPO_OK, "http://localhost/api/recordatorios/no-soy-uuid"),
      { params: { id: "no-soy-uuid" } },
    );
    expect(res.status).toBe(400);
    expect(escrito).toBeNull();
  });

  it("la lectura pide SOLO los vivos", async () => {
    await GET_RECS(pedido("admin"));
    expect(filtrosRec).toMatchObject({ deleted: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 SIN LA MIGRACIÓN CORRIDA, la pantalla de cheques NO se rompe", () => {
  const ERROR_REAL = {
    code: "PGRST205",
    message: "Could not find the table 'public.recordatorios' in the schema cache",
  };

  it("el GET responde 200 con la lista vacía y el aviso, no un 500", async () => {
    filasRecordatorios.mockResolvedValue({ data: null, error: ERROR_REAL, count: null });
    const res = await GET_RECS(pedido("admin"));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.recordatorios).toEqual([]);
    expect(d.faltaMigracion).toBe(true);
    expect(d.aviso).toContain("20260824120000_recordatorios.sql");
  });

  it("🔴 un error REAL de la base NO se disfraza de migración faltante", async () => {
    // Devolver "no hay recordatorios" ante un timeout sería la peor forma de
    // fallar: la pantalla se ve normal y vacía, y el aviso deja de sonar.
    filasRecordatorios.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
      count: null,
    });
    const res = await GET_RECS(pedido("admin"));
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL AVISO DE TELEGRAM — un solo mensaje, y los cheques primero", () => {
  it("con cheques Y recordatorios sale UN mensaje, con el bloque de cheques arriba", async () => {
    filasCheques.mockResolvedValue({ data: [cheque("XTREME SHOES", "2026-08-24", 5000)], error: null });
    filasRecordatorios.mockResolvedValue({ data: [filaRec()], error: null, count: 1 });

    const r = await runChequesAlert(nueveQuince("2026-08-24")); // lunes

    expect(r).toMatchObject({ ok: true, count: 1, recordatorios: 1, sent: true });
    expect(enviado).toHaveBeenCalledOnce(); // UN mensaje, no dos notificaciones
    const texto = enviado.mock.calls[0][0] as string;
    expect(texto.startsWith("⚠️ 1 cheque por vencer")).toBe(true);
    expect(texto).toContain("XTREME SHOES");
    expect(texto).toContain("🔔 1 recordatorio");
    expect(texto).toContain("• Recordar cobrar — HOY");
    // El bloque de cheques va ANTES: es la plata y es lo que se lee en la
    // notificación del iPhone sin abrirla.
    expect(texto.indexOf("XTREME SHOES")).toBeLessThan(texto.indexOf("🔔"));
  });

  it("🔴 SIN cheques pero CON recordatorio, el aviso SALE igual", async () => {
    // Antes de este cambio la corrida se cortaba en "sin cheques por vencer" y
    // no miraba nada más: el recordatorio no habría sonado nunca.
    filasCheques.mockResolvedValue({ data: [], error: null });
    filasRecordatorios.mockResolvedValue({ data: [filaRec()], error: null, count: 1 });

    const r = await runChequesAlert(nueveQuince("2026-08-24"));

    expect(r).toMatchObject({ ok: true, count: 0, recordatorios: 1, sent: true });
    const texto = enviado.mock.calls[0][0] as string;
    expect(texto.startsWith("🔔 1 recordatorio")).toBe(true);
    expect(texto).not.toContain("por vencer");
  });

  it("CON cheques y SIN recordatorios, el mensaje es EXACTAMENTE el de siempre", async () => {
    filasCheques.mockResolvedValue({ data: [cheque("XTREME SHOES", "2026-08-24", 5000)], error: null });
    const r = await runChequesAlert(nueveQuince("2026-08-24"));
    expect(r).toMatchObject({ count: 1, recordatorios: 0, sent: true, detail: "1 por vencer" });
    expect(enviado.mock.calls[0][0]).not.toContain("🔔");
  });

  it("sin nada de los dos NO se manda mensaje (un 'hoy no hay nada' diario es ruido)", async () => {
    const r = await runChequesAlert(nueveQuince("2026-08-24"));
    expect(r).toMatchObject({ ok: true, count: 0, recordatorios: 0, sent: false, detail: "sin cheques por vencer" });
    expect(enviado).not.toHaveBeenCalled();
  });

  it("🔴 correr DOS VECES el mismo día manda UN SOLO aviso (el mismo candado de siempre)", async () => {
    filasRecordatorios.mockResolvedValue({ data: [filaRec()], error: null, count: 1 });
    const primera = await runChequesAlert(nueveQuince("2026-08-24"));
    expect(primera.sent).toBe(true);

    // Tras el éxito el route deja el heartbeat de hoy: la 2ª corrida (reintento
    // de Vercel o recuperación de la reconciliación) lo ve y calla.
    heartbeat.mockResolvedValue({ data: { last_success_at: "2026-08-24T14:15:30.000Z" }, error: null });
    const segunda = await runChequesAlert(new Date("2026-08-24T18:00:00.000Z"));

    expect(segunda).toMatchObject({ sent: false, detail: "ya se avisó hoy" });
    expect(enviado).toHaveBeenCalledOnce();
  });

  it("SÁBADO no manda nada, tampoco por un recordatorio (ya se avisó el viernes)", async () => {
    filasRecordatorios.mockResolvedValue({ data: [filaRec({ fecha: "2026-08-29" })], error: null, count: 1 });
    const r = await runChequesAlert(nueveQuince("2026-08-29")); // sábado
    expect(r).toMatchObject({ sent: false, detail: "fin de semana — no se avisa" });
    expect(enviado).not.toHaveBeenCalled();
  });

  it("un recordatorio MENSUAL viejo suena el día que toca", async () => {
    // Puesto el 31-ene; hoy es 30-sep, que es el último día del mes.
    filasRecordatorios.mockResolvedValue({
      data: [filaRec({ fecha: "2026-01-31", repeticion: "mensual", texto: "Pagar el alquiler" })],
      error: null,
      count: 1,
    });
    const r = await runChequesAlert(nueveQuince("2026-09-30")); // miércoles
    expect(r.recordatorios).toBe(1);
    expect(enviado.mock.calls[0][0]).toContain("• Pagar el alquiler — HOY · cada mes");
  });
});

describe("🔴 UN FALLO DE RECORDATORIOS NO SE LLEVA PUESTO EL AVISO DE LOS CHEQUES", () => {
  it("sin la migración corrida, el aviso de cheques sale igual que siempre", async () => {
    filasCheques.mockResolvedValue({ data: [cheque("XTREME SHOES", "2026-08-24", 5000)], error: null });
    filasRecordatorios.mockResolvedValue({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.recordatorios' in the schema cache" },
      count: null,
    });

    const r = await runChequesAlert(nueveQuince("2026-08-24"));

    expect(r).toMatchObject({ ok: true, count: 1, recordatorios: 0, sent: true });
    expect(enviado.mock.calls[0][0]).toContain("XTREME SHOES");
    expect(r.detail).toContain("falta el DDL"); // queda anotado, no escondido
  });

  it("si la lectura de recordatorios REVIENTA, el cheque se avisa igual", async () => {
    filasCheques.mockResolvedValue({ data: [cheque("XTREME SHOES", "2026-08-24", 5000)], error: null });
    filasRecordatorios.mockResolvedValue({ data: null, error: { message: "db caída" }, count: null });

    const r = await runChequesAlert(nueveQuince("2026-08-24"));

    expect(r).toMatchObject({ ok: true, count: 1, sent: true });
    expect(enviado.mock.calls[0][0]).toContain("XTREME SHOES");
    expect(r.detail).toContain("recordatorios fallaron");
  });

  it("🔴 al revés NO: si la consulta de CHEQUES falla, la corrida queda ok:false", async () => {
    // Es la plata. El caller NO registra heartbeat y la reconciliación lo
    // reintenta — comportamiento de siempre, sin cambios.
    filasCheques.mockResolvedValue({ data: null, error: { message: "boom" } });
    filasRecordatorios.mockResolvedValue({ data: [filaRec()], error: null, count: 1 });

    const r = await runChequesAlert(nueveQuince("2026-08-24"));

    expect(r).toMatchObject({ ok: false, sent: false, detail: "boom" });
    expect(enviado).not.toHaveBeenCalled();
  });
});

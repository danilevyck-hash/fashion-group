// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CONDUCTA: el POST de aprobaciones NO escribe una fila de otra empresa.
//
// La regla pura vive en `asistencia-aprobador-empresa.test.ts`. Este archivo
// prueba la JUNTURA —que la ruta la LLAME— que es donde vivía el bug: el
// endpoint recibía `{codigo, fecha}` y escribía sin mirar nada. Un test de la
// función pura nunca habría visto eso.
//
// Se llama al handler REAL con cookie FIRMADA y se mira QUÉ se escribió.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-aprobador-empresa"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

/** Lo que la ruta habría escrito. Vacío = no se tocó una fila. */
const escrito: unknown[][] = [];
/** `true` = la base contesta PGRST205 («esa tabla no existe») al leer el reparto. */
let faltaTabla = false;
/** Un error que NO es «falta la tabla»: permiso, timeout, RLS. */
let errorAjeno: { code: string; message: string } | null = null;

const REPARTO = [
  { usuario: "david", empresa: "confecciones_boston" },
  { usuario: "Bodega", empresa: "fashion_wear" },
  { usuario: "Bodega", empresa: "vistana" },
];

const FICHAS = [
  { empleado_codigo: "40", nombre: "KEVIN", empresa: "confecciones_boston", activo: true },
  { empleado_codigo: "11", nombre: "JULIO", empresa: "vistana", activo: true },
  { empleado_codigo: "50", nombre: null, empresa: null, activo: true },
];

vi.mock("@/lib/asistencia/config-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/asistencia/config-server")>(
    "@/lib/asistencia/config-server",
  );
  return {
    ...real,
    leerPersonas: async () => ({ filas: FICHAS, faltaMigracion: false }),
  };
});

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (tabla: string) => ({
      select: () =>
        tabla === "asistencia_aprobador_empresa"
          ? Promise.resolve(
              errorAjeno
                ? { data: null, error: errorAjeno }
                : faltaTabla
                  ? { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${tabla}'` } }
                  : { data: REPARTO, error: null },
            )
          : Promise.resolve({ data: [], error: null }),
      upsert: (filas: unknown[]) => { escrito.push(filas); return Promise.resolve({ error: null }); },
    }),
  },
}));

const { POST } = await import("@/app/api/asistencia/aprobaciones/route");

function pedir(rol: string, usuario: string, dias: Array<{ codigo: string; fecha: string }>) {
  const cookie = signSession({
    role: rol, userId: "u1", userName: usuario, sessionToken: "t1",
    // `modules`: `requireAsistencia` los exige. Los de David son los reales.
    modules: rol === "gerente_boston" ? ["boston", "catalogos"] : ["asistencia"],
  });
  return new NextRequest("https://fashiongr.com/api/asistencia/aprobaciones", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify({ aprobado: true, dias: dias.map((d) => ({ ...d, minutos: 40 })) }),
  });
}

beforeEach(() => { escrito.length = 0; faltaTabla = false; errorAjeno = null; });

describe("🔴 Julio (cuenta `Bodega`) y las 3 empresas", () => {
  it("con gente SUYA aprueba, y se escribe", async () => {
    const r = await POST(pedir("bodega", "Bodega", [{ codigo: "11", fecha: "2026-08-03" }]));
    expect(r.status).toBe(200);
    expect(escrito.length).toBe(1);
  });

  it("🩸 con alguien de BOSTON se rechaza — es el caso real de los 57 días", async () => {
    const r = await POST(pedir("bodega", "Bodega", [{ codigo: "40", fecha: "2026-08-03" }]));
    expect(r.status).toBe(403);
    expect(escrito.length).toBe(0);
  });

  it("🔴 TODO O NADA: una sola ajena en el lote y NO se escribe NI UNA fila", async () => {
    const r = await POST(pedir("bodega", "Bodega", [
      { codigo: "11", fecha: "2026-08-03" },
      { codigo: "40", fecha: "2026-08-03" },
    ]));
    expect(r.status).toBe(403);
    expect(escrito.length).toBe(0);
    const j = await r.json();
    expect(j.fuera).toEqual(["40"]);
  });
});

describe("David", () => {
  it("aprueba a los suyos", async () => {
    const r = await POST(pedir("gerente_boston", "david", [{ codigo: "40", fecha: "2026-08-03" }]));
    expect(r.status).toBe(200);
    expect(escrito.length).toBe(1);
  });

  it("🔴 y NO a los de Vistana, aunque sea el único del lote", async () => {
    const r = await POST(pedir("gerente_boston", "david", [{ codigo: "11", fecha: "2026-08-03" }]));
    expect(r.status).toBe(403);
    expect(escrito.length).toBe(0);
  });
});

describe("admin y los bordes", () => {
  it("admin aprueba a cualquiera de las tres", async () => {
    const r = await POST(pedir("admin", "daniel", [
      { codigo: "40", fecha: "2026-08-03" },
      { codigo: "11", fecha: "2026-08-03" },
    ]));
    expect(r.status).toBe(200);
    expect(escrito.length).toBe(1);
  });

  it("⚠️ un código SIN ficha se rechaza: sin empresa no se puede afirmar nada", async () => {
    const r = await POST(pedir("bodega", "Bodega", [{ codigo: "50", fecha: "2026-08-03" }]));
    expect(r.status).toBe(403);
    expect(escrito.length).toBe(0);
  });

  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 3-SEP-2026 (tolerancia a la DDL retirada). Hasta
  // ese día un PGRST205 abría el reparto («se aprueba como antes, Julio no se
  // traba»). La tabla existe desde 20260903120000; hoy ese código es un error
  // como cualquier otro, y con el reparto ilegible NO se aprueba nada — abrirlo
  // sería reabrir el agujero de los 57 días de Boston por un timeout.
  it("🔴 un PGRST205 al leer el reparto NO abre la puerta: 500 y no se escribe", async () => {
    faltaTabla = true;
    const r = await POST(pedir("bodega", "Bodega", [{ codigo: "40", fecha: "2026-08-03" }]));
    expect(r.status).toBe(500);
    expect(escrito.length).toBe(0);
  });

  // 🩸 ESTE CASO FALTABA, y lo destapó el verificador de mutaciones: cambiar
  // `esTablaFaltante(...)` por `true` —o sea, tragarse CUALQUIER error como si
  // fuera la tabla ausente— pasaba todos los tests. Es el peor modo de fallo
  // posible acá: un permiso denegado, un timeout o un RLS se leerían como
  // «nadie está segmentado» y el reparto se abriría sin que nada avise.
  it("🔴 un error que NO es «falta la tabla» NO abre el reparto: revienta", async () => {
    errorAjeno = { code: "42501", message: "permission denied for table asistencia_aprobador_empresa" };
    const r = await POST(pedir("bodega", "Bodega", [{ codigo: "40", fecha: "2026-08-03" }]));
    expect(r.status).toBe(500);
    expect(escrito.length).toBe(0);
  });

  it("⚠️ y un timeout tampoco — ni siquiera nombrando la tabla", async () => {
    errorAjeno = { code: "57014", message: "canceling statement due to statement timeout" };
    const r = await POST(pedir("bodega", "Bodega", [{ codigo: "40", fecha: "2026-08-03" }]));
    expect(r.status).toBe(500);
    expect(escrito.length).toBe(0);
  });

  it("un rol que no aprueba sigue en 403, y tampoco escribe", async () => {
    const r = await POST(pedir("vendedor", "rey", [{ codigo: "11", fecha: "2026-08-03" }]));
    expect(r.status).toBe(403);
    expect(escrito.length).toBe(0);
  });
});

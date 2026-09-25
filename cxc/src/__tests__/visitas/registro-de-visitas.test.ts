// ─────────────────────────────────────────────────────────────────────────────
// EL REGISTRO DE VISITAS POR MÓDULO — los candados (25-sep-2026).
//
// Daniel, textual: «quién entra a cada módulo lo debes saber tú».
//
// EL HUECO QUE ESTO CIERRA: hoy se sabe quién ENTRA AL SISTEMA (`user_sessions`)
// y qué ACCIONES puntuales hizo (`activity_logs`), pero nada dice qué PANTALLA
// abrió. Tres auditorías del 25-sep-2026 no pudieron contestar si la secretaria
// o Contabilidad abren Comisiones, Ventas o Referencia.
//
// Lo que este archivo fija:
//   1. 🔴 UNA VISITA POR MÓDULO CADA 10 MINUTOS POR PESTAÑA, no más. Es lo que
//      hace que esto sea barato: la app ya aprendió con `last_seen` que escribir
//      en cada petición es el renglón más caro del sistema.
//   2. 🔴 UNA KEY QUE NO EXISTE ES 400, no un módulo fantasma en la medición.
//   3. 🔴 SIN SESIÓN, 204 Y NADA: el login y las páginas públicas no anotan.
//   4. 🔴 CON EL INTERRUPTOR APAGADO NO SE MANDA UN SOLO AVISO.
//   5. 🔴 EL UPSERT SUMA (no reemplaza): dos pestañas no pueden perder visitas.
//   6. 🔴 «QUIÉN USA QUÉ» ES SOLO DE ADMIN, y lo decide el SERVIDOR.
//   7. 🔴 LA TABLA ESTÁ CLASIFICADA en `backup/tablas.ts` — `bitacora`, fuera
//      del respaldo, y el candado de respaldo no se pone rojo.
//   8. 🔴 FALLA ABIERTA sin la migración: 204 y nada se rompe.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

import {
  DIAS_QUE_SE_GUARDAN,
  DIAS_QUE_SE_MIRAN,
  MINUTOS_ENTRE_VISITAS,
  MS_ENTRE_VISITAS,
  REGISTRO_DE_VISITAS,
  RPC_REGISTRAR_VISITA,
  TABLA_VISITAS,
  aparatoValido,
  claveDeMemoria,
  debeRegistrar,
  diaHaceNDias,
  esModuloConocido,
  moduloDeLaRuta,
} from "@/lib/visitas/registro";
import {
  modulosSinVisitas,
  visitasPorModulo,
  visitasPorPersona,
  type FilaVisita,
} from "@/lib/visitas/resumen";
import { CLASIFICACION, TABLAS_BITACORA, obligaRespaldo } from "@/lib/backup/tablas";
import { ALL_MODULE_KEYS } from "@/lib/modules";

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACION = path.join(RAIZ, "supabase/migrations/20261221120000_visitas_modulo.sql");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-visitas"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

// ── La base de mentira: guarda las llamadas a la RPC y puede fingir que la
//    migración todavía no corrió. ────────────────────────────────────────────
const llamadas: Array<{ nombre: string; args: Record<string, unknown> }> = [];
let faltaLaDdl = false;
let borradas: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: (nombre: string, args: Record<string, unknown>) => {
      llamadas.push({ nombre, args });
      return Promise.resolve(
        faltaLaDdl
          ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
          : { data: null, error: null },
      );
    },
    from: (tabla: string) => {
      const filtros: Record<string, unknown> = {};
      const cadena: Record<string, unknown> = {};
      Object.assign(cadena, {
        select: () => cadena,
        delete: () => cadena,
        gte: (c: string, v: unknown) => { filtros[c] = v; return cadena; },
        lt: (c: string, v: unknown) => { filtros[`lt_${c}`] = v; return cadena; },
        order: () => cadena,
        range: () => Promise.resolve(
          faltaLaDdl
            ? { data: null, error: { code: "42P01", message: 'relation "visitas_modulo" does not exist' }, count: null }
            : { data: [], error: null, count: 0 },
        ),
        then: (resolver: (v: unknown) => unknown) => {
          borradas.push({ tabla, ...filtros });
          return Promise.resolve(
            faltaLaDdl
              ? { data: null, error: { code: "42P01", message: "does not exist" } }
              : { data: [], error: null },
          ).then(resolver);
        },
      });
      return cadena;
    },
  },
}));

const { POST } = await import("@/app/api/visitas/route");
const { GET: RESUMEN } = await import("@/app/api/visitas/resumen/route");

function pedir(cuerpo: unknown, sesion: Record<string, unknown> | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sesion) headers.cookie = `cxc_session=${signSession(sesion)}`;
  return POST(
    new NextRequest("http://x/api/visitas", {
      method: "POST",
      headers,
      body: JSON.stringify(cuerpo),
    }),
  );
}

const SESION_SECRETARIA = { role: "secretaria", userId: "u-angela", userName: "Angela", sessionToken: "t" };

beforeEach(() => {
  llamadas.length = 0;
  borradas = [];
  faltaLaDdl = false;
});

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · Una visita por módulo cada 10 minutos, no más", () => {
  it("la primera sí; la de un minuto después, no; la de once, sí", () => {
    const t0 = Date.parse("2026-09-25T13:00:00Z");
    expect(debeRegistrar(null, t0)).toBe(true);
    expect(debeRegistrar(t0, t0 + 60_000)).toBe(false);
    expect(debeRegistrar(t0, t0 + MS_ENTRE_VISITAS - 1)).toBe(false);
    expect(debeRegistrar(t0, t0 + MS_ENTRE_VISITAS)).toBe(true);
    expect(MINUTOS_ENTRE_VISITAS).toBe(10);
  });

  it("ante la duda se anota: marca ilegible o reloj que va para atrás", () => {
    const t0 = Date.parse("2026-09-25T13:00:00Z");
    expect(debeRegistrar(Number.NaN, t0)).toBe(true);
    expect(debeRegistrar(t0 + 5_000, t0)).toBe(true);
  });

  it("🔴 `anotarVisita` manda UNA vez y calla las nueve siguientes", async () => {
    const enviados: string[] = [];
    vi.stubGlobal("navigator", { sendBeacon: (_u: string, b: Blob) => { enviados.push(String(b.type)); return true; } });
    const { anotarVisita } = await import("@/lib/visitas/anotar");
    window.sessionStorage.clear();

    const t0 = Date.parse("2026-09-25T13:00:00Z");
    expect(anotarVisita("cxc", "computadora", t0)).toBe(true);
    for (let i = 1; i <= 9; i += 1) {
      expect(anotarVisita("cxc", "computadora", t0 + i * 60_000)).toBe(false);
    }
    expect(anotarVisita("cxc", "computadora", t0 + MS_ENTRE_VISITAS)).toBe(true);
    expect(enviados).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("🔴 marcar diez veces desde el teléfono NO son diez visitas de `marcacion`", async () => {
    let enviados = 0;
    vi.stubGlobal("navigator", { sendBeacon: () => { enviados += 1; return true; } });
    const { anotarVisita } = await import("@/lib/visitas/anotar");
    window.sessionStorage.clear();

    const t0 = Date.parse("2026-09-25T12:00:00Z");
    // La pantalla de marcación no cambia de dirección al marcar: el componente
    // vuelve a pasar por acá y la memoria de la pestaña lo frena.
    for (let i = 0; i < 10; i += 1) anotarVisita("marcacion", "celular", t0 + i * 20_000);
    expect(enviados).toBe(1);
    vi.unstubAllGlobals();
  });

  it("cada módulo y cada aparato tienen su propia memoria", () => {
    expect(claveDeMemoria("cxc", "celular")).not.toBe(claveDeMemoria("cxc", "computadora"));
    expect(claveDeMemoria("cxc", "celular")).not.toBe(claveDeMemoria("guias", "celular"));
    expect(claveDeMemoria("cxc", "celular").startsWith("fg_visita_")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · Qué módulo es cada dirección", () => {
  it("las direcciones de siempre caen en su módulo", () => {
    expect(moduloDeLaRuta("/cxc")).toBe("cxc");
    expect(moduloDeLaRuta("/cxc/cliente/D-25")).toBe("cxc");
    expect(moduloDeLaRuta("/guias/123")).toBe("guias");
    expect(moduloDeLaRuta("/recordatorios")).toBe("cheques");
    expect(moduloDeLaRuta("/productos/cargar")).toBe("cargar");
    expect(moduloDeLaRuta("/clientes/D-25")).toBe("directorio");
    expect(moduloDeLaRuta("/admin/usuarios")).toBe("usuarios");
    expect(moduloDeLaRuta("/asistencia?tab=planilla")).toBe("asistencia");
    expect(moduloDeLaRuta("/guias/")).toBe("guias");
  });

  it("🔴 los cuatro que `getModuleKeyFromPath` deja afuera SÍ cuentan acá", () => {
    // Aquél pinta el acento de 2 px del encabezado y a propósito deja estos
    // cuatro en gris. Si acá faltaran, la medición mentiría justo donde hace
    // falta: son módulos de los que nadie sabe quién los usa.
    expect(moduloDeLaRuta("/vista-general")).toBe("vista-general");
    expect(moduloDeLaRuta("/referencia")).toBe("referencia");
    expect(moduloDeLaRuta("/catalogos/marcas")).toBe("catalogos");
    expect(moduloDeLaRuta("/catalogo/tommy")).toBe("catalogos");
    expect(moduloDeLaRuta("/admin/usuarios")).toBe("usuarios");
  });

  it("lo que no es un módulo no cuenta: inicio, grupos, login y páginas públicas", () => {
    for (const ruta of ["/", "/home", "/g/operacion", "/login", "/pedido-tommy/abc", "/pedido-calvin/xyz"]) {
      expect(moduloDeLaRuta(ruta)).toBeNull();
    }
    expect(moduloDeLaRuta(null)).toBeNull();
    expect(moduloDeLaRuta("")).toBeNull();
  });

  it("todo lo que devuelve es una key de `ALL_MODULES`, nunca una inventada", () => {
    const rutas = ["/cxc", "/guias", "/recordatorios", "/catalogo/reebok", "/marcacion", "/boston"];
    for (const r of rutas) {
      const key = moduloDeLaRuta(r);
      expect(key === null || ALL_MODULE_KEYS.includes(key)).toBe(true);
    }
    expect(esModuloConocido("inventado")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · POST /api/visitas — la puerta", () => {
  it("🔴 sin sesión: 204 y NADA escrito", async () => {
    const r = await pedir({ modulo: "cxc", aparato: "celular" }, null);
    expect(r.status).toBe(204);
    expect(llamadas).toHaveLength(0);
  });

  it("🔴 una key que no existe: 400, y no se escribe un módulo fantasma", async () => {
    const r = await pedir({ modulo: "inventado", aparato: "celular" }, SESION_SECRETARIA);
    expect(r.status).toBe(400);
    expect(llamadas).toHaveLength(0);
    expect((await pedir({}, SESION_SECRETARIA)).status).toBe(400);
  });

  it("🔴 quién es sale de la COOKIE, nunca del cuerpo", async () => {
    const r = await pedir(
      { modulo: "comisiones", aparato: "celular", user_id: "u-daniel", role: "admin", user_name: "daniel" },
      SESION_SECRETARIA,
    );
    expect(r.status).toBe(204);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].nombre).toBe(RPC_REGISTRAR_VISITA);
    expect(llamadas[0].args.p_user_id).toBe("u-angela");
    expect(llamadas[0].args.p_user_name).toBe("Angela");
    expect(llamadas[0].args.p_role).toBe("secretaria");
    expect(llamadas[0].args.p_modulo).toBe("comisiones");
    expect(llamadas[0].args.p_aparato).toBe("celular");
    // El día lo pone el servidor, en hora de Panamá.
    expect(String(llamadas[0].args.p_dia)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("un aparato raro cae en `computadora` — ante la duda, nunca se inventa un celular", async () => {
    await pedir({ modulo: "cxc", aparato: "reloj" }, SESION_SECRETARIA);
    expect(llamadas[0].args.p_aparato).toBe("computadora");
    expect(aparatoValido(undefined)).toBe("computadora");
    expect(aparatoValido("celular")).toBe("celular");
  });

  it("🔴 FALLA ABIERTA: sin la migración contesta 204 y no rompe nada", async () => {
    faltaLaDdl = true;
    const r = await pedir({ modulo: "guias", aparato: "computadora" }, SESION_SECRETARIA);
    expect(r.status).toBe(204);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · El interruptor apagado no manda un solo aviso", () => {
  it("🔴 con `REGISTRO_DE_VISITAS = false` no se llama a la ruta", async () => {
    vi.resetModules();
    vi.doMock("@/lib/visitas/registro", async (original) => ({
      ...(await original<typeof import("@/lib/visitas/registro")>()),
      REGISTRO_DE_VISITAS: false,
    }));
    let enviados = 0;
    vi.stubGlobal("navigator", { sendBeacon: () => { enviados += 1; return true; } });
    const { anotarVisita } = await import("@/lib/visitas/anotar");
    window.sessionStorage.clear();

    expect(anotarVisita("cxc", "computadora", Date.now())).toBe(false);
    expect(enviados).toBe(0);

    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/visitas/registro");
    vi.resetModules();
  });

  it("hoy está PRENDIDO", () => {
    expect(REGISTRO_DE_VISITAS).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · El upsert SUMA, no reemplaza", () => {
  const sql = fs.readFileSync(MIGRACION, "utf8");

  it("🔴 la función suma uno sobre lo que ya había", () => {
    expect(sql).toMatch(/ON CONFLICT \(dia, user_id, modulo, aparato\) DO UPDATE/);
    expect(sql).toMatch(/visitas\s*=\s*visitas_modulo\.visitas \+ 1/);
    // `primera_en` NO se toca al sumar: es la primera vez de ese día.
    expect(sql).not.toMatch(/SET[\s\S]{0,200}primera_en\s*=/);
  });

  it("la tabla tiene la PK, el CHECK del aparato y RLS de service_role", () => {
    expect(sql).toMatch(/PRIMARY KEY \(dia, user_id, modulo, aparato\)/);
    expect(sql).toMatch(/aparato IN \('celular', 'computadora'\)/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY service_role_all ON visitas_modulo/);
    // Nadie más puede escribir la medición desde afuera.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION registrar_visita_modulo/);
  });

  it("las columnas que pidió el diseño están todas", () => {
    for (const col of ["dia", "user_id", "user_name", "role", "modulo", "aparato", "visitas", "primera_en", "ultima_en"]) {
      expect(sql).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6 · «Quién usa qué» es SOLO de admin", () => {
  function mirar(role: string) {
    const cookie = signSession({ role, userId: "u", userName: "x", sessionToken: "t" });
    return RESUMEN(new NextRequest("http://x/api/visitas/resumen", { headers: { cookie: `cxc_session=${cookie}` } }));
  }

  it("🔴 admin entra; secretaria, contabilidad, bodega y vendedor NO", async () => {
    expect((await mirar("admin")).status).toBe(200);
    for (const rol of ["secretaria", "contabilidad", "bodega", "vendedor", "gerente_boston", "gerente_acs"]) {
      expect((await mirar(rol)).status).toBe(403);
    }
    expect((await RESUMEN(new NextRequest("http://x/api/visitas/resumen"))).status).toBe(401);
  });

  it("🔴 FALLA ABIERTA: sin la tabla contesta 200 y lo DICE", async () => {
    faltaLaDdl = true;
    const r = await mirar("admin");
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.tablaLista).toBe(false);
    expect(j.personas).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7 · Cómo se leen las visitas", () => {
  const FILAS: FilaVisita[] = [
    { dia: "2026-09-24", user_id: "u-1", user_name: "Angela", role: "secretaria", modulo: "cxc", aparato: "computadora", visitas: 4, ultima_en: "2026-09-24T18:00:00Z" },
    { dia: "2026-09-25", user_id: "u-1", user_name: "Angela", role: "secretaria", modulo: "cxc", aparato: "celular", visitas: 3, ultima_en: "2026-09-25T14:00:00Z" },
    { dia: "2026-09-25", user_id: "u-2", user_name: "yulissa", role: "contabilidad", modulo: "cxc", aparato: "computadora", visitas: 1, ultima_en: "2026-09-25T15:00:00Z" },
    { dia: "2026-09-25", user_id: "u-2", user_name: "yulissa", role: "contabilidad", modulo: "comisiones", aparato: "computadora", visitas: 2, ultima_en: "2026-09-25T16:00:00Z" },
  ];

  it("🔴 celular y computadora son DOS filas en la base y UNA persona en la pantalla", () => {
    const angela = visitasPorPersona(FILAS).find((p) => p.userId === "u-1" && p.modulo === "cxc")!;
    expect(angela.visitas).toBe(7);
    expect(angela.celular).toBe(3);
    expect(angela.computadora).toBe(4);
    expect(angela.ultimaEn).toBe("2026-09-25T14:00:00Z");
  });

  it("«N personas · N visitas», del módulo más usado al menos usado", () => {
    const porModulo = visitasPorModulo(FILAS);
    expect(porModulo[0]).toMatchObject({ modulo: "cxc", personas: 2, visitas: 8 });
    expect(porModulo[1]).toMatchObject({ modulo: "comisiones", personas: 1, visitas: 2 });
  });

  it("🔴 el módulo que nadie abrió es la RESPUESTA, no un dato que falta", () => {
    const sin = modulosSinVisitas(FILAS).map((m) => m.modulo);
    expect(sin).toContain("referencia");
    expect(sin).toContain("ventas");
    expect(sin).not.toContain("cxc");
    expect(sin).not.toContain("comisiones");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("8 · La tabla está clasificada, y se poda sola", () => {
  it("🔴 `visitas_modulo` es `bitacora` y NO obliga respaldo", () => {
    expect(CLASIFICACION[TABLA_VISITAS]).toBe("bitacora");
    expect((TABLAS_BITACORA as readonly string[]).includes(TABLA_VISITAS)).toBe(true);
    expect(obligaRespaldo(TABLA_VISITAS)).toBe(false);
  });

  it("🔴 la poda de 180 días vive en un cron que YA existe — sin entrada nueva", () => {
    const cron = fs.readFileSync(path.join(RAIZ, "src/app/api/cron/cleanup-sessions/route.ts"), "utf8");
    expect(cron).toContain("TABLA_VISITAS");
    expect(cron).toContain("DIAS_QUE_SE_GUARDAN");
    expect(DIAS_QUE_SE_GUARDAN).toBe(180);
    expect(DIAS_QUE_SE_MIRAN).toBe(30);
    // `vercel.json` no gana una entrada por esto (candado `cron-registro`).
    const vercel = fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8");
    expect(vercel).not.toContain("/api/cron/visitas");
  });

  it("el corte de días se cuenta hacia atrás sobre el día de Panamá", () => {
    expect(diaHaceNDias("2026-09-25", 30)).toBe("2026-08-26");
    expect(diaHaceNDias("2026-03-01", 1)).toBe("2026-02-28");
  });
});

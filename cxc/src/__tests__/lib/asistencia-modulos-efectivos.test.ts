// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ASISTENCIA: EL ROL NO ALCANZA — HAY QUE MIRAR LOS MÓDULOS DEL USUARIO.
//
// 🩸 EL AGUJERO QUE ESTE ARCHIVO CIERRA, MEDIDO EL 31-ago-2026 contra el build
// de producción con cookies firmadas: `requireRole` compara contra el ROL y
// nunca contra los módulos. Las DOS secretarias reales tienen
// `fg_users.modulos_override` poblado y NINGUNO incluye `asistencia` —no ven la
// ficha en el menú— pero entrando por la URL recibían la planilla con el sueldo
// de las 40 personas. **26 respuestas no-403** a usuarios sin el módulo.
//
// El invariante estaba escrito en `roles.ts` desde el día uno: *«la lista de
// modules.ts es la NAVEGACIÓN; la de las rutas es el CANDADO … las dos tienen
// que decir lo mismo»*. Decían lo mismo a nivel de ROL; el override por USUARIO
// rompía la equivalencia y no había nada que lo vigilara.
//
// Acá se prueba la CONDUCTA con cookies firmadas de verdad, más un BARRIDO que
// no deja nacer insegura a una ruta futura.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { requireAsistencia, MODULO_ASISTENCIA, MODULOS_PLANILLA } from "@/lib/asistencia/guard";
import { asistenciaRoles, aprobacionesRoles } from "@/lib/asistencia/roles";
import { MODULO_BOSTON, ROL_BOSTON } from "@/lib/boston/rol";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-asistencia-modulos"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

/** Los overrides REALES de producción (31-ago-2026). Ninguno trae `asistencia`. */
const OVERRIDE_ANDREA = ["cheques", "comisiones", "caja", "marketing", "directorio",
  "guias", "packing-lists", "reclamos", "catalogos", "cargar", "multifashion"];
const OVERRIDE_ANGELA = ["directorio", "marketing", "cheques", "caja", "comisiones",
  "guias", "packing-lists", "reclamos", "catalogos", "cargar", "cxc"];

function req(role: string, modules: string[] | undefined): NextRequest {
  const cookie = signSession({
    role, userId: "u1", userName: "test", sessionToken: "t1",
    ...(modules ? { modules } : {}),
  });
  return new NextRequest("https://fashiongr.com/api/asistencia/planilla", {
    headers: { cookie: `cxc_session=${cookie}` },
  });
}
const status = (r: unknown) => (r instanceof NextResponse ? r.status : 200);

describe("🔴 el caso real: la secretaria con override SIN asistencia", () => {
  for (const [quien, ov] of [["andrea", OVERRIDE_ANDREA], ["Angela", OVERRIDE_ANGELA]] as const) {
    it(`${quien} recibe 403 aunque su ROL esté en la lista`, () => {
      // Su rol SÍ está permitido — es justo lo que hacía que pasara antes.
      expect(asistenciaRoles()).toContain("secretaria");
      expect(ov).not.toContain(MODULO_ASISTENCIA);
      expect(status(requireAsistencia(req("secretaria", [...ov]), asistenciaRoles()))).toBe(403);
      // Y tampoco por la puerta de la planilla, que admite un módulo más.
      expect(status(requireAsistencia(req("secretaria", [...ov]), asistenciaRoles(), MODULOS_PLANILLA))).toBe(403);
    });
  }

  it("la MISMA secretaria, CON el módulo, pasa — el 403 es por el módulo y no por el rol", () => {
    expect(status(requireAsistencia(req("secretaria", ["guias", MODULO_ASISTENCIA]), asistenciaRoles()))).toBe(200);
  });
});

describe("quien tiene el módulo sigue entrando igual que antes", () => {
  it("contabilidad y bodega pasan con sus módulos de producción", () => {
    const mods = ["asistencia", "prestamos", "proveedores", "ventas", "gastos-contabilidad"];
    expect(status(requireAsistencia(req("contabilidad", mods), asistenciaRoles()))).toBe(200);
    expect(status(requireAsistencia(req("bodega", ["guias", "packing-lists", "catalogos", "referencia", "asistencia"]), aprobacionesRoles()))).toBe(200);
  });

  it("admin pasa sin mirar módulos, igual que en requireRole y en getVisibleModules", () => {
    expect(status(requireAsistencia(req("admin", []), asistenciaRoles()))).toBe(200);
    expect(status(requireAsistencia(req("admin", undefined), asistenciaRoles()))).toBe(200);
  });
});

describe("🔴 David NO se rompe: la planilla de Boston la habilita el módulo `boston`", () => {
  const MODS_DAVID = [MODULO_BOSTON, "catalogos"];

  it("entra a la planilla — es su pestaña, y su acceso viene de OTRO módulo", () => {
    expect(MODS_DAVID).not.toContain(MODULO_ASISTENCIA);
    const gate = [...asistenciaRoles(), ...aprobacionesRoles(), ROL_BOSTON];
    expect(status(requireAsistencia(req(ROL_BOSTON, MODS_DAVID), gate, MODULOS_PLANILLA))).toBe(200);
  });

  it("⚠️ y NO gana el resto del módulo: las otras rutas le siguen dando 403", () => {
    // 🔑 Acá lo frena el ROL (`gerente_boston` no está en `asistenciaRoles()`),
    // no el módulo — la conducta es la que importa, pero conviene decirlo: si
    // algún día se le agregara el rol, el módulo NO sería el segundo freno.
    expect(status(requireAsistencia(req(ROL_BOSTON, MODS_DAVID), asistenciaRoles()))).toBe(403);
  });

  it("tener `boston` no le abre la planilla a un rol que no es el suyo", () => {
    // El módulo `boston` lo declara `ROLES_MODULO_BOSTON`; un vendedor con esa
    // key en su lista no es un caso real, pero el rol tiene que seguir mandando.
    const gate = [...asistenciaRoles(), ...aprobacionesRoles(), ROL_BOSTON];
    expect(status(requireAsistencia(req("vendedor", [MODULO_BOSTON]), gate, MODULOS_PLANILLA))).toBe(403);
  });
});

describe("los bordes de la cookie", () => {
  it("🔴 sin `modules` NO se deja pasar — fail-closed", () => {
    expect(status(requireAsistencia(req("secretaria", undefined), asistenciaRoles()))).toBe(403);
  });
  it("🔴 con `modules` vacío tampoco", () => {
    expect(status(requireAsistencia(req("secretaria", []), asistenciaRoles()))).toBe(403);
  });
  it("sin cookie sigue siendo 401, no 403: el módulo no aflojó la exigencia de sesión", () => {
    const r = requireAsistencia(
      new NextRequest("https://fashiongr.com/api/asistencia/reporte") as NextRequest,
      asistenciaRoles(),
    );
    expect(status(r)).toBe(401);
  });
  it("un rol ajeno sigue en 403 aunque traiga el módulo en la cookie", () => {
    // El rol se mira PRIMERO (`requireRole`): la cookie es firmada por nosotros,
    // pero la lista de módulos la puso el login para ESE usuario.
    expect(status(requireAsistencia(req("gerente_acs", [MODULO_ASISTENCIA]), asistenciaRoles()))).toBe(403);
  });
});

// ── BARRIDO: una ruta nueva no puede nacer insegura ──────────────────────────

const RAIZ = process.cwd();
const DIR = path.join(RAIZ, "src/app/api/asistencia");
/** Fuera comentarios: un ejemplo en la documentación no es código. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function rutas(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...rutas(p));
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

describe("BARRIDO — toda ruta de /api/asistencia/* pasa por el guard", () => {
  const TODAS = rutas(DIR);

  it("el barrido encuentra rutas (si diera 0, no habría mirado nada)", () => {
    expect(TODAS.length).toBeGreaterThanOrEqual(12);
  });

  // `ingest` es la única excepción y NO usa cookie: la llama el agente del reloj
  // con un secreto propio (Bearer / x-asistencia-secret). Meterle el guard de
  // módulos la dejaría sin poder subir marcaciones.
  const EXCEPCIONES = new Set(["ingest"]);

  for (const f of TODAS) {
    const nombre = path.relative(DIR, f);
    const carpeta = nombre.split(path.sep)[0];
    if (EXCEPCIONES.has(carpeta)) continue;
    it(`${nombre} usa requireAsistencia y NO requireRole a secas`, () => {
      const src = sinComentarios(readFileSync(f, "utf-8"));
      expect(src).toContain("requireAsistencia(req,");
      expect(src).not.toMatch(/\brequireRole\s*\(/);
    });
  }

  it("🔴 `ingest` sigue SIN cookie y con su propio secreto", () => {
    const src = sinComentarios(readFileSync(path.join(DIR, "ingest/route.ts"), "utf-8"));
    expect(src).not.toMatch(/\brequireRole\s*\(|\brequireAsistencia\s*\(/);
    expect(src).toMatch(/x-asistencia-secret|authorization/i);
  });
});

describe("⚠️ el guard NO tocó a los demás módulos", () => {
  it("`requireRole` sigue sin mirar módulos — este commit no lo cambió", () => {
    const src = sinComentarios(readFileSync(path.join(RAIZ, "src/lib/requireRole.ts"), "utf-8"));
    expect(src).not.toContain("modules");
    expect(src).not.toContain("fgModulesDaAcceso");
  });
});

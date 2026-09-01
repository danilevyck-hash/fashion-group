// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UN APROBADOR NO PUEDE APROBAR FUERA DE SUS EMPRESAS.
//
// 🩸 EL CASO REAL, MEDIDO EN PRODUCCIÓN (31-ago-2026): quien podía aprobar
// aprobaba a las 40 personas de las TRES empresas — el POST recibía
// `{codigo, fecha}` y no miraba de dónde era esa persona. Julio, empleado de
// VISTANA que entra con la cuenta compartida `Bodega`, había aprobado
// **57 días de Confecciones Boston**.
//
// Reparto de Daniel: david → boston · Bodega → fashion_wear + vistana ·
// admin → las tres.
//
// Las DOS direcciones pesan igual: que NO pueda salirse de lo suyo, y que SÍ
// pueda con lo suyo. Un candado que solo prueba la primera se cumple con un
// endpoint que rechaza todo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  alcanceDe,
  alcanza,
  puedeAprobarA,
  type AsignacionAprobador,
} from "@/lib/asistencia/aprobador-empresa";
import { EMPRESAS_ASISTENCIA } from "@/lib/asistencia/config";
import {
  APROBACIONES_ROLES,
  aprobacionesRoles,
  asistenciaRoles,
  soloApruebaRoles,
  vePestana,
} from "@/lib/asistencia/roles";
import { ROL_BOSTON } from "@/lib/boston/rol";

/** El reparto que siembra la migración, tal cual. */
const REPARTO: AsignacionAprobador[] = [
  { usuario: "david", empresa: "confecciones_boston" },
  { usuario: "Bodega", empresa: "fashion_wear" },
  { usuario: "Bodega", empresa: "vistana" },
  { usuario: "Contabilidad", empresa: "confecciones_boston" },
  { usuario: "Contabilidad", empresa: "fashion_wear" },
  { usuario: "Contabilidad", empresa: "vistana" },
];

const de = (rol: string, usuario?: string) => alcanceDe(rol, usuario, REPARTO, false);

/** Las personas del caso real: una de cada empresa. */
const KEVIN = { codigo: "40", empresa: "confecciones_boston" };
const JULIO = { codigo: "11", empresa: "vistana" };
const RODRIGO = { codigo: "13", empresa: "fashion_wear" };

describe("🔴 el reparto de Daniel, persona por persona", () => {
  it("David solo alcanza Confecciones Boston", () => {
    const a = de(ROL_BOSTON, "david");
    expect([...(a.empresas ?? [])]).toEqual(["confecciones_boston"]);
    expect(alcanza(a, "confecciones_boston")).toBe(true);
    expect(alcanza(a, "vistana")).toBe(false);
    expect(alcanza(a, "fashion_wear")).toBe(false);
  });

  it("Julio (cuenta `Bodega`) alcanza Fashion Wear y Vistana — NO Boston", () => {
    const a = de("bodega", "Bodega");
    expect([...(a.empresas ?? [])].sort()).toEqual(["fashion_wear", "vistana"]);
    // 🩸 Ésta es la que estaba abierta: 57 días de Boston aprobados por él.
    expect(alcanza(a, "confecciones_boston")).toBe(false);
  });

  it("admin alcanza las tres, y NO necesita filas", () => {
    const a = alcanceDe("admin", "daniel", [], false);
    expect(a.empresas).toBeNull();
    for (const e of EMPRESAS_ASISTENCIA) expect(alcanza(a, e)).toBe(true);
  });

  it("el nombre no distingue mayúsculas: `bodega` ≡ `Bodega`", () => {
    expect([...(de("bodega", "bodega").empresas ?? [])].sort())
      .toEqual(["fashion_wear", "vistana"]);
    expect([...(de("bodega", "  BODEGA ").empresas ?? [])].sort())
      .toEqual(["fashion_wear", "vistana"]);
  });
});

describe("🔴 el veredicto del POST: TODO O NADA", () => {
  it("Julio aprobando a alguien de Boston: se rechaza el pedido ENTERO", () => {
    const a = de("bodega", "Bodega");
    // Dos personas suyas y UNA que no lo es.
    const v = puedeAprobarA(a, [JULIO, RODRIGO, KEVIN]);
    expect(v.ok).toBe(false);
    expect(v.fuera).toEqual(["40"]);
    expect(v.motivo).toMatch(/No se aprobó nada/);
  });

  it("✅ y con SOLO gente suya, pasa — el rechazo prueba algo", () => {
    const a = de("bodega", "Bodega");
    expect(puedeAprobarA(a, [JULIO, RODRIGO]).ok).toBe(true);
  });

  it("David con su gente pasa; con la de otra empresa, no", () => {
    const a = de(ROL_BOSTON, "david");
    expect(puedeAprobarA(a, [KEVIN]).ok).toBe(true);
    expect(puedeAprobarA(a, [KEVIN, JULIO]).ok).toBe(false);
  });

  it("⚠️ una persona SIN ficha se rechaza: sin empresa no se puede afirmar nada", () => {
    const a = de("bodega", "Bodega");
    const v = puedeAprobarA(a, [JULIO, { codigo: "50", empresa: null }]);
    expect(v.ok).toBe(false);
    expect(v.fuera).toEqual(["50"]);
  });

  it("un aprobador SIN filas propias no aprueba a nadie, y se le dice por qué", () => {
    const a = de("contabilidad", "alguien-que-nadie-configuro");
    expect([...(a.empresas ?? [])]).toEqual([]);
    const v = puedeAprobarA(a, [JULIO]);
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/no tienes ninguna empresa asignada/i);
  });

  it("admin nunca queda fuera", () => {
    const a = alcanceDe("admin", "daniel", [], false);
    expect(puedeAprobarA(a, [KEVIN, JULIO, RODRIGO]).ok).toBe(true);
  });
});

describe("⚠️ SIN la tabla, nadie queda segmentado (la app funciona antes del DDL)", () => {
  it("el alcance es «todas» y lo dice", () => {
    const a = alcanceDe("bodega", "Bodega", [], true);
    expect(a.empresas).toBeNull();
    expect(a.faltaTabla).toBe(true);
  });

  it("y por lo tanto aprueba como el día anterior — Julio no se queda trabado", () => {
    const a = alcanceDe("bodega", "Bodega", [], true);
    expect(puedeAprobarA(a, [KEVIN, JULIO, RODRIGO]).ok).toBe(true);
  });

  it("🔴 pero CON la tabla y sin filas, NO: la ausencia de tabla y la de filas son distintas", () => {
    const a = alcanceDe("bodega", "Bodega", [], false);
    expect(a.empresas).not.toBeNull();
    expect(puedeAprobarA(a, [JULIO]).ok).toBe(false);
  });
});

describe("una empresa que no existe no entra por la puerta de atrás", () => {
  it("una fila con una empresa inventada se ignora", () => {
    const a = alcanceDe("bodega", "Bodega",
      [{ usuario: "Bodega", empresa: "american_classic" }], false);
    expect([...(a.empresas ?? [])]).toEqual([]);
    expect(alcanza(a, "american_classic")).toBe(false);
  });
});

describe("🔑 David gana la puerta, no el módulo", () => {
  it("está en APROBACIONES_ROLES y NO en ASISTENCIA_ROLES", () => {
    expect(aprobacionesRoles()).toContain(ROL_BOSTON);
    expect(asistenciaRoles()).not.toContain(ROL_BOSTON);
  });

  it("ve UNA sola pestaña: Aprobaciones", () => {
    expect(vePestana(ROL_BOSTON, "aprobaciones")).toBe(true);
    for (const t of ["planilla", "reporte", "justificaciones", "vacaciones", "configuracion"]) {
      expect(vePestana(ROL_BOSTON, t), t).toBe(false);
    }
  });

  it("🔴 y NO cae en `soloApruebaRoles()`: su planilla de Boston conserva la plata", () => {
    expect(soloApruebaRoles()).not.toContain(ROL_BOSTON);
    expect(soloApruebaRoles()).toContain("bodega");
  });

  it("los cuatro roles que aprueban son exactamente los esperados", () => {
    expect([...APROBACIONES_ROLES].sort())
      .toEqual(["admin", "bodega", "contabilidad", ROL_BOSTON].sort());
  });
});

// ── La migración ─────────────────────────────────────────────────────────────

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260903120000_asistencia_aprobador_empresa.sql"),
  "utf-8",
);
/** Fuera comentarios: el archivo NOMBRA lo que prohíbe. */
const sinComentarios = SQL.replace(/^\s*--.*$/gm, "");

describe("la migración", () => {
  it("crea la tabla con llave compuesta y CHECK a las tres empresas", () => {
    expect(sinComentarios).toMatch(/CREATE TABLE IF NOT EXISTS asistencia_aprobador_empresa/);
    expect(sinComentarios).toMatch(/PRIMARY KEY \(usuario, empresa\)/);
    for (const e of EMPRESAS_ASISTENCIA) expect(sinComentarios).toContain(`'${e}'`);
  });

  it("🔴 NO TOCA las 521 aprobaciones que ya existen", () => {
    expect(sinComentarios).not.toMatch(/asistencia_horas_extra_aprobadas/);
  });

  it("no borra ni trunca nada", () => {
    expect(sinComentarios).not.toMatch(/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  });

  it("siembra el reparto de Daniel, y es idempotente", () => {
    expect(sinComentarios).toMatch(/\('david',\s*'confecciones_boston'\)/);
    expect(sinComentarios).toMatch(/\('Bodega',\s*'fashion_wear'\)/);
    expect(sinComentarios).toMatch(/\('Bodega',\s*'vistana'\)/);
    expect(sinComentarios).toMatch(/ON CONFLICT \(usuario, empresa\) DO NOTHING/);
  });

  it("⚠️ y NO le siembra filas a `admin`: pasa siempre, sin tabla", () => {
    expect(sinComentarios).not.toMatch(/\('admin',/);
  });

  it("le agrega el módulo a David con array_append, no reescribiendo la lista", () => {
    expect(sinComentarios).toMatch(/modulos\s*\|\|\s*ARRAY\['asistencia'\]/);
    expect(sinComentarios).toMatch(/role = 'gerente_boston'/);
    expect(sinComentarios).toMatch(/NOT \('asistencia' = ANY\(modulos\)\)/);
  });
});

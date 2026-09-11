// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UN SELECTOR DE EMPRESA PARA TODO ASISTENCIA, Y «REPORTE» SE LLAMA
// «ASISTENCIA» (10-sep-2026, noche)
//
// Daniel, textual: *«Reporte pasa a llamarse Asistencia. Tu orden»* y *«que
// reporte se pueda filtrar también por empresa y sacar un excel filtrado para
// revisar tardanzas, ausencia, etc. Aprobaciones también se debería de poder
// ver por empresa, todo por empresa no?»*.
//
// 🔴 El filtro es de LECTURA: nada de lo que se guarda cambia. Y la ruta de
// Aprobaciones con `?empresa=` no aprueba NADA de otra empresa (todo o nada).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signSession } from "@/lib/session-cookie";
import {
  TODAS, empresaElegida, empresaParaPedir, empresasQueVe, esTodas, etiquetaDeFiltro,
  filtrarPorEmpresa, nombreArchivoPorEmpresa, opcionesDeEmpresa,
} from "@/lib/asistencia/empresa-para-todo";
import { EMPRESAS_ASISTENCIA } from "@/lib/asistencia/config";
import { PESTANAS_PERSONA_EN_EL_CENTRO, pestanaMudada, pestanaQueSeAbre, pestanasDeAsistencia } from "@/lib/asistencia/persona-en-el-centro";
import { nombreArchivoAprobaciones } from "@/lib/asistencia/aprobaciones-excel";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-empresa-para-todo"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const escrito: unknown[][] = [];
const FICHAS = [
  { empleado_codigo: "40", nombre: "KEVIN", empresa: "confecciones_boston", activo: true },
  { empleado_codigo: "11", nombre: "JULIO", empresa: "vistana", activo: true },
];
vi.mock("@/lib/asistencia/config-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/asistencia/config-server")>("@/lib/asistencia/config-server");
  return { ...real, leerPersonas: async () => ({ filas: FICHAS, faltaMigracion: false }) };
});
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      upsert: (filas: unknown[]) => { escrito.push(filas); return Promise.resolve({ error: null }); },
    }),
  },
}));
const { POST } = await import("@/app/api/asistencia/aprobaciones/route");

const RAIZ = join(__dirname, "..", "..", "..");
const puro = (rel: string) =>
  readFileSync(join(RAIZ, rel), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function pedir(url: string, dias: Array<{ codigo: string; fecha: string }>) {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "daniel", sessionToken: "t1", modules: ["asistencia"] });
  return POST(new NextRequest(`http://x${url}`, {
    method: "POST", headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify({ aprobado: true, dias }),
  }));
}
beforeEach(() => { escrito.length = 0; });

describe("A. 🔴 «Reporte» se llama «Asistencia», y el orden es el del trabajo", () => {
  it("Colaboradores · Asistencia · Aprobaciones · Planilla · Préstamos", () => {
    expect(PESTANAS_PERSONA_EN_EL_CENTRO.map(([k, r]) => `${k}:${r}`)).toEqual([
      "colaboradores:Colaboradores", "asistencia:Asistencia", "aprobaciones:Aprobaciones", "planilla:Planilla", "prestamos:Préstamos",
    ]);
    expect(PESTANAS_PERSONA_EN_EL_CENTRO.some(([, r]) => /reporte/i.test(r))).toBe(false);
  });
  it("`?tab=reporte` sigue llegando: cae en Asistencia; el aterrizaje sigue en Colaboradores", () => {
    const visibles = pestanasDeAsistencia({ personaEnElCentro: true, planillaUnida: true });
    expect(pestanaMudada("reporte")).toBe("asistencia");
    expect(pestanaQueSeAbre("reporte", visibles)).toBe("asistencia");
    expect(pestanaQueSeAbre(null, visibles)).toBe("colaboradores");
    expect(puro("src/app/asistencia/colaboradores/SeccionAsistencia.tsx")).toMatch(/tab=asistencia&/);
    expect(puro("src/app/asistencia/AsistenciaClient.tsx")).toMatch(/\(tab === "reporte" \|\| tab === "asistencia"\) && <ReporteTab empresa=\{empresa\} \/>/);
  });
});

describe("B. 🔴 las opciones salen del rol", () => {
  it("admin: «Todas» + las cuatro, con nombre corto", () => {
    expect(empresasQueVe("admin")).toEqual(EMPRESAS_ASISTENCIA);
    const o = opcionesDeEmpresa("admin");
    expect(o[0]).toEqual({ clave: TODAS, etiqueta: "Todas" });
    expect(o.map((x) => x.clave)).toEqual([TODAS, ...EMPRESAS_ASISTENCIA]);
    expect(o.find((x) => x.clave === "american_classic")!.etiqueta).toBe("Multifashion");
  });
  it("🔴 David (gerente_boston): solo Boston, SIN «Todas»", () => {
    expect(opcionesDeEmpresa("gerente_boston")).toEqual([{ clave: "confecciones_boston", etiqueta: etiquetaDeFiltro("confecciones_boston") }]);
    expect(empresaElegida("vistana", "gerente_boston")).toBe("confecciones_boston");
    expect(empresaElegida(TODAS, "gerente_boston")).toBe("confecciones_boston");
  });
  it("basura o vacío caen en la primera opción; una empresa válida se respeta", () => {
    expect(empresaElegida("", "admin")).toBe(TODAS);
    expect(empresaElegida("otra", "admin")).toBe(TODAS);
    expect(empresaElegida("vistana", "admin")).toBe("vistana");
  });
});

describe("C. el filtro es de lectura y el archivo dice la empresa", () => {
  it("filtrarPorEmpresa: «Todas» deja pasar hasta a quien no tiene empresa", () => {
    const lista = [{ empresa: "vistana" }, { empresa: null }, { empresa: "confecciones_boston" }];
    expect(filtrarPorEmpresa(lista, TODAS)).toHaveLength(3);
    expect(filtrarPorEmpresa(lista, "")).toHaveLength(3);
    expect(filtrarPorEmpresa(lista, "vistana")).toEqual([{ empresa: "vistana" }]);
    expect(esTodas(TODAS) && esTodas("") && esTodas(null)).toBe(true);
    expect(empresaParaPedir(TODAS)).toBeNull();
    expect(empresaParaPedir("vistana")).toBe("vistana");
  });
  it("Asistencia-Boston-2026-09-01_2026-09-15.xlsx · Horas extra-Todas-…", () => {
    expect(nombreArchivoPorEmpresa("Asistencia", "confecciones_boston", "2026-09-01", "2026-09-15", "xlsx")).toBe("Asistencia-Boston-2026-09-01_2026-09-15.xlsx");
    expect(nombreArchivoPorEmpresa("Asistencia", TODAS, "2026-09-01", "2026-09-15", "pdf")).toBe("Asistencia-Todas-2026-09-01_2026-09-15.pdf");
    expect(nombreArchivoAprobaciones("2026-09-01", "2026-09-15", "vistana")).toBe("Horas-extra-Vistana-2026-09-01_2026-09-15.xlsx");
  });
});

describe("D. 🔴 la ruta de Aprobaciones con `empresa=` no aprueba nada de otra empresa", () => {
  it("un código de Vistana con Boston elegido: 400 y NO se escribe nada — ni el de Boston", async () => {
    const res = await pedir("/api/asistencia/aprobaciones?empresa=confecciones_boston", [
      { codigo: "40", fecha: "2026-09-01" }, { codigo: "11", fecha: "2026-09-01" },
    ]);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.fuera).toEqual(["11"]);
    expect(j.error).toContain("no es de Confecciones Boston");
    expect(escrito).toHaveLength(0);
  });
  it("solo gente de la empresa elegida: se escribe", async () => {
    const res = await pedir("/api/asistencia/aprobaciones?empresa=confecciones_boston", [{ codigo: "40", fecha: "2026-09-01" }]);
    expect(res.status).toBe(200);
    expect(escrito).toHaveLength(1);
  });
  it("sin `empresa=` se comporta como siempre", async () => {
    const res = await pedir("/api/asistencia/aprobaciones", [{ codigo: "40", fecha: "2026-09-01" }, { codigo: "11", fecha: "2026-09-01" }]);
    expect(res.status).toBe(200);
    expect(escrito).toHaveLength(1);
  });
});

describe("E. las pantallas cuelgan del MISMO selector", () => {
  it("el selector vive en el cajón del módulo, en la URL y recordado", () => {
    const src = puro("src/app/asistencia/AsistenciaClient.tsx");
    expect(src).toMatch(/useUrlState<string>\(PARAM_EMPRESA, ""\)/);
    expect(src).toMatch(/useLastUsed\(RECORDAR_EMPRESA, ""\)/);
    expect(src).toMatch(/aria-label="Empresa"/);
    for (const c of ["<PlanillaTab empresa={empresa} />", "<PrestamosTab empresa={empresa} />", "<AprobacionesTab empresa={empresa} />", "<ConfiguracionTab personaEnElCentro empresa={empresa} />"]) {
      expect(src).toContain(c);
    }
  });
  it("Planilla ya no tiene su propio selector, y con «Todas» pide elegir", () => {
    const src = puro("src/app/asistencia/PlanillaTab.tsx");
    expect(src).not.toMatch(/setEmpresa\(e\.target\.value\)/);
    expect(src).toMatch(/const sinEmpresa = esTodas\(empresa\);/);
    expect(src).toMatch(/if \(!elegido \|\| sinEmpresa\) return;/);
    expect(src).toMatch(/Elige <b>una empresa<\/b> arriba/);
  });
  it("Colaboradores perdió los chips de empresa y filtra por la de arriba", () => {
    const src = puro("src/app/asistencia/ConfiguracionTab.tsx");
    expect(src).not.toMatch(/\{etiquetaEmpresa\(e\)\} \(\{activos\.filter\(\(p\) => p\.empresa === e\)\.length\}\)/);
    expect(src).not.toMatch(/setFiltro\(e\)/);
    expect(src).toMatch(/filtrarPorEmpresa\(\(datos\?\.personas \?\? \[\]\)\.filter\(\(p\) => p\.activo\), empresa\)/);
  });
  it("Asistencia y Aprobaciones piden `empresa=` a sus rutas, y Préstamos filtra la lista", () => {
    expect(puro("src/app/asistencia/ReporteTab.tsx")).toMatch(/if \(emp\) p\.set\("empresa", emp\);/);
    expect(puro("src/app/api/asistencia/reporte/route.ts")).toMatch(/\.filter\(\(p\) => !empresaFiltro \|\| p\.empresa === empresaFiltro\)/);
    expect(puro("src/app/asistencia/AprobacionesTab.tsx")).toMatch(/if \(emp\) p\.set\("empresa", emp\);/);
    expect(puro("src/app/asistencia/PrestamosTab.tsx")).toMatch(/filtrarPorEmpresa\(j\.fichas \?\? \[\], props\.empresa\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. 🔴 LAS OPCIONES SALEN DE LO QUE SU ROL PUEDE VER EN EL SERVIDOR (11-sep-2026)
//
// 🩸 A `bodega` (Julio) el selector le ofrecía las 4 empresas y el servidor le
// recortaba a las suyas (`asistencia_aprobador_empresa`: fashion_wear +
// vistana): eligiendo Boston o Multifashion la pestaña quedaba vacía sin decir
// por qué. Las opciones salían solo de `esGerenteBoston`, no del alcance real.
// ─────────────────────────────────────────────────────────────────────────────
describe("E. 🔴 el selector ofrece SOLO lo que el alcance del servidor deja ver", () => {
  it("bodega con alcance [fashion_wear, vistana]: «Todas» + esas dos, en el orden de la casa", () => {
    expect(empresasQueVe("bodega", ["vistana", "fashion_wear"])).toEqual(
      EMPRESAS_ASISTENCIA.filter((k) => k === "fashion_wear" || k === "vistana"),
    );
    const o = opcionesDeEmpresa("bodega", ["vistana", "fashion_wear"]);
    expect(o.map((x) => x.clave)).toEqual([TODAS, ...EMPRESAS_ASISTENCIA.filter((k) => k === "fashion_wear" || k === "vistana")]);
    expect(o.some((x) => x.clave === "confecciones_boston")).toBe(false);
  });
  it("con UNA sola empresa en el alcance, solo ésa y sin «Todas»; una recordada ajena cae ahí", () => {
    expect(opcionesDeEmpresa("bodega", ["vistana"])).toEqual([{ clave: "vistana", etiqueta: etiquetaDeFiltro("vistana") }]);
    expect(empresaElegida("confecciones_boston", "bodega", ["vistana"])).toBe("vistana");
  });
  it("alcance `null` (admin, quien cierra) o todavía sin respuesta: las cuatro, como siempre", () => {
    expect(empresasQueVe("admin", null)).toEqual(EMPRESAS_ASISTENCIA);
    expect(empresasQueVe("bodega", undefined)).toEqual(EMPRESAS_ASISTENCIA);
  });
  it("🔴 David sigue siendo Boston, diga lo que diga el alcance", () => {
    expect(empresasQueVe("gerente_boston", ["vistana"])).toEqual(["confecciones_boston"]);
  });
  it("un alcance que no cruza con ninguna no deja el selector vacío: lo del rol, y el servidor recorta", () => {
    expect(empresasQueVe("bodega", [])).toEqual(EMPRESAS_ASISTENCIA);
    expect(empresasQueVe("bodega", ["otra"])).toEqual(EMPRESAS_ASISTENCIA);
  });
  it("y la pantalla se lo pregunta al servidor (`/api/asistencia/alcance`) y se lo pasa a las dos funciones", () => {
    const src = puro("src/app/asistencia/AsistenciaClient.tsx");
    expect(src).toContain('fetch("/api/asistencia/alcance"');
    expect(src).toContain("opcionesDeEmpresa(rol, alcance)");
    expect(src).toContain("empresaElegida(empresaUrl || empresaRecordada, rol, alcance)");
  });
});

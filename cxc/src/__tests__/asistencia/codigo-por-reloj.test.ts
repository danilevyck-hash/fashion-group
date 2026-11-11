// ─────────────────────────────────────────────────────────────────────────────
// EL MISMO NÚMERO EN DOS RELOJES ES DOS PERSONAS (11-nov-2026).
//
// El caso real: Jorman (ficha 5) marca en el reloj de Boston con el 5; Silenys,
// colaboradora nueva de Multifashion sin ficha, marca en el reloj de
// Multifashion también con el 5. Sin el mapeo, el día de Jorman trae 8 marcas,
// queda «a revisar» y su hora extra se mide contra la última marca de ELLA.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  MARCAS_POR_RELOJ_Y_NUMERO,
  SIN_MAPA,
  armarMapaDeReloj,
  codigosQueCaenEn,
  conCodigoPorReloj,
  llaveDeReloj,
} from "@/lib/asistencia/codigo-por-reloj";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type Correccion } from "@/lib/asistencia/correcciones";

const RAIZ = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Hora de Panamá → ISO (UTC−5 fijo). */
const en = (dia: string, hora: string) => new Date(`${dia}T${hora}-05:00`).toISOString();

const DIA = "2026-10-01";
const marca = (id: string, dispositivo: string, hora: string): Marcacion => ({
  id,
  empleado_codigo: "5",
  empleado_nombre: null,
  ocurrio_en: en(DIA, hora),
  dispositivo,
});

/** Jorman en Boston (08:00 → 16:30, almuerzo 30) y Silenys en Multifashion. */
const JORMAN = [
  marca("j1", "reloj cboston", "07:58:10"),
  marca("j2", "reloj cboston", "12:01:00"),
  marca("j3", "reloj cboston", "12:29:00"),
  marca("j4", "reloj cboston", "16:31:00"),
];
const SILENYS = [
  marca("s1", "reloj acs", "09:54:13"),
  marca("s2", "reloj acs", "13:51:22"),
  marca("s3", "reloj acs", "14:54:00"),
  marca("s4", "reloj acs", "19:00:42"),
];
const MEZCLADAS = [...JORMAN, ...SILENYS];

const MAPA = armarMapaDeReloj([
  { dispositivo: "reloj acs", codigo_reloj: "5", empleado_codigo: "308" },
  { dispositivo: "reloj acs", codigo_reloj: "4", empleado_codigo: "306" },
]);

const HORARIOS = [
  { empleado_codigo: "5", entrada: "08:00", salida: "16:30", almuerzo_minutos: 30 },
  { empleado_codigo: "308", entrada: "10:00", salida: "18:30", almuerzo_minutos: 60 },
];

function reporte(marcaciones: readonly Marcacion[]) {
  return armarReporte({
    marcaciones,
    horarios: HORARIOS,
    justificaciones: [],
    feriados: new Map(),
    desde: DIA,
    hasta: DIA,
    diasLaborables: new Map([["5", [1, 2, 3, 4, 5]], ["308", [1, 2, 3, 4, 5, 6]]]),
  });
}
const persona = (ps: ReturnType<typeof reporte>, codigo: string) => ps.find((p) => p.codigo === codigo);

describe("1. la regla pura", () => {
  it("🔴 el interruptor está APAGADO en main: se prende después de aplicar la migración", () => {
    expect(MARCAS_POR_RELOJ_Y_NUMERO).toBe(false);
  });

  it("con el mapa vacío devuelve LA MISMA lista (ni copia ni toca nada)", () => {
    expect(conCodigoPorReloj(MEZCLADAS, SIN_MAPA)).toBe(MEZCLADAS);
  });

  it("resuelve solo el par (reloj, número) del mapeo; lo demás queda tal cual", () => {
    const r = conCodigoPorReloj(MEZCLADAS, MAPA);
    expect(r.filter((m) => m.empleado_codigo === "5").map((m) => m.id)).toEqual(["j1", "j2", "j3", "j4"]);
    expect(r.filter((m) => m.empleado_codigo === "308").map((m) => m.id)).toEqual(["s1", "s2", "s3", "s4"]);
    // La lista que entró no se muta: la marca de Silenys sigue diciendo 5.
    expect(SILENYS.every((m) => m.empleado_codigo === "5")).toBe(true);
  });

  it("una marca sin dispositivo (agregada a mano) nunca se mueve", () => {
    const [m] = conCodigoPorReloj([{ empleado_codigo: "5", empleado_nombre: null, ocurrio_en: en(DIA, "09:00:00") }], MAPA);
    expect(m.empleado_codigo).toBe("5");
  });

  it("codigosQueCaenEn: el propio más los números de reloj que le pertenecen", () => {
    expect(codigosQueCaenEn("308", MAPA)).toEqual(["308", "5"]);
    expect(codigosQueCaenEn("5", MAPA)).toEqual(["5"]);
    expect(codigosQueCaenEn("5", SIN_MAPA)).toEqual(["5"]);
    expect(llaveDeReloj(" reloj acs ", " 5 ")).toBe("reloj acs|5");
  });
});

describe("2. el día de Jorman con las marcas de Silenys mezcladas → separadas", () => {
  it("🩸 SIN el mapeo: una sola persona con 8 marcas, a revisar, y la salida es la de ella", () => {
    const ps = reporte(MEZCLADAS);
    expect(ps.map((p) => p.codigo)).toEqual(["5"]);
    const d = persona(ps, "5")!.dias[0];
    expect(d.marcas).toHaveLength(8);
    expect(d.revisar).toBe(true);
    expect(d.salida).toBe("19:00:42");
  });

  it("🔴 CON el mapeo: dos personas, 4 marcas cada una, ninguna a revisar, cada una con su salida", () => {
    const ps = reporte(conCodigoPorReloj(MEZCLADAS, MAPA));
    expect(ps.map((p) => p.codigo).sort()).toEqual(["308", "5"]);
    const jorman = persona(ps, "5")!.dias[0];
    const silenys = persona(ps, "308")!.dias[0];
    expect(jorman.marcas).toHaveLength(4);
    expect(jorman.revisar).toBe(false);
    expect(jorman.salida).toBe("16:31:00");
    expect(silenys.marcas).toHaveLength(4);
    expect(silenys.revisar).toBe(false);
    expect(silenys.entrada).toBe("09:54:13");
    expect(silenys.salida).toBe("19:00:42");
  });

  it("y la hora extra de Jorman deja de medirse contra la salida de Silenys", () => {
    const mezclado = persona(reporte(MEZCLADAS), "5")!.dias[0].extraMin;
    const separado = persona(reporte(conCodigoPorReloj(MEZCLADAS, MAPA)), "5")!.dias[0].extraMin;
    expect(mezclado).toBeGreaterThan(separado);
    expect(separado).toBe(0); // 16:31 contra 16:30: no llega al mínimo de 10 min
  });

  it("una corrección sigue atada a SU marca por id y viaja con ella a su dueña", () => {
    const quita: Correccion = {
      id: "c1", marcacionId: "s4", empleadoCodigo: "5", fecha: DIA, hora: "", motivo: "—",
      creadaPor: "Contabilidad", creadaEn: en(DIA, "20:00:00"), quita: true,
    };
    const { marcaciones, porDia } = aplicarCorrecciones(conCodigoPorReloj(MEZCLADAS, MAPA), [quita]);
    expect(marcaciones.filter((m) => m.empleado_codigo === "308")).toHaveLength(3);
    expect(marcaciones.filter((m) => m.empleado_codigo === "5")).toHaveLength(4);
    expect([...porDia.keys()]).toEqual([`308|${DIA}`]);
  });
});

describe("3. el lector del servidor y los candados", () => {
  it("apagado, leerMapaDeReloj NO consulta la base y devuelve el mapa vacío", async () => {
    const from = vi.fn();
    vi.resetModules();
    vi.doMock("@/lib/supabase-server", () => ({ HAS_SERVICE_ROLE: true, supabaseServer: { from } }));
    const { leerMapaDeReloj } = await import("@/lib/asistencia/codigo-por-reloj-server");
    expect((await leerMapaDeReloj(false)).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/supabase-server");
  });

  it("prendido, lee solo los ACTIVOS; un error lanza (no se vuelve a mezclar en silencio)", async () => {
    let res: { data: unknown; error: unknown } = {
      data: [{ dispositivo: "reloj acs", codigo_reloj: "5", empleado_codigo: "308" }],
      error: null,
    };
    const eq = vi.fn(async () => res);
    const select = vi.fn(() => ({ eq }));
    vi.resetModules();
    vi.doMock("@/lib/supabase-server", () => ({ HAS_SERVICE_ROLE: true, supabaseServer: { from: () => ({ select }) } }));
    const { leerMapaDeReloj } = await import("@/lib/asistencia/codigo-por-reloj-server");
    const mapa = await leerMapaDeReloj(true);
    expect(eq).toHaveBeenCalledWith("activo", true);
    expect(mapa.get("reloj acs|5")).toBe("308");
    res = { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
    await expect(leerMapaDeReloj(true)).rejects.toThrow(/mapeo de relojes/);
    vi.doUnmock("@/lib/supabase-server");
  });

  it("🔴 TODO lector de marcas del reloj resuelve el código por el MISMO lugar", () => {
    const lectores = [
      "app/api/asistencia/reporte/route.ts",
      "app/api/asistencia/planilla/route.ts",
      "app/api/asistencia/horarios/route.ts",
      "lib/asistencia/quien-marco-server.ts",
      "lib/asistencia/config-server.ts",
      "lib/asistencia/ficha-de-configuracion-server.ts",
      "lib/asistencia/correcciones-server.ts",
      "lib/marcacion/estado-server.ts",
    ];
    for (const rel of lectores) {
      const src = leer(rel);
      expect(src, rel).toMatch(/conCodigoPorReloj\(/);
      expect(src, rel).toMatch(/leerMapaDeReloj\(\)/);
    }
    // El Reporte y la planilla lo hacen ANTES de aplicar las correcciones.
    for (const rel of ["app/api/asistencia/reporte/route.ts", "app/api/asistencia/planilla/route.ts"]) {
      const src = leer(rel);
      expect(src.indexOf("conCodigoPorReloj(marcacionesCrudas"), rel).toBeLessThan(src.indexOf("aplicarCorrecciones(marcaciones"));
    }
  });

  it("🔴 la marca del reloj NUNCA se edita: la resolución es una copia al leer, y nadie escribe en el mapeo desde la app", () => {
    for (const rel of ["lib/asistencia/codigo-por-reloj.ts", "lib/asistencia/codigo-por-reloj-server.ts"]) {
      const src = leer(rel);
      expect(src, rel).not.toMatch(/\.(update|delete|upsert|insert)\(/);
    }
    const mig = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20270111120000_asistencia_codigo_por_reloj.sql"), "utf8");
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS asistencia_codigo_por_reloj/);
    expect(mig).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(mig).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b\s+(asistencia_|FROM)/);
  });
});

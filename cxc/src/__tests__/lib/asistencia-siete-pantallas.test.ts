// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE DANIEL APROBÓ AL REVISAR LAS 7 PANTALLAS DE ASISTENCIA (10-sep-2026)
//
//   1. Los totales del Reporte se muestran con dos decimales (eran
//      9544.499999999998): PRESENTACIÓN. Y la plata de la planilla se suma a
//      centavos en cada paso (evidencia, no cambio).
//   2. El Reporte capitaliza los nombres, como la lista.
//   3. «Justificaciones del período» no se dibuja cuando no hay ninguna.
//   4. Un código sin ficha muestra «—» en Jornada: 48 es relleno, no dato.
//   5. Los avisos del reloj son UNA línea por reloj (*«debe de ser más chico,
//      que no estorbe tanto»*); el párrafo explicativo pasó a un «?».
//   7. Préstamos: «Descuento a terceros» solo cuando alguien lo tiene.
//   8. El almuerzo es POR EMPRESA: 30 en las tres de siempre, 60 en
//      Multifashion (*«entrada 10am, una hora de almuerzo»*). Medido: 0
//      diferencias en la quincena en curso (`_medir-almuerzo-por-empresa.ts`).
// (El 6 —el aviso «qué cambió» se marca visto al mostrarse— vive en
// `components/novedades-una-vez.test.tsx`.)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const upserts: Array<Record<string, unknown>> = [];
let fichaEmpresa: string | null = null;
let entradaPrevia: string | null = null;

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "test", userId: "1", sessionToken: "t" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (tabla: string) => ({
      upsert: (fila: Record<string, unknown>) => { upserts.push(fila); return Promise.resolve({ error: null }); },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: tabla === "asistencia_personas"
              ? (fichaEmpresa ? { empresa: fichaEmpresa } : null)
              : (entradaPrevia ? { entrada: entradaPrevia } : null),
            error: null,
          }),
        }),
      }),
    }),
  },
}));

import { PUT as putHorario } from "@/app/api/asistencia/horarios/route";
import {
  ALMUERZO_FIJO_MIN, ALMUERZO_POR_EMPRESA, EMPRESAS_ASISTENCIA, almuerzoDeEmpresa, textoAlmuerzo,
} from "@/lib/asistencia/config";
import { EXTRA_AUTOMATICO_POR_EMPRESA } from "@/lib/asistencia/extra-automatico";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const puro = (rel: string) =>
  leer(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pedido = (body: unknown) => ({ json: async () => body }) as never;

beforeEach(() => { upserts.length = 0; fichaEmpresa = null; entradaPrevia = null; });

describe("1. 🔴 los totales del Reporte se ven con dos decimales, y la plata ya se suma a centavos", () => {
  const rep = puro("src/app/asistencia/ReporteTab.tsx");
  it("la fila de totales usa el MISMO formato que las celdas (fmtMin)", () => {
    expect(rep).toMatch(/\{tot\.tarde \? fmtMin\(tot\.tarde\) : "—"\}/);
    expect(rep).toMatch(/\{tot\.noTrab \? fmtMin\(tot\.noTrab\) : "—"\}/);
    expect(rep).toMatch(/\{tot\.extra \? fmtMin\(tot\.extra\) : "—"\}/);
    expect(rep).not.toMatch(/\{tot\.tarde \|\| "—"\}/);
  });
  it("EVIDENCIA: el total de la planilla se suma a centavos en cada paso, y el cierre redondea", () => {
    const pl = puro("src/lib/asistencia/planilla.ts");
    expect(pl).toMatch(/t\.totalBruto = centavos\(t\.totalBruto \+ d\.totalBruto\)/);
    expect(pl).toMatch(/t\.tardanzas = centavos\(t\.tardanzas \+ d\.tardanzas\)/);
    const pg = puro("src/lib/asistencia/planilla-guardada.ts");
    expect(pg).toMatch(/const c = \(n: number\) => Math\.round\(n \* 100\) \/ 100;/);
    expect(pg).toMatch(/totalBruto: c\(totalBruto\)/);
    // El Excel y el PDF de la planilla NO re-suman: leen `d.totales`.
    const ex = puro("src/lib/asistencia/planilla-exportar.ts");
    expect(ex).toMatch(/const t = d\.totales;/);
    expect(ex).not.toMatch(/totalBruto \+=/);
  });
});

describe("2. los nombres del Reporte se muestran capitalizados", () => {
  it("reusa capitalizarNombre sobre la etiqueta, solo con nombre", () => {
    const rep = puro("src/app/asistencia/ReporteTab.tsx");
    expect(rep).toMatch(/capitalizarNombre\(etiquetaPersona\(p\.codigo, p\.nombre\)\)/);
  });
});

describe("3. 🔴 «Justificaciones del período» no se dibuja sin justificaciones", () => {
  it("el componente devuelve null vacío o cargando, y el enlace vive adentro", () => {
    const j = puro("src/app/asistencia/JustificacionesDelPeriodo.tsx");
    expect(j).toMatch(/if \(lista === null \|\| lista\.length === 0\) return null;/);
    expect(j).toMatch(/Justificaciones del período \(\$\{lista\.length\}\)/);
    expect(j).toMatch(/const \[abierta, setAbierta\] = useState\(false\);/);
    const rep = puro("src/app/asistencia/ReporteTab.tsx");
    expect(rep).not.toMatch(/verJustificaciones/);
    // 🔴 10-sep-2026 (noche): la pestaña recibe la empresa del selector de todo
    // el módulo (`empresa={empresa}`). Ver `asistencia-empresa-para-todo.test.ts`.
    expect(rep).toMatch(/<JustificacionesDelPeriodo desde=\{desde\} hasta=\{hasta\} empresa=\{empresa\} \/>/);
  });
});

describe("4. sin ficha, la jornada va con guion", () => {
  it("escritorio y celular", () => {
    const c = puro("src/app/asistencia/ConfiguracionTab.tsx");
    expect(c).toMatch(/\{p\.configurado \? `\$\{p\.jornadaSemanal\} h` : "—"\}/);
    expect(c).toMatch(/valor=\{p\.configurado \? `\$\{p\.jornadaSemanal\} h\/semana` : "—"\}/);
  });
});

describe("5. 🔴 los avisos del reloj son UNA línea por reloj", () => {
  const e = puro("src/app/asistencia/EstadoReloj.tsx");
  it("el párrafo explicativo pasó a un «?» con title; el error del reloj sigue a la vista", () => {
    expect(e).toMatch(/title=\{explicacion\}/);
    expect(e).toMatch(/const explicacion = reloj\.salud === "con_error" \? null : reloj\.detalle;/);
    expect(e).toMatch(/reloj\.salud === "con_error" && reloj\.detalle && \(/);
    expect(e).not.toMatch(/leading-relaxed/);
  });
  it("los tres estados del pedido siguen diciendo lo mismo, más corto, y el botón se queda", () => {
    expect(e).toMatch(/La PC de la oficina no ha recogido el pedido: revisa que esté prendida\./);
    expect(e).toMatch(/Pedido enviado, la PC lo recoge en unos minutos\./);
    expect(e).toMatch(/"Esperando a la PC…" : "Traer ahora"/);
    expect(e).toMatch(/px-3 py-1\.5/);
  });
});

describe("7. Préstamos: «Descuento a terceros» solo cuando alguien lo tiene", () => {
  it("la columna se dibuja solo si alguna fila tiene saldo de terceros, y la tarjeta lo dice", () => {
    const p = puro("src/app/asistencia/PrestamosTab.tsx");
    expect(p).toMatch(/const hayTerceros = fichas\.some\(\(f\) => \(f\.saldoTerceros \?\? 0\) > 0\);/);
    expect(p).toMatch(/\{hayTerceros && <th[^>]*>\{NOMBRE_CUENTA\.terceros\}<\/th>\}/);
    expect(p).toMatch(/\{hayTerceros && \(\s*<td/);
    expect(p).toMatch(/\(f\.saldoTerceros \?\? 0\) > 0 && ` · \$\{NOMBRE_CUENTA\.terceros\} \$\{money\(f\.saldoTerceros \?\? 0\)\}`/);
    // Y la página del colaborador ya desglosaba solo las cuentas con saldo.
    expect(puro("src/app/asistencia/colaboradores/SeccionPrestamos.tsx")).toMatch(/terceros: ficha\.saldoTerceros/);
  });
});

describe("8. 🔴 el almuerzo es por empresa: 30 en las tres de siempre, 60 en Multifashion", () => {
  it("la tabla cubre las cuatro empresas, como el extra automático", () => {
    expect(Object.keys(ALMUERZO_POR_EMPRESA).sort()).toEqual([...EMPRESAS_ASISTENCIA].sort());
    expect(Object.keys(ALMUERZO_POR_EMPRESA).sort()).toEqual(Object.keys(EXTRA_AUTOMATICO_POR_EMPRESA).sort());
    expect(ALMUERZO_POR_EMPRESA.american_classic).toBe(60);
    for (const e of ["confecciones_boston", "vistana", "fashion_wear"] as const) {
      expect(ALMUERZO_POR_EMPRESA[e]).toBe(ALMUERZO_FIJO_MIN);
    }
    expect(ALMUERZO_FIJO_MIN).toBe(30);
  });
  it("almuerzoDeEmpresa: Multifashion 60; desconocida, vacía o sin ficha → 30", () => {
    expect(almuerzoDeEmpresa("american_classic")).toBe(60);
    expect(almuerzoDeEmpresa("vistana")).toBe(30);
    expect(almuerzoDeEmpresa("otra")).toBe(30);
    expect(almuerzoDeEmpresa(null)).toBe(30);
    expect(almuerzoDeEmpresa(undefined)).toBe(30);
  });
  it("la frase de las pantallas y los papeles lo dice", () => {
    expect(textoAlmuerzo()).toBe("30 minutos (60 en Multifashion)");
    for (const rel of [
      "src/app/asistencia/HorariosTab.tsx", "src/app/asistencia/ConfiguracionTab.tsx",
      "src/app/asistencia/ReporteTab.tsx", "src/app/asistencia/ComoFuncionaTab.tsx",
      "src/lib/asistencia/exportar.ts",
    ]) {
      expect(puro(rel), rel).toMatch(/textoAlmuerzo\(\)/);
      expect(puro(rel), rel).not.toMatch(/igual para todos/);
    }
    // Horarios muestra el almuerzo GUARDADO de cada fila, no la constante.
    expect(puro("src/app/asistencia/HorariosTab.tsx")).toMatch(/\{f\.almuerzoMinutos\} minutos/);
  });
  it("🔴 el PUT de Horarios escribe el de la empresa de la ficha, nunca el del cuerpo", async () => {
    fichaEmpresa = "american_classic"; entradaPrevia = "10:00:00";
    const res = await putHorario(pedido({ codigo: "301", nombre: "Jenifer", salida: "19:00", almuerzoMinutos: 15 }));
    expect(res.status).toBe(200);
    expect(upserts[0].almuerzo_minutos).toBe(60);
    // Y la entrada guardada (10:00) se conserva: no se pisa con las 8:00.
    expect(upserts[0].entrada).toBe("10:00");
    upserts.length = 0; fichaEmpresa = "vistana"; entradaPrevia = null;
    await putHorario(pedido({ codigo: "6", nombre: "Ángela", salida: "16:30", almuerzoMinutos: 60 }));
    expect(upserts[0].almuerzo_minutos).toBe(30);
    expect(upserts[0].entrada).toBe("08:00");
    upserts.length = 0; fichaEmpresa = null;
    await putHorario(pedido({ codigo: "9999", salida: "17:00" }));
    expect(upserts[0].almuerzo_minutos).toBe(30);
  });
  it("el motor sigue leyendo la columna por persona (donde el PUT lo deja escrito)", () => {
    expect(puro("src/lib/asistencia/reporte.ts")).toMatch(/const almuerzoProg = h\?\.almuerzo_minutos \?\? ALMUERZO_FIJO_MIN;/);
  });
});

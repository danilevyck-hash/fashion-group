// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EN ASISTENCIA SON «COLABORADORES», NO «PERSONAS» (10-sep-2026)
//
// Daniel, textual: *«no lo llames personas, sino colaboradores»*.
//
// La pestaña que abre el módulo con `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` prendido
// se rotula «Colaboradores», su clave de URL es `?tab=colaboradores` y la página
// de cada quien vive en `/asistencia/colaboradores/[codigo]`. Lo viejo sigue
// llegando: `?tab=personas` cae en la misma pestaña (MUDANZA del módulo puro) y
// `/asistencia/personas/7` redirige 307 desde `next.config.js`, con la query
// intacta, como `/cheques` → `/recordatorios`.
//
// ⚠️ LO QUE NO CAMBIA, A PROPÓSITO: los identificadores de código
// (`PersonaPagina`, `RUTA_PERSONAS`, `persona-en-el-centro.ts`), la tabla
// `asistencia_personas`, el `persona=<código>` de la URL de Aprobaciones, y las
// frases donde «persona» quiere decir «un humano decide» («lo decide una
// persona»), que no hablan del empleado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PESTANAS_PERSONA_EN_EL_CENTRO,
  RUTA_PERSONAS,
  RUTA_PERSONAS_VIEJA,
  RUTA_PERSONA_NUEVA,
  pestanaMudada,
  pestanaPorDefecto,
  pestanaQueSeAbre,
  pestanasDeAsistencia,
  rutaDePersona,
} from "@/lib/asistencia/persona-en-el-centro";
import { avisoPendientes } from "@/lib/asistencia/configuracion-avisos";
import { avisoSinSaldo } from "@/lib/asistencia/saldo-vacaciones";
import { textoExtraNoAprobada } from "@/lib/asistencia/aprobaciones";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
/** Sin comentarios: un candado no se cumple con una palabra dentro de una explicación. */
const puro = (rel: string) =>
  leer(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function archivos(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) out.push(...archivos(rel, exts));
    else if (exts.some((e) => n.endsWith(e))) out.push(rel);
  }
  return out;
}

const VISIBLES = pestanasDeAsistencia({ personaEnElCentro: true, planillaUnida: true });

describe("A. 🔴 la pestaña se llama «Colaboradores»", () => {
  it("el rótulo es «Colaboradores» y la clave `colaboradores`, y es la primera", () => {
    expect(PESTANAS_PERSONA_EN_EL_CENTRO[0]).toEqual(["colaboradores", "Colaboradores"]);
    expect(VISIBLES[0]).toEqual(["colaboradores", "Colaboradores"]);
  });

  it("ninguna pestaña se llama «Personas» ni tiene clave `personas`", () => {
    for (const [k, rotulo] of PESTANAS_PERSONA_EN_EL_CENTRO) {
      expect(k).not.toBe("personas");
      expect(rotulo).not.toMatch(/\bPersonas?\b/);
    }
  });

  it("🔴 el módulo abre en Colaboradores", () => {
    expect(pestanaPorDefecto(true)).toBe("colaboradores");
    expect(pestanaQueSeAbre(null, VISIBLES)).toBe("colaboradores");
  });

  it("la pantalla monta la pestaña por su clave nueva, y la vieja no existe como clave", () => {
    const src = puro("src/app/asistencia/AsistenciaClient.tsx");
    // 🔴 10-sep-2026 (noche): la pestaña recibe la empresa del selector de todo
    // el módulo (`empresa={empresa}`). Ver `asistencia-empresa-para-todo.test.ts`.
    expect(src).toMatch(/tab === "colaboradores" && <ConfiguracionTab personaEnElCentro empresa=\{empresa\} \/>/);
    expect(src).not.toMatch(/tab === "personas"/);
  });
});

describe("B. 🔴 `?tab=personas` sigue llegando a la misma pestaña", () => {
  it("`personas` está en la mudanza y cae en `colaboradores`", () => {
    expect(pestanaMudada("personas")).toBe("colaboradores");
    expect(pestanaQueSeAbre("personas", VISIBLES)).toBe("colaboradores");
    expect(pestanaQueSeAbre(" personas ", VISIBLES)).toBe("colaboradores");
  });

  it("las redirecciones viejas que caían en `personas` ahora caen en `colaboradores`", () => {
    expect(pestanaMudada("configuracion")).toBe("colaboradores");
    expect(pestanaMudada("vacaciones")).toBe("colaboradores");
    expect(pestanaQueSeAbre("configuracion", VISIBLES)).toBe("colaboradores");
    expect(pestanaQueSeAbre("vacaciones", VISIBLES)).toBe("colaboradores");
  });

  it("quien no ve Colaboradores no cae ahí por `?tab=personas`: cae en la primera suya", () => {
    const suyas = VISIBLES.filter(([k]) => k === "aprobaciones");
    expect(pestanaQueSeAbre("personas", suyas)).toBe("aprobaciones");
  });
});

describe("C. 🔴 la dirección es /asistencia/colaboradores/[codigo], y la vieja redirige", () => {
  it("las rutas del módulo puro apuntan a `colaboradores`", () => {
    expect(RUTA_PERSONAS).toBe("/asistencia/colaboradores");
    expect(RUTA_PERSONAS_VIEJA).toBe("/asistencia/personas");
    expect(rutaDePersona("7")).toBe("/asistencia/colaboradores/7");
    expect(RUTA_PERSONA_NUEVA).toBe("/asistencia/colaboradores/nueva");
  });

  it("la carpeta nueva existe y la vieja ya no", () => {
    expect(existsSync(join(RAIZ, "src/app/asistencia/colaboradores/[codigo]/page.tsx"))).toBe(true);
    expect(existsSync(join(RAIZ, "src/app/asistencia/personas"))).toBe(false);
  });

  it("🔴 next.config.js redirige la vieja a la nueva, TEMPORAL (307) y con el código", () => {
    const cfg = leer("next.config.js");
    expect(cfg).toMatch(
      /source:\s*"\/asistencia\/personas\/:codigo"\s*,\s*destination:\s*"\/asistencia\/colaboradores\/:codigo"\s*,\s*permanent:\s*false/,
    );
  });

  it("la página vuelve a `?tab=colaboradores`, nunca a `?tab=personas`", () => {
    const src = puro("src/app/asistencia/colaboradores/PersonaPagina.tsx");
    expect(src).toMatch(/\/asistencia\?tab=colaboradores/);
    expect(src).not.toMatch(/tab=personas/);
    expect(src).toMatch(/‹ Colaboradores/);
  });

  it("el título de la página y el alta dicen «Colaborador»", () => {
    expect(puro("src/app/asistencia/colaboradores/[codigo]/page.tsx")).toMatch(/Colaborador · Asistencia/);
    expect(puro("src/app/asistencia/colaboradores/PersonaPagina.tsx")).toMatch(/"Colaborador nuevo"/);
    expect(puro("src/app/asistencia/colaboradores/FichaEditar.tsx")).toMatch(/"Colaborador nuevo"/);
  });
});

describe("D. 🔴 barrido: ningún texto visible del módulo dice «Personas»", () => {
  const ARCHIVOS = [
    ...archivos("src/app/asistencia", [".tsx", ".ts"]),
    ...archivos("src/lib/asistencia", [".ts", ".tsx"]),
  ];

  it("hay archivos que barrer", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(20);
  });

  it("«Personas» (plural, con mayúscula) no aparece en el código de ningún archivo", () => {
    for (const rel of ARCHIVOS) {
      expect(puro(rel), rel).not.toMatch(/\bPersonas\b/);
    }
  });

  it("ninguna columna, etiqueta ni título dice «Persona» a secas", () => {
    for (const rel of ARCHIVOS) {
      const src = puro(rel);
      expect(src, rel).not.toMatch(/"Persona"/);
      expect(src, rel).not.toMatch(/>\s*Persona\s*</);
      expect(src, rel).not.toMatch(/(titulo|label|placeholder|resumen)="[^"]*\b[Pp]ersonas?\b[^"]*"/);
    }
  });

  it("lo que se dibuja con singular/plural dice colaborador(es), no persona(s)", () => {
    for (const rel of ARCHIVOS) {
      const src = puro(rel);
      expect(src, rel).not.toMatch(/\?\s*"(1 )?persona[^"]*"\s*:\s*[`"]/);
      expect(src, rel).not.toMatch(/"personas?\b[^"]*"\s*\}/);
    }
  });
});

describe("E. los avisos y el Telegram hablan de colaboradores", () => {
  it("el aviso de pendientes de la lista", () => {
    expect(avisoPendientes({ total: 38, sinConfigurar: 6, sinSalario: 4 } as never)!.titulo)
      .toBe("10 colaboradores de 38 todavía no salen en la planilla.");
    expect(avisoPendientes({ total: 38, sinConfigurar: 1, sinSalario: 0 } as never)!.titulo)
      .toBe("1 colaborador de 38 todavía no sale en la planilla.");
  });

  it("el aviso de quién se quedó sin saldo", () => {
    expect(avisoSinSaldo(20, 16)).toContain("36 colaboradores no tienen saldo");
    expect(avisoSinSaldo(1, 0)).toContain("1 colaborador no tiene saldo");
  });

  it("el aviso de horas extra sin aprobar de la planilla", () => {
    const uno = textoExtraNoAprobada([{ codigo: "1", etiqueta: "A", minutos: 30, monto: 1 }] as never);
    expect(uno).toContain("1 colaborador tiene horas extra sin aprobar");
    const dos = textoExtraNoAprobada([
      { codigo: "1", etiqueta: "A", minutos: 30, monto: 1 },
      { codigo: "2", etiqueta: "B", minutos: 30, monto: 1 },
    ] as never);
    expect(dos).toContain("2 colaboradores tienen horas extra sin aprobar");
  });
});

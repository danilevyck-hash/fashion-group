/* ─────────────────────────────────────────────────────────────────────────────
 * CORREGIR UNA HORA EN LA PESTAÑA ASISTENCIA — los candados (11-sep-2026).
 *
 * Mockup aprobado por Daniel. Cuatro cosas:
 *   1. La hora se ELIGE con el selector del sistema (`type="time" step="1"`),
 *      nunca texto libre; los segundos son opcionales (`completarSegundos`).
 *   2. El porqué es obligatorio, campo libre, con hasta 4 botones de los más
 *      usados en 90 días, ARMADOS SOLOS de lo guardado (`motivos-frecuentes`).
 *   3. «Justificar» en la fila del día abre el MISMO formulario de la ficha.
 *   4. Ningún aviso manda a «Horarios», que ya no existe como pestaña.
 *
 * La pantalla se prueba en `asistencia-corregir-hora.test.tsx`.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import {
  claveMotivo,
  desdeDeLaVentana,
  motivosFrecuentes,
  MAX_MOTIVOS_FRECUENTES,
  MIN_USOS_MOTIVO,
  VENTANA_MOTIVOS_DIAS,
} from "@/lib/asistencia/motivos-frecuentes";
import {
  completarSegundos,
  diaCortoConSemana,
  encabezadoCorreccion,
} from "@/lib/asistencia/correcciones";

const RAIZ = join(process.cwd(), "src");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
/** Sin comentarios: un candado que se cumple con su propia explicación da permiso para romper. */
const puro = (rel: string) =>
  leer(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
// 1. LA HORA: selector del sistema, segundos opcionales
// ─────────────────────────────────────────────────────────────────────────────

describe("1. 🔴 la hora se elige con el selector del sistema, nunca texto libre", () => {
  it("la ventana usa <input type=\"time\" step=\"1\"> y no tiene ningún input de texto para la hora", () => {
    const src = puro("app/asistencia/CorregirMarcacionModal.tsx");
    expect(src).toMatch(/type="time"\s+step="1"/);
    expect(src).not.toMatch(/inputMode="numeric"/);
    expect(src).not.toMatch(/placeholder="8:00"/);
    // Y la frase del formato se fue: con el selector no hay formato que explicar.
    expect(src).not.toMatch(/Como 8:00/);
  });

  it("completarSegundos: con segundos, se respetan", () => {
    expect(completarSegundos("08:00:30", "13:22:02")).toBe("08:00:30");
    expect(completarSegundos("8:00:30", null)).toBe("08:00:30");
  });

  it("🔴 completarSegundos: sin tocar la hora del reloj, se conservan SUS segundos (13:22:02 no se vuelve 13:22:00)", () => {
    expect(completarSegundos("13:22", "13:22:02")).toBe("13:22:02");
  });

  it("completarSegundos: hora distinta sin segundos → :00; sin reloj (agregando) → :00", () => {
    expect(completarSegundos("08:00", "13:22:02")).toBe("08:00:00");
    expect(completarSegundos("08:00", null)).toBe("08:00:00");
  });

  it("completarSegundos: lo que no es una hora del día es null", () => {
    expect(completarSegundos("", "13:22:02")).toBeNull();
    expect(completarSegundos("25:00", null)).toBeNull();
    expect(completarSegundos("8", null)).toBeNull();
    expect(completarSegundos("17:4", null)).toBeNull();
  });

  it("la ventana manda al servidor la hora COMPLETADA, con segundos", () => {
    const src = puro("app/asistencia/CorregirMarcacionModal.tsx");
    expect(src).toMatch(/const horaGuardar = completarSegundos\(hora, marca\.relojHora\)/);
    expect(src).toMatch(/hora: horaGuardar,/);
  });

  it("precargada con la hora del reloj CON segundos (no recortada a HH:MM)", () => {
    const src = puro("app/asistencia/CorregirMarcacionModal.tsx");
    expect(src).toMatch(/normalizarHora\(marca\.relojHora \?\? ""\) \?\? ""/);
    expect(src).not.toMatch(/\.slice\(0, 5\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA LÍNEA DE ARRIBA y el recuadro que se fue
// ─────────────────────────────────────────────────────────────────────────────

describe("la ventana dice arriba, en UNA línea, quién, qué día y qué marcó el reloj", () => {
  it("«Yulissa Juárez · lun 31 ago · el reloj marcó 13:22:02»", () => {
    expect(encabezadoCorreccion("Yulissa Juárez", "2026-08-31", "13:22:02"))
      .toBe("Yulissa Juárez · lun 31 ago · el reloj marcó 13:22:02");
    expect(diaCortoConSemana("2026-09-07")).toBe("lun 7 sep");
  });

  it("agregando: «el reloj no registró nada»", () => {
    expect(encabezadoCorreccion("Ana Gómez", "2026-08-20", null))
      .toBe("Ana Gómez · jue 20 ago · el reloj no registró nada");
  });

  it("🔴 el recuadro «Esto no se borra nunca…» se retiró de la ventana y vive UNA vez en el «?» de la pestaña", () => {
    const modal = puro("app/asistencia/CorregirMarcacionModal.tsx");
    expect(modal).not.toMatch(/Esto no se borra nunca/);
    expect(modal).not.toMatch(/Lo que marcó el reloj/);
    const rep = puro("app/asistencia/ReporteTab.tsx");
    expect(rep).toMatch(/no borra nunca lo que marcó el reloj/);
    expect(rep).toMatch(/es la que cuenta para el pago/);
  });

  it("los botones son «Cerrar» y «Guardar»", () => {
    const src = leer("app/asistencia/CorregirMarcacionModal.tsx");
    expect(src).toMatch(/>\s*Cerrar\s*</);
    expect(src).toMatch(/"Guardando…" : "Guardar"\}/);
    expect(src).not.toMatch(/Guardar corrección/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EL PORQUÉ: obligatorio, campo libre, botones que se arman solos
// ─────────────────────────────────────────────────────────────────────────────

describe("2. 🔴 los motivos frecuentes se ARMAN SOLOS: 90 días, 2+ usos, máximo 4, grafía más reciente", () => {
  const HOY = "2026-09-11";
  const f = (motivo: string, creadaEn: string) => ({ motivo, creadaEn });

  it("las constantes son las que dictó Daniel: «máximo 4», y hace falta repetirse", () => {
    expect(MAX_MOTIVOS_FRECUENTES).toBe(4);
    expect(MIN_USOS_MOTIVO).toBe(2);
    expect(VENTANA_MOTIVOS_DIAS).toBe(90);
    expect(desdeDeLaVentana("2026-09-11")).toBe("2026-06-13");
  });

  it("la clave: minúsculas, sin acentos, sin bordes, un solo espacio", () => {
    expect(claveMotivo("  No MARCÓ   salida ")).toBe("no marco salida");
    expect(claveMotivo("Enfermedad")).toBe(claveMotivo("ENFERMEDAD"));
    // 🔴 Nada por parecido: un artículo de diferencia es OTRA clave.
    expect(claveMotivo("No marco la salida")).not.toBe(claveMotivo("No marco salida"));
  });

  it("sin historia, NINGÚN botón («empezar vacíos»)", () => {
    expect(motivosFrecuentes([], HOY)).toEqual([]);
  });

  it("con un solo uso no es frecuente", () => {
    expect(motivosFrecuentes([f("Mensajería", "2026-09-01T10:00:00Z")], HOY)).toEqual([]);
  });

  it("lo medido en producción el 11-sep-2026: 8 filas → 3 botones, los sueltos quedan fuera", () => {
    const filas = [
      f("No marco la salida", "2026-08-28T17:58:57Z"),
      f("ENFERMEDAD", "2026-08-28T17:50:00Z"),
      f("ENFERMEDAD", "2026-08-28T17:40:00Z"),
      f("Boda de Daniel", "2026-08-27T12:00:00Z"),
      f("Boda de Daniel", "2026-08-27T11:00:00Z"),
      f("Mensajería de Daniel", "2026-08-27T10:00:00Z"),
      f("No marco salida", "2026-08-26T21:00:00Z"),
      f("No marco salida", "2026-08-26T20:27:18Z"),
    ];
    const r = motivosFrecuentes(filas, HOY);
    expect(r).toHaveLength(3);
    expect(new Set(r)).toEqual(new Set(["ENFERMEDAD", "Boda de Daniel", "No marco salida"]));
    expect(r).not.toContain("Mensajería de Daniel");
    expect(r).not.toContain("No marco la salida");
  });

  it("orden: más usado primero; a igual uso, el escrito más recientemente", () => {
    const filas = [
      f("a", "2026-09-01T00:00:00Z"), f("a", "2026-09-02T00:00:00Z"), f("a", "2026-09-03T00:00:00Z"),
      f("b", "2026-09-05T00:00:00Z"), f("b", "2026-09-06T00:00:00Z"),
      f("c", "2026-08-01T00:00:00Z"), f("c", "2026-08-02T00:00:00Z"),
    ];
    expect(motivosFrecuentes(filas, HOY)).toEqual(["a", "b", "c"]);
  });

  it("🔴 se muestra la GRAFÍA MÁS RECIENTE del grupo", () => {
    const filas = [
      f("no marco salida", "2026-08-01T00:00:00Z"),
      f("No marcó salida", "2026-09-01T00:00:00Z"),
    ];
    expect(motivosFrecuentes(filas, HOY)).toEqual(["No marcó salida"]);
  });

  it("máximo 4 aunque haya más frecuentes", () => {
    const filas = ["a", "b", "c", "d", "e"].flatMap((m, i) => [
      f(m, `2026-09-0${i + 1}T00:00:00Z`), f(m, `2026-09-0${i + 1}T01:00:00Z`),
    ]);
    expect(motivosFrecuentes(filas, HOY)).toHaveLength(4);
  });

  it("🔴 lo de hace más de 90 días sale solo («eliminando si una no se usa»)", () => {
    const filas = [f("viejo", "2026-05-01T00:00:00Z"), f("viejo", "2026-05-02T00:00:00Z")];
    expect(motivosFrecuentes(filas, HOY)).toEqual([]);
    // El borde: justo 90 días atrás entra.
    const borde = [f("borde", "2026-06-13T00:00:00Z"), f("borde", "2026-06-13T01:00:00Z")];
    expect(motivosFrecuentes(borde, HOY)).toEqual(["borde"]);
  });

  it("un motivo vacío no arma ningún grupo", () => {
    expect(motivosFrecuentes([f("  ", "2026-09-01T00:00:00Z"), f("", "2026-09-01T00:00:00Z")], HOY)).toEqual([]);
  });

  it("🔴 NINGUNA lista de motivos escrita a mano en la ventana ni en el módulo puro", () => {
    for (const rel of ["app/asistencia/CorregirMarcacionModal.tsx", "lib/asistencia/motivos-frecuentes.ts"]) {
      const src = puro(rel);
      // Un arreglo literal de textos con espacios adentro es una lista de
      // motivos escrita a mano (los meses «ene, feb…» no llevan espacio).
      expect(src, rel).not.toMatch(/\[\s*"[^"\n]* [^"\n]*"\s*,/);
    }
    // La ventana los PIDE a la ruta y los pinta desde el estado.
    const modal = puro("app/asistencia/CorregirMarcacionModal.tsx");
    expect(modal).toMatch(/fetch\("\/api\/asistencia\/correcciones\/motivos"/);
    expect(modal).toMatch(/frecuentes\.map\(/);
    // Tocar un botón ESCRIBE en el campo; el campo es lo que se guarda.
    expect(modal).toMatch(/onClick=\{\(\) => setMotivo\(m\)\}/);
    expect(modal).toMatch(/motivo,\s*\}\),/);
  });
});

describe("2b. la ruta GET /api/asistencia/correcciones/motivos: solo lectura, sin tabla nueva", () => {
  it("lee motivo y creada_en de asistencia_correcciones, con la ventana de 90 días, y no escribe nada", () => {
    const srv = puro("lib/asistencia/correcciones-server.ts");
    const fn = srv.slice(srv.indexOf("export async function leerMotivosFrecuentes"), srv.indexOf("export interface NuevaCorreccion"));
    expect(fn).toMatch(/\.from\(TABLA_CORRECCIONES\)/);
    expect(fn).toMatch(/\.select\("motivo, creada_en"\)/);
    expect(fn).toMatch(/\.gte\("creada_en", `\$\{desdeDeLaVentana\(hoy\)\}/);
    expect(fn).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    const ruta = puro("app/api/asistencia/correcciones/motivos/route.ts");
    expect(ruta).toMatch(/requireAsistencia\(req, asistenciaRoles\(\)\)/);
    expect(ruta).toMatch(/motivos: await leerMotivosFrecuentes\(\)/);
    expect(ruta).not.toMatch(/export async function (POST|PUT|DELETE|PATCH)/);
  });

  it("CONDUCTA: la ruta devuelve los frecuentes calculados sobre lo que hay en la base", async () => {
    vi.resetModules();
    vi.doMock("@/lib/requireRole", () => ({
      requireRole: () => ({ role: "secretaria", userName: "Angela", userId: "2", sessionToken: "t", modules: ["asistencia"] }),
    }));
    const FILAS = [
      { motivo: "Se le olvidó marcar", creada_en: "2026-09-10T12:00:00+00:00" },
      { motivo: "se le olvido marcar", creada_en: "2026-09-09T12:00:00+00:00" },
      { motivo: "Reloj sin internet", creada_en: "2026-09-08T12:00:00+00:00" },
    ];
    vi.doMock("@/lib/supabase-server", () => ({
      HAS_SERVICE_ROLE: true,
      supabaseServer: {
        from: () => {
          const q: Record<string, unknown> = {};
          for (const m of ["select", "gte", "order", "limit"]) q[m] = () => q;
          (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data: FILAS, error: null });
          return q;
        },
      },
    }));
    const { GET } = await import("@/app/api/asistencia/correcciones/motivos/route");
    const res = await GET(new NextRequest("http://x/api/asistencia/correcciones/motivos"));
    expect(res.status).toBe(200);
    const d = await (res as NextResponse).json();
    expect(d.motivos).toEqual(["Se le olvidó marcar"]);
  });

  it("CONDUCTA: sin permiso no contesta nada", async () => {
    vi.resetModules();
    vi.doMock("@/lib/requireRole", () => ({
      requireRole: () => NextResponse.json({ error: "Sin permiso." }, { status: 403 }),
    }));
    const { GET } = await import("@/app/api/asistencia/correcciones/motivos/route");
    const res = await GET(new NextRequest("http://x/api/asistencia/correcciones/motivos"));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. «JUSTIFICAR» EN LA FILA DEL DÍA — el MISMO formulario
// ─────────────────────────────────────────────────────────────────────────────

describe("3. 🔴 «Justificar» en la fila abre el MISMO formulario de la ficha, con ese día puesto", () => {
  it("hay UN formulario (JustificarForm) y lo montan la sección de la ficha y la ventana del día", () => {
    const form = puro("app/asistencia/JustificarForm.tsx");
    expect(form).toMatch(/fetch\("\/api\/asistencia\/justificaciones",\s*\{\s*method: "POST"/);
    expect(form).toMatch(/JSON\.stringify\(\{ codigo, desde, hasta, motivo, nota \}\)/);
    expect(form).toMatch(/MOTIVOS_JUSTIFICACION\.map\(/);
    // La sección de la ficha abre con HOY.
    expect(puro("app/asistencia/colaboradores/SeccionJustificaciones.tsx"))
      .toMatch(/<JustificarForm[\s\S]*?desdeInicial=\{hoy\}[\s\S]*?hastaInicial=\{hoy\}/);
    // La ventana del día abre con ESE día, desde = hasta.
    expect(puro("app/asistencia/JustificarDiaModal.tsx"))
      .toMatch(/<JustificarForm[\s\S]*?codigo=\{dia\.codigo\}[\s\S]*?desdeInicial=\{dia\.fecha\}[\s\S]*?hastaInicial=\{dia\.fecha\}/);
    // 🔴 Ni la sección ni la ventana tienen un segundo POST de justificaciones.
    expect(puro("app/asistencia/colaboradores/SeccionJustificaciones.tsx")).not.toMatch(/method: "POST"/);
    expect(puro("app/asistencia/JustificarDiaModal.tsx")).not.toMatch(/fetch\(/);
  });

  it("la fila del día ofrece «Justificar» al lado de «Agregar hora», sin menú «···», y solo donde una justificación cambia algo", () => {
    const rep = puro("app/asistencia/ReporteTab.tsx");
    expect(rep).toMatch(/Justificar\s*<\/button>/);
    expect(rep).toMatch(/const seJustifica = !d\.feriado && !d\.vacacion && !d\.justificado;/);
    expect(rep).toMatch(/onJustificar\(\{ codigo, persona, fecha: d\.fecha \}\)/);
    expect(rep).not.toMatch(/OverflowMenu|···/);
  });

  it("al guardar, la pestaña se refresca (cargar) y la lista del período se vuelve a leer (refresco)", () => {
    const rep = puro("app/asistencia/ReporteTab.tsx");
    expect(rep).toMatch(/onGuardado=\{\(\) => \{ setRefrescoJustificaciones\(\(n\) => n \+ 1\); void cargar\(\); \}\}/);
    const per = puro("app/asistencia/JustificacionesDelPeriodo.tsx");
    expect(per).toMatch(/useEffect\(\(\) => \{ void leer\(\); \}, \[leer, refresco\]\);/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. NINGÚN AVISO MANDA A «HORARIOS»
// ─────────────────────────────────────────────────────────────────────────────

describe("4. 🔴 ningún aviso de Asistencia manda a «Horarios», que ya no es una pestaña", () => {
  it("barrido: ningún texto visible dice «en Horarios» ni <b>Horarios</b>", () => {
    for (const rel of ["app/asistencia/ReporteTab.tsx", "app/asistencia/PlanillaTab.tsx", "app/asistencia/ComoFuncionaTab.tsx"]) {
      const src = puro(rel);
      expect(src, rel).not.toMatch(/<b>Horarios<\/b>/);
      expect(src, rel).not.toMatch(/en Horarios\b/);
    }
  });

  it("el aviso de la hora de salida manda a la ficha del colaborador, desde el módulo puro", () => {
    const rep = puro("app/asistencia/ReporteTab.tsx");
    expect(rep).toMatch(/su hora de salida\s+confirmada\. Mientras tanto se asume 5:00 p\.m\. — se confirma \{dondeSeCargaLaFicha\(\)\}, en <b>\{PESTANA_FICHAS\}<\/b>\./);
    expect(puro("app/asistencia/PlanillaTab.tsx")).toMatch(/Se confirma \{dondeSeCargaLaFicha\(\)\}, en <b>\{PESTANA_FICHAS\}<\/b>\./);
  });
});

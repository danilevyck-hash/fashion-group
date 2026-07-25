import { describe, it, expect, vi } from "vitest";

// acs-resumen-diario importa supabase-server en el top-level; se mockea para
// que el import no construya el cliente real en el entorno de test.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));

import {
  addDays,
  ventanasResumen,
  cierreUtcDe,
  buildMensaje,
  buildMensajeHtml,
  fmtVariacion,
  fmtDiaCorto,
  fmtDiaTitulo,
  fmtDiaPrevLargo,
  fmtRangoMesPrevLargo,
  fmtRangoAnioPrev,
  type AcsResumenDiario,
} from "@/lib/acs-resumen-diario";

describe("addDays", () => {
  it("suma y resta días cruzando mes y año", () => {
    expect(addDays("2026-07-04", 1)).toBe("2026-07-05");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("-364 días cae en el mismo día de la semana del año anterior", () => {
    // 2026-07-04 es sábado → 2025-07-05 también es sábado
    expect(addDays("2026-07-04", -364)).toBe("2025-07-05");
  });
});

describe("ventanasResumen — same-period estricto 1..D vs 1..D", () => {
  it("mismo D en ambos lados (corte mitad de mes)", () => {
    const v = ventanasResumen("2026-07-15");
    expect(v.inicioMes).toBe("2026-07-01");
    expect(v.inicioMesPrev).toBe("2025-07-01");
    expect(v.cortePrev).toBe("2025-07-15"); // MISMO día 15
    expect(v.fechaComparable).toBe("2025-07-16"); // −364d, mismo día de semana
    // YTD: 1-ene..corte vs 1-ene..cortePrev — ventanas del MISMO largo.
    expect(v.inicioAnio).toBe("2026-01-01");
    expect(v.inicioAnioPrev).toBe("2025-01-01");
  });

  it("D=1: ventana de un solo día en ambos años", () => {
    const v = ventanasResumen("2026-07-01");
    expect(v.inicioMes).toBe("2026-07-01");
    expect(v.cortePrev).toBe("2025-07-01");
    expect(v.inicioMesPrev).toBe("2025-07-01");
  });

  it("cambio de mes: corte recortado a fin de mes anterior compara meses completos", () => {
    // Caso sync viejo el día 1: corte = fecha−1 = 31-jul → julio completo vs julio completo
    const v = ventanasResumen("2026-07-31");
    expect(v.inicioMes).toBe("2026-07-01");
    expect(v.cortePrev).toBe("2025-07-31");
    expect(v.inicioMesPrev).toBe("2025-07-01");
  });

  it("cambio de año: corte 1-ene compara contra 1-ene del año pasado", () => {
    const v = ventanasResumen("2026-01-01");
    expect(v.cortePrev).toBe("2025-01-01");
    expect(v.inicioMesPrev).toBe("2025-01-01");
    // YTD del 1-ene: la ventana es un solo día en ambos años.
    expect(v.inicioAnio).toBe("2026-01-01");
    expect(v.inicioAnioPrev).toBe("2025-01-01");
  });

  it("29-feb: cortePrev se recorta a 28-feb (el año anterior no es bisiesto)", () => {
    const v = ventanasResumen("2028-02-29");
    expect(v.cortePrev).toBe("2027-02-28");
    expect(v.inicioMesPrev).toBe("2027-02-01");
    // el YTD hereda ese mismo cierre recortado
    expect(v.inicioAnio).toBe("2028-01-01");
    expect(v.inicioAnioPrev).toBe("2027-01-01");
  });
});

describe("cierreUtcDe", () => {
  it("el cierre del día Panamá es fecha+1 a las 00:00 UTC (19:00 Panamá = 7pm)", () => {
    expect(cierreUtcDe("2026-07-04")).toBe("2026-07-05T00:00:00.000Z");
    expect(cierreUtcDe("2026-12-31")).toBe("2027-01-01T00:00:00.000Z");
  });
});

// Cifras REALES de american_classic al 24-jul-2026, verificadas el 25-jul-2026
// contra la tabla base switch_facturas (no contra la vista que usa la lib).
const BASE: AcsResumenDiario = {
  fecha: "2026-07-24",
  corte: "2026-07-24",
  syncFresco: true,
  hoy: 1761.13,
  hoyPrev: 1494.27,
  fechaComparable: "2025-07-25",
  mes: 34278.19,
  mesPrev: 24682.78,
  anio: 298582.12,
  anioPrev: 263406.77,
};
const SEP = "━".repeat(18);

describe("buildMensaje — formato tabla aprobado 25-jul-2026", () => {
  it("sync fresco: tabla completa de dos bloques, columnas alineadas", () => {
    expect(buildMensaje(BASE)).toBe(
      [
        "🏪 ACS · viernes 24 jul",
        SEP,
        "Día    $1,761    ▲ +18%",
        "Mes    $34,278   ▲ +38.9%",
        "Año    $298,582  ▲ +13.4%",
        SEP,
        "Año pasado",
        "Día    $1,494    viernes 25 jul 2025",
        "Mes    $24,683   1 al 24 de julio 2025",
        "Año    $263,407  1 ene al 24 jul 2025",
      ].join("\n"),
    );
  });

  it("las columnas arrancan en la MISMA posición en las 6 filas", () => {
    const filas = buildMensaje(BASE)
      .split("\n")
      .filter((l) => /^(Día|Mes|Año) +\$/.test(l));
    expect(filas).toHaveLength(6);
    // col 0-6 = label, col 7-16 = monto (ancho del mayor, $298,582, +2), 17+ = resto
    for (const f of filas) {
      expect(f.indexOf("$")).toBe(7);
      expect(f.slice(7, 17)).toMatch(/^\$[\d,]+ +$/);
      expect(f[17]).not.toBe(" ");
    }
  });

  it("negativo usa ▼ y respeta los decimales de cada fila", () => {
    const msg = buildMensaje({ ...BASE, hoy: 900, mes: 20000, anio: 250000 });
    expect(msg).toContain("▼ -40%"); // día: 0 decimales
    expect(msg).toContain("▼ -19.0%"); // mes:  1 decimal
    expect(msg).toContain("▼ -5.1%"); // año:  1 decimal
    expect(msg).not.toContain("▲");
  });

  it("$0 real con sync fresco (tienda cerrada) SÍ se manda, con ▼ -100%", () => {
    const msg = buildMensaje({ ...BASE, hoy: 0 });
    expect(msg).toContain("Día    $0");
    expect(msg).toContain("▼ -100%");
    expect(msg).toContain("Día    $1,494    viernes 25 jul 2025");
  });

  it("guardia ⏳: sin sync fresco cae la fila Día de AMBOS bloques y se dice el corte", () => {
    const msg = buildMensaje({
      ...BASE,
      syncFresco: false,
      corte: "2026-07-23",
      hoy: 0,
      hoyPrev: 0,
      mes: 32517.06,
      mesPrev: 23188.51,
      anio: 296820.99,
      anioPrev: 262057.72,
    });
    expect(msg).toBe(
      [
        "🏪 ACS · viernes 24 jul",
        SEP,
        "⏳ Ventas del día aún sincronizando (al 23-jul)",
        "Mes    $32,517   ▲ +40.2%",
        "Año    $296,821  ▲ +13.3%",
        SEP,
        "Año pasado",
        "Mes    $23,189   1 al 23 de julio 2025",
        "Año    $262,058  1 ene al 23 jul 2025",
      ].join("\n"),
    );
    expect(msg).not.toContain("Día");
    expect(msg).not.toContain("-100%");
  });

  it("YTD sin dato del año pasado: 's/d año pasado' y la fila Año no baja al bloque", () => {
    const msg = buildMensaje({ ...BASE, anioPrev: 0 });
    expect(msg).toContain("Año    $298,582  s/d año pasado");
    expect(msg).toContain("Año pasado"); // el bloque sigue: Día y Mes sí tienen
    expect(msg).not.toContain("1 ene al 24 jul 2025");
    expect(msg).toContain("Mes    $24,683   1 al 24 de julio 2025");
  });

  it("sin NINGÚN comparable: se omite el bloque 'Año pasado' entero y su separador", () => {
    const msg = buildMensaje({ ...BASE, hoyPrev: 0, mesPrev: 0, anioPrev: 0 });
    expect(msg).not.toContain("Año pasado");
    expect(msg.split("\n").filter((l) => l === SEP)).toHaveLength(1);
    expect(msg).toContain("Día    $1,761    s/d año pasado");
    expect(msg).toContain("Mes    $34,278   s/d año pasado");
    expect(msg).toContain("Año    $298,582  s/d año pasado");
  });

  it("prefijo '(recuperado) ' va dentro del bloque, pegado al título", () => {
    expect(buildMensaje(BASE, "(recuperado) ").split("\n")[0]).toBe(
      "(recuperado) 🏪 ACS · viernes 24 jul",
    );
  });
});

describe("buildMensajeHtml", () => {
  it("envuelve la tabla en <pre> — es lo que hace que Telegram la pinte monoespaciada", () => {
    const html = buildMensajeHtml(BASE);
    expect(html.startsWith("<pre>")).toBe(true);
    expect(html.endsWith("</pre>")).toBe(true);
    expect(html.slice(5, -6)).toBe(buildMensaje(BASE));
  });

  it("escapa & < > para que parse_mode=HTML no rechace el mensaje", () => {
    expect(buildMensajeHtml(BASE, "<b>A & B</b> ")).toContain(
      "&lt;b&gt;A &amp; B&lt;/b&gt;",
    );
  });
});

describe("fmtVariacion", () => {
  it("▲ para subida, ▼ para bajada", () => {
    expect(fmtVariacion(120, 100, 0)).toBe("▲ +20%");
    expect(fmtVariacion(80, 100, 1)).toBe("▼ -20.0%");
  });

  it("0% exacto: '=' sin signo, ni ▲ ni ▼", () => {
    expect(fmtVariacion(100, 100, 0)).toBe("= 0%");
    expect(fmtVariacion(100, 100, 1)).toBe("= 0.0%");
  });

  it("la flecha se decide sobre el % YA REDONDEADO (nunca '▲ +0.0%' ni '▼ -0%')", () => {
    expect(fmtVariacion(100.02, 100, 1)).toBe("= 0.0%"); // +0.02% → redondea a 0
    expect(fmtVariacion(99.98, 100, 1)).toBe("= 0.0%"); // -0.02% → redondea a 0, no "-0"
    expect(fmtVariacion(100.4, 100, 0)).toBe("= 0%");
  });

  it("sin base comparable (prev ≤ 0): 's/d año pasado', sin flecha", () => {
    expect(fmtVariacion(1000, 0, 1)).toBe("s/d año pasado");
    expect(fmtVariacion(1000, -5, 1)).toBe("s/d año pasado");
  });
});

describe("labels de fecha", () => {
  it("fmtDiaCorto: sin día de semana, para el aviso ⏳", () => {
    expect(fmtDiaCorto("2026-07-03")).toBe("3-jul");
    expect(fmtDiaCorto("2026-07-23")).toBe("23-jul");
  });

  it("fmtDiaTitulo: día de semana completo, sin guiones", () => {
    expect(fmtDiaTitulo("2026-07-24")).toBe("viernes 24 jul");
    expect(fmtDiaTitulo("2026-07-04")).toBe("sábado 4 jul");
  });

  it("fmtDiaPrevLargo: mismo día de semana del año pasado, con año completo", () => {
    expect(fmtDiaPrevLargo("2025-07-25")).toBe("viernes 25 jul 2025");
    expect(fmtDiaPrevLargo("2025-07-05")).toBe("sábado 5 jul 2025");
  });

  it("fmtRangoMesPrevLargo: 1..D del mes de corte, año anterior, mes en letras", () => {
    expect(fmtRangoMesPrevLargo("2026-07-24")).toBe("1 al 24 de julio 2025");
    // D=1: "1 al 1 de…" se lee mal → se colapsa a un solo día
    expect(fmtRangoMesPrevLargo("2026-07-01")).toBe("1 de julio 2025");
    // 29-feb → mismo recorte que ventanasResumen.cortePrev (28-feb)
    expect(fmtRangoMesPrevLargo("2028-02-29")).toBe("1 al 28 de febrero 2027");
  });

  it("fmtRangoAnioPrev: ventana YTD del año anterior (1-ene..mismo mes-día)", () => {
    expect(fmtRangoAnioPrev("2026-07-24")).toBe("1 ene al 24 jul 2025");
    expect(fmtRangoAnioPrev("2026-12-31")).toBe("1 ene al 31 dic 2025");
    // corte 1-ene: la ventana es un solo día, no un rango
    expect(fmtRangoAnioPrev("2026-01-01")).toBe("1 ene 2025");
    expect(fmtRangoAnioPrev("2028-02-29")).toBe("1 ene al 28 feb 2027");
  });
});

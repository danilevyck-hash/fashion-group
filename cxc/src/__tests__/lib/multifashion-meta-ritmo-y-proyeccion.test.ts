// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL TELEGRAM Y LA TARJETA DE LA META NO SE PUEDEN CONTRADECIR (23-sep-2026)
//
// Lo que Daniel vio ese día, a las 8:50 p.m.:
//
//   · Telegram de ACS:  «🎯 Meta ▲ +5% arriba del ritmo»
//   · Multifashion › Vendedoras › Metas, tarjeta «Viaje playa»:
//     «$32,945.68 de $420,000 · Así como van, cierran en $401,881.60 ·
//      faltarían $18,118.40»
//
// Si van 5 % ARRIBA del ritmo tienen que cerrar POR ENCIMA de la meta, no
// $18.118 por debajo. Uno de los dos mentía.
//
// ── POR QUÉ SON LA MISMA CUENTA ──────────────────────────────────────────────
//
//   ritmo      = prevHastaCorte × (objetivo ÷ prevRango)
//   pct        = vendido ÷ ritmo − 1
//   proyección = vendido ÷ fracción,  con fracción = prevHastaCorte ÷ prevRango
//
//   ⇒ proyección ÷ objetivo = vendido ÷ ritmo  ⇒  proyección ÷ objetivo − 1 = pct
//
// O sea: «ir arriba del ritmo» y «cerrar por encima de la meta» son literalmente
// la misma afirmación. La única forma de que se separen es que la «fracción de
// temporada transcurrida» salga de dos lados distintos — y eso era exactamente
// lo que pasaba.
//
// ── DE DÓNDE SALÍA CADA UNA (medido contra producción el 23-sep-2026) ────────
//
//   objetivo        $420,000.00   (meta «Viaje playa», 1-sep → 31-dic-2026)
//   vendido al 23   $32,945.68    (multifashion_meta_ventas_v2)
//   prev al 23      $25,473.08    (1..23-sep-2025; el 23 de 2025 vendió $0)
//   prev rango      $340,698.55   (sep-dic 2025)
//   sep 2025 mes    $36,430.41
//
//   Telegram:  fracción = 25.473,08 ÷ 340.698,55                = 7,4767 %
//   Pantalla:  fracción = (23÷30 × 36.430,41) ÷ 340.698,55      = 8,1979 %
//
// La pantalla repartía el MES del año pasado en partes iguales entre sus días,
// y septiembre de 2025 no vendió parejo. Daba por transcurrida más temporada de
// la que pasó y hundía la proyección: $401.881,60 en vez de $440.643,43.
//
// 🔴 EL QUE MENTÍA ERA LA PANTALLA. La regla buena —el año pasado día por día—
// ya la usaban DOS lugares: el ritmo del Telegram (`meta-ritmo.ts`) y el
// «Cierra en» del mes (`resumen-minimo.ts` › `proyeccionMesPorTemporada`, que
// divide `prevMismosDias ÷ prevMesCompleto`). Solo la meta la aproximaba.
//
// Este archivo es el candado: con datos FIJOS, si el ritmo dice «arriba» la
// proyección no puede dar por debajo de la meta, ni al revés.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Todo lo que se ejercita acá es PURO. `metas-lectura` arrastra el cliente de
// Supabase al cargarse (de ahí sale `corteDeLaMeta`), así que el doble REVIENTA:
// una lectura que se escape tiene que fallar, no recibir datos de mentira.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => {
      throw new Error("este test no debe tocar la base");
    },
    rpc: () => {
      throw new Error("este test no debe tocar la base");
    },
  },
}));

import { ritmoMeta } from "@/lib/multifashion/meta-ritmo";
import {
  avanceMeta,
  transcurrido,
  fraccionDelAnioPasado,
  type PesoMes,
} from "@/lib/multifashion/metas-avance";
import { corteDeLaMeta } from "@/lib/multifashion/metas-lectura";

// ── Lo medido contra producción el 23-sep-2026 ───────────────────────────────

const META = { desde: "2026-09-01", hasta: "2026-12-31", objetivo: 420000 };
const HOY = "2026-09-23";
const VENDIDO = 32945.68;
const PREV_HASTA_CORTE = 25473.08;
const PREV_RANGO = 340698.55;

/** Los pesos mensuales reales: el respaldo, y lo que ANTES mandaba. */
const TEMPORADA_2025: PesoMes[] = [
  { mes: "2025-09", ventas: 36430.41 },
  { mes: "2025-10", ventas: 46429.63 },
  { mes: "2025-11", ventas: 57580.78 },
  { mes: "2025-12", ventas: 200257.73 },
];

const BASE_REAL = { hastaCorte: PREV_HASTA_CORTE, rango: PREV_RANGO };

const avanceReal = () =>
  avanceMeta({
    ...META,
    hoy: HOY,
    vendido: VENDIDO,
    pesos: TEMPORADA_2025,
    baseAnioPasado: BASE_REAL,
  });

const ritmoReal = () =>
  ritmoMeta({
    objetivo: META.objetivo,
    vendido: VENDIDO,
    ventaPrevRango: PREV_RANGO,
    ventaPrevHastaCorte: PREV_HASTA_CORTE,
  });

// ═════════════════════════════════════════════════════════════════════════════
// 1. EL CASO REAL — los dos números que Daniel vio, y el que queda
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el caso del 23-sep-2026, reproducido", () => {
  it("el Telegram decía +4,92 % arriba del ritmo (redondeado, «+5%»)", () => {
    const r = ritmoReal();
    expect(r).not.toBeNull();
    expect(r!.ritmo).toBeCloseTo(31402.23, 2);
    expect(r!.pct).toBeCloseTo(0.0492, 4);
    expect(r!.pct).toBeGreaterThan(0);
  });

  it("🩸 la cuenta VIEJA (mes repartido en partes iguales) daba los $401.881,60 del defecto", () => {
    const viejo = avanceMeta({ ...META, hoy: HOY, vendido: VENDIDO, pesos: TEMPORADA_2025 });
    expect(viejo.proyeccion).toBeCloseTo(401881.6, 2);
    expect(viejo.alcanza).toBe(false);
    // Y ésa es justamente la contradicción: ritmo arriba, proyección abajo.
    expect(ritmoReal()!.pct).toBeGreaterThan(0);
  });

  it("🔴 con la base buena la tarjeta cierra en $440.643,43 y le SOBRAN $20.643,43", () => {
    const a = avanceReal();
    expect(a.base).toBe("temporada");
    expect(a.fraccionTranscurrida).toBeCloseTo(0.0747672, 7);
    expect(a.proyeccion).toBeCloseTo(440643.43, 2);
    expect(a.alcanza).toBe(true);
    expect(a.brechaProyectada).toBeCloseTo(20643.43, 2);
  });

  it("🔴 y dice EXACTAMENTE lo mismo que el Telegram: proyección ÷ objetivo − 1 = el % del ritmo", () => {
    const a = avanceReal();
    const r = ritmoReal()!;
    expect(a.proyeccion! / a.objetivo - 1).toBeCloseTo(r.pct, 6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. 🔴 LA REGLA QUE NO SE PUEDE ROMPER — nunca más una contradicción
//
// Con la MISMA base, el signo tiene que coincidir SIEMPRE: si el ritmo dice
// «arriba», la proyección alcanza; si dice «abajo», no alcanza.
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el ritmo y la proyección no se pueden contradecir", () => {
  // Casos fijos: arriba, abajo, justo en la meta, y los bordes del período.
  const CASOS: { rot: string; vendido: number; hoy: string; prevHastaCorte: number }[] = [
    { rot: "muy arriba", vendido: 60000, hoy: HOY, prevHastaCorte: PREV_HASTA_CORTE },
    { rot: "apenas arriba (el caso real)", vendido: VENDIDO, hoy: HOY, prevHastaCorte: PREV_HASTA_CORTE },
    { rot: "apenas abajo", vendido: 31000, hoy: HOY, prevHastaCorte: PREV_HASTA_CORTE },
    { rot: "muy abajo", vendido: 12000, hoy: HOY, prevHastaCorte: PREV_HASTA_CORTE },
    { rot: "a mitad de temporada", vendido: 180000, hoy: "2026-11-15", prevHastaCorte: 140441.82 },
    { rot: "a mitad, flojo", vendido: 110000, hoy: "2026-11-15", prevHastaCorte: 140441.82 },
    { rot: "clavado en la meta", vendido: (420000 * PREV_HASTA_CORTE) / PREV_RANGO, hoy: HOY, prevHastaCorte: PREV_HASTA_CORTE },
  ];

  for (const c of CASOS) {
    it(`${c.rot}: el signo del ritmo y el «alcanza» de la proyección coinciden`, () => {
      const r = ritmoMeta({
        objetivo: META.objetivo,
        vendido: c.vendido,
        ventaPrevRango: PREV_RANGO,
        ventaPrevHastaCorte: c.prevHastaCorte,
      });
      const a = avanceMeta({
        ...META,
        hoy: c.hoy,
        vendido: c.vendido,
        pesos: TEMPORADA_2025,
        baseAnioPasado: { hastaCorte: c.prevHastaCorte, rango: PREV_RANGO },
      });
      expect(r).not.toBeNull();
      expect(a.proyeccion).not.toBeNull();
      // El corazón del candado.
      expect(a.alcanza).toBe(r!.pct >= 0);
      // Y no solo el signo: es la MISMA cuenta.
      expect(a.proyeccion! / a.objetivo - 1).toBeCloseTo(r!.pct, 6);
    });
  }

  it("🔴 con la cuenta VIEJA la regla se rompe — por eso el candado existe", () => {
    const viejo = avanceMeta({ ...META, hoy: HOY, vendido: VENDIDO, pesos: TEMPORADA_2025 });
    const r = ritmoReal()!;
    expect(r.pct >= 0).toBe(true);
    expect(viejo.alcanza).toBe(false); // ← la contradicción del 23-sep
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. LA BASE BUENA MANDA, Y EL RESPALDO SIGUE ENTERO
// ═════════════════════════════════════════════════════════════════════════════

describe("de dónde sale la fracción de temporada", () => {
  it("🔴 con base del año pasado, los pesos mensuales NI SE MIRAN", () => {
    const conPesos = transcurrido(META.desde, META.hasta, HOY, TEMPORADA_2025, BASE_REAL);
    const sinPesos = transcurrido(META.desde, META.hasta, HOY, [], BASE_REAL);
    expect(conPesos.fraccion).toBe(sinPesos.fraccion);
    expect(conPesos.fraccion).toBeCloseTo(PREV_HASTA_CORTE / PREV_RANGO, 10);
    expect(conPesos.base).toBe("temporada");
  });

  it("sin base, el respaldo mensual sigue funcionando igual que siempre", () => {
    const t = transcurrido(META.desde, META.hasta, HOY, TEMPORADA_2025);
    expect(t.base).toBe("temporada");
    expect(t.fraccion).toBeCloseTo(((23 / 30) * 36430.41) / PREV_RANGO, 10);
  });

  it("sin base y sin pesos, se cae a los días PELADOS y lo dice", () => {
    const t = transcurrido(META.desde, META.hasta, HOY, []);
    expect(t.base).toBe("dias");
    expect(t.fraccion).toBeCloseTo(23 / 122, 10);
  });

  it("🔴 un rango en cero, o un «hasta el corte» mayor que el rango, NO se usa (se cae al respaldo)", () => {
    expect(fraccionDelAnioPasado({ hastaCorte: 100, rango: 0 })).toBeNull();
    expect(fraccionDelAnioPasado({ hastaCorte: 100, rango: -5 })).toBeNull();
    expect(fraccionDelAnioPasado({ hastaCorte: 500, rango: 400 })).toBeNull();
    expect(fraccionDelAnioPasado(null)).toBeNull();
    // Un neto negativo por devoluciones es 0, no un número raro.
    expect(fraccionDelAnioPasado({ hastaCorte: -30, rango: 400 })).toBe(0);
  });

  it("con base rota pero pesos buenos, la proyección sigue saliendo (falla ABIERTO)", () => {
    const a = avanceMeta({
      ...META,
      hoy: HOY,
      vendido: VENDIDO,
      pesos: TEMPORADA_2025,
      baseAnioPasado: { hastaCorte: 999999, rango: PREV_RANGO }, // inconsistente
    });
    expect(a.base).toBe("temporada");
    expect(a.proyeccion).toBeCloseTo(401881.6, 2);
  });

  it("los pisos y bordes de siempre no se movieron", () => {
    // Antes de empezar: no se proyecta.
    const antes = avanceMeta({ ...META, hoy: "2026-08-31", vendido: 0, baseAnioPasado: BASE_REAL });
    expect(antes.motivoSinProyeccion).toBe("no-empezo");
    // Bajo el 5 % de temporada tampoco.
    const temprano = avanceMeta({
      ...META,
      hoy: "2026-09-05",
      vendido: 5000,
      baseAnioPasado: { hastaCorte: 8000, rango: PREV_RANGO }, // 2,3 %
    });
    expect(temprano.motivoSinProyeccion).toBe("muy-temprano");
    expect(temprano.proyeccion).toBeNull();
    // Cerrada: lo vendido ES el cierre.
    const cerrada = avanceMeta({ ...META, hoy: "2027-01-05", vendido: 500000, baseAnioPasado: BASE_REAL });
    expect(cerrada.estado).toBe("cerrada");
    expect(cerrada.proyeccion).toBe(500000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. EL CORTE ES EL MISMO, Y ACOTADO AL PERÍODO
// ═════════════════════════════════════════════════════════════════════════════

describe("corteDeLaMeta — el día hasta el que se mide", () => {
  it("dentro del período es hoy; antes, el inicio; después, el final", () => {
    expect(corteDeLaMeta(META.desde, META.hasta, HOY)).toBe(HOY);
    expect(corteDeLaMeta(META.desde, META.hasta, "2026-08-01")).toBe(META.desde);
    expect(corteDeLaMeta(META.desde, META.hasta, "2027-03-01")).toBe(META.hasta);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. BARRIDO — una sola fuente, y nada de `ventas_raw` por la puerta de atrás
// ═════════════════════════════════════════════════════════════════════════════

const raiz = path.join(process.cwd(), "src", "lib", "multifashion");
const leer = (f: string) => readFileSync(path.join(raiz, f), "utf8");

describe("🔴 los dos números salen del MISMO lado", () => {
  it("la base del año pasado de la tarjeta se lee con `leerVentasDelPeriodo`, igual que el ritmo", () => {
    const lectura = leer("metas-lectura.ts");
    const bloque = lectura.slice(lectura.indexOf("export async function leerBaseAnioPasado"));
    const cuerpo = bloque.slice(0, bloque.indexOf("\n}\n"));
    expect(cuerpo).toContain("leerVentasDelPeriodo");
    expect(cuerpo).toContain("unAnioAntes");
    // El ritmo del Telegram usa la misma pareja.
    const ritmo = leer("meta-ritmo-lectura.ts");
    expect(ritmo).toContain("leerVentasDelPeriodo");
    expect(ritmo).toContain("unAnioAntes");
  });

  it("🔴 la tarjeta NO nombra `multifashion_overview_serie_v1` a mano: va por `rpcRetail`", () => {
    const lectura = leer("metas-lectura.ts");
    const codigo = lectura
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    expect(codigo).not.toContain("multifashion_overview_serie_v1");
    expect(codigo).toContain('rpcRetail("overviewSerie"');
  });

  it("🔴 el avance de la meta le pasa la base a TODAS sus cuentas (la grupal y la de cada vendedora)", () => {
    const lectura = leer("metas-lectura.ts");
    const llamadas = lectura.match(/avanceMeta\(\{/g) ?? [];
    expect(llamadas.length).toBeGreaterThanOrEqual(2);
    expect((lectura.match(/baseAnioPasado,/g) ?? []).length).toBe(llamadas.length);
  });

  it("ninguna de las dos cuentas escribe en la base", () => {
    for (const f of ["metas-avance.ts", "meta-ritmo.ts"]) {
      const s = leer(f);
      for (const prohibido of ["insert(", "update(", "upsert(", "delete(", "supabaseServer"]) {
        expect(s).not.toContain(prohibido);
      }
    }
  });
});

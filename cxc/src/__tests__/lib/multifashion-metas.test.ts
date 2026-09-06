// ─────────────────────────────────────────────────────────────────────────────
// CANDADOS del sistema de metas de Multifashion.
//
// Todos los números de este archivo salen de una MEDICIÓN contra producción del
// 13-ago-2026 (`scripts/_diag-metas-multifashion.ts`, solo lectura):
//
//   retail ene-jul 2026   305.092,60      retail sep-dic 2025   340.698,55
//   retail 1-13 ago 2026   21.055,23      retail 1-13 ago 2025   14.376,71
//
//   sep 2025  36.430,41 (10,7%)   ·   oct 2025  46.429,63 (13,6%)
//   nov 2025  57.580,78 (16,9%)   ·   dic 2025 200.257,73 (58,8%)
//
//   14 nombres de vendedor en Switch → 11 personas
//   Ana Trejos / ANA TREJOS · Yeisibeth Muñoz / YEISIBETH MUÑOZ ·
//   Cindy De Gracia / CINDY DE GRACIA  → partidas en dos
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// `metas-lectura` importa el cliente de Supabase al cargarse.
//
// Por defecto el doble REVIENTA: casi todo este archivo ejercita funciones
// PURAS y ninguna debe tocar la base. El bloque que prueba `avanceDeMeta` de
// verdad (§4ter) le pone una implementación en su `beforeEach` y la devuelve a
// reventar al terminar — así una lectura que se escape en otro test sigue
// fallando en vez de recibir datos de mentira.
const REVIENTA = () => {
  throw new Error("este test no debe tocar la base");
};
const dobleSupabase = vi.hoisted(() => ({
  from: vi.fn(() => {
    throw new Error("este test no debe tocar la base");
  }),
  rpc: vi.fn(() => {
    throw new Error("este test no debe tocar la base");
  }),
}));

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: dobleSupabase }));

import {
  claveVendedora,
  esClaveDeSistema,
  nombreParaMostrar,
  agruparVendedoras,
  ventasDeParticipantes,
  textoAporteNoAsignado,
  APORTE_NO_ASIGNADO_MINIMO,
  CLAVE_SISTEMA,
} from "@/lib/multifashion/metas-clave";

import {
  avanceMeta,
  transcurrido,
  pesosPorDia,
  diasInclusive,
  diasDelMes,
  mesDelAnioAnterior,
  FRACCION_MINIMA_PARA_PROYECTAR,
  type PesoMes,
} from "@/lib/multifashion/metas-avance";

import {
  puedeVerMetas,
  puedeEditarMetas,
  rolesQueEntranAMetas,
  ROLES_ADMIN_METAS,
  ROLES_LECTURA_METAS,
} from "@/lib/multifashion/metas-permiso";

import {
  esFuncionAusente,
  totalDe,
  totalDeParticipantes,
  avanceDeMeta,
  type Meta,
} from "@/lib/multifashion/metas-lectura";

// Los pesos REALES de la temporada sep-dic 2025 (medidos).
const TEMPORADA_2025: PesoMes[] = [
  { mes: "2025-09", ventas: 36430.41 },
  { mes: "2025-10", ventas: 46429.63 },
  { mes: "2025-11", ventas: 57580.78 },
  { mes: "2025-12", ventas: 200257.73 },
];

const META = { desde: "2026-09-01", hasta: "2026-12-31", objetivo: 420000 };

// ═════════════════════════════════════════════════════════════════════════════
// 1. QUIÉN ES QUIÉN — los nombres partidos en dos
// ═════════════════════════════════════════════════════════════════════════════

describe("claveVendedora — la agrupación por persona", () => {
  it("junta las TRES parejas reales que Switch tiene cargadas de dos formas", () => {
    expect(claveVendedora("Ana Trejos")).toBe(claveVendedora("ANA TREJOS"));
    expect(claveVendedora("Yeisibeth Muñoz")).toBe(claveVendedora("YEISIBETH MUÑOZ"));
    expect(claveVendedora("Cindy De Gracia")).toBe(claveVendedora("CINDY DE GRACIA"));
  });

  it("la Ñ y el acento no separan a una persona de sí misma", () => {
    expect(claveVendedora("Yeisibeth Muñoz")).toBe("YEISIBETH MUNOZ");
    expect(claveVendedora("MUÑOZ")).toBe(claveVendedora("MUNOZ"));
  });

  it("colapsa espacios de más y recorta las puntas", () => {
    expect(claveVendedora("  Ana   Trejos  ")).toBe("ANA TREJOS");
  });

  it("un nombre vacío o ausente no es una persona", () => {
    expect(claveVendedora(null)).toBeNull();
    expect(claveVendedora(undefined)).toBeNull();
    expect(claveVendedora("   ")).toBeNull();
  });

  it("🔴 NO junta por parecido — dos personas distintas siguen distintas", () => {
    // Es la lección de las tiendas (`Outlet Duty Free N2` vs `N3`): nada de
    // distancia de edición. Un caracter de diferencia = otra clave.
    expect(claveVendedora("Ana Trejos")).not.toBe(claveVendedora("Ana Trejo"));
    expect(claveVendedora("Milagros Torres")).not.toBe(claveVendedora("Milagro Torres"));
    expect(claveVendedora("Jennifer Miranda")).not.toBe(claveVendedora("Witney Miranda"));
  });

  it("DEFAULT es del sistema, no una persona", () => {
    expect(esClaveDeSistema(claveVendedora("DEFAULT"))).toBe(true);
    expect(esClaveDeSistema(claveVendedora("default"))).toBe(true);
    expect(esClaveDeSistema(claveVendedora("Ana Trejos"))).toBe(false);
    expect(CLAVE_SISTEMA).toBe("DEFAULT");
  });

  it("⚠️ `Angel pizza` NO está excluido por código — se muestra y no se elige", () => {
    // Decidir por código quién es vendedora sería decidir por Daniel, y el día
    // que contrate a alguien habría que tocar código para que apareciera.
    expect(esClaveDeSistema(claveVendedora("Angel pizza"))).toBe(false);
    const lista = agruparVendedoras([{ vendedor: "Angel pizza", subtotal: 100 }]);
    expect(lista.map((v) => v.clave)).toContain("ANGEL PIZZA");
  });
});

describe("nombreParaMostrar", () => {
  it("prefiere la forma que se lee como nombre, no la que grita", () => {
    expect(nombreParaMostrar(["YEISIBETH MUÑOZ", "Yeisibeth Muñoz"])).toBe("Yeisibeth Muñoz");
    expect(nombreParaMostrar(["ANA TREJOS", "Ana Trejos"])).toBe("Ana Trejos");
  });

  it("con una sola forma en mayúsculas, la usa tal cual", () => {
    expect(nombreParaMostrar(["JAILINE"])).toBe("JAILINE");
  });

  it("es ESTABLE: no depende del orden en que lleguen las formas", () => {
    // Si dependiera de las ventas, el nombre podría cambiar solo entre dos
    // cargas de la misma pantalla.
    expect(nombreParaMostrar(["Ana Trejos", "ANA TREJOS"])).toBe(
      nombreParaMostrar(["ANA TREJOS", "Ana Trejos"]),
    );
  });
});

describe("agruparVendedoras — el caso real", () => {
  const filas = [
    { vendedor: "Ana Trejos", subtotal: 20000 },
    { vendedor: "ANA TREJOS", subtotal: 24998.17 },
    { vendedor: "Yeisibeth Muñoz", subtotal: 10000 },
    { vendedor: "YEISIBETH MUÑOZ", subtotal: 10925.62 },
    { vendedor: "JAILINE", subtotal: 162988.24 },
    { vendedor: "DEFAULT", subtotal: 1773.86 },
  ];

  it("🔴 una persona partida en dos suma ENTERA, no la mitad", () => {
    const out = agruparVendedoras(filas);
    const ana = out.find((v) => v.clave === "ANA TREJOS");
    expect(ana?.ventas).toBe(44998.17);
    expect([...(ana?.formas ?? [])].sort()).toEqual(["ANA TREJOS", "Ana Trejos"]);
    expect(ana?.nombre).toBe("Ana Trejos");
  });

  it("cada persona aparece UNA vez", () => {
    const out = agruparVendedoras(filas);
    expect(out.filter((v) => v.clave === "ANA TREJOS")).toHaveLength(1);
    expect(out.filter((v) => v.clave === "YEISIBETH MUNOZ")).toHaveLength(1);
  });

  it("DEFAULT queda fuera de la lista de candidatas", () => {
    expect(agruparVendedoras(filas).map((v) => v.clave)).not.toContain("DEFAULT");
  });

  it("viene ordenada por ventas, que es el orden en que sirve elegir", () => {
    const out = agruparVendedoras(filas);
    expect(out[0].clave).toBe("JAILINE");
    expect(out.map((v) => v.ventas)).toEqual([...out.map((v) => v.ventas)].sort((a, b) => b - a));
  });

  it("respeta el conteo de documentos de una fila ya agregada por Postgres", () => {
    // Sin esto, una fila que resume 900 tiquetes contaría como uno solo.
    const out = agruparVendedoras([
      { vendedor: "JAILINE", subtotal: 1000, documentos: 900 },
      { vendedor: "JAILINE", subtotal: 500, documentos: 100 },
    ]);
    expect(out[0].documentos).toBe(1000);
  });
});

describe("ventasDeParticipantes", () => {
  const filas = [
    { vendedor: "Ana Trejos", subtotal: 20000 },
    { vendedor: "ANA TREJOS", subtotal: 24998.17 },
    { vendedor: "Angel pizza", subtotal: 17128.99 },
    { vendedor: "DEFAULT", subtotal: 1773.86 },
  ];

  it("suma las dos formas de la misma persona", () => {
    expect(ventasDeParticipantes(filas, ["ANA TREJOS"]).get("ANA TREJOS")).toBe(44998.17);
  });

  it("🔴 lo que NO se eligió no suma — ni DEFAULT ni quien no es vendedora", () => {
    const out = ventasDeParticipantes(filas, ["ANA TREJOS"]);
    expect([...out.keys()]).toEqual(["ANA TREJOS"]);
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(44998.17);
  });

  it("una participante sin ventas da 0, no desaparece", () => {
    const out = ventasDeParticipantes(filas, ["ANA TREJOS", "NUEVA PERSONA"]);
    expect(out.get("NUEVA PERSONA")).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. LA PROYECCIÓN — que diciembre pese lo que pesa
// ═════════════════════════════════════════════════════════════════════════════

describe("aritmética de fechas", () => {
  it("cuenta los días inclusive en las dos puntas", () => {
    expect(diasInclusive("2026-09-01", "2026-09-01")).toBe(1);
    expect(diasInclusive("2026-09-01", "2026-12-31")).toBe(122);
  });

  it("no se corre un día por la zona horaria", () => {
    // En Panamá (UTC−5) un `new Date(iso)` mal hecho corre el día entero.
    expect(diasInclusive("2026-01-01", "2026-12-31")).toBe(365);
    expect(diasInclusive("2024-01-01", "2024-12-31")).toBe(366);
  });

  it("sabe cuántos días tiene cada mes, bisiesto incluido", () => {
    expect(diasDelMes("2025-09")).toBe(30);
    expect(diasDelMes("2025-12")).toBe(31);
    expect(diasDelMes("2024-02")).toBe(29);
    expect(diasDelMes("2025-02")).toBe(28);
  });

  it("el mes de referencia es el MISMO mes del año anterior", () => {
    expect(mesDelAnioAnterior("2026-09")).toBe("2025-09");
    expect(mesDelAnioAnterior("2026-01")).toBe("2025-01");
  });
});

describe("🔴 la proyección pondera por temporada, no por días", () => {
  it("al 31-oct van 61 de 122 días (50%) pero solo el 24,3% de la temporada", () => {
    const t = transcurrido(META.desde, META.hasta, "2026-10-31", TEMPORADA_2025);
    expect(t.base).toBe("temporada");
    // sep (36.430,41) + oct (46.429,63) = 82.860,04 de 340.698,55
    expect(t.fraccion).toBeCloseTo(82860.04 / 340698.55, 6);
    expect(t.fraccion).toBeCloseTo(0.2432, 3);

    // Y por días sería la mitad: la diferencia entre las dos cuentas.
    const porDias = transcurrido(META.desde, META.hasta, "2026-10-31", undefined);
    expect(porDias.base).toBe("dias");
    expect(porDias.fraccion).toBeCloseTo(61 / 122, 6);
  });

  it("🩸 una tienda que va PERFECTA no puede verse como un fracaso en octubre", () => {
    // Va exactamente al ritmo de llegar a 420.000: al 31-oct le corresponden
    // 420.000 × 24,32% = 102.148,26.
    const alRitmo = 420000 * (82860.04 / 340698.55);

    const bien = avanceMeta({ ...META, hoy: "2026-10-31", vendido: alRitmo, pesos: TEMPORADA_2025 });
    // Al centavo del objetivo. (No se exige `alcanza === true` acá: el ritmo
    // exacto cae JUSTO en el borde y el redondeo a centavos decide por un
    // centavo. Lo que importa es que la proyección diga 420.000 y no 204.000.)
    expect(bien.proyeccion).toBeCloseTo(420000, 0);

    // Un pelo por encima del ritmo ya no está en el borde: tiene que alcanzar.
    const arriba = avanceMeta({
      ...META, hoy: "2026-10-31", vendido: alRitmo * 1.01, pesos: TEMPORADA_2025,
    });
    expect(arriba.alcanza).toBe(true);
    expect(arriba.proyeccion).toBeGreaterThan(420000);

    // 🔴 Con la cuenta ingenua, la MISMA tienda "cierra" en ~204.000: anunciaría
    // un fracaso rotundo en el mes en que todavía no pasó nada.
    const ingenua = avanceMeta({ ...META, hoy: "2026-10-31", vendido: alRitmo, pesos: [] });
    expect(ingenua.proyeccion).toBeLessThan(210000);
    expect(ingenua.alcanza).toBe(false);
  });

  it("el error simétrico: ir MAL no puede verse como que alcanza", () => {
    // La mitad del ritmo que corresponde.
    const vendido = 420000 * (82860.04 / 340698.55) * 0.5;
    const a = avanceMeta({ ...META, hoy: "2026-10-31", vendido, pesos: TEMPORADA_2025 });
    expect(a.alcanza).toBe(false);
    expect(a.proyeccion).toBeCloseTo(210000, 0);
  });

  it("diciembre pesa el 58,8% y el reloj lo refleja", () => {
    const alCierreDeNoviembre = transcurrido(META.desde, META.hasta, "2026-11-30", TEMPORADA_2025);
    expect(alCierreDeNoviembre.fraccion).toBeCloseTo(1 - 200257.73 / 340698.55, 6);
    expect(1 - alCierreDeNoviembre.fraccion).toBeCloseTo(0.588, 3);
  });

  it("un mes a medias reparte el peso por DÍA, no entero", () => {
    // Medio diciembre no puede llevarse el peso de diciembre completo: el error
    // sería enorme justo donde más duele.
    const t = transcurrido(META.desde, META.hasta, "2026-12-15", TEMPORADA_2025);
    const dicHasta15 = (200257.73 / 31) * 15;
    expect(t.fraccion).toBeCloseTo((82860.04 + 57580.78 + dicHasta15) / 340698.55, 6);
  });

  it("los pesos por día suman el peso de su mes, ni más ni menos", () => {
    const p = pesosPorDia("2026-09-01", "2026-09-30", TEMPORADA_2025)!;
    expect(p).toHaveLength(30);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(36430.41, 6);
  });
});

describe("cuándo NO se proyecta", () => {
  it("🔴 al principio no se inventa un número: dividir por casi cero amplifica ruido", () => {
    const a = avanceMeta({ ...META, hoy: "2026-09-02", vendido: 5000, pesos: TEMPORADA_2025 });
    expect(a.proyeccion).toBeNull();
    expect(a.motivoSinProyeccion).toBe("muy-temprano");
    expect(a.alcanza).toBeNull();
    expect(a.fraccionTranscurrida).toBeLessThan(FRACCION_MINIMA_PARA_PROYECTAR);
  });

  it("antes de empezar, no hay nada que proyectar", () => {
    const a = avanceMeta({ ...META, hoy: "2026-08-13", vendido: 0, pesos: TEMPORADA_2025 });
    expect(a.estado).toBe("por-empezar");
    expect(a.motivoSinProyeccion).toBe("no-empezo");
    expect(a.proyeccion).toBeNull();
    expect(a.diasTranscurridos).toBe(0);
  });

  it("cerrado el período, lo vendido ES el cierre (no se extrapola nada)", () => {
    const a = avanceMeta({ ...META, hoy: "2027-01-05", vendido: 431000, pesos: TEMPORADA_2025 });
    expect(a.estado).toBe("cerrada");
    expect(a.proyeccion).toBe(431000);
    expect(a.fraccionTranscurrida).toBe(1);
    expect(a.diasQueFaltan).toBe(0);
  });

  it("sin año pasado se cae a los días Y LO DICE (no proyecta en silencio)", () => {
    const a = avanceMeta({ ...META, hoy: "2026-10-31", vendido: 100000, pesos: [] });
    expect(a.base).toBe("dias");
    expect(a.proyeccion).not.toBeNull();
  });

  it("un año pasado todo en cero no sirve como temporada", () => {
    const a = avanceMeta({
      ...META,
      hoy: "2026-10-31",
      vendido: 100000,
      pesos: [{ mes: "2025-09", ventas: 0 }, { mes: "2025-12", ventas: 0 }],
    });
    expect(a.base).toBe("dias");
  });

  it("un mes con venta NEGATIVA no puede hacer que el reloj camine para atrás", () => {
    const conNegativo = pesosPorDia("2026-09-01", "2026-10-31", [
      { mes: "2025-09", ventas: -5000 },
      { mes: "2025-10", ventas: 46429.63 },
    ])!;
    expect(conNegativo.every((p) => p >= 0)).toBe(true);
  });
});

describe("los números del avance", () => {
  const a = avanceMeta({ ...META, hoy: "2026-11-30", vendido: 180000, pesos: TEMPORADA_2025 });

  it("dice cuánto falta y nunca en negativo", () => {
    expect(a.falta).toBe(240000);
    const superada = avanceMeta({ ...META, hoy: "2026-11-30", vendido: 500000, pesos: TEMPORADA_2025 });
    expect(superada.falta).toBe(0);
    expect(superada.cumplida).toBe(true);
  });

  it("el porcentaje puede pasar de 100% (no se topa el dato, solo la barra)", () => {
    const superada = avanceMeta({ ...META, hoy: "2026-11-30", vendido: 462000, pesos: TEMPORADA_2025 });
    expect(superada.pctVendido).toBeCloseTo(1.1, 6);
  });

  it("la brecha proyectada dice cuánto sobra o cuánto falta", () => {
    expect(a.brechaProyectada).toBeCloseTo((a.proyeccion ?? 0) - 420000, 2);
    expect(a.alcanza).toBe((a.proyeccion ?? 0) >= 420000);
  });

  it("los montos van a centavos, la unidad que se muestra", () => {
    const b = avanceMeta({ ...META, hoy: "2026-11-30", vendido: 180000.005, pesos: TEMPORADA_2025 });
    expect(Number.isInteger(Math.round(b.vendido * 100))).toBe(true);
  });

  it("objetivo 0 no revienta la división", () => {
    const b = avanceMeta({ ...META, hoy: "2026-11-30", vendido: 100, objetivo: 0, pesos: TEMPORADA_2025 });
    expect(Number.isFinite(b.pctVendido)).toBe(true);
  });

  it("un período de UN día es válido y no divide por cero", () => {
    const b = avanceMeta({
      desde: "2026-09-01", hasta: "2026-09-01", hoy: "2026-09-01",
      objetivo: 1000, vendido: 500, pesos: TEMPORADA_2025,
    });
    expect(b.diasTotales).toBe(1);
    expect(Number.isFinite(b.fraccionTranscurrida)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. 🔴 LA COSTURA DEL PERMISO DE JENNIFER
// ═════════════════════════════════════════════════════════════════════════════

describe("permiso — quién ve y quién toca", () => {
  it("🔴 Jennifer (gerente_acs) VE las metas — Daniel abrió Multifashion completo", () => {
    // Decisión del 13-ago-2026, textual: "abrile Multifashion completo".
    // Era justo quien más la necesitaba y la única que la tenía vedada.
    expect(puedeVerMetas("gerente_acs")).toBe(true);
    expect(rolesQueEntranAMetas()).toContain("gerente_acs");
  });

  // CAMBIÓ DE DIRECCIÓN el 6-sep-2026: `secretaria` SALIÓ. El módulo
  // Multifashion nunca fue suyo y ésta era la última puerta que le quedaba
  // adentro. Daniel: «A» — ciérralo igual; con la pestaña «Multifashion» de
  // Comisiones ve el ranking de vendedoras y su comisión.
  it("admin las ve; secretaria ya no (6-sep-2026)", () => {
    expect(puedeVerMetas("admin")).toBe(true);
    expect(puedeVerMetas("secretaria")).toBe(false);
  });

  it("nadie más entra", () => {
    for (const rol of ["vendedor", "bodega", "contabilidad", "secretaria", "", null, undefined]) {
      expect(puedeVerMetas(rol as string | null | undefined), `rol ${rol}`).toBe(false);
    }
  });

  it("🔑 VER NO ES EDITAR — solo admin crea, cambia o retira", () => {
    // Jennifer comisiona por la tienda Y por sus ventas personales: dejarla
    // editar metas sería dejarla editarse su propio objetivo.
    expect(puedeEditarMetas("admin")).toBe(true);
    expect(puedeEditarMetas("gerente_acs")).toBe(false);
    expect(puedeEditarMetas("secretaria")).toBe(false);
    expect(ROLES_ADMIN_METAS).toEqual(["admin"]);
  });

  it("la lista de lectura es explícita y no se ensancha sin querer", () => {
    expect([...ROLES_LECTURA_METAS].sort()).toEqual(["admin", "gerente_acs"]);
  });

  it("🔴 la perilla vieja NO quedó de adorno", () => {
    // Una perilla que ya no puede estar en `false` es una mentira que alguien
    // va a leer como una opción viva. Se borró en vez de dejarla en `true`.
    const raiz = path.join(process.cwd(), "src");
    const culpables: string[] = [];
    const caminar = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p2 = path.join(dir, e);
        if (statSync(p2).isDirectory()) caminar(p2);
        // Los tests quedan fuera del barrido: este mismo archivo nombra la
        // perilla para poder buscarla, y no es código de producción.
        else if (/\.tsx?$/.test(e) && !p2.includes("__tests__")) {
          // 🩸 Los comentarios se borran PRIMERO: este repo ya pagó TRES veces
          // el candado que se rompe por su propia explicación.
          const src = readFileSync(p2, "utf-8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
          if (src.includes("METAS_ABIERTAS_AL_ROL_ACOTADO")) culpables.push(p2);
        }
      }
    };
    caminar(raiz);
    expect(culpables).toEqual([]);
  });

  it("⚠️ el cálculo del avance NO mira roles — el permiso es una decisión aparte", () => {
    // Es LO que hizo que abrirle el acceso a Jennifer fuera un cambio de lista
    // y no un rediseño. Si el permiso se metiera en la cuenta (recortando el
    // rango, por ejemplo), el avance dependería de quién pregunta y dos
    // pantallas dirían números distintos de lo mismo.
    const sinComentarios = readFileSync(
      path.join(process.cwd(), "src/lib/multifashion/metas-lectura.ts"),
      "utf-8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(sinComentarios).not.toContain("gerente_acs");
    expect(sinComentarios).not.toContain("metas-permiso");
    expect(sinComentarios).not.toContain("auth.role");
    expect(sinComentarios).not.toMatch(/clamp\w+\(/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. LECTURA — que las tres formas de sumar den lo MISMO
// ═════════════════════════════════════════════════════════════════════════════

describe("lectura del período", () => {
  const filas = [
    { vendedor: "Ana Trejos", mes: "2026-09", ventas: 20000, documentos: 400, ultima: "2026-09-30" },
    { vendedor: "ANA TREJOS", mes: "2026-10", ventas: 24998.17, documentos: 454, ultima: "2026-10-28" },
    { vendedor: "DEFAULT", mes: "2026-09", ventas: 1773.86, documentos: 90, ultima: "2026-09-29" },
  ];

  it("el total del período incluye TODO — es el mismo que muestra el Resumen", () => {
    // Sacarle DEFAULT haría que la meta de la tienda no cuadrara con la venta
    // de la tienda, y una meta que no cuadra con el número de al lado no se usa.
    expect(totalDe(filas)).toBe(46772.03);
  });

  it("el desglose por persona suma SOLO a esas personas, juntando sus dos formas", () => {
    // ⚠️ Esto es a quién se le ACREDITA cada venta, NO lo que la meta mide. En
    // una meta grupal el avance es el total de la tienda pase lo que pase con
    // esta lista — ver §4ter.
    const out = totalDeParticipantes(filas, ["ANA TREJOS"]);
    expect(out.get("ANA TREJOS")).toBe(44998.17);
  });

  it("reconoce 'esa función todavía no existe' de forma ESTRECHA", () => {
    expect(esFuncionAusente({ code: "PGRST202" })).toBe(true);
    expect(esFuncionAusente({ code: "42883" })).toBe(true);
    expect(esFuncionAusente({ message: "Could not find the function foo" })).toBe(true);
  });

  it("🔴 un timeout o un permiso denegado NO son 'no instalado'", () => {
    // Caerse al camino de 8 viajes paginados ante un error de verdad sería
    // esconderlo y agrandarlo contra una base que ya se cayó por saturación.
    expect(esFuncionAusente({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(esFuncionAusente({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esFuncionAusente({ message: "fetch failed" })).toBe(false);
    expect(esFuncionAusente(null)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4ter. 🔴 UNA META GRUPAL MIDE LA TIENDA ENTERA
//
// Es un test de CONDUCTA: corre `avanceDeMeta` de verdad con la base doblada y
// mira el número que sale. Un barrido de texto no serviría — la regla vieja y
// la nueva se distinguen por UNA línea, y este repo ya pagó tres veces el
// candado que se cumple leyendo su propio comentario.
//
// Los datos son los MEDIDOS contra producción (may-jul 2026,
// `scripts/_verif-meta-mide-la-tienda.ts`): la tienda vendió 147.737,77 y las 4
// vendedoras 141.705,00 = 95,9%. El 4,1% que falta (6.032,77) son códigos
// viejos que siguen abiertos en Switch.
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el avance de una meta GRUPAL es la tienda entera", () => {
  // Medido el 14-ago-2026 contra producción.
  const MAY_JUL = [
    { vendedor: "Sheynee Batista", mes: "2026-05", ventas: 47857.0, documentos: 900, ultima: "2026-07-31" },
    { vendedor: "Milagros Torres", mes: "2026-05", ventas: 41416.1, documentos: 800, ultima: "2026-07-31" },
    { vendedor: "Jailine", mes: "2026-05", ventas: 35260.48, documentos: 700, ultima: "2026-07-31" },
    { vendedor: "Jennifer Miranda", mes: "2026-05", ventas: 17171.42, documentos: 300, ultima: "2026-07-31" },
    // Los cuatro códigos que ya no son de vendedoras vivas.
    { vendedor: "YEISIBETH MUÑOZ", mes: "2026-05", ventas: 2042.21, documentos: 40, ultima: "2026-06-29" },
    { vendedor: "ANA TREJOS", mes: "2026-07", ventas: 1786.77, documentos: 35, ultima: "2026-07-21" },
    { vendedor: "CINDY DE GRACIA", mes: "2026-06", ventas: 1607.98, documentos: 30, ultima: "2026-08-11" },
    { vendedor: "DEFAULT", mes: "2026-05", ventas: 595.81, documentos: 12, ultima: "2026-05-30" },
  ];
  const TIENDA = 147737.77;
  const LAS_CUATRO = 141705.0;

  const LAS_4 = ["SHEYNEE BATISTA", "MILAGROS TORRES", "JAILINE", "JENNIFER MIRANDA"].map((clave) => ({
    clave,
    nombre: clave,
    objetivoIndividual: null,
  }));

  const meta = (over: Partial<Meta> = {}): Meta => ({
    id: "m1",
    nombre: "Meta del viaje",
    desde: "2026-05-01",
    hasta: "2026-07-31",
    objetivo: 420000,
    tipo: "grupal",
    premio: "Un viaje para todas",
    premioMonto: 2000,
    activa: true,
    participantes: [],
    ...over,
  });

  beforeEach(() => {
    dobleSupabase.rpc.mockImplementation((async (fn: string) => {
      if (fn === "multifashion_meta_ventas_v1") return { data: MAY_JUL, error: null };
      // Sin temporada del año pasado: la proyección se cae a los días y lo dice.
      // Acá no se está probando la proyección, así que se deja fuera del medio.
      if (fn === "multifashion_overview_serie_v1") return { data: { meses: [] }, error: null };
      throw new Error(`RPC inesperada: ${fn}`);
    }) as never);
  });

  afterEach(() => {
    dobleSupabase.rpc.mockImplementation(REVIENTA as never);
  });

  it("🔴 CON las 4 elegidas, el avance sigue siendo el TOTAL de la tienda", async () => {
    // El candado que este PR viene a poner. Con la regla vieja daba 141.705,00
    // —los 6.032,77 de los códigos viejos desaparecían de la meta— y sobre los
    // 420.000 eso son ~17.000: la diferencia entre ganarse el viaje y no.
    const con = await avanceDeMeta(meta({ participantes: LAS_4 }), "2026-08-14");
    expect(con.avance.vendido).toBe(TIENDA);
    expect(con.avance.vendido).not.toBe(LAS_CUATRO);
  });

  it("elegir participantes NO cambia el avance: con las 4 y sin nadie da lo mismo", async () => {
    const con = await avanceDeMeta(meta({ participantes: LAS_4 }), "2026-08-14");
    const sin = await avanceDeMeta(meta({ participantes: [] }), "2026-08-14");
    expect(con.avance.vendido).toBe(sin.avance.vendido);
  });

  it("los aportes se miden CONTRA la tienda, así que suman ~96% y no 100%", async () => {
    const con = await avanceDeMeta(meta({ participantes: LAS_4 }), "2026-08-14");
    const suma = con.porVendedora.reduce((a, v) => a + v.aporte, 0);
    expect(suma).toBeCloseTo(LAS_CUATRO / TIENDA, 10);
    expect(Math.round(suma * 100)).toBe(96);
  });

  it("🔑 lo que falta para el 100% viaja calculado, no supuesto", async () => {
    const con = await avanceDeMeta(meta({ participantes: LAS_4 }), "2026-08-14");
    const suma = con.porVendedora.reduce((a, v) => a + v.aporte, 0);
    expect(con.aporteNoAsignado).toBeCloseTo(1 - suma, 10);
    expect(Math.round(con.aporteNoAsignado * 100)).toBe(4);
  });

  it("⚠️ el % que falta NO es un 4% fijo: cambia con el período", async () => {
    // Con solo dos de las cuatro elegidas, lo no asignado tiene que crecer. Un
    // 4% hardcodeado pasaría el test de arriba y fallaría acá.
    const con = await avanceDeMeta(meta({ participantes: LAS_4.slice(0, 2) }), "2026-08-14");
    expect(con.aporteNoAsignado).toBeGreaterThan(0.3);
  });

  it("cada aporte individual es su porción de la TIENDA, no del grupo elegido", async () => {
    const con = await avanceDeMeta(meta({ participantes: LAS_4 }), "2026-08-14");
    const sheynee = con.porVendedora.find((v) => v.clave === "SHEYNEE BATISTA")!;
    expect(sheynee.vendido).toBe(47857.0);
    expect(sheynee.aporte).toBeCloseTo(47857.0 / TIENDA, 10); // 32,4%
    expect(sheynee.aporte).not.toBeCloseTo(47857.0 / LAS_CUATRO, 10); // NO 33,8%
  });

  it("🔴 en una meta POR VENDEDORA no cambia nada: se mide la suma de las elegidas", async () => {
    // Ahí cada una tiene su objetivo escrito a mano y se mide contra el suyo.
    const con = await avanceDeMeta(
      meta({
        tipo: "vendedora",
        participantes: LAS_4.map((p) => ({ ...p, objetivoIndividual: 40000 })),
      }),
      "2026-08-14",
    );
    expect(con.avance.vendido).toBe(LAS_CUATRO);
    expect(con.aporteNoAsignado).toBe(0);
    const suma = con.porVendedora.reduce((a, v) => a + v.aporte, 0);
    expect(suma).toBeCloseTo(1, 10);
  });

  it("la meta grupal no le inventa objetivo a nadie, ni siquiera midiendo la tienda", async () => {
    const con = await avanceDeMeta(meta({ participantes: LAS_4 }), "2026-08-14");
    expect(con.porVendedora.every((v) => v.objetivo === null && v.avance === null)).toBe(true);
  });
});

describe("la línea que explica por qué los aportes no suman 100%", () => {
  it("dice el porcentaje REAL que se le pasa, no uno escrito a mano", () => {
    expect(textoAporteNoAsignado(0.041)).toContain("El 4%");
    expect(textoAporteNoAsignado(0.128)).toContain("El 13%");
    expect(textoAporteNoAsignado(0.593)).toContain("El 59%");
  });

  it("🔴 explica en español simple, sin jerga ni nombres de tabla", () => {
    const t = textoAporteNoAsignado(0.041)!;
    expect(t).toContain("código");
    expect(t).toContain("no está en esta lista");
    expect(t).toContain("Cuentan para la meta igual");
    for (const jerga of ["DEFAULT", "Switch", "vendedor_id", "%", "NULL", "sin asignar"]) {
      if (jerga === "%") continue;
      expect(t, `la línea no puede decir "${jerga}"`).not.toContain(jerga);
    }
  });

  it("⚠️ la causa va como LO HABITUAL, no como una certeza", () => {
    // Sobre sep-dic 2025 con estas mismas 4 el faltante da 59,3%, y ahí son
    // personas que en ese momento SÍ trabajaban. Afirmar la causa haría que la
    // pantalla mienta en cuanto cambie el período.
    const t = textoAporteNoAsignado(0.593)!;
    expect(t).toContain("casi siempre");
  });

  it("cuando sí suman 100% no hay nada que explicar: no se dibuja", () => {
    expect(textoAporteNoAsignado(0)).toBeNull();
    expect(textoAporteNoAsignado(0.0001)).toBeNull();
  });

  it("🩸 nunca dice 'el 0% que falta' — eso se lee como un error del sistema", () => {
    expect(textoAporteNoAsignado(APORTE_NO_ASIGNADO_MINIMO - 0.0001)).toBeNull();
    expect(textoAporteNoAsignado(APORTE_NO_ASIGNADO_MINIMO)).toContain("El 1%");
    expect(textoAporteNoAsignado(NaN)).toBeNull();
  });

  it("las DOS pantallas la sacan del mismo lugar — no hay dos redacciones", () => {
    for (const f of [
      "src/components/multifashion/MetaAvanceCard.tsx",
      "src/components/multifashion/MetasEnVendedoras.tsx",
    ]) {
      const src = readFileSync(path.join(process.cwd(), f), "utf-8");
      expect(src, `${f} no muestra la línea`).toContain("textoAporteNoAsignado");
      // 1-sep-2026: el texto de pantalla pasó a tuteo neutro (sin voseo) — candado en `nada-de-voseo.test.ts`.
      expect(src, `${f} escribe la frase a mano`).not.toContain("que ya no trabajan aquí.");
    }
  });
});

describe("el formulario dice la regla al ELEGIR, no después", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("🔴 la opción grupal ya no promete que se suma 'lo que venden todas juntas'", () => {
    const src = sinComentarios(leer("src/components/multifashion/MetaFormModal.tsx"));
    expect(src).not.toContain("Se suma lo que venden todas juntas");
    expect(src).toContain("Cuenta toda la venta de la tienda.");
  });

  it("y el texto de participantes dice que marcar no recorta la meta", () => {
    const src = sinComentarios(leer("src/components/multifashion/MetaFormModal.tsx"));
    expect(src).not.toContain("Si no marcas a nadie, la meta cuenta toda la venta");
    expect(src).toContain("marques a quien marques");
  });

  it("🩸 y ya no MIENTE con que un monto vacío hereda el del grupo", () => {
    // `avanceDeMeta` deja `objetivo` en null a propósito (Daniel: "Las metas
    // personales las pongo yo a mano"), así que un monto vacío deja a esa
    // vendedora SIN meta. El código está bien; el texto era el que llevaba a
    // dejar campos vacíos sin darse cuenta.
    const src = sinComentarios(leer("src/components/multifashion/MetaFormModal.tsx"));
    expect(src).not.toContain("usa el monto de arriba");
    expect(src).not.toContain("el monto de arriba");
    expect(src).toContain("La que quede sin monto no tiene meta.");
  });

  it("🔑 y no se puede guardar una meta por vendedora con montos vacíos", () => {
    // Ya estaba cubierto en `falta`, y se fija acá para que siga estándolo: una
    // meta individual sin un solo monto no mide nada.
    const src = sinComentarios(leer("src/components/multifashion/MetaFormModal.tsx"));
    expect(src).toMatch(/sinMonto\s*=\s*useMemo/);
    expect(src).toMatch(/else if \(sinMonto > 0\)/);
    expect(src).toMatch(/disabled=\{falta\.length > 0 \|\| guardando\}/);
  });

  it("la pantalla de Metas dice que la meta cuenta toda la tienda", () => {
    const card = leer("src/components/multifashion/MetaAvanceCard.tsx");
    expect(card).toContain("La meta cuenta toda la venta de la tienda");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4bis. 🔴 UNA META GRUPAL NO GENERA METAS INDIVIDUALES
// ═════════════════════════════════════════════════════════════════════════════

describe("una meta grupal NO se reparte entre las vendedoras", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("el objetivo por persona NO cae de vuelta al monto del grupo", () => {
    // Daniel, textual: *"las vendedoras no deberian de tener meta individual
    // diferente cuando se abre una nueva meta"* y *"Las metas personales las
    // pongo yo a mano"*. Un `?? meta.objetivo` sería inventarle un objetivo a
    // alguien, que es justo lo que prohibió.
    const src = sinComentarios(leer("src/lib/multifashion/metas-lectura.ts"));
    expect(src).not.toMatch(/objetivoIndividual\s*\?\?\s*meta\.objetivo/);
    expect(src).toMatch(/meta\.tipo === "vendedora"\s*\?\s*p\.objetivoIndividual\s*:\s*null/);
  });

  it("no existe ningún reparto automático del monto del grupo", () => {
    // Ni en partes iguales ni a prorrata de lo vendido.
    for (const f of [
      "src/lib/multifashion/metas-lectura.ts",
      "src/components/multifashion/MetaFormModal.tsx",
      "src/components/multifashion/MetaAvanceCard.tsx",
      "src/app/api/multifashion/metas/route.ts",
    ]) {
      const src = sinComentarios(leer(f));
      expect(src, `${f} reparte el objetivo`).not.toMatch(
        /objetivo\s*\/\s*(participantes|elegidas|claves)/,
      );
      expect(src, `${f} reparte el objetivo`).not.toMatch(/objetivo\s*\*\s*aporte/);
    }
  });

  it("en la meta POR VENDEDORA el monto del grupo es la SUMA, no al revés", () => {
    const src = sinComentarios(leer("src/components/multifashion/MetaFormModal.tsx"));
    expect(src).toContain("sumaIndividuales");
    expect(src).toMatch(/tipo === "vendedora" \? sumaIndividuales : Number\(objetivo\)/);
  });

  it("la pantalla no promete una meta personal que nadie escribió", () => {
    const src = sinComentarios(leer("src/components/multifashion/MetaAvanceCard.tsx"));
    // En grupal se muestra el APORTE; la meta de cada una solo si el tipo lo es.
    expect(src).toContain("del avance");
    expect(src).toMatch(/meta\.tipo === "vendedora"/);
  });
});

describe("el aporte de cada una a una meta grupal", () => {
  it("es su porción del avance del grupo, no una meta", () => {
    // Daniel lo pidió así: "Jailine $28,140 · 29% del avance".
    const vendidoGrupal = 97000;
    const jailine = 28140;
    expect(Math.round((jailine / vendidoGrupal) * 100)).toBe(29);
  });

  it("con el grupo en 0 no se divide por cero", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/multifashion/metas-lectura.ts"),
      "utf-8",
    );
    expect(src).toMatch(/vendidoGrupal > 0 \? vendido \/ vendidoGrupal : 0/);
  });

  it("⚠️ SIN PODIO: la pantalla no numera ni premia posiciones", () => {
    // El premio de una meta grupal es colectivo ("el viaje es de todas o de
    // ninguna"). Un ranking acá le daría dos mensajes contradictorios a la
    // misma gente. La competencia individual vive FUERA de este módulo.
    const src = readFileSync(
      path.join(process.cwd(), "src/components/multifashion/MetaAvanceCard.tsx"),
      "utf-8",
    );
    for (const prohibido of ["🥇", "🥈", "🥉", "podio", "1º", "2º", "3º", "medalla"]) {
      expect(src, `la tarjeta no puede traer ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe("desde cuándo no vende cada una", () => {
  it("🔴 la última venta se agrupa por PERSONA, no por forma del nombre", () => {
    // Si `Ana Trejos` dejó de usarse y siguió `ANA TREJOS`, la fecha buena es
    // la más nueva de las dos.
    const out = agruparVendedoras([
      { vendedor: "Ana Trejos", subtotal: 100, ultima: "2026-01-15" },
      { vendedor: "ANA TREJOS", subtotal: 100, ultima: "2026-07-30" },
    ]);
    expect(out[0].ultimaVenta).toBe("2026-07-30");
  });

  it("quien no vendió en la ventana queda con `null`, no con una fecha inventada", () => {
    const out = agruparVendedoras([{ vendedor: "JAILINE", subtotal: 100 }]);
    expect(out[0].ultimaVenta).toBeNull();
  });

  it("⚠️ el sistema NO saca de la lista a quien dejó de vender — lo DICE", () => {
    // Witney Miranda vendió por última vez el 28-mar-2026 y ya no trabaja, pero
    // filtrarla por código sería decidir por Daniel quién participa.
    const out = agruparVendedoras([
      { vendedor: "Witney Miranda", subtotal: 27018.2, ultima: "2026-03-28" },
      { vendedor: "JAILINE", subtotal: 90777.3, ultima: "2026-08-13" },
    ]);
    expect(out.map((v) => v.clave)).toContain("WITNEY MIRANDA");
    expect(out.find((v) => v.clave === "WITNEY MIRANDA")?.ultimaVenta).toBe("2026-03-28");
  });

  it("la pantalla muestra la fecha y marca a quien lleva mucho sin vender", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/multifashion/MetaFormModal.tsx"),
      "utf-8",
    );
    expect(src).toContain("textoUltimaVenta");
    expect(src).toContain("No vendió en los últimos 12 meses");
    expect(src).toContain("DIAS_PARA_MARCAR_INACTIVA");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4ter. La 6ª pestaña tiene que ENTRAR
// ═════════════════════════════════════════════════════════════════════════════

describe("la tira de sub-tabs con 6 pestañas", () => {
  const view = readFileSync(
    path.join(process.cwd(), "src/components/multifashion/MultifashionView.tsx"),
    "utf-8",
  );

  it("existe la pestaña Metas y monta su contenido", () => {
    expect(view).toContain('<TabsTrigger value="metas"');
    expect(view).toContain('<TabsContent value="metas"');
    expect(view).toContain("<MetasSubtab />");
  });

  it("🩸 los íconos se esconden hasta `lg` — es lo que hace que las 6 entren", () => {
    // Medido en el navegador: con el 6º sub-tab la tira pasó a 433 px contra
    // 390 (desborda 43) y a 565 contra 554 en el iPad (desborda 11). Una tira
    // que desborda deja la última pestaña fuera de la pantalla, alcanzable solo
    // arrastrando — el mismo defecto que ya se corrigió con el 5º sub-tab.
    // Con los íconos ocultos y `px-1.5`, mide 390/390 · 554/554 · 744/744.
    expect(view).toContain('const SUBTAB_ICON_CLASS = "hidden h-3 w-3 lg:inline-block"');
    expect(view).toMatch(/px-1\.5 py-2 text-xs text-gray-500 lg:px-3/);
  });

  it("⚠️ ningún rótulo se acortó para hacer lugar", () => {
    // Son texto que el personal lee: cambiarlos es decisión de Daniel.
    for (const rotulo of ["Resumen", "Vendedoras", "Productos", "Clientes", "Caja", "Metas"]) {
      expect(view, `falta el rótulo ${rotulo}`).toContain(`> ${rotulo}\n`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. CANDADOS DE CONDUCTA sobre la semántica de "venta"
// ═════════════════════════════════════════════════════════════════════════════

describe("qué es 'venta' para una meta", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");
  // Los barridos borran los comentarios PRIMERO: este repo ya pagó tres veces
  // el candado que se cumple a sí mismo con su propia explicación.
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  /** Igual, pero para SQL: ahí el comentario empieza con `--`. */
  const sinComentariosSql = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

  it("🩸 NUNCA se usa `subtotal_descuento` crudo de switch_facturas: se lee la VISTA", () => {
    // La vista ya proyecta el subtotal con descuento y FIRMADO (las NC
    // negativas). Ir a la tabla base sería estrenar una segunda definición y
    // el error clásico es sumar antes del descuento: infla la meta ~5%.
    const src = sinComentarios(leer("src/lib/multifashion/metas-lectura.ts"));
    expect(src).not.toContain("switch_facturas");
    expect(src).toContain("VISTA_RETAIL");
  });

  it("la vista se importa de retail-dia.ts — no se escribe el nombre a mano", () => {
    const src = sinComentarios(leer("src/lib/multifashion/metas-lectura.ts"));
    expect(src).toMatch(/import\s*\{[^}]*VISTA_RETAIL[^}]*\}\s*from\s*"\.\/retail-dia"/);
    expect(src).not.toContain('"_multifashion_sf_vw"');
  });

  it("🔴 SIEMPRE se filtra retail (is_wholesale = false)", () => {
    const src = sinComentarios(leer("src/lib/multifashion/metas-lectura.ts"));
    expect(src).toContain('.eq("is_wholesale", false)');
    const sql = sinComentariosSql(leer("supabase/migrations/20260813170000_multifashion_metas.sql"));
    expect(sql).toContain("is_wholesale = false");
  });

  it("🔴 el SQL NO vuelve a firmar las notas de crédito — la vista ya las firma", () => {
    // Firmarlas dos veces da exactamente el DOBLE de las devoluciones de
    // diferencia: la firma conocida de ese error en este repo.
    const sql = sinComentariosSql(leer("supabase/migrations/20260813170000_multifashion_metas.sql"));
    expect(sql).not.toContain("Nota de Cr");
    expect(sql).not.toMatch(/-\s*subtotal/);
    expect(sql).toContain("SUM(v.subtotal)");
  });

  it("la lectura pagina — `db-max-rows` corta en 1.000 EN SILENCIO", () => {
    // El período de la meta tuvo 6.610 documentos el año pasado: sin paginar se
    // leería el 15% de la venta sin un solo error.
    const src = sinComentarios(leer("src/lib/multifashion/metas-lectura.ts"));
    expect(src).toContain("leerTodoPaginado");
    expect(src).toMatch(/\.order\(/);
  });

  it("la migración es ADITIVA: no borra ni vacía nada", () => {
    const sql = sinComentariosSql(leer("supabase/migrations/20260813170000_multifashion_metas.sql"));
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+(?!multifashion_)/i);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS multifashion_metas");
  });

  it("⚠️ NO toca `ventas_metas` ni los nombres de vendedora en la base", () => {
    const sql = sinComentariosSql(leer("supabase/migrations/20260813170000_multifashion_metas.sql"));
    expect(sql).not.toContain("ventas_metas");
    expect(sql).not.toMatch(/UPDATE\s+switch_facturas/i);
  });

  it("las tablas nuevas tienen RLS prendida", () => {
    const sql = leer("supabase/migrations/20260813170000_multifashion_metas.sql");
    expect(sql).toContain("ALTER TABLE multifashion_metas               ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE multifashion_meta_participantes  ENABLE ROW LEVEL SECURITY");
  });
});

// ============================================================================
// CANDADO — MARKETING · UN PERÍODO CERRADO ES UNA FILA, AUNQUE LO COMPARTAN
// DOS MARCAS (22-sep-2026).
//
// 🩸 EL DEFECTO. En producción hay UN período cerrado: «mid 2026», con
// `proveedor_key = 'pvh'` (PVH = la casa de Tommy Hilfiger y Calvin Klein).
// La pestaña «Cerrados» lo partía por marca y dibujaba DOS filas iguales —
// mismo nombre, misma fecha— y el contador decía «Cerrados 2».
// Daniel, viéndolo: *«doble?»*.
//
// Lo que este archivo no deja aflojar:
//
//   1. UNA FILA POR PERÍODO, con los DOS montos, cada uno con su marca.
//   2. 🔴 LOS MONTOS NO SE SUMAN ENTRE MARCAS: un grupo no tiene `total`, y el
//      módulo no tiene una sola operación de suma. Cada marca recibió su ZIP
//      aparte.
//   3. LA PESTAÑA CUENTA PERÍODOS, no filas por marca («Cerrados 1»).
//   4. UN PERÍODO DE UNA SOLA MARCA SE DIBUJA COMO SIEMPRE (título con el
//      nombre, subtítulo con la marca, un monto y la fila entera tocable).
//   5. ADENTRO DE LA MARCA la fila dice «parte Tommy Hilfiger · el resto es de
//      Calvin Klein», y el monto sigue siendo SOLO el de esa marca.
//   6. LAS MARCAS DE UN PERÍODO SALEN DE SUS DOCUMENTOS (las filas del
//      agregador), nunca de una lista escrita a mano.
//   7. INTERRUPTOR (`MARKETING_PORTADA_REDISENO`) EN `false` = como antes.
//
// Mutaciones a mano: ver el postmortem, § «(C) · el cierre compartido».
// ============================================================================
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams("estado=cerrados"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import PortadaAbiertosCerrados from "@/app/marketing/components/PortadaAbiertosCerrados";
import {
  agruparCerradosPorPeriodo,
  esCompartido,
  marcasCompaneras,
  marcasDelGrupo,
  nombreDeProveedor,
  textoParteDeLaMarca,
  tituloDelGrupo,
  unirNombres,
} from "@/lib/marketing/cerrados-por-periodo";
import {
  MARKETING_PORTADA_REDISENO,
  filasCerradas,
  type CerradoPortada,
  type PeriodoMeta,
} from "@/lib/marketing/portada-rediseno";
import { armarSecciones } from "@/lib/marketing/lista-por-periodo";

const RAIZ = path.join(__dirname, "..", "..", "..");
const codigo = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: las reglas se barren sobre lo que CORRE. */
const sinComentarios = (rel: string) =>
  codigo(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── Los datos REALES de producción (medidos el 22-sep-2026 por REST) ────────
const PERIODO_PVH = "8e2ee894-2b68-47f2-b342-b6c0bc9f5a0a";
const CERRADO_EN = "2026-08-12T01:20:45.664098+00:00";

const cerradosPvh: CerradoPortada[] = [
  {
    id: PERIODO_PVH,
    bloqueKey: "TH",
    bloqueNombre: "Tommy Hilfiger",
    nombre: "mid 2026",
    cerradoEn: CERRADO_EN,
    total: 94104.43,
    noReportado: { count: 0, total: 0 },
  },
  {
    id: PERIODO_PVH,
    bloqueKey: "CK",
    bloqueNombre: "Calvin Klein",
    nombre: "mid 2026",
    cerradoEn: CERRADO_EN,
    total: 46462.14,
    noReportado: { count: 0, total: 0 },
  },
];

const metaPvh: Record<string, PeriodoMeta> = {
  [PERIODO_PVH]: {
    abiertoEn: CERRADO_EN,
    nombreAlCerrar: null,
    notaCredito: null,
    proveedorKey: "pvh",
  },
};

const gruposDePvh = () => agruparCerradosPorPeriodo(filasCerradas(cerradosPvh, metaPvh));

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · una fila por período, con un monto por marca", () => {
  it("«mid 2026» de PVH deja de verse doble", () => {
    const grupos = gruposDePvh();
    expect(grupos).toHaveLength(1);
    const g = grupos[0];
    expect(g.id).toBe(PERIODO_PVH);
    expect(esCompartido(g)).toBe(true);
    expect(tituloDelGrupo(g)).toBe("mid 2026 · PVH");
    expect(marcasDelGrupo(g)).toBe("Calvin Klein + Tommy Hilfiger");
    expect(g.marcas.map((m) => [m.marcaNombre, m.total])).toEqual([
      ["Calvin Klein", 46462.14],
      ["Tommy Hilfiger", 94104.43],
    ]);
  });

  it("el nombre de la casa sale de una tabla chica; lo desconocido no se adivina", () => {
    expect(nombreDeProveedor("pvh")).toBe("PVH");
    expect(nombreDeProveedor("PVH")).toBe("PVH");
    expect(nombreDeProveedor("TH")).toBeNull();
    expect(nombreDeProveedor("reebok")).toBeNull();
    expect(nombreDeProveedor(null)).toBeNull();
    // Sin casa conocida, el título es el nombre pelado: nunca un código.
    const sinCasa = agruparCerradosPorPeriodo(
      filasCerradas(cerradosPvh, {
        [PERIODO_PVH]: { abiertoEn: null, nombreAlCerrar: null, notaCredito: null, proveedorKey: "zzz" },
      }),
    )[0];
    expect(tituloDelGrupo(sinCasa)).toBe("mid 2026");
    expect(sinCasa.marcas).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · los montos de dos marcas NO se suman", () => {
  it("un grupo no tiene un total, ni siquiera en cero", () => {
    const g = gruposDePvh()[0];
    expect("total" in g).toBe(false);
    expect(Object.values(g)).not.toContain(140566.57);
  });

  it("el módulo no tiene una sola operación de suma", () => {
    const src = sinComentarios("src/lib/marketing/cerrados-por-periodo.ts");
    expect(src).not.toMatch(/\+=/);
    expect(src).not.toMatch(/\breduce\s*\(/);
    expect(src).not.toMatch(/\btotal\s*\+/);
  });

  it("la portada no dibuja el total de las dos marcas juntas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bloques: [],
          cerrados: cerradosPvh,
          periodosMeta: metaPvh,
          hoy: "2026-09-22",
          marcas: [],
        }),
      })),
    );
    render(<PortadaAbiertosCerrados {...props} />);
    await waitFor(() => expect(screen.getByText("mid 2026 · PVH")).toBeTruthy());
    expect(screen.getByText("$46,462.14")).toBeTruthy();
    expect(screen.getByText("$94,104.43")).toBeTruthy();
    expect(screen.queryByText("$140,566.57")).toBeNull();
  });
});

const props = {
  onSelectBloque: () => {},
  onSelectCerrado: () => {},
  onRegistrarGasto: () => {},
  onOpenImpulsadoras: () => {},
  onOpenInventario: () => {},
  onOpenReportes: () => {},
  refreshKey: 0,
};

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · la pestaña cuenta PERÍODOS", () => {
  it("dos marcas del mismo cierre dicen «Cerrados 1», y una fila sola", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bloques: [],
          cerrados: cerradosPvh,
          periodosMeta: metaPvh,
          hoy: "2026-09-22",
          marcas: [],
        }),
      })),
    );
    render(<PortadaAbiertosCerrados {...props} />);
    await waitFor(() => expect(screen.getByText("mid 2026 · PVH")).toBeTruthy());
    const tab = screen.getByRole("tab", { name: /Cerrados/ });
    expect(tab.textContent).toBe("Cerrados1");
    expect(screen.getAllByText(/^mid 2026/)).toHaveLength(1);
    expect(screen.getByText(/Calvin Klein \+ Tommy Hilfiger · Cerrado el/)).toBeTruthy();
    // Cada monto es su propia puerta: una por marca, ninguna que las junte.
    expect(screen.getByRole("button", { name: "Abrir mid 2026 de Tommy Hilfiger" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir mid 2026 de Calvin Klein" })).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · un período de UNA marca se dibuja como siempre", () => {
  const soloCk: CerradoPortada[] = [
    {
      id: "per-solo",
      bloqueKey: "CK",
      bloqueNombre: "Calvin Klein",
      nombre: "2025",
      cerradoEn: "2026-01-05T12:00:00Z",
      total: 1000,
      noReportado: { count: 0, total: 0 },
    },
  ];

  it("el título es el nombre, el subtítulo la marca y el monto es uno", async () => {
    const g = agruparCerradosPorPeriodo(
      filasCerradas(soloCk, {
        "per-solo": { abiertoEn: null, nombreAlCerrar: null, notaCredito: null, proveedorKey: "CK" },
      }),
    )[0];
    expect(esCompartido(g)).toBe(false);
    expect(tituloDelGrupo(g)).toBe("2025");
    expect(marcasDelGrupo(g)).toBe("Calvin Klein");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          bloques: [],
          cerrados: soloCk,
          periodosMeta: {},
          hoy: "2026-09-22",
          marcas: [],
        }),
      })),
    );
    render(<PortadaAbiertosCerrados {...props} />);
    await waitFor(() => expect(screen.getByText("2025")).toBeTruthy());
    // La fila entera es tocable, como siempre.
    expect(screen.getByRole("button", { name: "Abrir 2025 de Calvin Klein" })).toBeTruthy();
    expect(screen.getByText("$1,000.00")).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · adentro de la marca: «parte …», con SU monto", () => {
  const insumos = (bloqueKey: string) => ({
    bloqueKey,
    bloque: null,
    cerrados: cerradosPvh.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      cerradoEn: c.cerradoEn,
      total: c.total,
      bloqueKey: c.bloqueKey,
      bloqueNombre: c.bloqueNombre,
      facturas: { count: 1, total: c.total },
      muebles: { count: 0, total: 0 },
    })),
    detalle: [],
    generales: new Map(),
    conPeriodos: true,
    ordenProyectos: [],
    proveedorPorPeriodo: new Map([[PERIODO_PVH, "pvh"]]),
  });

  it("en Tommy dice el resto es de Calvin, y al revés", () => {
    const th = armarSecciones(insumos("TH"))[0];
    expect(th.compartido).toEqual({ proveedorNombre: "PVH", otrasMarcas: ["Calvin Klein"] });
    expect(textoParteDeLaMarca("Tommy Hilfiger", th.compartido!.otrasMarcas)).toBe(
      "parte Tommy Hilfiger · el resto es de Calvin Klein",
    );
    // 🔴 El monto de la sección es SOLO el de esta marca.
    expect(th.total).toBe(94104.43);

    const ck = armarSecciones(insumos("CK"))[0];
    expect(ck.compartido).toEqual({ proveedorNombre: "PVH", otrasMarcas: ["Tommy Hilfiger"] });
    expect(ck.total).toBe(46462.14);
  });

  it("un período de una sola marca no dice nada nuevo", () => {
    const soloTh = {
      ...insumos("TH"),
      cerrados: insumos("TH").cerrados.filter((c) => c.bloqueKey === "TH"),
    };
    expect(armarSecciones(soloTh)[0].compartido).toBeNull();
    expect(textoParteDeLaMarca("Tommy Hilfiger", [])).toBe("");
  });

  it("con tres marcas, el resto se enumera en español", () => {
    expect(unirNombres(["A"])).toBe("A");
    expect(unirNombres(["A", "B"])).toBe("A y B");
    expect(unirNombres(["A", "B", "C"])).toBe("A, B y C");
    expect(textoParteDeLaMarca("Karl Lagerfeld", ["Calvin Klein", "Tommy Hilfiger"])).toBe(
      "parte Karl Lagerfeld · el resto es de Calvin Klein y Tommy Hilfiger",
    );
  });

  it("la pantalla de la marca usa el texto del módulo, no uno escrito ahí", () => {
    const src = codigo("src/app/marketing/[marca]/page.tsx");
    expect(src).toContain("textoParteDeLaMarca(marca.nombre, compartido.otrasMarcas)");
    expect(src).not.toMatch(/"parte /);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6 · las marcas salen de los documentos, no de una lista a mano", () => {
  it("`marcasCompaneras` mira las filas del agregador, por id de período", () => {
    const filas = cerradosPvh.map((c) => ({
      id: c.id,
      bloqueKey: c.bloqueKey,
      bloqueNombre: c.bloqueNombre,
    }));
    expect(marcasCompaneras(filas, PERIODO_PVH, "TH")).toEqual(["Calvin Klein"]);
    expect(marcasCompaneras(filas, PERIODO_PVH, "CK")).toEqual(["Tommy Hilfiger"]);
    expect(marcasCompaneras(filas, "otro", "TH")).toEqual([]);
    expect(marcasCompaneras(filas, null, "TH")).toEqual([]);
  });

  it("el módulo no enumera marcas ni códigos de marca", () => {
    const src = sinComentarios("src/lib/marketing/cerrados-por-periodo.ts");
    expect(src).not.toMatch(/Tommy|Calvin|Karl|Reebok|Joybees/);
    expect(src).not.toMatch(/\["(TH|CK|KL|RBK|J)"\]/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7 · el interruptor", () => {
  it("hoy está PRENDIDO", () => {
    expect(MARKETING_PORTADA_REDISENO).toBe(true);
  });

  it("apagado, la fila de la marca vuelve a ser la de antes", () => {
    const src = codigo("src/app/marketing/[marca]/page.tsx");
    expect(src).toContain(
      "const compartido = MARKETING_PORTADA_REDISENO ? s.compartido : null;",
    );
    // Sin período compartido no hay subtítulo: la fila de siempre.
    expect(src).toContain("subtitulo={subtitulo || undefined}");
  });

  it("nada de esto escribe en la base", () => {
    const src = sinComentarios("src/lib/marketing/cerrados-por-periodo.ts");
    expect(src).not.toMatch(/supabase|\binsert\b|\bupdate\b|\bdelete\b|fetch\(/i);
  });
});

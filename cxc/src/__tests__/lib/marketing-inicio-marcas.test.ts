// ============================================================================
// CANDADO — el inicio de Marketing tiene que ENSEÑAR el proyecto que existe.
//
// 🩸 El bug (11-ago-2026): Daniel creó el proyecto "Apertura" para
// Nova Lux, S.a., le registró una entrega de muebles de $1.040 asignada a
// Calvin Klein y CERO facturas. El proyecto no aparecía en ninguna parte del
// inicio. Textual: *"puse generar un proyecto nuevo y no lo veo en calvin
// klein… no veo nova lux, dónde lo encuentro?"*. Las tarjetas de marca y el
// filtro de la lista se armaban SOLO desde `mk_factura_marcas`.
//
// Lo que este archivo defiende:
//   1. Una entrega de muebles mete al proyecto en la tarjeta de SU marca.
//   2. Los montos de FACTURAS por marca no se movieron ni un centavo: los
//      muebles van en su propio bucket, nunca sumados encima.
//   3. El contador de la tarjeta cuenta el MISMO conjunto que abre la lista
//      (barrido estático: `proyectos-lista` tiene que usar el módulo puro).
//   4. Multifashion y el archivo Tommy/Calvin siguen separados como estaban.
//
// Los números de los casos "producción" son los MEDIDOS el 11-ago-2026 contra
// la base real, no inventados.
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  agregarResumenInicio,
  marcasDeEntrega,
  marcasDeProyecto,
  porcionEntregaParaMarca,
  type EntradaResumen,
} from "@/lib/marketing/resumen-inicio";

// --- Catálogo de marcas, tal cual producción -------------------------------
const TH = "1673d8a7-582c-4568-8608-34c88b4b6ec6";
const CK = "6dc27cc7-c061-440e-9dc9-915198852a47";
const J = "4ae69377-2426-45fe-8a18-d7466c5e9781";
const MARCAS = [
  { id: TH, empresa_codigo: "fashion_wear" },
  { id: CK, empresa_codigo: "vistana" },
  { id: J, empresa_codigo: "joystep" },
];

function correr(p: Partial<EntradaResumen>) {
  return agregarResumenInicio({
    facturas: [],
    facturaMarcas: [],
    entregas: [],
    marcas: MARCAS,
    proyectosVivos: new Set<string>(),
    proyectosMultifashion: new Set<string>(),
    ...p,
  });
}

describe("Nova Lux — un proyecto SOLO con entrega de muebles", () => {
  const NOVA = "f0c57078-281c-4e34-8225-106eda59dce7";
  const base = {
    entregas: [
      { proyecto_id: NOVA, total: 1040, total_por_marca: { [CK]: 1040 } },
    ],
    proyectosVivos: new Set([NOVA]),
  };

  it("aparece en la tarjeta de Calvin Klein", () => {
    const r = correr(base);
    expect(r.proyectosPorMarca[CK]).toBe(1);
  });

  it("sus $1.040 se ven, pero como MUEBLES, no como facturas", () => {
    const r = correr(base);
    expect(r.mueblesPorMarca[CK]).toEqual({ count: 1, total: 1040 });
    expect(r.porMarca[CK]).toBeUndefined();
  });

  it("no se cuela en las otras marcas", () => {
    const r = correr(base);
    expect(r.proyectosPorMarca[TH]).toBeUndefined();
    expect(r.mueblesPorMarca[TH]).toBeUndefined();
  });
});

describe("los montos de FACTURAS no cambian por sumar entregas", () => {
  // Reparto real: una factura de $1.000 al 50/50 entre Tommy y Calvin.
  const facturas = [
    { id: "f1", proyecto_id: "p1", total: 1000 },
  ];
  const facturaMarcas = [
    { factura_id: "f1", marca_id: TH, porcentaje: 50 },
    { factura_id: "f1", marca_id: CK, porcentaje: 50 },
  ];
  const proyectosVivos = new Set(["p1"]);

  it("sin entregas da el reparto de siempre", () => {
    const r = correr({ facturas, facturaMarcas, proyectosVivos });
    expect(r.porMarca[TH]).toEqual({ count: 1, total: 500 });
    expect(r.porMarca[CK]).toEqual({ count: 1, total: 500 });
  });

  it("CON entregas gigantes encima, `porMarca` sigue IDÉNTICO", () => {
    const r = correr({
      facturas,
      facturaMarcas,
      proyectosVivos,
      entregas: [
        {
          proyecto_id: "p1",
          total: 40565,
          total_por_marca: { [TH]: 40565 },
        },
      ],
    });
    expect(r.porMarca[TH]).toEqual({ count: 1, total: 500 });
    expect(r.porMarca[CK]).toEqual({ count: 1, total: 500 });
    // …y los muebles viven aparte.
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 1, total: 40565 });
  });
});

describe("los pagos de impulsadora suman plata pero NO son un proyecto", () => {
  it("factura suelta (proyecto_id null) no levanta el contador", () => {
    const r = correr({
      facturas: [
        { id: "f1", proyecto_id: null, total: 800, impulsadora_id: "i1" },
      ],
      facturaMarcas: [{ factura_id: "f1", marca_id: CK, porcentaje: 100 }],
    });
    expect(r.porMarca[CK]).toEqual({ count: 1, total: 800 });
    expect(r.impulsadoraPorMarca[CK]).toEqual({ count: 1, total: 800 });
    expect(r.proyectosPorMarca[CK]).toBeUndefined();
  });
});

describe("el archivo Tommy/Calvin y Multifashion siguen separados", () => {
  it("una factura legacy va al archivo y NO a la tarjeta de marca", () => {
    const r = correr({
      facturas: [
        { id: "f1", proyecto_id: "p1", total: 300, grupo_legacy: true },
      ],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.legacy).toEqual({ count: 1, total: 300 });
    expect(r.porMarca[TH]).toBeUndefined();
  });

  it("pero la ENTREGA de ese mismo proyecto sí entra en la marca", () => {
    // Medido: 11 de los 22 proyectos con entrega tienen además facturas
    // legacy. El archivo cuenta solo facturas legacy; la marca, solo
    // no-legacy + entregas → no hay doble conteo de plata en ningún lado.
    const r = correr({
      facturas: [
        { id: "f1", proyecto_id: "p1", total: 300, grupo_legacy: true },
      ],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
      entregas: [
        { proyecto_id: "p1", total: 3080, total_por_marca: { [TH]: 3080 } },
      ],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.legacy).toEqual({ count: 1, total: 300 });
    expect(r.proyectosPorMarca[TH]).toBe(1);
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 1, total: 3080 });
  });

  it("las entregas de un proyecto Multifashion NO tocan las marcas", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "mf", total: 500, total_por_marca: { [CK]: 500 } },
      ],
      proyectosVivos: new Set(["mf"]),
      proyectosMultifashion: new Set(["mf"]),
    });
    expect(r.mueblesPorMarca[CK]).toBeUndefined();
    expect(r.proyectosPorMarca[CK]).toBeUndefined();
    expect(r.multifashion.entregas).toBe(1);
    expect(r.multifashion.muebles).toBe(500);
  });
});

describe("bordes del dato", () => {
  it("una marca con monto 0 en la entrega no mete al proyecto en su tarjeta", () => {
    const r = correr({
      entregas: [
        {
          proyecto_id: "p1",
          total: 100,
          total_por_marca: { [TH]: 100, [CK]: 0 },
        },
      ],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.proyectosPorMarca[TH]).toBe(1);
    expect(r.proyectosPorMarca[CK]).toBeUndefined();
  });

  it("una entrega sin proyecto vivo se ignora del todo", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "borrado", total: 999, total_por_marca: { [TH]: 999 } },
        { proyecto_id: null, total: 999, total_por_marca: { [TH]: 999 } },
      ],
      proyectosVivos: new Set<string>(),
    });
    expect(r.mueblesPorMarca[TH]).toBeUndefined();
    expect(r.mobiliario).toEqual({ entregas: 0, total: 0 });
  });

  it("el mismo proyecto con dos entregas cuenta UNA vez como proyecto", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "p1", total: 100, total_por_marca: { [TH]: 100 } },
        { proyecto_id: "p1", total: 200, total_por_marca: { [TH]: 200 } },
      ],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.proyectosPorMarca[TH]).toBe(1);
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 2, total: 300 });
  });

  it("el 'otro 50%' de la empresa interna suma a la porción de la marca", () => {
    const e = {
      proyecto_id: "p1",
      total: 200,
      total_por_marca: { [TH]: 100 },
      total_por_empresa_interna: { fashion_wear: 100 },
    };
    expect(porcionEntregaParaMarca(e, TH, "fashion_wear")).toBe(200);
    const r = correr({ entregas: [e], proyectosVivos: new Set(["p1"]) });
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 1, total: 200 });
  });

  it("marcasDeEntrega solo devuelve las marcas con plata", () => {
    expect(
      marcasDeEntrega({
        proyecto_id: "p",
        total: 1,
        total_por_marca: { [TH]: 5, [CK]: 0, [J]: -3 },
      }),
    ).toEqual([TH]);
    expect(
      marcasDeEntrega({ proyecto_id: "p", total: 1, total_por_marca: null }),
    ).toEqual([]);
  });

  it("marcasDeProyecto une facturas y entregas sin repetir", () => {
    expect(
      [...marcasDeProyecto({ porFacturas: [TH, CK], porEntregas: [CK, J] })].sort(),
    ).toEqual([TH, CK, J].sort());
  });
});

describe("mobiliario global (la tarjeta de Herramientas)", () => {
  it("cuenta TODAS las entregas de proyectos vivos, Multifashion incluida", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "p1", total: 100, total_por_marca: { [TH]: 100 } },
        { proyecto_id: "mf", total: 400, total_por_marca: { [CK]: 400 } },
      ],
      proyectosVivos: new Set(["p1", "mf"]),
      proyectosMultifashion: new Set(["mf"]),
    });
    expect(r.mobiliario).toEqual({ entregas: 2, total: 500 });
  });
});

// ---------------------------------------------------------------------------
// BARRIDOS ESTÁTICOS — la tarjeta y la lista no pueden divergir.
// ---------------------------------------------------------------------------
const SRC = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

describe("barrido estático", () => {
  it("proyectos-lista usa el MISMO módulo puro que la tarjeta", () => {
    // Si la lista escribiera su propia regla de "marca de una entrega", la
    // tarjeta podría decir "11 proyectos" y la lista enseñar 10 — que se lee
    // como si un proyecto se hubiera borrado.
    const src = leer("app/api/marketing/proyectos-lista/route.ts");
    expect(src).toContain('from "@/lib/marketing/resumen-inicio"');
    expect(src).toContain("marcasDeEntrega");
    expect(src).toContain("porcionEntregaParaMarca");
    // Y la entrega tiene que alimentar el bucket de marca, no solo el
    // desglose. El `^\s*` es a propósito: comentar la línea NO cuenta como
    // que sigue ahí (una mutación real que un `toContain` dejaba pasar).
    expect(src).toMatch(/^\s*nonLegacy\.add\(mid\);/m);
    expect(src).toMatch(/^\s*nonLegacyMarcasByProy\.set\(pid, nonLegacy\);/m);
  });

  it("marca-resumen no reescribe la cuenta a mano", () => {
    const src = leer("app/api/marketing/marca-resumen/route.ts");
    expect(src).toContain("agregarResumenInicio");
  });

  it("la tarjeta NO suma facturas + muebles en un solo monto", () => {
    // Los muebles eran $71.765 que no se contaban en ninguna tarjeta; fundirlos
    // en el mismo `$` triplicaba el número que Daniel ya conoce.
    const src = leer("app/marketing/components/MarcaSelector.tsx");
    expect(src).not.toMatch(/facturas\.total\s*\+\s*muebles\.total/);
    expect(src).not.toMatch(/muebles\.total\s*\+\s*facturas\.total/);
    // Las dos líneas existen por separado.
    expect(src).toContain('etiqueta="Facturas"');
    expect(src).toContain('etiqueta="Muebles"');
  });

  it("los dos buckets viejos siguen accesibles desde el inicio", () => {
    // "No se borra nada": Gastos Tommy y Calvin + Multifashion bajaron a
    // enlace, pero siguen abriendo su pantalla.
    const src = leer("app/marketing/components/MarcaSelector.tsx");
    // Se exige el CABLE, no la palabra: `onSelectLegacyX` contiene
    // "onSelectLegacy" y dejaría pasar un enlace que ya no abre nada.
    expect(src).toMatch(/onClick=\{onSelectLegacy\}/);
    expect(src).toMatch(/onClick=\{onSelectMultifashion\}/);
    expect(src).toContain("Gastos Tommy y Calvin");
    expect(src).toContain("Multifashion");
  });

  it("la ficha del proyecto deriva sus marcas de los DOCUMENTOS", () => {
    // `mk_proyecto_marcas` está casi vacía (3 de 22 proyectos vivos, medido
    // 11-ago-2026; Nova Lux tiene cero). Leer solo esa tabla habría dejado el
    // bloque "Marcas" en blanco justo en el proyecto que originó el arreglo.
    const src = leer("app/marketing/components/ProyectoOverlay.tsx");
    expect(src).toContain("marcasDelProyecto");
    expect(src).toMatch(/total_por_marca/);
    expect(src).toMatch(/f\.marcas/);
    expect(src).toContain("no está duplicado");
  });

  it("Mobiliario e Impulsadoras se abren desde el inicio", () => {
    const src = leer("app/marketing/components/MarcaSelector.tsx");
    expect(src).toMatch(/onClick=\{onOpenInventario\}/);
    expect(src).toMatch(/onClick=\{onOpenImpulsadoras\}/);
  });
});

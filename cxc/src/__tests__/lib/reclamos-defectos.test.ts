/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RECLAMOS — LOS CINCO DEFECTOS DEL 11-sep-2026.
 *
 *   5. **Abrir por enlace directo o recargar con F5 pintaba el reclamo sin
 *      nada**: el SSR no firmaba los archivos ni pedía `reclamo_settlements`, y
 *      el cliente no vuelve a pedir el detalle en la primera corrida. Fotos
 *      rotas, sin «Factura del proveedor», sin comprobante, «Recuperación 0%».
 *   6. **En «Cobrados» la fila seguía ofreciendo «Correo»**: mandarlo es
 *      cobrarle dos veces al proveedor (medido: $5.306,62 en 5 reclamos). El
 *      lote y el detalle sí lo frenaban; la fila y el servidor, no.
 *   7. **El orden**: Daniel, textual: *«reclamo debe ir sort el más nuevo
 *      arriba para verlo, pero con opción de sort en todas las columnas: más
 *      plata, más días, menos días, menos plata»*.
 *   8. **Joystep se ofrecía al crear y no tiene tarjeta**: ese reclamo sumaba
 *      arriba y no había dónde abrirlo.
 *   9. **«Fecha de factura *» marcada obligatoria y sin validar** en los dos
 *      lados. Medido: 0 de 33 reclamos vivos están sin ella.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ORDEN_DEFAULT,
  alTocarColumna,
  flechaDeColumna,
  ordenAUrl,
  ordenDesdeUrl,
  ordenarReclamos,
  type Orden,
} from "@/lib/reclamos/orden";
import {
  EMPRESAS_CON_RECLAMOS,
  empresasParaElegir,
} from "@/lib/reclamos/empresas-con-reclamos";
import { validateReclamoHeader } from "@/lib/reclamos/validate";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
describe("5 · el detalle se lee por UNA sola puerta", () => {
  const LECTOR = sinComentarios(leer("src/lib/reclamos/leer-detalle.ts"));
  const RUTA = sinComentarios(leer("src/app/api/reclamos/[id]/route.ts"));
  const SSR = sinComentarios(leer("src/app/reclamos/page.tsx"));

  it("🔴 trae las liquidaciones: sin ellas «Recuperación» decía 0%", () => {
    expect(LECTOR).toContain("reclamo_settlements(*)");
  });

  it("🔴 firma las TRES clases de archivo", () => {
    expect(LECTOR).toContain("firmarFacturaPathSafe(");
    expect(LECTOR).toContain("firmarFotos(");
    expect(LECTOR).toContain("firmarFotoPathSafe(");
  });

  it("🔴 las dos puertas leen por ahí, y el SSR ya no arma su propio select", () => {
    expect(RUTA).toContain("leerDetalleReclamo(");
    expect(SSR).toContain("leerDetalleReclamo(");
    expect(SSR).not.toContain("reclamo_fotos(*)");
    expect(SSR).not.toContain("reclamo_settlements(*)");
  });

  it("⚠️ falla ABIERTA: si el detalle se cae, la lista igual se dibuja", () => {
    expect(SSR).toContain("leerDetalleReclamo(detailId).catch(");
  });

  it("⚠️ las URLs firmadas no se guardan en la fila: se firman al leer", () => {
    expect(LECTOR).not.toContain("update(");
    expect(LECTOR).not.toContain("getPublicUrl");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6 · un reclamo cobrado no se vuelve a mandar", () => {
  const LISTA = sinComentarios(leer("src/app/reclamos/components/EmpresaList.tsx"));
  const ENVIO = sinComentarios(
    leer("src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts"),
  );

  it("🔴 la FILA solo ofrece «Correo» sobre un reclamo pendiente", () => {
    expect(LISTA).toMatch(/esPendiente\(r\) &&[\s\S]{0,200}Correo/);
  });

  it("🔴 y el SERVIDOR lo rechaza, que es el freno de verdad", () => {
    expect(ENVIO).toContain("esPendiente(");
    expect(ENVIO).toMatch(/ya está cobrado/);
  });

  it("el candado del LOTE no se aflojó", () => {
    expect(LISTA).toContain('filtro === "por-cobrar"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("7 · el orden lo elige quien mira", () => {
  const r = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    nro_reclamo: id,
    nro_factura: "100",
    fecha_factura: "2026-06-01",
    created_at: "2026-06-01T00:00:00Z",
    reclamado_en: null,
    ...over,
  });

  it("🔴 abre con la factura más RECIENTE arriba", () => {
    expect(ORDEN_DEFAULT).toEqual({ columna: "dias", sentido: "asc" });
    const lista = [
      r("viejo", { fecha_factura: "2026-03-01" }),
      r("nuevo", { fecha_factura: "2026-09-01" }),
      r("medio", { fecha_factura: "2026-06-01" }),
    ];
    expect(ordenarReclamos(lista, ORDEN_DEFAULT, () => 0).map((x) => x.id)).toEqual([
      "nuevo",
      "medio",
      "viejo",
    ]);
  });

  it("🔴 «más plata» y «menos plata», por el total con impuestos", () => {
    const lista = [r("a"), r("b"), r("c")];
    const total = (x: { id: string }) => ({ a: 10, b: 300, c: 50 }[x.id] ?? 0);
    const masPlata: Orden = { columna: "total", sentido: "desc" };
    expect(ordenarReclamos(lista, masPlata, total).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(
      ordenarReclamos(lista, { columna: "total", sentido: "asc" }, total).map((x) => x.id),
    ).toEqual(["a", "c", "b"]);
  });

  it("🔴 «más días» es la factura más vieja; «menos días», la más nueva", () => {
    const lista = [
      r("nuevo", { fecha_factura: "2026-09-01" }),
      r("viejo", { fecha_factura: "2026-01-01" }),
    ];
    expect(
      ordenarReclamos(lista, { columna: "dias", sentido: "desc" }, () => 0).map((x) => x.id),
    ).toEqual(["viejo", "nuevo"]);
  });

  it("⚠️ lo que NO tiene fecha de factura va al FINAL, mire donde mire la flecha", () => {
    const lista = [r("sin", { fecha_factura: null }), r("con", { fecha_factura: "2026-05-05" })];
    for (const sentido of ["asc", "desc"] as const) {
      const ids = ordenarReclamos(lista, { columna: "dias", sentido }, () => 0).map((x) => x.id);
      expect(ids[ids.length - 1], sentido).toBe("sin");
    }
  });

  it("lo que nunca se reclamó también queda al final de su columna", () => {
    const lista = [
      r("sin", { reclamado_en: null }),
      r("con", { reclamado_en: "2026-07-17T16:28:00Z" }),
    ];
    for (const sentido of ["asc", "desc"] as const) {
      const ids = ordenarReclamos(lista, { columna: "reclamado", sentido }, () => 0).map((x) => x.id);
      expect(ids[ids.length - 1], sentido).toBe("sin");
    }
  });

  it("tocar la misma columna la invierte; otra arranca en «lo más grande primero»", () => {
    const a = alTocarColumna(ORDEN_DEFAULT, "total");
    expect(a).toEqual({ columna: "total", sentido: "desc" });
    expect(alTocarColumna(a, "total")).toEqual({ columna: "total", sentido: "asc" });
  });

  it("🔴 la flecha solo la lleva la columna ordenada", () => {
    const orden: Orden = { columna: "total", sentido: "desc" };
    expect(flechaDeColumna(orden, "total")).toBe("↓");
    expect(flechaDeColumna({ ...orden, sentido: "asc" }, "total")).toBe("↑");
    expect(flechaDeColumna(orden, "dias")).toBe("");
  });

  it("el orden viaja en la URL, y el default NO la ensucia", () => {
    expect(ordenAUrl(ORDEN_DEFAULT)).toBe("");
    expect(ordenAUrl({ columna: "total", sentido: "desc" })).toBe("total:desc");
    expect(ordenDesdeUrl("total:desc")).toEqual({ columna: "total", sentido: "desc" });
    expect(ordenDesdeUrl("basura")).toEqual(ORDEN_DEFAULT);
    expect(ordenDesdeUrl("")).toEqual(ORDEN_DEFAULT);
    expect(ordenDesdeUrl(null)).toEqual(ORDEN_DEFAULT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("8 · el formulario ofrece las MISMAS empresas que la portada", () => {
  it("🔴 Joystep no se ofrece: no tiene tarjeta dónde abrir el reclamo", () => {
    expect(empresasParaElegir()).toEqual(EMPRESAS_CON_RECLAMOS);
    expect(empresasParaElegir()).not.toContain("Joystep");
  });

  it("⚠️ pero un reclamo que YA está en Joystep conserva su opción al editar", () => {
    expect(empresasParaElegir("Joystep")).toContain("Joystep");
    // Y en el orden del mapa, no pegada al final.
    expect(empresasParaElegir("Joystep").length).toBe(EMPRESAS_CON_RECLAMOS.length + 1);
  });

  it("las dos pantallas leen la misma lista", () => {
    for (const rel of [
      "src/app/reclamos/components/ReclamoForm.tsx",
      "src/app/reclamos/components/ReclamoDetail.tsx",
    ]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toContain("empresasParaElegir(");
      expect(src, rel).not.toMatch(/\{EMPRESAS\.map\(/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("9 · la fecha de la factura es obligatoria de verdad", () => {
  const cab = {
    empresa: "Fashion Wear",
    nro_factura: "F1",
    fecha_reclamo: "2026-09-10",
    nro_orden_compra: "OC",
  };

  it("🔴 sin ella no pasa, y lo dice con la MISMA frase de la lista", () => {
    expect(validateReclamoHeader({ ...cab, fecha_factura: "" })).toBe(
      "Falta la fecha de la factura.",
    );
    expect(validateReclamoHeader({ ...cab })).toBe("Falta la fecha de la factura.");
  });

  it("con ella, pasa", () => {
    expect(validateReclamoHeader({ ...cab, fecha_factura: "2026-09-01" })).toBeNull();
  });

  it("🔴 el SERVIDOR también la exige, al crear y al editar la cabecera", () => {
    const post = sinComentarios(leer("src/app/api/reclamos/route.ts"));
    expect(post).toMatch(/validateReclamoNuevo\(\{[^}]*fecha_factura/);
    const patch = sinComentarios(leer("src/app/api/reclamos/[id]/route.ts"));
    expect(patch).toMatch(/editaCabecera[\s\S]{0,160}"fecha_factura"/);
    expect(patch).toMatch(/validateReclamoHeader\(\{[\s\S]{0,300}fecha_factura/);
  });

  it("🔴 y la pantalla la manda en las dos validaciones", () => {
    const cliente = sinComentarios(leer("src/app/reclamos/ReclamosClient.tsx"));
    expect(cliente).toMatch(/validateReclamoNuevo\([\s\S]{0,220}fecha_factura/);
    expect(cliente).toMatch(/validateReclamoFull\([\s\S]{0,220}fecha_factura/);
  });
});

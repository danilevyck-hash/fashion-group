// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SALE UNA GUÍA — y por qué `tipo_despacho` NO alcanza para saberlo.
//
// Daniel, textual: *«Entrega directa no debería de llevar placa, ya que es
// directo con nuestro propio camión.»*
//
// 🩸 LA TRAMPA QUE ESTE ARCHIVO CONGELA: `guia_transporte.tipo_despacho` tiene
// DEFAULT 'externo' en la base. Medido en producción el 14-ago-2026, las 186
// guías vivas traen esa columna con valor — incluida la única PENDIENTE
// (GT-201, sin placa ni chofer). O sea que un `g.tipo_despacho ?? derivado`
// sería un no-op perfecto: la rama de respaldo no se ejecuta nunca.
//
// Los números medidos que son los fixtures de acá:
//   · 51 guías creadas como entrega directa → 50 grabadas como externo, 1 bien
//   · GT-194, GT-195 y GT-196 (11-ago-2026): placa "0" y N° transp "0", las
//     ÚNICAS tres placas "0" de toda la base
//   · GT-186 es la única con `tipo_despacho='directo'` (chofer "Julio")
//
// Y el candado en la dirección contraria, que importa igual: `modo_entrega` NO
// puede ganar siempre. Con el botón "Cambiar", una guía creada como directa
// puede salir con el camión de un tercero — y ahí el papel tiene que decir
// "Transportista externo" con su placa real.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { construirPdfGuia } from "@/lib/guias/pdf-guia";
import {
  ETIQUETA_TIPO_DESPACHO,
  esEntregaDirecta,
  guiaYaDespachada,
  numeroTranspImpreso,
  numeroTranspUnicoImpreso,
  sinCeroPelado,
  tipoDespachoDeModo,
  tipoDespachoEfectivo,
} from "@/lib/guias/modo-despacho";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("🔴 el modo arranca en lo que se eligió al CREAR la guía", () => {
  it("una guía pendiente creada como entrega directa es DIRECTA, aunque tipo_despacho diga 'externo'", () => {
    // Es GT-194/195/196 tal cual están en producción.
    expect(
      tipoDespachoEfectivo({
        estado: "Pendiente Bodega",
        modo_entrega: "entrega_directa",
        tipo_despacho: "externo",
      }),
    ).toBe("directo");
  });

  it("una guía pendiente creada con transportista sigue siendo EXTERNA", () => {
    expect(
      tipoDespachoEfectivo({
        estado: "Pendiente Bodega",
        modo_entrega: "transportista",
        tipo_despacho: "externo",
      }),
    ).toBe("externo");
  });

  it("⚠️ una guía YA DESPACHADA manda con `tipo_despacho`: la historia no se reinterpreta", () => {
    // Sin esto, cambiar el modo al despachar (llegó el camión de un tercero)
    // dejaría el papel diciendo "Entrega directa" con una placa ajena al lado.
    expect(
      tipoDespachoEfectivo({
        estado: "Completada",
        modo_entrega: "entrega_directa",
        tipo_despacho: "externo",
      }),
    ).toBe("externo");
    expect(
      tipoDespachoEfectivo({
        estado: "Completada",
        modo_entrega: "transportista",
        tipo_despacho: "directo",
      }),
    ).toBe("directo");
  });

  it("una guía Rechazada también es historia", () => {
    expect(guiaYaDespachada("Rechazada")).toBe(true);
    expect(guiaYaDespachada("Completada")).toBe(true);
    expect(guiaYaDespachada("Pendiente Bodega")).toBe(false);
    expect(guiaYaDespachada("Confirmada")).toBe(false);
    expect(guiaYaDespachada(null)).toBe(false);
  });

  it("sin `modo_entrega` legible NO se inventa una entrega directa: cae en 'externo'", () => {
    // Es el comportamiento de siempre. Medido: hoy las 186 guías vivas tienen
    // modo_entrega, así que esta rama no cambia ni una fila — existe para que
    // una fila rara no se vuelva "entrega directa" por ausencia de dato.
    expect(tipoDespachoEfectivo({ estado: "Pendiente Bodega" })).toBe("externo");
    expect(tipoDespachoEfectivo({ estado: "Pendiente Bodega", modo_entrega: null })).toBe("externo");
    expect(tipoDespachoEfectivo({ estado: "Pendiente Bodega", modo_entrega: "cualquier cosa" })).toBe("externo");
    expect(tipoDespachoEfectivo({ estado: "Completada", tipo_despacho: "vaya a saber" })).toBe("externo");
  });

  it("`tipoDespachoDeModo` traduce lo que la persona elige al alta", () => {
    expect(tipoDespachoDeModo("entrega_directa")).toBe("directo");
    expect(tipoDespachoDeModo("transportista")).toBe("externo");
  });

  it("`esEntregaDirecta` es exactamente 'el modo efectivo es directo'", () => {
    expect(esEntregaDirecta({ estado: "Pendiente Bodega", modo_entrega: "entrega_directa", tipo_despacho: "externo" })).toBe(true);
    expect(esEntregaDirecta({ estado: "Completada", modo_entrega: "entrega_directa", tipo_despacho: "externo" })).toBe(false);
  });
});

describe("🔴 un '0' no es una placa ni un N° de guía", () => {
  it("el '0' pelado se trata como vacío", () => {
    expect(sinCeroPelado("0")).toBe("");
    expect(sinCeroPelado(" 0 ")).toBe("");
  });

  it("⚠️ pero NADA que contenga un 0 se pierde", () => {
    // El riesgo de una limpieza así es comerse un dato bueno. Solo el "0"
    // solito, que es lo que se teclea para pasar una validación.
    expect(sinCeroPelado("DG7115")).toBe("DG7115");
    expect(sinCeroPelado("EK0700")).toBe("EK0700");
    expect(sinCeroPelado("0AB123")).toBe("0AB123");
    expect(sinCeroPelado("00")).toBe("00");
    expect(sinCeroPelado("TR-0")).toBe("TR-0");
    expect(sinCeroPelado("")).toBe("");
    expect(sinCeroPelado(null)).toBe("");
  });

  it("el papel hereda el número de la cabecera igual que siempre, pero sin el '0'", () => {
    // La herencia línea → cabecera NO cambió: sigue viviendo en
    // `falta-para-despachar`. Esto es un envoltorio, no una segunda regla.
    expect(numeroTranspImpreso("", "TR-900")).toBe("TR-900");
    expect(numeroTranspImpreso("TR-901", "TR-900")).toBe("TR-901");
    expect(numeroTranspImpreso("0", "0")).toBe("");
    expect(numeroTranspImpreso("0", "TR-900")).toBe("TR-900");
  });

  it("el encabezado sigue callándose con varios números distintos", () => {
    expect(numeroTranspUnicoImpreso([{ numero_guia_transp: "TR-1" }, { numero_guia_transp: "TR-2" }], "TR-1")).toBe("");
    expect(numeroTranspUnicoImpreso([{ numero_guia_transp: "" }, { numero_guia_transp: "" }], "TR-900")).toBe("TR-900");
    expect(numeroTranspUnicoImpreso([{ numero_guia_transp: "0" }], "0")).toBe("");
  });
});

describe("🔴 las MISMAS palabras en todas las pantallas", () => {
  it("hay UNA sola fuente para los dos rótulos", () => {
    expect(ETIQUETA_TIPO_DESPACHO.externo).toBe("Transportista externo");
    expect(ETIQUETA_TIPO_DESPACHO.directo).toBe("Entrega directa");
  });

  it("ninguna pantalla de guías vuelve a escribir el rótulo a mano", () => {
    // Barrido estático: los comentarios se borran PRIMERO — este repo ya pagó
    // cuatro veces el candado que se cumple con su propia explicación.
    const archivos = [
      "src/app/guias/components/PrintDocument.tsx",
      "src/app/guias/components/DespachoForm.tsx",
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/components/GuiaForm.tsx",
      "src/app/guias/[id]/page.tsx",
      "src/lib/guias/pdf-guia.ts",
    ];
    for (const a of archivos) {
      const cuerpo = sinComentarios(leer(a));
      expect(cuerpo, a).not.toContain('? "Entrega directa" : "Transportista externo"');
      expect(cuerpo, a).toContain("ETIQUETA_TIPO_DESPACHO");
    }
  });

  it("y ninguna decide el modo mirando `tipo_despacho` a mano", () => {
    const archivos = [
      "src/app/guias/components/PrintDocument.tsx",
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/[id]/page.tsx",
      "src/lib/guias/pdf-guia.ts",
      "src/app/guias/components/useDespachoGuia.ts",
    ];
    for (const a of archivos) {
      const cuerpo = sinComentarios(leer(a));
      expect(cuerpo, a).not.toContain('tipo_despacho === "directo"');
      expect(cuerpo, a).not.toContain('tipo_despacho as TipoDespacho) || "externo"');
    }
  });
});

describe("🔴 EL PDF QUE SE COMPARTE, generado de verdad", () => {
  // 🩸 Un barrido de texto sobre `pdf-guia.ts` NO alcanza, y está comprobado por
  // mutación: devolverle la placa al PDF pasaba en verde con el candado
  // estático puesto. Acá se GENERA el archivo y se lee su contenido — jsPDF no
  // comprime los streams de este documento, así que el texto sale legible.
  const texto = (g: Parameters<typeof construirPdfGuia>[0]) =>
    Buffer.from(construirPdfGuia(g).output("arraybuffer")).toString("latin1");

  const BASE = {
    id: "g194",
    numero: 194,
    fecha: "2026-08-11",
    transportista: "Entrega directa",
    modo_entrega: "entrega_directa" as const,
    transportista_id: null,
    placa: "0",
    observaciones: "",
    total_bultos: 4,
    item_count: 1,
    monto_total: 0,
    estado: "Pendiente Bodega",
    entregado_por: "Julio",
    numero_guia_transp: "0",
    tipo_despacho: "externo",
    guia_items: [
      { orden: 1, cliente: "CITY MALL", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1", bultos: 4, numero_guia_transp: "0" },
    ],
  };

  it("una entrega directa NO se comparte como 'Transportista externo'", () => {
    const t = texto(BASE);
    expect(t).toContain("Entrega directa");
    expect(t).not.toContain("Transportista externo");
  });

  it("…ni con la placa en cero: no lleva placa", () => {
    const t = texto(BASE);
    expect(t).not.toContain("PLACA");
    expect(t).not.toContain("N GUIA TRANSP");
  });

  it("⚠️ y una guía con transportista sigue llevando placa y número", () => {
    const t = texto({
      ...BASE,
      modo_entrega: "transportista" as const,
      transportista: "Transporte Rápido",
      transportista_id: "t1",
      placa: "EK0700",
      numero_guia_transp: "TR-900",
      guia_items: [{ ...BASE.guia_items[0], numero_guia_transp: "TR-900" }],
    });
    expect(t).toContain("Transportista externo");
    expect(t).toContain("PLACA");
    expect(t).toContain("EK0700");
    expect(t).toContain("TR-900");
  });

  it("⚠️ una guía YA despachada con transportista externo no se reinterpreta", () => {
    const t = texto({ ...BASE, estado: "Completada", placa: "DG7115", numero_guia_transp: "TR-4471" });
    expect(t).toContain("Transportista externo");
    expect(t).toContain("DG7115");
  });
});

describe("🔴 en entrega directa no se ESCRIBE placa ni N° de transportista", () => {
  const hook = sinComentarios(leer("src/app/guias/components/useDespachoGuia.ts"));

  it("el despacho manda la placa VACÍA, no la omite", () => {
    // Omitirla dejaría pegada la placa de un tercero si alguien empezó en modo
    // externo y después tocó "Cambiar" — la misma mentira, por otra puerta.
    expect(hook).toContain('payload.placa = ""');
    expect(hook).toContain('payload.numero_guia_transp = ""');
  });

  it("y limpia también el número de CADA línea", () => {
    expect(hook).toContain("payload.items_guia_transp = items");
    expect(hook).toContain('numero_guia_transp: ""');
  });

  it("⚠️ con transportista externo se sigue mandando todo lo de siempre", () => {
    expect(hook).toContain("payload.placa = bPlaca");
    expect(hook).toContain("payload.items_guia_transp = porLinea");
    // ⚠️ CANDADO QUE CAMBIÓ DE DIRECCIÓN (25-ago-2026). Antes fijaba
    // `numeroGuiaDeCabecera(numerosTransp)` a secas — correcto mientras las
    // cajas por línea nacían prellenadas con el número de la cabecera. Desde
    // que nacen VACÍAS, esa expresión ESCRIBE "" y borra el número que la
    // secretaria anotó al crear la guía. Lo que este candado siempre quiso
    // decir es que la cabecera se manda (no se omite), y eso sigue en pie.
    expect(hook).toContain("payload.numero_guia_transp = numeroCabeceraAlDespachar(");
    expect(hook).not.toContain("payload.numero_guia_transp = numeroGuiaDeCabecera(numerosTransp)");
  });
});

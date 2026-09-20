/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ETIQUETAS · LOS CINCO ARREGLOS DE DANIEL (18-sep-2026) — la parte PURA.
 *
 * (La pantalla está en `src/__tests__/components/guias-etiquetas-fase1b.test.tsx`.)
 *
 * Lo que este archivo fija:
 *
 *   1. 🔴 ANTI-DOBLE CAPTURA, LAS DOS DIRECCIONES. Daniel: *«factura importada
 *      desde Etiquetas sale marcada/bloqueada en el selector de siempre, y
 *      viceversa»*. Una factura con etiqueta viva se marca SOLO en «Facturas
 *      etiquetadas pendientes»; y una que ya está en un renglón por el selector
 *      no se puede volver a marcar desde el panel de etiquetas.
 *   2. 🔴 ESTO FRENA; «Ya salió en GT-XXX» solo AVISA — y son reglas distintas
 *      a propósito, escrito en el comentario del módulo.
 *   3. 🔴 CORREGIR BULTOS LLEVA A REIMPRIMIR EL JUEGO COMPLETO, con el aviso de
 *      que el papel viejo quedó mal.
 *   4. 🔴 LA PESTAÑA DEL PDF SE ABRE **ANTES** DEL `await` (la trampa de iOS),
 *      y sin pestaña el archivo igual se baja.
 *   5. El selector para etiquetar NO ofrece lo ya etiquetado, y DICE cuántas
 *      escondió.
 *   6. El copy de Switch, verbatim.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  MOTIVO_TOMADA_POR_EL_SELECTOR,
  capturaEnElSelector,
  capturaEnEtiquetas,
  etiquetaEstaMarcada,
  etiquetaPendienteDeLaFactura,
  idsParaAtar,
  textoCajas,
} from "@/lib/guias/anti-doble-captura";
import {
  TEXTO_TRAER_DE_SWITCH,
  avisoDeReimpresion,
  facturasParaEtiquetar,
  marcarEtiqueta,
  textoEscondidasPorEtiqueta,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";
import { marcarFactura, type RenglonDeGuia } from "@/lib/guias/atajos-facturas";
import { abrirPdfEnPestana, type VentanaAbierta } from "@/lib/guias/pdf-en-pestana";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const antiDoble = leer("src/lib/guias/anti-doble-captura.ts");
const pestana = leer("src/lib/guias/pdf-en-pestana.ts");
const vista = leer("src/app/guias/components/EtiquetasView.tsx");
const panelSelector = leer("src/app/guias/components/FacturasDelCliente.tsx");
const panelEtiquetas = leer("src/app/guias/components/EtiquetasPendientes.tsx");
const formulario = leer("src/app/guias/components/GuiaForm.tsx");

/** La etiqueta real de la medición: Nova Lux, Fashion Shoes, 14 cajas. */
function etq(over: Partial<EtiquetaFila> = {}): EtiquetaFila {
  return {
    id: 1,
    empresa_key: "fashion_shoes",
    empresa: "Fashion Shoes",
    switch_factura_id: 52558,
    secuencial: "11-000002558",
    fecha_factura: "2026-09-18",
    cliente_codigo: "D-170",
    cliente_nombre: "Nova Lux, S.A.",
    destino: "Paso Canoas",
    cajas: 14,
    creado_en: "2026-09-18T14:41:00-05:00",
    guia_numero: null,
    ...over,
  };
}

/** La MISMA factura, como la sirve `/api/guias/facturas-cliente`. */
function fac(over: Record<string, unknown> = {}) {
  return {
    empresa_key: "fashion_shoes",
    empresa: "Fashion Shoes",
    switch_factura_id: 52558,
    secuencial: "11-000002558",
    fecha: "2026-09-18T14:00:00Z",
    total: 1200,
    yaSalioEn: null,
    ...over,
  } as const as Parameters<typeof capturaEnElSelector>[2] & { fecha: string; total: number };
}

const CLIENTE = { nombre: "Nova Lux, S.A.", codigo: "D-170" };
const VACIO: RenglonDeGuia[] = [
  { orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" },
];

/** Barre `src/` (sin los tests) buscando un patrón. Devuelve los archivos. */
function barrer(re: RegExp, dentroDe = "src"): string[] {
  const encontrados: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (rel === "src/__tests__") continue;
        recorrer(rel);
      } else if (/\.tsx?$/.test(e.name) && re.test(readFileSync(path.join(raiz, rel), "utf8"))) {
        encontrados.push(rel);
      }
    }
  };
  recorrer(dentroDe);
  return encontrados;
}

// ─── 1 · dirección ETIQUETAS ⇒ SELECTOR ──────────────────────────────────────

describe("🔴 1. la factura con etiqueta viva sale BLOQUEADA en el selector de siempre", () => {
  it("sin etiquetas, la fila es libre: la pantalla de siempre no cambia", () => {
    expect(capturaEnElSelector(VACIO, CLIENTE, fac(), []).modo).toBe("libre");
  });

  it("con etiqueta pendiente y la factura YA en el renglón: bloqueada, marcada y con el porqué", () => {
    const e = etq();
    const items = marcarEtiqueta(VACIO, e);
    const c = capturaEnElSelector(items, CLIENTE, fac(), [e]);
    expect(c.modo).toBe("de-etiquetas");
    if (c.modo !== "de-etiquetas") throw new Error("imposible");
    expect(c.marcada).toBe(true);
    expect(c.motivo).toBe("Ya viene de Etiquetas · 14 bultos");
  });

  it("con etiqueta pendiente y la factura TODAVÍA no marcada: igual bloqueada, y dice dónde se marca", () => {
    const e = etq();
    const c = capturaEnElSelector(VACIO, CLIENTE, fac(), [e]);
    if (c.modo !== "de-etiquetas") throw new Error("tendría que estar bloqueada");
    expect(c.marcada).toBe(false);
    expect(c.motivo).toBe("Se marca en Etiquetas · 14 bultos");
  });

  it("🔴 la etiqueta que YA salió en una guía NO bloquea: eso es el aviso «ya salió», que avisa y no frena", () => {
    const e = etq({ guia_numero: 256 });
    expect(capturaEnElSelector(VACIO, CLIENTE, fac(), [e]).modo).toBe("libre");
    expect(etiquetaPendienteDeLaFactura([e], fac())).toBeNull();
  });

  it("🔴 el pareo es por empresa + id de Switch, nunca por el número de factura", () => {
    const e = etq();
    // MISMO id, OTRA empresa: el id de Switch se cuenta dentro de su empresa,
    // así que sin la empresa en la clave se bloquearía una factura ajena.
    const otraEmpresa = fac({ empresa_key: "vistana", empresa: "Vistana International" });
    expect(capturaEnElSelector(VACIO, CLIENTE, otraEmpresa, [e]).modo).toBe("libre");
    // Y una factura sin id de Switch no se puede parear: nunca se bloquea.
    expect(capturaEnElSelector(VACIO, CLIENTE, fac({ switch_factura_id: null }), [e]).modo).toBe("libre");
  });

  it("un bulto se dice en singular", () => {
    expect(textoCajas(1)).toBe("1 bulto");
    expect(textoCajas(14)).toBe("14 bultos");
  });
});

// ─── 2 · dirección SELECTOR ⇒ ETIQUETAS ──────────────────────────────────────

describe("🔴 2. la factura marcada en el selector no se vuelve a marcar desde Etiquetas", () => {
  const e = etq();

  it("libre mientras no esté en ningún renglón", () => {
    expect(capturaEnEtiquetas(VACIO, e, new Set())).toBe("libre");
    expect(etiquetaEstaMarcada(VACIO, e, new Set())).toBe(false);
  });

  it("marcada por este panel: sigue siendo suya (y es la que se ata al guardar)", () => {
    const items = marcarEtiqueta(VACIO, e);
    expect(capturaEnEtiquetas(items, e, new Set([e.id]))).toBe("marcada");
    expect(idsParaAtar(items, [e], new Set([e.id]))).toEqual([1]);
  });

  it("🔴 puesta por el SELECTOR de siempre: TOMADA — bloqueada, y no se ata", () => {
    const items = marcarFactura(VACIO, CLIENTE, { empresa: "Fashion Shoes", secuencial: "11-000002558" });
    expect(capturaEnEtiquetas(items, e, new Set())).toBe("tomada-por-el-selector");
    expect(etiquetaEstaMarcada(items, e, new Set())).toBe(false);
    expect(idsParaAtar(items, [e], new Set())).toEqual([]);
  });

  it("🔑 borrar la fila a mano desmarca la etiqueta sola (la conducta de la Fase 1, intacta)", () => {
    const items = marcarEtiqueta(VACIO, e);
    expect(etiquetaEstaMarcada(items, e, new Set([e.id]))).toBe(true);
    // La fila se borra a mano; el id sigue en «mías» y la etiqueta ya no cuenta.
    expect(etiquetaEstaMarcada(VACIO, e, new Set([e.id]))).toBe(false);
    expect(idsParaAtar(VACIO, [e], new Set([e.id]))).toEqual([]);
  });

  it("el bloqueo dice a dónde ir, no solo que no se puede", () => {
    expect(MOTIVO_TOMADA_POR_EL_SELECTOR).toContain("Facturas del cliente");
  });
});

// ─── 3 · una FRENA y la otra AVISA, y está escrito ───────────────────────────

describe("🔴 3. por qué una frena y la otra avisa, escrito donde se lee", () => {
  it("el módulo explica la diferencia con el aviso «Ya salió en GT-XXX»", () => {
    expect(antiDoble).toContain("Ya salió en GT-XXX");
    expect(antiDoble).toMatch(/AVISA|avisa/);
    expect(antiDoble).toMatch(/FRENA|bloquea/);
  });

  it("⚠️ y el aviso de «ya salió» sigue SIN bloquear nada en el selector", () => {
    // La casilla solo se apaga por etiquetas (`deEtiquetas`), jamás por `yaSalioEn`.
    expect(panelSelector).toMatch(/disabled=\{deEtiquetas\}/);
    expect(panelSelector).not.toMatch(/disabled=\{[^}]*yaSalioEn/);
  });

  it("🔴 el freno lo decide la función pura, no un `if` escrito en la pantalla", () => {
    expect(panelSelector).toContain("capturaEnElSelector");
    expect(panelEtiquetas).toContain("capturaEnEtiquetas");
    // Y ni una pantalla reimplementa la regla mirando los campos a mano.
    expect(panelSelector).not.toMatch(/etiquetaDeLaFactura\(/);
  });

  it("🔴 el freno está TAMBIÉN en el toque, no solo en el `disabled` que se ve", () => {
    const marcar = panelSelector.slice(panelSelector.indexOf("function toggle("), panelSelector.indexOf("function toggle(") + 600);
    expect(marcar).toMatch(/capturaEnElSelector\([\s\S]*?\)\.modo === "de-etiquetas"\) return;/);
    const alternar = panelEtiquetas.slice(panelEtiquetas.indexOf("function alternar("), panelEtiquetas.indexOf("function alternar(") + 600);
    expect(alternar).toMatch(/if \(estado === "tomada-por-el-selector"\) return;/);
  });

  it("🔴 UNA sola lectura de las etiquetas, compartida por los dos paneles", () => {
    expect(formulario).toContain("useEtiquetasVivas");
    expect(formulario).toMatch(/etiquetasVivas=\{etiquetasVivas\}/);
    expect(formulario).toMatch(/etiquetas=\{etiquetasVivas\}/);
    // Los paneles ya no piden la lista por su cuenta.
    expect(panelEtiquetas).not.toContain("/api/guias/etiquetas");
    expect(panelSelector).not.toContain("/api/guias/etiquetas");
  });
});

// ─── 4 · corregir bultos lleva a reimprimir ──────────────────────────────────

describe("🔴 4. corregir los bultos lleva directo a reimprimir el juego completo", () => {
  it("el aviso nombra los dos números y dice que el papel quedó mal", () => {
    const a = avisoDeReimpresion(14, 16);
    expect(a).toContain("14");
    expect(a).toContain("16");
    expect(a).toMatch(/quedaron mal/);
    expect(a).toMatch(/juego completo/);
  });

  it("sin cambio de número no hay aviso: una frase de más tapa los datos", () => {
    expect(avisoDeReimpresion(14, 14)).toBeNull();
  });

  it("un bulto se dice en singular", () => {
    expect(avisoDeReimpresion(1, 3)).toContain("Eran 1 bulto");
  });

  it("🔴 la pantalla abre la reimpresión al guardar, con el aviso, y NO solo cierra", () => {
    expect(vista).toMatch(/onListo=\{async \(actualizada, antes\) => \{[\s\S]*?setReimprimiendo\(\{ etiqueta: actualizada, aviso: avisoDeReimpresion\(antes, actualizada\.cajas\) \}\)/);
  });

  it("🔴 y abre con el JUEGO COMPLETO elegido", () => {
    expect(vista).toMatch(/useState<"juego" \| "una">\("juego"\)/);
  });
});

// ─── 5 · la pestaña del PDF nace ANTES del await ─────────────────────────────

describe("🔴 5. el PDF se abre en pestaña nueva, y la pestaña nace ANTES del await", () => {
  function ventana(): VentanaAbierta {
    return { location: { href: "" }, closed: false, close: vi.fn() };
  }

  it("🔴 LA TRAMPA DE iOS: `abrir` se llama antes de esperar a que el PDF se arme", async () => {
    const abrir = vi.fn(() => ventana());
    let abiertaAlArmar = 0;
    const r = await abrirPdfEnPestana(async () => {
      abiertaAlArmar = abrir.mock.calls.length;
      return { url: "blob:xyz", descargar: vi.fn() };
    }, abrir);
    expect(abiertaAlArmar).toBe(1); // ya estaba abierta cuando empezó el trabajo lento
    expect(abrir.mock.calls[0][0]).toBe(""); // en blanco: la dirección todavía no existe
    expect(r).toBe("pestana");
  });

  it("la dirección del blob se le pone a la pestaña ya abierta", async () => {
    const v = ventana();
    const r = await abrirPdfEnPestana(
      async () => ({ url: "blob:xyz", descargar: vi.fn() }),
      () => v,
    );
    expect(v.location.href).toBe("blob:xyz");
    expect(r).toBe("pestana");
  });

  it("🔴 sin pestaña, el archivo IGUAL sale: se intenta la directa y si no, se baja", async () => {
    const descargar = vi.fn();
    const abrir = vi.fn(() => null);
    const r = await abrirPdfEnPestana(async () => ({ url: "blob:xyz", descargar }), abrir);
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir.mock.calls[1][0]).toBe("blob:xyz");
    expect(descargar).toHaveBeenCalledTimes(1);
    expect(r).toBe("descarga");
  });

  it("si no hay nada que imprimir (el servidor dijo que no), la pestaña vacía se cierra", async () => {
    const v = ventana();
    const r = await abrirPdfEnPestana(async () => null, () => v);
    expect(v.close).toHaveBeenCalled();
    expect(r).toBe("nada");
  });

  it("si armarlo revienta, la pestaña se cierra y el error sube tal cual", async () => {
    const v = ventana();
    await expect(
      abrirPdfEnPestana(async () => { throw new Error("sin red"); }, () => v),
    ).rejects.toThrow("sin red");
    expect(v.close).toHaveBeenCalled();
  });

  it("🔴 el módulo abre la ventana ANTES del `await`, en el código (no solo en la prueba)", () => {
    const cuerpo = pestana.slice(pestana.indexOf("export async function abrirPdfEnPestana"));
    const abre = cuerpo.indexOf("const ventana = abrir(");
    const espera = cuerpo.indexOf("await armar()");
    expect(abre).toBeGreaterThan(-1);
    expect(espera).toBeGreaterThan(abre);
  });

  it("🔴 la pestaña de Etiquetas ya no baja el PDF por su cuenta: todo sale por este módulo", () => {
    expect(vista).toContain("abrirPdfEnPestana");
    expect(vista).toContain('output("bloburl")');
    // El ÚNICO `.save(` que queda es la RED de abajo, adentro de `descargar`.
    expect(vista).toMatch(/descargar: \(\) => doc\.save\(/);
    expect((vista.match(/\.save\(/g) ?? []).length).toBe(1);
  });

  it("🔴 y en el alta la pestaña se abre ANTES del POST, no después", () => {
    const cuerpo = vista.slice(vista.indexOf("async function etiquetar()"));
    const abre = cuerpo.indexOf("await abrirPdfEnPestana(");
    const post = cuerpo.indexOf('fetch("/api/guias/etiquetas"');
    expect(abre).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(abre);
  });

  it("⚠️ y se dice que Catálogos abre una URL del servidor y acá el PDF se arma en el navegador", () => {
    expect(pestana).toMatch(/Cat[áa]logos/);
    expect(pestana).toContain("bloburl");
  });
});

// ─── 6 · lo ya etiquetado no se ofrece, y se dice cuánto se escondió ─────────

describe("🔴 6. el selector para etiquetar NO muestra las ya etiquetadas", () => {
  const e = etq();
  const lista = [
    fac(),
    fac({ switch_factura_id: 52559, secuencial: "11-000002559" }),
    fac({ switch_factura_id: 52560, secuencial: "11-000002560" }),
  ] as never[];

  it("la ya etiquetada se va de la lista", () => {
    const r = facturasParaEtiquetar(lista, [e]);
    expect(r.visibles.map((f) => f.secuencial)).toEqual(["11-000002559", "11-000002560"]);
    expect(r.escondidas).toBe(1);
  });

  it("sin etiquetas no se esconde nada", () => {
    expect(facturasParaEtiquetar(lista, []).escondidas).toBe(0);
  });

  it("⚠️ una factura sin id de Switch nunca se esconde: no se la puede parear", () => {
    const sinId = [fac({ switch_factura_id: null })] as never[];
    expect(facturasParaEtiquetar(sinId, [e]).escondidas).toBe(0);
  });

  it("🔴 se DICE cuántas se escondieron y dónde están", () => {
    expect(textoEscondidasPorEtiqueta(0)).toBeNull();
    expect(textoEscondidasPorEtiqueta(1)).toBe("1 factura de este cliente ya está etiquetada — mírala en la lista");
    expect(textoEscondidasPorEtiqueta(3)).toBe("3 facturas de este cliente ya están etiquetadas — míralas en la lista");
  });

  it("la pantalla usa la función pura y dibuja el conteo", () => {
    expect(vista).toContain("facturasParaEtiquetar");
    expect(vista).toContain("textoEscondidasPorEtiqueta");
    // Y el chip «Ya etiquetada» de la fila se fue: esas filas ya no se dibujan.
    expect(vista).not.toContain(">Ya etiquetada<");
  });
});

// ─── 7 · el copy de Switch, verbatim ─────────────────────────────────────────

describe("🔴 7. el copy de Switch es el que dictó Daniel", () => {
  it("la frase, letra por letra", () => {
    expect(TEXTO_TRAER_DE_SWITCH).toBe("¿No aparece la factura de hoy? Tráela de Switch");
  });

  it("la pantalla la usa de la constante, no la escribe a mano", () => {
    expect(vista).toContain("TEXTO_TRAER_DE_SWITCH");
    expect(vista).not.toContain("El detalle de Switch entra una vez al día");
  });
});

// ─── 8 · nada de voseo y nada por debajo de 12 px ───────────────────────────

describe("🔴 8. los archivos nuevos cumplen las reglas de la casa", () => {
  it("nada de voseo en lo que se ve (el barrido de la casa cubre `src/**`)", () => {
    const textos = [antiDoble, pestana, panelEtiquetas, panelSelector, vista].join("\n");
    expect(textos).not.toMatch(/\b(eleg\u00ed|escrib\u00ed|revis\u00e1|guard\u00e1|ten\u00e9s|pod\u00e9s|mir\u00e1|toc\u00e1|ac\u00e1)\b/);
  });


  it("🔴 y el módulo del anti-doble captura es PURO: sin React, sin fetch, sin reloj", () => {
    expect(antiDoble).not.toMatch(/from "react"|fetch\(|new Date\(/);
    // Nadie más escribe su propia versión de la regla.
    const otros = barrer(/tomada-por-el-selector/).filter(
      (f) => f !== "src/lib/guias/anti-doble-captura.ts" && f !== "src/app/guias/components/EtiquetasPendientes.tsx",
    );
    expect(otros).toEqual([]);
  });
});

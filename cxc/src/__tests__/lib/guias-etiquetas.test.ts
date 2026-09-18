/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ETIQUETAS PARA LAS CAJAS DE UN DESPACHO (18-sep-2026)
 *
 * Daniel: elegir una factura, escribir cuántas cajas y que salgan las hojas
 * para pegar. La etiqueta se imprime PRIMERO; la guía se hace ese día o tres
 * días después, y sola se entera.
 *
 * Lo que este archivo fija (la parte PURA y la forma de la tabla; las rutas
 * EJECUTADAS viven en `src/__tests__/api/guias-etiquetas-route.test.ts` y la
 * pantalla en `guias-etiquetas-pantalla.test.tsx`):
 *
 *   1. EL ESTADO SE DERIVA, jamás se mantiene: sin renglón vivo de guía viva,
 *      la etiqueta vuelve sola a «Pendiente de guía».
 *   2. IMPORTADA = BLOQUEADA: ni se corrige ni se borra.
 *   3. SOFT DELETE FIRMADO, NUNCA UN DELETE — barrido incluido.
 *   4. El único de la base es PARCIAL: borrada la etiqueta, esa factura se
 *      puede volver a etiquetar.
 *   5. Solo las 6 empresas del grupo, por inclusión.
 *   6. Los roles se DERIVAN de `GUIAS_WRITE_ROLES`, no se copian.
 *   7. El papel: 4 por hoja; reimprimir una caja va en la POSICIÓN 1.
 *   8. La etiqueta NO lleva transportista, ni piezas, ni código de barras, ni
 *      la dirección del directorio.
 *   9. Se juntan por CLIENTE **Y** EMPRESA, con los bultos sumados.
 *  10. La tabla nueva está clasificada en el respaldo.
 *  11. La pestaña NO cuelga de `GUIAS_ATAJOS_NUEVOS`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { GUIAS_WRITE_ROLES } from "@/lib/guias/roles-escritura";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { TABLAS_PERSONAS } from "@/lib/backup/tablas";
import {
  ETIQUETAS_ROLES,
  ETIQUETAS_POR_HOJA,
  MAX_CAJAS,
  agruparEtiquetasEnRenglones,
  cajasDelJuego,
  cuantasHojas,
  desmarcarEtiqueta,
  estaImportada,
  etiquetaDeLaFactura,
  etiquetaMarcada,
  etiquetasMarcadas,
  fechaDeLaEtiqueta,
  filtrarEtiquetas,
  guiaQueSeLlevo,
  hojasDeEtiquetas,
  marcarEtiqueta,
  motivoBloqueo,
  nombreArchivoEtiquetas,
  puedeCorregirse,
  puedeEtiquetar,
  rotuloEstado,
  ROTULO_CAJA,
  numeroDeCaja,
  textoImprimir,
  totalBultos,
  validarCajas,
  validarEtiquetaNueva,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const MIGRACION = "supabase/migrations/20261207120000_guias_etiquetas.sql";
const migracion = leer(MIGRACION);
const servidor = leer("src/lib/guias/etiquetas-server.ts");
const puro = leer("src/lib/guias/etiquetas.ts");
const pdf = leer("src/lib/guias/pdf-etiquetas.ts");
const rutaLista = leer("src/app/api/guias/etiquetas/route.ts");
const rutaUno = leer("src/app/api/guias/etiquetas/[id]/route.ts");
const rutaImportar = leer("src/app/api/guias/etiquetas/importar/route.ts");
const vista = leer("src/app/guias/components/EtiquetasView.tsx");
const paginaGuias = leer("src/app/guias/page.tsx");

/** Una etiqueta de ejemplo — datos REALES medidos el 18-sep-2026 (GT-256). */
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

// ─── 1 · el estado se DERIVA ─────────────────────────────────────────────────

describe("🔴 1. el estado se deriva del renglón, nunca de una columna", () => {
  it("sin renglón atado: «Pendiente de guía»", () => {
    expect(guiaQueSeLlevo(null)).toBeNull();
    expect(rotuloEstado(etq())).toBe("Pendiente de guía");
    expect(estaImportada(etq())).toBe(false);
  });

  it("renglón vivo de guía viva: «En GT-256»", () => {
    expect(guiaQueSeLlevo({ deleted: false, guia: { numero: 256, deleted: false } })).toBe(256);
    expect(rotuloEstado(etq({ guia_numero: 256 }))).toBe("En GT-256");
    expect(estaImportada(etq({ guia_numero: 256 }))).toBe(true);
  });

  it("🔴 EL RENGLÓN BORRADO NO ATA — la etiqueta vuelve sola a Pendiente", () => {
    expect(guiaQueSeLlevo({ deleted: true, guia: { numero: 256, deleted: false } })).toBeNull();
  });

  it("🔴 LA GUÍA BORRADA TAMPOCO ATA — los DOS `deleted` son independientes", () => {
    expect(guiaQueSeLlevo({ deleted: false, guia: { numero: 256, deleted: true } })).toBeNull();
  });

  it("un renglón sin guía (huérfano) tampoco ata", () => {
    expect(guiaQueSeLlevo({ deleted: false, guia: null })).toBeNull();
    expect(guiaQueSeLlevo({ deleted: false, guia: { numero: null, deleted: false } })).toBeNull();
  });

  it("🔴 la tabla NO tiene columna de estado: se derivaría mal el día que nadie la mantenga", () => {
    expect(migracion).not.toMatch(/^\s+estado\s/m);
    // Y el servidor calcula el número con la función pura, no leyendo una columna.
    expect(servidor).toContain("guiaQueSeLlevo");
  });

  it("el servidor mira los DOS deleted al derivar (el del renglón y el de la guía)", () => {
    expect(servidor).toContain('.select("id, guia_id, deleted")');
    expect(servidor).toContain('.select("id, numero, deleted")');
  });
});

// ─── 2 · importada = bloqueada ───────────────────────────────────────────────

describe("🔴 2. importada = bloqueada, y lo decide el SERVIDOR", () => {
  it("pendiente: se corrige y se borra", () => {
    expect(puedeCorregirse(etq())).toBe(true);
    expect(motivoBloqueo(etq())).toBeNull();
  });

  it("importada: ni se corrige ni se borra, y el motivo se DICE", () => {
    const e = etq({ guia_numero: 256 });
    expect(puedeCorregirse(e)).toBe(false);
    expect(motivoBloqueo(e)).toContain("GT-256");
  });

  it("🔴 el servidor rechaza con 409, no se fía del botón", () => {
    expect(servidor).toMatch(/corregirCajas[\s\S]*?status: 409/);
    expect(servidor).toMatch(/borrarEtiqueta[\s\S]*?status: 409/);
  });

  it("la PANTALLA usa la MISMA regla pura (no una copia suya)", () => {
    expect(vista).toContain("puedeCorregirse");
    expect(vista).not.toMatch(/guia_numero\s*(===|!==)\s*null/);
  });
});

// ─── 3 · soft delete firmado, nunca DELETE ───────────────────────────────────

describe("🔴 3. borrar no borra: soft delete FIRMADO", () => {
  it("la migración exige la firma con un CHECK", () => {
    expect(migracion).toContain("guias_etiquetas_baja_firmada");
    expect(migracion).toContain("borrado_por IS NOT NULL AND borrado_en IS NOT NULL");
  });

  it("la tabla NO recibe permiso de DELETE", () => {
    expect(migracion).toContain("GRANT SELECT, INSERT, UPDATE ON guias_etiquetas TO service_role");
    expect(migracion).not.toMatch(/GRANT[^;]*DELETE[^;]*guias_etiquetas/i);
  });

  it("el servidor escribe deleted + quién + cuándo, y no llama a .delete(", () => {
    expect(servidor).toContain("deleted: true");
    expect(servidor).toContain("borrado_por");
    expect(servidor).toContain("borrado_en");
    const sinComentarios = servidor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toContain(".delete(");
  });

  it("🩸 NINGÚN archivo del sistema hace un DELETE sobre `guias_etiquetas`", () => {
    const rastro = barrer(/from\(["']guias_etiquetas["']\)[\s\S]{0,200}\.delete\(/);
    expect(rastro, `hay un DELETE de verdad: ${rastro.join(", ")}`).toEqual([]);
  });

  it("RLS encendida y solo `service_role`", () => {
    expect(migracion).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migracion).toContain("FOR ALL TO service_role");
  });
});

// ─── 4 · el único es PARCIAL ─────────────────────────────────────────────────

describe("🔴 4. una factura, un juego — pero borrada se puede volver a etiquetar", () => {
  it("el índice único es parcial: WHERE NOT deleted", () => {
    expect(migracion).toContain("CREATE UNIQUE INDEX IF NOT EXISTS guias_etiquetas_factura_viva_unica");
    expect(migracion).toContain("ON guias_etiquetas (empresa_key, switch_factura_id)");
    expect(migracion).toMatch(/guias_etiquetas_factura_viva_unica[\s\S]{0,120}WHERE NOT deleted/);
  });

  it("⚠️ `deleted` es NOT NULL en esta tabla: con NULL el índice parcial dejaría pasar repetidos", () => {
    expect(migracion).toMatch(/deleted\s+boolean NOT NULL DEFAULT false/);
  });

  it("el anti-duplicado del servidor mira SOLO las vivas — en las DOS lecturas", () => {
    // ⚠️ Los dos filtros son defensas separadas y REDUNDANTES a propósito (sacar
    // uno solo no cambia la conducta), así que se exigen por escrito: `buscarViva`
    // busca la fila y `leerEtiqueta` la trae con su estado.
    expect(servidor).toContain(
      '.eq("empresa_key", empresaKey)\n    .eq("switch_factura_id", switchFacturaId)\n    .eq("deleted", false)',
    );
    expect(servidor).toContain('.eq("id", id)\n    .eq("deleted", false)\n    .maybeSingle()');
  });

  it("la pantalla reconoce la ya etiquetada por (empresa, id de Switch), nunca por el número escrito", () => {
    expect(etiquetaDeLaFactura([etq()], "fashion_shoes", 52558)?.id).toBe(1);
    // Otro empresa con el MISMO id de Switch NO es la misma factura.
    expect(etiquetaDeLaFactura([etq()], "fashion_wear", 52558)).toBeNull();
  });
});

// ─── 5 · solo las 6 del grupo ────────────────────────────────────────────────

describe("🔴 5. solo las 6 empresas del grupo, por INCLUSIÓN", () => {
  it("una empresa del grupo pasa", () => {
    for (const k of B2B_EMPRESA_KEYS) {
      const v = validarEtiquetaNueva({ ...bodyOk(), empresa_key: k });
      expect(v.ok, `${k} debería entrar`).toBe(true);
    }
  });

  it("🔴 Boston y Multifashion NO entran, aunque manden su clave a mano", () => {
    for (const k of ["confecciones_boston", "american_classic"]) {
      const v = validarEtiquetaNueva({ ...bodyOk(), empresa_key: k });
      expect(v.ok).toBe(false);
    }
  });

  it("la lista se DERIVA de `B2B_EMPRESA_KEYS`, no se enumera a mano", () => {
    expect(puro).toContain("B2B_EMPRESA_KEYS");
    expect(puro).not.toContain('"vistana"');
  });
});

function bodyOk() {
  return {
    empresa_key: "fashion_shoes",
    switch_factura_id: 52558,
    secuencial: "11-000002558",
    fecha_factura: "2026-09-18",
    cliente_codigo: "D-170",
    cliente_nombre: "Nova Lux, S.A.",
    destino: "Paso Canoas",
    cajas: 14,
  };
}

describe("la validación es fail-closed y con texto para la pantalla", () => {
  it("falta el destino, falta el cliente, falta la fecha: cada uno con su aviso", () => {
    expect(validarEtiquetaNueva({ ...bodyOk(), destino: "  " })).toMatchObject({ ok: false });
    expect(validarEtiquetaNueva({ ...bodyOk(), cliente_codigo: "" })).toMatchObject({ ok: false });
    expect(validarEtiquetaNueva({ ...bodyOk(), fecha_factura: "2026-02-30" })).toMatchObject({ ok: false });
    expect(validarEtiquetaNueva({ ...bodyOk(), switch_factura_id: 0 })).toMatchObject({ ok: false });
  });

  it("las cajas: entero de 1 a 300, ni 0 ni 301 ni «tres»", () => {
    expect(validarCajas(1)).toMatchObject({ ok: true, valor: 1 });
    expect(validarCajas(MAX_CAJAS)).toMatchObject({ ok: true });
    expect(validarCajas(0)).toMatchObject({ ok: false });
    expect(validarCajas(MAX_CAJAS + 1)).toMatchObject({ ok: false });
    expect(validarCajas("tres")).toMatchObject({ ok: false });
    expect(validarCajas(2.5)).toMatchObject({ ok: false });
  });

  it("el CHECK de la base dice el MISMO rango que la pantalla", () => {
    expect(migracion).toContain(`cajas >= 1 AND cajas <= ${MAX_CAJAS}`);
  });
});

// ─── 6 · los roles se derivan ────────────────────────────────────────────────

describe("🔴 6. los roles se DERIVAN de quien escribe una guía", () => {
  it("son exactamente admin · secretaria · bodega", () => {
    expect([...ETIQUETAS_ROLES]).toEqual([...GUIAS_WRITE_ROLES]);
    expect([...ETIQUETAS_ROLES].sort()).toEqual(["admin", "bodega", "secretaria"]);
  });

  it("el vendedor no entra (ve Guías en solo lectura)", () => {
    expect(puedeEtiquetar("vendedor")).toBe(false);
    expect(puedeEtiquetar(null)).toBe(false);
    expect(puedeEtiquetar("bodega")).toBe(true);
  });

  it("la lista NO está escrita a mano en el módulo", () => {
    expect(puro).toContain("GUIAS_WRITE_ROLES");
    expect(puro).not.toMatch(/\["admin", "secretaria", "bodega"\]/);
  });

  it("las TRES rutas exigen esa misma lista", () => {
    for (const r of [rutaLista, rutaUno, rutaImportar]) {
      expect(r).toContain("ETIQUETAS_ROLES");
      expect(r).toContain("requireRole");
    }
  });
});

// ─── 7 · el papel ────────────────────────────────────────────────────────────

describe("🔴 7. hoja carta, cuatro por hoja, líneas de corte", () => {
  it("cuatro por hoja", () => {
    expect(ETIQUETAS_POR_HOJA).toBe(4);
    expect(cuantasHojas(14)).toBe(4);
    expect(cuantasHojas(4)).toBe(1);
    expect(cuantasHojas(5)).toBe(2);
    expect(textoImprimir(14)).toBe("Imprimir 14 etiquetas · 4 hojas");
    expect(textoImprimir(1)).toBe("Imprimir 1 etiqueta · 1 hoja");
  });

  it("14 cajas = 4 hojas, y la última lleva DOS cuartos en blanco", () => {
    const hojas = hojasDeEtiquetas(cajasDelJuego(14));
    expect(hojas).toHaveLength(4);
    expect(hojas[0]).toEqual([1, 2, 3, 4]);
    expect(hojas[3]).toEqual([13, 14, null, null]);
  });

  it("🔴 reimprimir UNA caja: una hoja, la etiqueta en la POSICIÓN 1 y el resto en blanco", () => {
    expect(hojasDeEtiquetas([7])).toEqual([[7, null, null, null]]);
  });

  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 18-sep-2026, a propósito: «CAJA» y su número son
  // DOS textos (el rótulo chico arriba, el número enorme abajo) y la fecha pasó
  // al formato de la casa. Lo fija `guias-etiqueta-rediseno.test.ts`.
  it("«CAJA» y «3 de 14» son dos textos, y la fecha va en el formato de la casa", () => {
    expect(ROTULO_CAJA).toBe("CAJA");
    expect(numeroDeCaja(3, 14)).toBe("3 de 14");
    expect(fechaDeLaEtiqueta("2026-09-18")).toBe("18 sept 2026");
    expect(fechaDeLaEtiqueta("")).toBe("");
  });

  it("el PDF es jsPDF, carta vertical, y dibuja las líneas de corte SIEMPRE", () => {
    expect(pdf).toContain('from "jspdf"');
    expect(pdf).toContain('format: "letter"');
    expect(pdf).toContain('orientation: "portrait"');
    expect(pdf).toContain("setLineDashPattern");
    // Las líneas se dibujan por hoja, antes de los cuartos: una hoja con dos
    // cuartos vacíos igual se parte por el medio.
    expect(pdf).toMatch(/lineasDeCorte\(doc\);[\s\S]{0,200}hoja\.forEach/);
  });

  it("🔴 UN SOLO generador: no hay un segundo dibujo para la reimpresión", () => {
    const generadores = pdf.match(/export function construirPdf\w*/g) ?? [];
    expect(generadores).toHaveLength(1);
  });

  it("el papel SE ARMA de verdad: 14 cajas = 4 páginas con bytes adentro", async () => {
    // No alcanza con leer el archivo: un `setLineDashPattern` que no existiera
    // reventaría recién al tocar «Imprimir», delante de la secretaria.
    const { construirPdfEtiquetas, datosDeEtiqueta } = await import("@/lib/guias/pdf-etiquetas");
    const doc = construirPdfEtiquetas(datosDeEtiqueta(etq()), cajasDelJuego(14));
    expect(doc.getNumberOfPages()).toBe(4);
    expect((doc.output("arraybuffer") as ArrayBuffer).byteLength).toBeGreaterThan(2000);
  });

  it("y la reimpresión de la caja 7 sale en UNA página, con un nombre que dice qué es", async () => {
    const { construirPdfEtiquetas, datosDeEtiqueta } = await import("@/lib/guias/pdf-etiquetas");
    const doc = construirPdfEtiquetas(datosDeEtiqueta(etq()), [7]);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(nombreArchivoEtiquetas(etq(), 7)).toBe("Etiquetas-11-000002558-caja-7.pdf");
    expect(nombreArchivoEtiquetas(etq())).toBe("Etiquetas-11-000002558.pdf");
  });
});

// ─── 8 · lo que la etiqueta NO lleva ─────────────────────────────────────────

describe("🔴 8. la etiqueta lleva seis cosas, y nada más", () => {
  it("lleva empresa, fecha, factura, cliente, destino y la caja", () => {
    for (const campo of ["empresa", "fecha_factura", "secuencial", "cliente_nombre", "destino", "numeroDeCaja"]) {
      expect(pdf).toContain(campo);
    }
  });

  it("🔴 SIN transportista, SIN piezas, SIN código de barras", () => {
    const sinComentarios = pdf.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/transportista/i);
    expect(sinComentarios).not.toMatch(/piezas|cantidad_articulos/i);
    expect(sinComentarios).not.toMatch(/barcode|jsbarcode|bwip|qrcode|zpl/i);
  });

  it("🔴 SIN la dirección del directorio: el destino es el del ENVÍO", () => {
    const sinComentarios = (puro + pdf + servidor)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toContain("direccion_switch");
    expect(sinComentarios).not.toContain("clientes_master");
    expect(migracion).toContain("nunca la dirección del directorio");
  });

  it("no se estrenó ninguna dependencia de código de barra ni de QR", () => {
    const pkg = JSON.parse(leer("package.json")) as { dependencies: Record<string, string> };
    const nombres = Object.keys(pkg.dependencies).join(" ");
    expect(nombres).not.toMatch(/barcode|bwip|qrcode|zebra|dymo/i);
  });
});

// ─── 9 · juntar por cliente + empresa ────────────────────────────────────────

describe("🔴 9. se juntan por CLIENTE y EMPRESA, con los bultos sumados", () => {
  const tres = [
    etq({ id: 1, cliente_codigo: "D-108", cliente_nombre: "American Classics Store", empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "11-000003260", cajas: 2, destino: "David" }),
    etq({ id: 2, cliente_codigo: "D-108", cliente_nombre: "American Classics Store", empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "11-000003257", cajas: 1, destino: "David" }),
    etq({ id: 3, cliente_codigo: "D-108", cliente_nombre: "American Classics Store", empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "11-000003255", cajas: 3, destino: "David" }),
  ];

  it("tres facturas del mismo par → UN renglón, 6 bultos, las tres facturas", () => {
    const r = agruparEtiquetasEnRenglones(tres);
    expect(r).toHaveLength(1);
    expect(r[0].bultos).toBe(6);
    expect(r[0].facturas).toBe("11-000003260, 11-000003257, 11-000003255");
    expect(r[0].direccion).toBe("David");
    expect(totalBultos(r)).toBe(6);
  });

  it("🔴 el MISMO cliente en DOS empresas van en DOS renglones (como GT-256 de verdad)", () => {
    const dos = [
      etq({ id: 1, empresa_key: "fashion_shoes", empresa: "Fashion Shoes", cajas: 14 }),
      etq({ id: 2, empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "11-000003258", cajas: 5 }),
    ];
    const r = agruparEtiquetasEnRenglones(dos);
    expect(r).toHaveLength(2);
    expect(totalBultos(r)).toBe(19);
  });

  it("⚠️ una etiqueta que YA salió en una guía no se mete en otra", () => {
    const r = agruparEtiquetasEnRenglones([...tres, etq({ id: 9, guia_numero: 256 })]);
    expect(r).toHaveLength(1);
  });

  it("marcar y desmarcar LLENA los renglones de siempre, sin pisar lo escrito a mano", () => {
    const vacio = [{ orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" }];
    const conUna = marcarEtiqueta(vacio, tres[0]);
    expect(conUna[0]).toMatchObject({
      cliente: "American Classics Store",
      cliente_codigo: "D-108",
      empresa: "Fashion Wear",
      facturas: "11-000003260",
      bultos: 2,
      direccion: "David",
    });
    const conDos = marcarEtiqueta(conUna, tres[1]);
    expect(conDos).toHaveLength(1);
    expect(conDos[0].facturas).toBe("11-000003260, 11-000003257");
    expect(conDos[0].bultos).toBe(3);
    // Desmarcar quita SU factura y SUS cajas, y no toca la otra.
    const deVuelta = desmarcarEtiqueta(conDos, tres[1]);
    expect(deVuelta[0].facturas).toBe("11-000003260");
    expect(deVuelta[0].bultos).toBe(2);
    // Y desmarcar la última retira la fila (queda una vacía donde escribir).
    const limpio = desmarcarEtiqueta(deVuelta, tres[0]);
    expect(limpio).toHaveLength(1);
    expect(limpio[0].facturas).toBe("");
  });

  it("qué está marcado se DERIVA de los renglones", () => {
    const vacio = [{ orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" }];
    expect(etiquetaMarcada(vacio, tres[0])).toBe(false);
    const conUna = marcarEtiqueta(vacio, tres[0]);
    expect(etiquetaMarcada(conUna, tres[0])).toBe(true);
    expect(etiquetasMarcadas(conUna, tres)).toEqual([1]);
  });

  it("🔴 el amarre lo escribe una ruta APARTE: `POST /api/guias` no cambió", () => {
    const rutaGuias = leer("src/app/api/guias/route.ts");
    expect(rutaGuias).not.toContain("guias_etiquetas");
    expect(rutaGuias).not.toContain("etiqueta");
    // Y la ruta de importar toca solo `guias_etiquetas`.
    expect(servidor).toMatch(/importarEtiquetas[\s\S]*?from\(TABLA_ETIQUETAS\)[\s\S]*?guia_item_id: renglonId/);
  });

  it("🔴 y NO escribe en `guia_items` ni en `guia_transporte`", () => {
    const sinComentarios = servidor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/from\("guia_items"\)[\s\S]{0,120}\.(update|insert|upsert|delete)\(/);
    expect(sinComentarios).not.toMatch(/from\("guia_transporte"\)[\s\S]{0,120}\.(update|insert|upsert|delete)\(/);
  });
});

// ─── 10 · el respaldo ────────────────────────────────────────────────────────

describe("🔴 10. nada que no se pueda volver a conseguir se queda sin copia", () => {
  it("`guias_etiquetas` está clasificada como `personas`", () => {
    expect(TABLAS_PERSONAS).toContain("guias_etiquetas");
  });

  it("y el cron de respaldo la baja", () => {
    expect(leer("src/app/api/cron/backup/route.ts")).toContain('{ table: "guias_etiquetas" }');
  });
});

// ─── 11 · la pestaña, y la puerta de la que NO cuelga ────────────────────────

describe("🔴 11. la pestaña «Etiquetas» tiene su propia puerta", () => {
  it("se dibuja para los tres roles que escriben guías", () => {
    expect(paginaGuias).toContain("puedeEtiquetar(role)");
    expect(paginaGuias).toContain('["etiquetas", "Etiquetas"]');
  });

  it("🔴 NO cuelga de `GUIAS_ATAJOS_NUEVOS` (ése es la reversión de Nueva guía)", () => {
    expect(paginaGuias).toMatch(/const hayEtiquetas = puedeEtiquetar\(role\);/);
    expect(paginaGuias).not.toMatch(/hayEtiquetas\s*=\s*GUIAS_ATAJOS_NUEVOS/);
  });

  it("⚠️ la sección de Nueva guía SÍ cuelga de ese interruptor", () => {
    const form = leer("src/app/guias/components/GuiaForm.tsx");
    expect(form).toMatch(/GUIAS_ATAJOS_NUEVOS && !editingId && !soloCorregible && onReemplazarItems && \(\s*<EtiquetasPendientes/);
  });

  // 🔄 18-sep-2026 — el botón decía «Traer de Switch ahora». Daniel: *«¿no
  // prefieres Actualizar ahora?»*. Solo el TEXTO: la ruta es la misma.
  it("«Actualizar ahora» reusa la ruta de siempre, sin estrenar un camino a Switch", () => {
    expect(vista).toContain('fetch("/api/guias/facturas-hoy", { method: "POST" })');
    const sinComentarios = vista.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/apifactura|switch-api/i);
  });

  it("reusa el ÚNICO selector de cliente del sistema", () => {
    expect(vista).toContain('from "@/components/ClientePicker"');
  });

  it("el destino se autollena con la MISMA regla del formulario de la guía", () => {
    expect(vista).toContain("destinoParaAutollenar");
    expect(vista).toContain("botonesDeDestino");
  });
});

// ─── la lista de la pestaña ──────────────────────────────────────────────────

describe("la lista abre por pendientes y busca por subcadena exacta", () => {
  const filas = [etq({ id: 1 }), etq({ id: 2, guia_numero: 256, cliente_nombre: "Golden Mall" })];

  it("«Pendientes de guía» deja fuera lo que ya salió", () => {
    expect(filtrarEtiquetas(filas, "pendientes", "")).toHaveLength(1);
    expect(filtrarEtiquetas(filas, "todas", "")).toHaveLength(2);
  });

  it("busca sin acentos y sin mayúsculas, exacto — jamás por parecido", () => {
    expect(filtrarEtiquetas(filas, "todas", "golden")).toHaveLength(1);
    expect(filtrarEtiquetas(filas, "todas", "nova lux")).toHaveLength(1);
    expect(filtrarEtiquetas(filas, "todas", "novalux")).toHaveLength(0);
  });
});

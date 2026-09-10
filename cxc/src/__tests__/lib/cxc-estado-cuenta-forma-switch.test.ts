// ─────────────────────────────────────────────────────────────────────────────
// EL ESTADO DE CUENTA SALE CON LA FORMA DE SWITCH (9-sep-2026)
//
// Daniel, textual: *«el sistema debe de mandar el estado de cuenta tal cual como
// sale en Switch cuando descargas el historial. Mismos números, mismos nombres,
// mismo todo!!!!»* — y, preguntado si copiábamos la HISTORIA completa o la
// FORMA con los documentos abiertos, eligió lo segundo: es lo mismo que hace el
// botón del avioncito de Switch, que «envía el estado de cuenta pendiente».
//
// 🩸 CÓMO ESTABA. El papel tenía seis columnas propias —Documento · Tipo ·
// Fecha · Días · Monto · Saldo— y ninguna de las diez de Switch, así que el
// cliente no podía parear nuestro papel con el que ya recibe. Salía además con
// el nombre en MAYÚSCULAS, porque la pantalla le pasaba `nombre_normalized`,
// que existe para PAREAR y no para leerse.
//
// 🔴 MEDIDO CONTRA PRODUCCIÓN (`scripts/_medir-estado-cuenta-switch.mjs`), D-25
// City Mall Paso Canoa en Fashion Wear:
//   · 31 documentos abiertos contra los 1.354 que imprime Switch;
//   · **Total General $130.699,36 en los dos papeles**, al centavo;
//   · los tres primeros tramos de Switch (0-30 $10.057,27 · 31-60 $80.748,65 ·
//     61-90 $39.893,44) suman exactamente nuestro «0 a 90 días»;
//   · el saldo corrido de cada renglón es el mismo `saldoConsecutivo` que manda
//     Switch (1.006,80 → 3.708,15 → 3.716,31 → … → 130.699,36).
//
// LAS CINCO DECISIONES DE DANIEL, una por bloque de abajo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { AGING_ORDER, tramoRango, tramoLabel } from "@/lib/cxc-aging";
import { EMPRESA_FISCAL, fichaFiscal } from "@/lib/cxc/empresa-fiscal";
import {
  fechaDMY,
  fechaVence,
  nombreDelPapel,
  capitalizarNombre,
  filasDelPapel,
  tramosDelPapel,
  cuadrarConSwitch,
  monto,
} from "@/lib/cxc/estado-cuenta-switch";
import { COLUMNAS } from "@/lib/cxc/pdf-estado-cuenta-hoja";
import { buildEstadoCuentaPDF, buildEstadoCuentaLotePDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta } from "@/lib/cxc/estado-cuenta-tipos";

const raiz = join(__dirname, "..", "..");
function leer(rel: string): string {
  return readFileSync(join(raiz, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

async function textoDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += ((await page.getTextContent()).items as any[]).map((it) => it.str).join(" ") + "\n";
  }
  return texto.replace(/\s+/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS CINCO DOCUMENTOS REALES DE D-25 QUE FIJAN EL PAPEL. Salen del estado de
// cuenta de producción del 9-sep-2026 y del papel de Switch del 8-sep.
// ─────────────────────────────────────────────────────────────────────────────
const D25 = {
  codigo: "D-25",
  clienteNombre: "City Mall Paso Canoa",
  cliente: {
    nombre: "City Mall Paso Canoa",
    identificacion: "1513069-1-650069",
    telefono: "727-7247",
    email: "contabilidad@citymall.com.pa",
    direccion: "Paso Canoas",
    limiteCredito: 0,
    tiempoMorosidad: 0,
  },
  total: 5579.91,
  generadoEn: "2026-09-09T12:00:00.000Z",
  empresas: [
    {
      empresa_key: "fashion_wear",
      empresa_nombre: "Fashion Wear",
      subtotal: 5579.91,
      saldoSwitch: null,
      documentos: [
        { numero: "11-000003121", fecha: "2026-06-16", tipo: "Factura", monto: 2978.88, saldo: 1006.8, debito: 1006.8, credito: 0, dias: 85, plazoCredito: 90, numeroFiscal: "FE012000040254-103-278837-5400012026061600000031210010114344239888" },
        { numero: "11-000003122", fecha: "2026-06-17", tipo: "Factura", monto: 2792.7, saldo: 2701.35, debito: 2701.35, credito: 0, dias: 84, plazoCredito: 90, numeroFiscal: null },
        { numero: "14-000000258", fecha: "2026-06-23", tipo: "Nota de Débito", monto: 8.16, saldo: 8.16, debito: 8.16, credito: 0, dias: 78, plazoCredito: 90, numeroFiscal: null },
        { numero: "11-000003124", fecha: "2026-06-24", tipo: "Factura", monto: 1926, saldo: 1863, debito: 1863, credito: 0, dias: 77, plazoCredito: 90, numeroFiscal: null },
        { numero: "14-000000259", fecha: "2026-06-25", tipo: "Nota de Débito", monto: 0.6, saldo: 0.6, debito: 0.6, credito: 0, dias: 76, plazoCredito: 90, numeroFiscal: null },
      ],
    },
  ],
} as unknown as EstadoCuenta;

// ═════════════════════════════════════════════════════════════════════════════
// 1. 🔴 SOLO LOS DOCUMENTOS ABIERTOS — Y EL TOTAL CUADRA IGUAL
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 solo los documentos ABIERTOS (saldo ≠ 0)", () => {
  const lector = leer("lib/cxc/estado-cuenta-data.ts");

  it("la consulta pide saldo <> 0 y nada más", () => {
    expect(lector).toContain('.neq("saldo", 0)');
  });

  it("🔴 el orden es (fecha, ccte_id) — el papel lleva saldo corrido", () => {
    // Si el orden se mueve, los números intermedios dejan de ser los de Switch
    // aunque el total siga dando igual.
    expect(lector).toMatch(/\.order\("fecha_creacion", \{ ascending: true \}\)\s*\.order\("ccte_id", \{ ascending: true \}\)/);
  });

  it("el saldo corrido termina en el total, por construcción", () => {
    const { filas, total } = filasDelPapel(D25.empresas[0].documentos);
    expect(filas.map((f) => f.saldo)).toEqual(["1,006.80", "3,708.15", "3,716.31", "5,579.31", "5,579.91"]);
    expect(total).toBe(5579.91);
  });

  it("🔴 un RECIBO abierto RESTA del saldo corrido", () => {
    // Medido: de los 943 documentos abiertos de las 6 empresas, 42 son recibos
    // y 32 notas de crédito. Si sumaran, el papel le cobraría al cliente lo que
    // ya pagó.
    const { filas, total } = filasDelPapel([
      { numero: "11-1", fecha: "2026-06-16", tipo: "Factura", debito: 1000, credito: 0, dias: 10, plazoCredito: 90, numeroFiscal: null },
      { numero: "12-1", fecha: "2026-06-20", tipo: "Recibo", debito: 0, credito: 300, dias: 6, plazoCredito: 0, numeroFiscal: null },
      { numero: "13-1", fecha: "2026-06-21", tipo: "Nota de Crédito", debito: 0, credito: 50, dias: 5, plazoCredito: 0, numeroFiscal: null },
    ]);
    expect(filas.map((f) => f.saldo)).toEqual(["1,000.00", "700.00", "650.00"]);
    expect(total).toBe(650);
    // …y el crédito se escribe en SU columna, no en la de débitos.
    expect(filas[1].debito).toBe("");
    expect(filas[1].credito).toBe("300.00");
  });

  it("🩸 un documento con saldo 0 NO puede colarse: no lo trae la consulta", () => {
    expect(lector).not.toMatch(/\.gte\("saldo"/);
    expect(lector).not.toMatch(/\.eq\("saldo", 0\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. 🔴 LOS TRES TRAMOS, NO LOS OCHO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 los TRES tramos de la pantalla, no los ocho de Switch", () => {
  it("son exactamente tres y salen de `cxc-aging`", () => {
    expect(AGING_ORDER).toHaveLength(3);
    expect(AGING_ORDER.map(tramoRango)).toEqual(["0 a 90 días", "91 a 120 días", "121 días y más"]);
  });

  it("el papel no escribe los rótulos a mano: los deriva", () => {
    const hoja = leer("lib/cxc/pdf-estado-cuenta-hoja.ts");
    expect(hoja).toContain("AGING_ORDER.map((k) => tramoRango(k))");
    for (const suelto of ["0-30", "31-60", "61-90", "121-180", "181-270", "271-365", "365"]) {
      expect(hoja, `volvió el tramo de Switch «${suelto}» al papel`).not.toContain(`"${suelto}`);
    }
  });

  it("los cortes son los de siempre — 0-90 / 91-120 / 121+", () => {
    const t = tramosDelPapel([
      { debito: 100, credito: 0, dias: 90 },
      { debito: 200, credito: 0, dias: 91 },
      { debito: 400, credito: 0, dias: 120 },
      { debito: 800, credito: 0, dias: 121 },
    ]);
    expect(t).toEqual({ current: 100, watch: 600, overdue: 800 });
  });

  it("un crédito abierto RESTA de su tramo", () => {
    expect(tramosDelPapel([{ debito: 0, credito: 300, dias: 10 }]).current).toBe(-300);
  });

  it("los 31 documentos de D-25 caen los 31 en «0 a 90 días»", () => {
    // Medido: los tres primeros tramos de Switch suman exactamente esto.
    const t = tramosDelPapel(D25.empresas[0].documentos);
    expect(t.current).toBe(5579.91);
    expect(t.watch).toBe(0);
    expect(t.overdue).toBe(0);
  });

  it("⚠️ dentro de la casa `tramoLabel()` NO cambió", () => {
    expect(AGING_ORDER.map(tramoLabel)).toEqual([
      "Por vencer 0-90d", "Vencido reciente 91-120d", "Vencido crítico 121d+",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. 🔴 UN DOCUMENTO POR COMPAÑÍA — LAS SEIS NUNCA SE JUNTAN EN UNA HOJA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 una compañía por hoja", () => {
  const dosEmpresas = {
    ...D25,
    total: 5579.91 + 1000,
    empresas: [
      D25.empresas[0],
      {
        empresa_key: "vistana",
        empresa_nombre: "Vistana International",
        subtotal: 1000,
        saldoSwitch: null,
        documentos: [
          { numero: "11-000000001", fecha: "2026-07-01", tipo: "Factura", monto: 1000, saldo: 1000, debito: 1000, credito: 0, dias: 70, plazoCredito: 90, numeroFiscal: null },
        ],
      },
    ],
  } as unknown as EstadoCuenta;

  it("dos compañías son al menos dos hojas, cada una con su cabeza", async () => {
    const { doc } = buildEstadoCuentaPDF(dosEmpresas, "CITY MALL PASO CANOA");
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const texto = await textoDelPdf(doc);
    // Dos «ESTADO DE CUENTA» = dos cabezas = dos hojas de compañía.
    expect((texto.match(/ESTADO DE CUENTA/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((texto.match(/Total General:/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("🩸 los totales de dos compañías NUNCA se suman en un mismo número", async () => {
    const texto = await textoDelPdf(buildEstadoCuentaPDF(dosEmpresas, "X").doc);
    expect(texto).toContain("Total General: 5,579.91");
    expect(texto).toContain("Total General: 1,000.00");
    expect(texto, "el papel juntó las compañías en un total").not.toContain("Total General: 6,579.91");
  });

  it("el código va por la fila de la compañía, no por la URL", () => {
    expect(leer("lib/pdf-estado-cuenta.ts")).toContain("data.empresas.forEach");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. 🔴 TODOS LOS DOCUMENTOS — NADA SE PLIEGA POR SER DE MENOS DE $50
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 se ven TODOS los documentos (Daniel: «En ninguno. Quiero ver todo.»)", () => {
  it("el papel dibuja los cinco, incluida la nota de $0.60", async () => {
    const texto = await textoDelPdf(buildEstadoCuentaPDF(D25, "X").doc);
    for (const n of ["11-000003121", "11-000003122", "14-000000258", "11-000003124", "14-000000259"]) {
      expect(texto, `se perdió el documento ${n}`).toContain(n);
    }
    expect(texto, "se plegó la nota chica").toContain("0.60");
  });

  it("🩸 ni el cajón del grupo ni el de Boston pliegan nada", () => {
    for (const rel of ["app/cxc/components/EstadoCuentaDrawer.tsx", "../components/cxc/BostonDocumentosDrawer.tsx"]) {
      const src = leer(rel.startsWith("..") ? rel.slice(3) : rel);
      expect(src, `${rel} volvió a plegar los documentos chicos`).not.toContain("partirDocumentos");
    }
  });

  it("…y el papel tampoco lo importa", () => {
    for (const rel of ["lib/pdf-estado-cuenta.ts", "lib/cxc/pdf-estado-cuenta-hoja.ts"]) {
      expect(leer(rel)).not.toContain("documentos-chicos");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. 🔴 EL NOMBRE DEL CLIENTE, COMO LO ESCRIBE SWITCH
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el nombre del cliente no vuelve a MAYÚSCULAS", () => {
  it("manda el de Switch, no el normalizado que le pasa la pantalla", () => {
    expect(nombreDelPapel("City Mall Paso Canoa", "CITY MALL PASO CANOA")).toBe("City Mall Paso Canoa");
  });

  it("sin nombre de Switch, capitaliza el que llegue", () => {
    expect(nombreDelPapel("", "CITY MALL PASO CANOA")).toBe("City Mall Paso Canoa");
    expect(nombreDelPapel(null, "MULTI FASHION HOLDING")).toBe("Multi Fashion Holding");
  });

  it("⚠️ las siglas no se rompen: «S.A.» sigue siendo «S.A.»", () => {
    expect(capitalizarNombre("A-AMANI, S.A.")).toBe("A-Amani, S.A.");
    expect(capitalizarNombre("CITY MALL S A")).toBe("City Mall S A");
    expect(capitalizarNombre("FASHION CITY, INC RANGUNI")).toBe("Fashion City, Inc Ranguni");
    expect(capitalizarNombre("C/C EL DOLLAR 1,2,3,4 Y 5")).toBe("C/C El Dollar 1,2,3,4 Y 5");
  });

  it("🔴 el servidor lo arma del `cliente_nombre` de Switch, no del código", () => {
    const src = leer("lib/cxc/estado-cuenta-data.ts");
    expect(src).toContain("if (!nombreSwitch && r.cliente_nombre) nombreSwitch = r.cliente_nombre.trim();");
    expect(src).toContain("clienteNombre: nombreDelPapel(nombreSwitch || ficha.nombre, codigo),");
  });

  it("el papel lo escribe bien aunque la pantalla le pase el grito", async () => {
    const texto = await textoDelPdf(buildEstadoCuentaPDF(D25, "CITY MALL PASO CANOA").doc);
    expect(texto).toContain("City Mall Paso Canoa");
    expect(texto, "el papel volvió a gritar el nombre del cliente").not.toContain("CITY MALL PASO CANOA");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. LA FORMA: LAS DIEZ COLUMNAS, LA CABEZA Y EL PIE DE SWITCH
// ═════════════════════════════════════════════════════════════════════════════

describe("la forma del papel es la de Switch", () => {
  it("las diez columnas, en el orden de Switch", () => {
    expect([...COLUMNAS]).toEqual([
      "Fecha", "Comprobante", "Comentario", "N. Interno",
      "Débitos", "Créditos", "Saldo", "Vence", "Plazo", "Días",
    ]);
  });

  it("las fechas van en DD-MM-AAAA", () => {
    expect(fechaDMY("2026-06-16")).toBe("16-06-2026");
    expect(fechaDMY(null)).toBe("");
  });

  it("🔴 «Vence» se deriva de la fecha + el plazo (Switch no la manda)", () => {
    // Comprobado contra el papel de Switch: 16-06-2026 + 90 = 14-09-2026.
    expect(fechaVence("2026-06-16", 90)).toBe("14-09-2026");
    expect(fechaVence("2026-06-23", 90)).toBe("21-09-2026");
  });

  it("⚠️ con plazo 0 la celda va VACÍA, como en Switch — no se inventa una fecha", () => {
    expect(fechaVence("2026-06-16", 0)).toBe("");
    expect(fechaVence("2026-06-16", null)).toBe("");
  });

  it("el N. Fiscal se imprime debajo de su documento", async () => {
    const texto = await textoDelPdf(buildEstadoCuentaPDF(D25, "X").doc);
    expect(texto).toContain("N. Fiscal: FE012000040254-103-278837-5400012026061600000031210010114344239888");
  });

  it("el papel trae la ficha del cliente y el «RECIBIDO CONFORME»", async () => {
    const texto = await textoDelPdf(buildEstadoCuentaPDF(D25, "X").doc);
    for (const t of [
      "ESTADO DE CUENTA", "Fecha:", "Nombre:", "Teléfono:", "Identificación:", "Email:",
      "Código:", "Dirección:", "Límite de crédito:", "Tiempo de Morosidad:",
      "1513069-1-650069", "727-7247", "Paso Canoas", "RECIBIDO CONFORME",
    ]) {
      expect(texto, `falta «${t}» en el papel`).toContain(t);
    }
  });

  it("🔴 es NUESTRO papel: el logo se DIBUJA de verdad, y va el pie de la casa", async () => {
    // No alcanza con que el archivo nombre `FG_LOGO_BASE64`: se comprueba que la
    // primera hoja pinte una imagen. Un `if (0)` delante del `addImage` deja el
    // nombre en el archivo y el papel sin logo.
    const { doc } = buildEstadoCuentaPDF(D25, "X");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
    const ops = await (await pdf.getPage(1)).getOperatorList();
    const pintaImagen = (ops.fnArray as number[]).some(
      (fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject,
    );
    expect(pintaImagen, "el papel del cliente se quedó sin el logo de Fashion Group").toBe(true);

    const texto = await textoDelPdf(doc);
    expect(texto).toContain("Confidencial");
    expect(texto).toContain("fashiongr.com");
  });

  it("la cabeza dice la empresa acreedora tal cual la registra Switch", async () => {
    const texto = await textoDelPdf(buildEstadoCuentaPDF(D25, "X").doc);
    expect(texto).toContain("FASHION WEAR, INC");
    expect(texto).toContain("Identificación: 40254-103-278837");
  });

  it("⚠️ una empresa sin ficha NO toma los datos de otra", () => {
    // 🔄 CAMBIA DE DIRECCIÓN EL 9-SEP-2026, NO SE BORRA. Decía «las CINCO que
    // todavía no dictó Daniel salen con su nombre corto y las tres líneas en
    // blanco»; ese día Daniel bajó de Switch el papel de las seis y dictó el
    // nombre legal y la identificación de cada una, así que ya no hay ninguna
    // vacía. La regla de fondo —**nadie hereda los datos de otro**— se conserva
    // y ahora se comprueba con las seis llenas, más el CONTROL de una clave que
    // no está en la lista.
    for (const key of ["vistana", "fashion_shoes", "active_shoes", "active_wear", "joystep"]) {
      const f = fichaFiscal(key, "Nombre Corto");
      expect(f.identificacion, `${key} tomó una identificación prestada`)
        .not.toBe(EMPRESA_FISCAL.fashion_wear.identificacion);
      expect(f.legal, `${key} tomó el nombre legal de Fashion Wear`)
        .not.toBe(EMPRESA_FISCAL.fashion_wear.legal);
    }
    // CONTROL (la dirección original): una clave que ni existe en la lista
    // sigue sin heredar nada — sale con el nombre de la pantalla y en blanco.
    // 🔄 El ejemplo pasó de Boston a Multifashion ese mismo 9-sep-2026, más
    // tarde: Daniel bajó también el papel de Confecciones Boston y dictó sus
    // cuatro líneas, así que Boston YA tiene ficha (ver el bloque de abajo). El
    // control se conserva con la empresa que sigue sin tenerla.
    const rara = fichaFiscal("american_classic", "Multifashion");
    expect(rara.legal).toBe("Multifashion");
    expect(rara.identificacion).toBe("");
    expect(rara.telefono).toBe("");
    expect(rara.correo).toBe("");

    // Y Boston, que sí la tiene, no toma nada de una del grupo — ni su correo.
    const boston = fichaFiscal("confecciones_boston", "Confecciones Boston");
    expect(boston.legal).toBe("CONFECCIONES BOSTON S.A");
    expect(boston.identificacion).not.toBe(EMPRESA_FISCAL.fashion_wear.identificacion);
    expect(boston.correo).not.toContain("fashiongr.com");
  });

  it("⚠️ la columna Comentario va vacía: el API de Switch no lo manda", () => {
    const { filas } = filasDelPapel(D25.empresas[0].documentos);
    expect(filas.every((f) => f.comentario === "")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. 🔴 EL CUADRE CONTRA SWITCH SE DICE, NO SE ESCONDE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el cuadre contra Switch", () => {
  it("cuando no coincide, hay aviso con los dos números", () => {
    const c = cuadrarConSwitch(130699.36, 128000);
    expect(c.cuadra).toBe(false);
    expect(c.aviso).toContain("128,000.00");
    expect(c.aviso).toContain("130,699.36");
  });

  it("un centavo es redondeo de Switch, no una avería", () => {
    expect(cuadrarConSwitch(130699.36, 130699.35).cuadra).toBe(true);
  });

  it("⚠️ sin dato de Switch NO se afirma nada", () => {
    expect(cuadrarConSwitch(130699.36, null)).toEqual({ cuadra: true, diferencia: 0, aviso: null });
  });

  it("🔴 la pantalla lo DICE — no se puede callar", () => {
    const src = leer("app/cxc/components/EstadoCuentaDrawer.tsx");
    expect(src, "el cajón dejó de comparar contra Switch").toContain("cuadrarConSwitch");
    expect(src, "el aviso del cuadre dejó de dibujarse").toContain("cuadre.aviso");
    // La guarda exacta: se calla SOLO cuando cuadra. Un `return null` suelto
    // esconde el aviso sin que ningún otro candado se entere.
    expect(src).toContain("if (cuadre.cuadra || !cuadre.aviso) return null;");
    // Y la hoja «Cobrar» lo dice también, que es el último momento para parar.
    const hoja = leer("app/cxc/components/HojaCobrar.tsx");
    expect(hoja).toContain("cuadrarConSwitch");
    expect(hoja).toContain("{cuadre && !cuadre.cuadra && cuadre.aviso && (");
  });

  it("el lector trae el saldo que manda Switch, y falla ABIERTO sin la DDL", () => {
    const src = leer("lib/cxc/estado-cuenta-data.ts");
    expect(src).toContain('from("switch_estadocuenta_saldo")');
    expect(src).toContain("if (error || !data) return fuera;");
  });

  it("el sync dejó de tirar `saldoTotal`", () => {
    const src = leer("lib/switch-api/sync-empresa.ts");
    expect(src).toContain("await guardarSaldosSwitch(empresaKey, saldosSwitch);");
    expect(src).toContain("ec?.saldoTotal");
    expect(src).toContain('.from("switch_estadocuenta_saldo")');
  });

  it("⚠️ el cuadre NO se le cuenta al cliente: no va en el papel", () => {
    for (const rel of ["lib/pdf-estado-cuenta.ts", "lib/cxc/pdf-estado-cuenta-hoja.ts"]) {
      expect(leer(rel), `${rel} le muestra al cliente nuestro desfase`).not.toContain("cuadrarConSwitch");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. EL PAPEL DEL LOTE ES EL MISMO PAPEL
// ═════════════════════════════════════════════════════════════════════════════

describe("«Cobrar a los N» usa la MISMA hoja", () => {
  it("cada cliente entra por la misma función, y al final va el resumen", async () => {
    const otro = { ...D25, codigo: "D-29", clienteNombre: "City Mall David", total: 5579.91 } as unknown as EstadoCuenta;
    const { doc } = buildEstadoCuentaLotePDF([
      { data: D25, nombre: "CITY MALL PASO CANOA" },
      { data: otro, nombre: "CITY MALL DAVID" },
    ]);
    const texto = await textoDelPdf(doc);
    expect(texto).toContain("Resumen");
    expect(texto).toContain("City Mall Paso Canoa");
    expect(texto).toContain("City Mall David");
    expect(texto).toContain("Total General: 11,159.82");
    // La forma de Switch también acá: las diez columnas y el RECIBIDO CONFORME.
    for (const th of COLUMNAS) expect(texto).toContain(th);
    expect(texto).toContain("RECIBIDO CONFORME");
  });

  it("con UN solo cliente no hay hoja de resumen (sería el mismo número dos veces)", async () => {
    const texto = await textoDelPdf(buildEstadoCuentaLotePDF([{ data: D25, nombre: "X" }]).doc);
    expect(texto).not.toContain("Resumen");
  });

  it("los dos papeles llaman a `dibujarCliente`, no a dos dibujos distintos", () => {
    const src = leer("lib/pdf-estado-cuenta.ts");
    expect((src.match(/dibujarCliente\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. ⚠️ LOS NÚMEROS NO SE MOVIERON
// ═════════════════════════════════════════════════════════════════════════════

describe("⚠️ esto es FORMA: los números son los mismos", () => {
  it("«débito − crédito» de cada fila es el saldo firmado de siempre", () => {
    // Medido sobre los 943 documentos abiertos de las 6 empresas: coinciden.
    for (const d of D25.empresas[0].documentos) {
      expect(Math.round((d.debito - d.credito) * 100) / 100).toBe(d.saldo);
    }
  });

  it("el total del papel es el subtotal que ya calculaba el sistema", () => {
    expect(filasDelPapel(D25.empresas[0].documentos).total).toBe(D25.empresas[0].subtotal);
  });

  it("el dinero se escribe con dos decimales y coma de miles", () => {
    expect(monto(130699.36)).toBe("130,699.36");
    expect(monto(0)).toBe("0.00");
  });
});

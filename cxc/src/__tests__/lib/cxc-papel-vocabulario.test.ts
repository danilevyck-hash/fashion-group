// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DE CXC HABLA EL IDIOMA DE LA PANTALLA (12-ago-2026)
//
// Tres superficies dicen los MISMOS números: la pantalla de Cuentas por Cobrar
// (`/admin`), el correo de estado de cuenta y los papeles que salen de ahí (el
// PDF que se le adjunta al cliente y los dos reportes de "Exportar"). Cada una
// se escribía sus propios rótulos, así que se separaron:
//
//   · el tramo viejo llegó a tener CUATRO redacciones — "121d+" (pantalla),
//     "+120d" (tarjeta de celular), "Vencido crítico +120d" (tabla del PDF) y
//     "Vencido +121d" (caja KPI del MISMO PDF);
//   · "Corriente" y "Vigilancia" solo existían en ese PDF, en ningún otro lado;
//   · el mismo número se llamaba "Total pendiente" en pantalla, "Total CXC" en
//     una caja del PDF y "TOTAL ADEUDADO" en el papel que recibe el cliente.
//
// 🔴 LO QUE ESTE ARCHIVO EXISTE PARA CAZAR, y es lo que más importa: que vuelva
// la palabra **"vencido"** a algo que LEE EL CLIENTE. `dias` es la EDAD del
// documento desde su emisión, NO días de mora: no sabemos el plazo de crédito de
// cada factura, así que llamarle "vencido" a un documento de 121 días es afirmar
// algo que el dato no dice. La regla ya estaba escrita en
// `lib/cxc/estado-cuenta-email.ts` y el correo la respetaba — el PDF adjunto y
// el mensaje de "Copiar mensaje" (WhatsApp) NO.
//
// ⚠️ ACÁ NO SE MIDE NINGÚN NÚMERO. Los tramos siguen siendo 0-90 / 91-120 / 121+
// y las cifras salen de los mismos campos de siempre. El último bloque lo fija.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { AGING } from "@/lib/cxc-aging";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import { buildResumenHtml } from "@/lib/cxc/estado-cuenta-email";
import type { EstadoCuenta } from "@/app/cxc/components/EstadoCuentaDrawer";

const raiz = join(__dirname, "..", "..");

/** Lee un archivo del repo SIN comentarios: cada poda deja escrito POR QUÉ se
 *  fue un texto, y ese comentario haría fallar al candado que dice "ya no está". */
function leer(rel: string): string {
  return readFileSync(join(raiz, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

const plano = (s: string) => s.replace(/\s+/g, " ");

// ── El PDF de verdad: se genera y se le lee el texto ─────────────────────────

async function textoDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += (content.items as any[]).map((it) => it.str).join(" ") + "\n";
  }
  return texto;
}

/** Un estado de cuenta con documentos de los TRES tramos (28, 100 y 210 días).
 *  🔄 9-sep-2026: gana `debito`/`credito` y la ficha del cliente porque el papel
 *  pasó a tener la forma de Switch — los montos que imprime salen de esas dos
 *  columnas, que ya venían de Switch y nadie miraba. */
const ESTADO: EstadoCuenta = {
  codigo: "D-108",
  clienteNombre: "American Classics Store",
  cliente: {
    nombre: "American Classics Store",
    identificacion: "155-1-2",
    telefono: "727-0000",
    email: "cliente@ejemplo.com",
    direccion: "Vía España",
    limiteCredito: 0,
    tiempoMorosidad: 0,
  },
  total: 3_500,
  empresas: [
    {
      empresa_key: "vistana",
      empresa_nombre: "Vistana International",
      subtotal: 3_500,
      saldoSwitch: null,
      documentos: [
        { numero: "FE-0001", tipo: "Factura", fecha: "2026-07-15", dias: 28, monto: 1_000, saldo: 1_000, debito: 1_000, credito: 0, plazoCredito: 90, numeroFiscal: null },
        { numero: "FE-0002", tipo: "Factura", fecha: "2026-05-04", dias: 100, monto: 1_500, saldo: 1_500, debito: 1_500, credito: 0, plazoCredito: 90, numeroFiscal: null },
        { numero: "FE-0003", tipo: "Factura", fecha: "2026-01-14", dias: 210, monto: 1_000, saldo: 1_000, debito: 1_000, credito: 0, plazoCredito: 0, numeroFiscal: null },
      ],
    },
  ],
} as unknown as EstadoCuenta;

// ─────────────────────────────────────────────────────────────────────────────
// 1. 🔴 LO QUE LEE EL CLIENTE NUNCA DICE "VENCIDO"
// ─────────────────────────────────────────────────────────────────────────────

const PROHIBIDO = /vencid[oa]s?/i;

describe("🔴 la palabra 'vencido' no llega a lo que ve el cliente", () => {
  it("el PDF de estado de cuenta — el papel que se adjunta al correo", async () => {
    const { doc } = buildEstadoCuentaPDF(ESTADO, "American Classics Store");
    const texto = await textoDelPdf(doc);
    expect(texto, "el PDF del cliente dice 'vencido'").not.toMatch(PROHIBIDO);
  });

  it("la tabla del correo de estado de cuenta", () => {
    const html = buildResumenHtml(ESTADO.empresas, "American Classics Store");
    expect(html).not.toMatch(PROHIBIDO);
    // …y sigue rotulando por ANTIGÜEDAD, que es lo que reemplaza a "vencido".
    expect(html).toContain("Más de 90 días");
  });

  it("🩸 el mensaje de 'Copiar mensaje'/WhatsApp — decía VENCIDO CRITICO en mayúsculas", () => {
    // Es texto que Daniel pega y el cliente lee. Se rotula por antigüedad,
    // igual que la columna del correo aprobado.
    const fuente = plano(leer("app/cxc/page.tsx"));
    // 🔄 8-sep-2026: el corte de abajo era `indexOf("function exportCSV")`, y
    // ese CSV se retiró (Daniel: «en ningún lado quiero exportar CSV, solo
    // Excel»). Un `indexOf` que devuelve -1 recorta el archivo entero menos un
    // carácter y el candado pasa MIRANDO OTRA COSA: ahora el corte se exige.
    const desde = fuente.indexOf("function buildEmailBody");
    // El corte es el primer código DESPUÉS de los helpers: `plano()` borra los
    // comentarios, así que no puede ser un rótulo comentado.
    const hasta = fuente.indexOf("export default function AdminDashboard");
    expect(desde, "se movió `buildEmailBody`").toBeGreaterThan(-1);
    expect(hasta, "se movió el corte del bloque de helpers").toBeGreaterThan(desde);
    const cuerpo = fuente.slice(desde, hasta);
    expect(cuerpo, "el mensaje al cliente volvió a decir 'vencido'").not.toMatch(PROHIBIDO);
    expect(cuerpo).toContain("Hasta 90 días");
    expect(cuerpo).toContain("De 91 a 120 días");
    expect(cuerpo).toContain("Más de 120 días");
  });

  it("…y las tres líneas siguen saliendo de current / watch / overdue (ningún tramo se movió)", () => {
    const cuerpo = plano(leer("app/cxc/page.tsx"));
    expect(cuerpo).toContain("if (client.current > 0) lines.push(`Hasta 90 días: $${fmt(client.current)}`)");
    expect(cuerpo).toContain("if (client.watch > 0) lines.push(`De 91 a 120 días: $${fmt(client.watch)}`)");
    expect(cuerpo).toContain("if (client.overdue > 0) lines.push(`Más de 120 días: $${fmt(client.overdue)}`)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El papel del cliente llama "Total" a lo que la pantalla llama "Total"
// ─────────────────────────────────────────────────────────────────────────────

describe("el PDF del cliente y la pantalla nombran igual al mismo número", () => {
  // 🔄 9-sep-2026 — CAMBIA DE DIRECCIÓN, NO DE SENTIDO. El papel pasó a tener la
  // forma de Switch (Daniel: «tal cual como sale en Switch… mismos nombres»), y
  // en ese papel la línea final se llama «Total General:». Lo que este candado
  // siempre quiso decir es que NO vuelva «TOTAL ADEUDADO», el grito que solo
  // existía acá — y eso se sigue exigiendo, con el CONTROL de que el número
  // sigue rotulado con la palabra «Total».
  it("la línea final dice 'Total General', nunca 'TOTAL ADEUDADO'", async () => {
    const { doc } = buildEstadoCuentaPDF(ESTADO, "American Classics Store");
    const texto = await textoDelPdf(doc);
    expect(texto).not.toContain("ADEUDADO");
    expect(texto).toContain("Total General");
  });

  it("el pie del drawer, que es la referencia, sigue diciendo 'Total'", () => {
    expect(plano(leer("app/cxc/components/EstadoCuentaDrawer.tsx"))).toContain(">Total<");
  });

  it("la fila de total del correo, que viaja con ese PDF, también dice 'Total'", () => {
    expect(buildResumenHtml(ESTADO.empresas, "X")).toContain(">Total</td>");
  });

  // 🔄 9-sep-2026 — CAMBIA DE DIRECCIÓN CON SU CONTROL. Los encabezados SÍ
  // cambiaron, y a propósito: son los DIEZ de Switch. Daniel, textual: *«el
  // sistema debe de mandar el estado de cuenta tal cual como sale en Switch…
  // mismos números, mismos nombres, mismo todo!!!!»*. El cliente ya conoce
  // estos, que son los del papel que recibe de nosotros por el otro lado.
  it("los encabezados del papel son los DIEZ de Switch", async () => {
    const { doc } = buildEstadoCuentaPDF(ESTADO, "American Classics Store");
    const texto = await textoDelPdf(doc);
    for (const th of ["Fecha", "Comprobante", "Comentario", "N. Interno", "Débitos", "Créditos", "Saldo", "Vence", "Plazo", "Días"]) {
      expect(texto, `se perdió el encabezado "${th}" del papel`).toContain(th);
    }
    // CONTROL al revés: los seis viejos, que solo existían acá, no vuelven.
    expect(texto, "volvió el encabezado propio «Subtotal»").not.toContain("Subtotal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Los reportes de "Exportar" DERIVAN sus rótulos de la pantalla
// ─────────────────────────────────────────────────────────────────────────────

describe("los reportes de Exportar no se escriben sus propios rótulos", () => {
  const PDF = "lib/pdf-cxc.ts";

  it("los tramos se derivan de `cxc-aging`, la misma fuente que rotula la pantalla", () => {
    const fuente = plano(leer(PDF));
    expect(fuente).toContain('from "@/lib/cxc-aging"');
    // 🔑 EL NOMBRE DEL TRAMO SE MUDÓ A `cxc-aging` COMO `tramoLabel`. Antes el
    // papel llevaba su propia lambda —correcta, pero PROPIA— mientras las dos
    // pantallas rotulaban distinto: el escritorio solo el rango ("0-90d") y el
    // celular solo el nombre ("Por vencer"), con su lista copiada a mano. Las
    // TRES superficies llaman ahora a la misma función, así que no pueden
    // volver a separarse. El candado deja de exigir la copia local y exige la
    // derivación, que es lo que siempre quiso decir.
    expect(fuente).toContain("const tramo = tramoLabel;");
    expect(fuente).not.toMatch(/const tramo = \(k: AgingKey\) =>/);
    // 🔄 8-sep-2026 — EL CANDADO CAMBIA DE DIRECCIÓN, NO DE SENTIDO. Los dos
    // papeles («Resumen» y «Detallado») se fusionaron en las DOS descargas de
    // Daniel («Total por cliente» y «Detallado por compañía»), con la misma
    // cabecera y el mismo pie; con eso se fueron las cuatro cajas KPI y la barra
    // de porcentajes, que eran los otros dos consumidores del rótulo. Lo que se
    // sigue exigiendo es lo que siempre quiso decir: que el nombre del tramo
    // SALGA de `cxc-aging` y que los ENCABEZADOS de las dos tablas lo usen.
    const encabezados = fuente.match(/tramo\("current"\), tramo\("watch"\), tramo\("overdue"\)/g) ?? [];
    expect(encabezados.length, "los encabezados dejaron de derivar el tramo").toBe(2);
    // CONTROL al revés: ningún rótulo de tramo escrito a mano en el papel.
    for (const k of ["Por vencer", "Vencido reciente", "Vencido crítico"]) {
      expect(fuente, `"${k}" volvió escrito a mano al papel`).not.toContain(`"${k}"`);
    }
  });

  it("no vuelven las palabras que solo existían en ese papel", () => {
    const fuente = plano(leer(PDF));
    for (const palabra of ["Corriente", "Vigilancia", "Total CXC", "Reporte CXC", "+121d", "+120d", '"TOTAL"']) {
      expect(fuente, `"${palabra}" volvió a ${PDF}`).not.toContain(palabra);
    }
  });

  it("el encabezado dice qué es y de qué empresa, y la fecha", () => {
    // 🔄 8-sep-2026: el encabezado pasó a ser el del brandbook de la casa —logo,
    // debajo qué es y de qué empresa, y a la derecha la fecha y `Hoja N de M`—,
    // así que el texto ya no se arma en este archivo: viene resuelto de
    // `subtituloDelPapel()`, que lo comparten el PDF y el título del Excel. Lo
    // que se exige es que la fecha salga de `fmtDate` (la del sistema) y que la
    // sigla no vuelva.
    const fuente = plano(leer(PDF));
    expect(fuente).toContain("doc.text(fmtDate(hoy)");
    expect(fuente).toContain("Hoja ${i} de ${hojas}");
    expect(fuente).not.toContain("Reporte CXC");
  });

  it("'aging' no vuelve al menú que describe estos papeles", () => {
    // Jerga en inglés en la pantalla de una secretaria panameña.
    const fuente = plano(leer("app/cxc/page.tsx"));
    expect(fuente).not.toMatch(/>[^<]*\baging\b[^<]*</i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ⚠️ ESTO FUE VOCABULARIO: NINGÚN TRAMO NI NINGÚN NÚMERO SE MOVIÓ
// ─────────────────────────────────────────────────────────────────────────────

describe("⚠️ los tramos y las cifras quedaron intactos", () => {
  it("los tres cortes siguen siendo 0-90 / 91-120 / 121+", () => {
    expect(AGING.current.colLabel).toBe("0-90d");
    expect(AGING.watch.colLabel).toBe("91-120d");
    expect(AGING.overdue.colLabel).toBe("121d+");
  });

  it("los totales del reporte siguen saliendo de current / watch / overdue", () => {
    // 🔄 8-sep-2026 — CAMBIA DE DIRECCIÓN CON SU CONTROL. Las cuatro cajas KPI
    // del «Resumen» se retiraron al fusionar los dos papeles; la suma que
    // hacían vive ahora en la fila de Total, y la arma `totalDeLasFilas()` sobre
    // las filas que produce `filasTotalPorCliente()` — que es donde `current`,
    // `watch` y `overdue` se leen del cliente. Un solo lugar en vez de dos.
    const papel = plano(leer("lib/pdf-cxc.ts"));
    expect(papel).toContain("totalDeLasFilas(filas)");
    expect(papel).toContain("totalDeLasFilas(bloques)");
    const decide = plano(leer("lib/cxc/descargas.ts"));
    expect(decide).toContain("t0: c.current");
    expect(decide).toContain("t1: c.watch");
    expect(decide).toContain("t2: c.overdue");
  });

  it("el corte de 90 días del correo no se tocó (es EDAD, no mora)", () => {
    const fuente = plano(leer("lib/cxc/estado-cuenta-email.ts"));
    expect(fuente).toContain("(d.dias ?? 0) > 90 ? s + d.saldo : s");
  });

  // 🔄 9-sep-2026 — CAMBIA DE DIRECCIÓN CON SU CONTROL. Los MONTOS son los
  // mismos; lo que cambió es que el papel de Switch los escribe SIN el signo de
  // dólar. Se sigue exigiendo que las tres cifras estén y que el total sea la
  // suma — que es lo que este candado existe para cazar.
  it("el PDF del cliente sigue mostrando los mismos montos", async () => {
    const { doc } = buildEstadoCuentaPDF(ESTADO, "American Classics Store");
    const texto = (await textoDelPdf(doc)).replace(/\s+/g, " ");
    for (const monto of ["1,000.00", "1,500.00", "3,500.00"]) {
      expect(texto, `se perdió ${monto} del papel`).toContain(monto);
    }
    expect(texto, "el total dejó de ser la suma").toContain("Total General: 3,500.00");
  });
});

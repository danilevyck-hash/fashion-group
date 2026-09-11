/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL CORREO AL PROVEEDOR LLEVA ADJUNTOS, Y EL EXCEL DEJA DE LLEVAR
 * LINKS (11-sep-2026).
 *
 * Daniel, textual: *«la factura y la foto del reclamo que sale por correo en el
 * excel, sale por medio de un link… se puede adjuntar directo al correo y
 * quitarlo del excel? Va»*.
 *
 * Lo que protege cada bloque:
 *   1. El Excel del CORREO no puede contener un solo `http`. Si vuelve a
 *      llevarlos, el proveedor tiene dos caminos al mismo archivo y uno de
 *      ellos es una URL firmada de un año a nuestro bucket privado.
 *   2. El Excel que se DESCARGA sí conserva sus links (CONTROL): sin ellos
 *      Andrea se queda sin la factura y sin las fotos.
 *   3. El tope del correo es el del correo YA CODIFICADO: base64 crece 4/3, y
 *      pasarse tira el correo ENTERO, adjuntos y Excel incluidos.
 *   4. Lo que no cabe se dice. Y el orden de recorte es factura antes que foto.
 *
 * Medido contra producción el 11-sep-2026: 4 facturas (4,57 MB, la mayor
 * 2,13 MB) y 14 fotos (2,03 MB, la mayor 0,25 MB) en los 33 reclamos vivos —
 * o sea que hoy el tope no se toca ni de lejos. El reparto existe para el día
 * en que Andrea suba seis fotos de teléfono de 6 MB cada una.
 *
 * Los barridos BORRAN LOS COMENTARIOS PRIMERO: este repo ya pagó varias veces
 * el candado que se cumple con su propia explicación.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import XLSX from "xlsx-js-style";

// excel-bulk importa supabase-server (crea el cliente al cargar) — se mockea.
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: false,
  supabaseServer: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}` })),
          error: null,
        }),
      }),
    },
  },
}));

import { buildBulkReclamosExcel } from "@/lib/reclamos/excel-bulk";
import { buildReclamoSheet } from "@/lib/excel-reclamo";
import {
  avisoDeAdjuntos,
  avisoDeOmitidos,
  contarPorClase,
  extensionDe,
  JPEG_QUALITY,
  MAX_DIM,
  nombreFactura,
  nombreFoto,
  nombreSeguro,
  ordenDeAdjuntos,
  repartirAdjuntos,
  TOPE_CRUDO_BYTES,
  TOPE_RESEND_BYTES,
  type CandidatoAdjunto,
} from "@/lib/reclamos/adjuntos-plan";

const RAIZ = join(__dirname, "..", "..", "..");
const sinComentarios = (ruta: string): string =>
  readFileSync(join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

beforeAll(() => {
  // reclamoGaleriaUrl (link «Ver fotos») firma con HMAC — lee el secret al llamar.
  process.env.SESSION_SECRET = "test-secret-adjuntos";
});

const items = [{ referencia: "REF-1", descripcion: "Zapato", talla: "42", cantidad: 2, precio_unitario: 10.5, motivo: "Dañado" }];
const fotos = [{ storage_path: "reclamos/r1/foto1.jpg" }];
const rec1 = {
  id: "11111111-2222-3333-4444-555555555555",
  nro_reclamo: "REC-2026-0026",
  empresa: "Fashion Wear",
  proveedor: "Proveedor X",
  nro_factura: "F-100",
  fecha_reclamo: "2026-06-01",
  estado: "Creado",
  factura_pdf_path: "r1/factura.pdf",
  reclamo_items: items,
  reclamo_fotos: fotos,
};
const rec2 = {
  ...rec1,
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  nro_reclamo: "REC-2026-0027",
  factura_pdf_path: "r2/factura.pdf",
  reclamo_fotos: [{ storage_path: "reclamos/r2/foto1.png" }],
};

/** Todo el texto de un libro Excel, hoja por hoja, celdas y targets de links. */
function textoDelLibro(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const trozos: string[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    for (const k of Object.keys(ws)) {
      if (k.startsWith("!")) continue;
      const celda = ws[k] as { v?: unknown; l?: { Target?: string } };
      if (celda.v !== undefined) trozos.push(String(celda.v));
      if (celda.l?.Target) trozos.push(celda.l.Target);
    }
  }
  return trozos.join("\n");
}

const cand = (nombre: string, clase: CandidatoAdjunto["clase"], bytes: number, nro = "REC-1"): CandidatoAdjunto => ({
  nombre,
  clase,
  nroReclamo: nro,
  contenido: Buffer.alloc(bytes, 1),
});

// 🔄 11-sep-2026 (tarde): Daniel cerró la decisión con un *«sin links»* que vale
// para las DOS salidas. Ya no existe un Excel con links: se fue la opción
// `conLinks`, y con ella la galería pública entera. Este bloque pasó de cubrir
// «el Excel del correo» a cubrir EL Excel, y el CONTROL de abajo cambió de
// dirección con su nota. Ningún caso se borró.
describe("(1) el Excel NO lleva ni un link, ni el del correo ni el de la descarga", () => {
  it("el libro entero no contiene `http`", async () => {
    const buf = await buildBulkReclamosExcel(
      [rec1, rec2] as unknown as Parameters<typeof buildBulkReclamosExcel>[0],
      "Fashion Wear",
      null,
    );
    expect(textoDelLibro(buf)).not.toMatch(/http/i);
  });

  it("el Resumen no tiene las DOS columnas de links y conserva «# Fotos»", async () => {
    const buf = await buildBulkReclamosExcel(
      [rec1, rec2] as unknown as Parameters<typeof buildBulkReclamosExcel>[0],
      "Fashion Wear",
      null,
    );
    const texto = textoDelLibro(buf);
    expect(texto).toContain("# Fotos");
    expect(texto).not.toContain("Factura PDF");
    expect(texto).not.toContain("Ver factura");
    expect(texto).not.toContain("Ver fotos");
  });

  it("la hoja del reclamo no dibuja «Archivos y evidencia»", () => {
    const ws = buildReclamoSheet(
      { ...rec1, factura_pdf_url: "https://signed.example/r1/factura.pdf" },
      items as unknown as Record<string, unknown>[],
      fotos,
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "REC");
    const texto = textoDelLibro(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
    expect(texto).not.toContain("ARCHIVOS Y EVIDENCIA");
    expect(texto).not.toMatch(/http/i);
  });

  it("YA NO EXISTE una forma de pedir el Excel CON links", () => {
    // La opción `conLinks` se retiró: un Excel con links no se puede armar ni
    // queriendo. Antes esto exigía que la ruta del correo pasara
    // `conLinks: false`; ahora exige que esa perilla no vuelva a existir.
    for (const ruta of [
      "src/lib/excel-reclamo.ts",
      "src/lib/reclamos/excel-bulk.ts",
      "src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts",
    ]) {
      expect(sinComentarios(ruta), `${ruta} volvió a tener la perilla`).not.toContain("conLinks");
    }
  });

  it("ningún generador de Excel cita la galería ni firma una URL de factura", () => {
    for (const ruta of [
      "src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts",
      "src/app/api/reclamos/proveedor/[empresa]/export-zip/route.ts",
      "src/app/api/reclamos/proveedor/[empresa]/export-excel/route.ts",
      "src/app/api/reclamos/[id]/excel/route.ts",
      "src/app/api/reclamos/export-excel/route.ts",
      "src/lib/excel-reclamo.ts",
      "src/lib/reclamos/excel-bulk.ts",
    ]) {
      const src = sinComentarios(ruta);
      expect(src, `${ruta} cita la galería`).not.toContain("reclamoGaleriaUrl");
      expect(src, `${ruta} firma la factura por un año`).not.toContain("adjuntarFacturaUrls");
      expect(src).not.toContain("Ver factura");
      expect(src).not.toContain("Ver fotos");
    }
  });
});

/* 🔄 11-sep-2026 (tarde) — ESTE BLOQUE CAMBIÓ DE DIRECCIÓN, CON NOTA Y SIN
 * BORRARSE. Decía «CONTROL — el Excel que se DESCARGA conserva sus links», y
 * era cierto por la mañana: la factura y las fotos solo se podían alcanzar por
 * ahí. Daniel lo cerró de otra forma —*«sin links»*— y con la factura bajándose
 * desde «Descargar › Factura del proveedor» y las fotos a la vista en la página
 * del reclamo, el link dejó de ser el único camino y pasó a ser el único
 * riesgo. Lo que se exige ahora es lo contrario, y por eso está escrito acá y
 * no borrado: el Excel de la DESCARGA tampoco lleva links. */
describe("(2) el Excel que se DESCARGA tampoco lleva links", () => {
  it("el libro de la descarga no contiene `http` ni nombra la galería", async () => {
    const buf = await buildBulkReclamosExcel(
      [rec1, rec2] as unknown as Parameters<typeof buildBulkReclamosExcel>[0],
      "Fashion Wear",
      null,
    );
    const texto = textoDelLibro(buf);
    expect(texto).not.toMatch(/http/i);
    expect(texto).not.toContain("Ver factura");
    expect(texto).not.toContain("Ver fotos");
    expect(texto).not.toMatch(/\/reclamos\/galeria\//);
  });

  it("LA GALERÍA PÚBLICA SE RETIRÓ ENTERA: página, vista, token y su exención", () => {
    for (const rel of [
      "src/app/reclamos/galeria/[id]/page.tsx",
      "src/app/reclamos/galeria/[id]/GaleriaView.tsx",
      "src/lib/reclamos/galeria.ts",
      "src/lib/reclamos/gallery-token.ts",
    ]) {
      expect(existsSync(join(RAIZ, rel)), `${rel} volvió`).toBe(false);
    }
    // Y el middleware ya no la deja pasar sin sesión. El comentario que cuenta
    // por qué se fue SÍ nombra la ruta, así que se borra antes de barrer.
    const mw = sinComentarios("src/middleware.ts");
    expect(mw).not.toContain("/reclamos/galeria/");
  });

  it("nadie en el repo firma ya un token de galería de reclamo", () => {
    // `git grep -l` sale con código 1 cuando NO encuentra nada, y execFileSync
    // lo convierte en excepción: ese es el caso bueno. Cualquier otra cosa —una
    // salida con archivos, o un error que no sea «no encontré»— es el candado
    // rojo. Se excluye este propio archivo, que nombra los símbolos para
    // contar que se fueron.
    let archivos = "";
    try {
      archivos = execFileSync(
        "git",
        ["grep", "-l", "-e", "reclamoGaleriaUrl", "-e", "signReclamoGalleryToken", "--", "src"],
        { cwd: RAIZ, encoding: "utf8" },
      ).trim();
    } catch (err) {
      const e = err as { status?: number };
      if (e.status !== 1) throw err;
    }
    const restantes = archivos
      .split("\n")
      .filter((f) => f && !f.endsWith("reclamos-correo-adjuntos.test.ts"));
    expect(restantes).toEqual([]);
  });
});

describe("(3) el tope es el del correo ya codificado", () => {
  it("Resend acepta 40 MB, y el presupuesto crudo es 3/4 de eso (base64 crece 4/3)", () => {
    expect(TOPE_RESEND_BYTES).toBe(40 * 1024 * 1024);
    expect(TOPE_CRUDO_BYTES).toBe(Math.floor((TOPE_RESEND_BYTES * 3) / 4));
    // Si alguien iguala los dos, un correo lleno rebota entero: el candado lo ve.
    expect(TOPE_CRUDO_BYTES).toBeLessThan(TOPE_RESEND_BYTES);
  });

  it("lo que entra nunca suma más que el presupuesto", () => {
    const { incluidos } = repartirAdjuntos(
      [cand("a.pdf", "factura", 700), cand("b.jpg", "foto", 400), cand("c.jpg", "foto", 400)],
      1000,
    );
    const total = incluidos.reduce((s, a) => s + a.contenido.length, 0);
    expect(total).toBeLessThanOrEqual(1000);
  });

  it("las fotos se achican a 1600 px y JPEG 80 antes de viajar", () => {
    expect(MAX_DIM).toBe(1600);
    expect(JPEG_QUALITY).toBe(80);
    const io = sinComentarios("src/lib/reclamos/adjuntos.ts");
    expect(io).toContain("sharp");
    expect(io).toContain("MAX_DIM");
    expect(io).toContain("JPEG_QUALITY");
  });
});

describe("(4) el orden de recorte: el Excel, la factura, y al final las fotos", () => {
  it("el Excel va primero, después las facturas y al final las fotos", () => {
    const orden = ordenDeAdjuntos([
      cand("foto.jpg", "foto", 10),
      cand("fac.pdf", "factura", 10),
      cand("libro.xlsx", "excel", 10),
    ]).map((a) => a.clase);
    expect(orden).toEqual(["excel", "factura", "foto"]);
  });

  it("entre fotos entra primero la más liviana: así caben más, no menos", () => {
    const orden = ordenDeAdjuntos([
      cand("gorda.jpg", "foto", 900),
      cand("flaca.jpg", "foto", 100),
      cand("media.jpg", "foto", 500),
    ]).map((a) => a.nombre);
    expect(orden).toEqual(["flaca.jpg", "media.jpg", "gorda.jpg"]);
  });

  it("con el presupuesto justo, la FACTURA entra y la foto se queda fuera", () => {
    const { incluidos, omitidos } = repartirAdjuntos(
      [cand("libro.xlsx", "excel", 100), cand("fac.pdf", "factura", 800), cand("foto.jpg", "foto", 800)],
      1000,
    );
    expect(incluidos.map((a) => a.clase)).toEqual(["excel", "factura"]);
    expect(omitidos.map((a) => a.clase)).toEqual(["foto"]);
  });

  it("un archivo enorme NO deja fuera a los chicos que sí entraban", () => {
    const { incluidos } = repartirAdjuntos(
      [cand("enorme.jpg", "foto", 5000), cand("chica-1.jpg", "foto", 100), cand("chica-2.jpg", "foto", 100)],
      1000,
    );
    expect(incluidos.map((a) => a.nombre)).toEqual(["chica-1.jpg", "chica-2.jpg"]);
  });
});

describe("(5) lo que no cabe SE DICE", () => {
  it("sin omitidos no se escribe un renglón para decir que no pasó nada", () => {
    expect(avisoDeOmitidos([])).toBe("");
  });

  it("con fotos fuera, el cuerpo dice cuántas y que se pueden pedir", () => {
    const texto = avisoDeOmitidos([cand("a.jpg", "foto", 1), cand("b.jpg", "foto", 1)]);
    expect(texto).toContain("2 fotos");
    expect(texto).toContain("pídelas");
  });

  it("en singular no dice «1 fotos»", () => {
    expect(avisoDeOmitidos([cand("a.jpg", "foto", 1)])).toContain("1 foto ");
  });

  it("el aviso de lo que SÍ viaja nombra el Excel y cuenta facturas y fotos", () => {
    const texto = avisoDeAdjuntos(
      [cand("libro.xlsx", "excel", 1), cand("f.pdf", "factura", 1), cand("a.jpg", "foto", 1), cand("b.jpg", "foto", 1)],
      "Reclamos_Fashion_Wear_2026-09-11.xlsx",
    );
    expect(texto).toContain("Reclamos_Fashion_Wear_2026-09-11.xlsx");
    expect(texto).toContain("1 factura en PDF");
    expect(texto).toContain("2 fotos");
  });

  it("el aviso es texto PLANO: ninguna etiqueta HTML se cuela por el nombre del archivo", () => {
    const texto = avisoDeAdjuntos([cand("libro.xlsx", "excel", 1)], "raro<script>.xlsx");
    expect(texto).not.toContain("<strong>");
    // Lo escapa quien arma el HTML, no este módulo.
    expect(texto).toContain("raro<script>.xlsx");
    expect(sinComentarios("src/lib/reclamos/adjuntos-plan.ts")).not.toContain("<strong>");
  });

  it("contarPorClase cuenta las tres clases", () => {
    expect(contarPorClase([cand("a.xlsx", "excel", 1), cand("b.pdf", "factura", 1), cand("c.jpg", "foto", 1)])).toEqual({
      excel: 1,
      factura: 1,
      foto: 1,
    });
  });
});

describe("(6) los nombres que ve el proveedor", () => {
  it("la factura se llama «<N° de reclamo>-factura.pdf»", () => {
    expect(nombreFactura("REC-2026-0026")).toBe("REC-2026-0026-factura.pdf");
  });

  it("las fotos van numeradas desde 1, en el orden de la ficha", () => {
    expect(nombreFoto("REC-2026-0026", 1)).toBe("REC-2026-0026-foto-1.jpg");
    expect(nombreFoto("REC-2026-0026", 2, "png")).toBe("REC-2026-0026-foto-2.png");
  });

  it("un N° raro no arma una ruta ni un nombre vacío", () => {
    expect(nombreSeguro("../../etc/passwd")).toBe("etc-passwd");
    expect(nombreSeguro("")).toBe("Reclamo");
    expect(nombreFactura(null)).toBe("Reclamo-factura.pdf");
  });

  it("la extensión sale del path, y sin path es jpg", () => {
    expect(extensionDe("reclamos/r1/foto.PNG")).toBe("png");
    expect(extensionDe("reclamos/r1/foto")).toBe("jpg");
    expect(extensionDe(null)).toBe("jpg");
  });
});

describe("(7) el correo se arma con el módulo puro, no a mano", () => {
  it("la ruta usa repartirAdjuntos y no escribe su propio tope", () => {
    const ruta = sinComentarios("src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts");
    expect(ruta).toContain("repartirAdjuntos");
    expect(ruta).toContain("candidatosDeReclamos");
    // Un «40» o un «1024 * 1024» en la ruta es una segunda copia del tope.
    expect(ruta).not.toMatch(/1024\s*\*\s*1024/);
  });

  it("el correo manda los adjuntos repartidos, no solo el Excel", () => {
    const ruta = sinComentarios("src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts");
    expect(ruta).toMatch(/incluidos\.map\(/);
    expect(ruta).toContain("attachments");
  });
});

/**
 * CANDADO ANTI-COPIA del guard de montos imposibles.
 *
 * 🩸 Por qué existe: el 29-jul se encontró el MISMO cálculo escrito a mano en 13
 * lugares distintos. Cuando una regla vive en 13 copias, arreglar una arregla
 * una: las otras 12 siguen mintiendo, y nadie sabe cuál rige. Este test pone el
 * build en ROJO en las dos direcciones:
 *
 *   (a) alguien escribe la validación A MANO en otro archivo, y
 *   (b) alguien saca el guard de un sync que hoy lo tiene.
 *
 * El barrido es estático (lee los archivos), sin ejecutar los syncs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(process.cwd(), "src");

/** Los dos archivos donde la regla PUEDE vivir. Cualquier otro que la escriba falla. */
const DUENOS = ["src/lib/switch-api/monto-guard.ts", "src/lib/switch-api/monto-guard-io.ts"];

function listarFuentes(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next") continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      listarFuentes(ruta, out);
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      out.push(ruta);
    }
  }
  return out;
}

const FUENTES = listarFuentes(RAIZ).map((ruta) => ({
  rel: ruta.slice(process.cwd().length + 1),
  texto: readFileSync(ruta, "utf8"),
}));

const esDueno = (rel: string) => DUENOS.includes(rel);
const esTest = (rel: string) => rel.startsWith("src/__tests__");

describe("nadie vuelve a escribir la validación de montos a mano", () => {
  /**
   * Un umbral de plata escrito a mano: comparar una magnitud contra un literal
   * de 7 cifras o más. Es exactamente la forma que tomaría una 7ª copia.
   */
  it("ningún archivo compara Math.abs(...) contra un millón escrito a mano", () => {
    const patron = /Math\.abs\s*\([^;\n]{0,120}?\)\s*[><]=?\s*[\d][\d_]{5,}/;
    const culpables = FUENTES.filter(
      (f) => !esDueno(f.rel) && !esTest(f.rel) && patron.test(f.texto),
    ).map((f) => f.rel);
    expect(
      culpables,
      `Estos archivos escriben el guard de montos a mano. Usá particionarFilas/columnasImposibles de "@/lib/switch-api/monto-guard".`,
    ).toEqual([]);
  });

  it("los pisos del guard son literales SOLO en monto-guard.ts", () => {
    // Los pisos reales del registro: si aparecen fuera de su dueño, alguien los
    // copió en vez de importarlos.
    const pisos = ["20_000_000", "2_000_000", "1_000_000"];
    const culpables = FUENTES.filter(
      (f) =>
        !esDueno(f.rel) &&
        !esTest(f.rel) &&
        pisos.some((p) => f.texto.includes(p)) &&
        /imposible|absurdo|umbral/i.test(f.texto),
    ).map((f) => f.rel);
    expect(
      culpables,
      "Un piso del guard de montos aparece fuera de monto-guard.ts. Importalo, no lo copies.",
    ).toEqual([]);
  });

  it("el multiplicador 20× vive en un solo lugar", () => {
    const declaraciones = FUENTES.filter((f) => /MONTO_FACTOR\s*=/.test(f.texto)).map((f) => f.rel);
    expect(declaraciones).toEqual(["src/lib/switch-api/monto-guard.ts"]);
  });

  it("monto-guard.ts es PURO: no importa supabase ni Telegram (o no se puede testear)", () => {
    const puro = FUENTES.find((f) => f.rel === "src/lib/switch-api/monto-guard.ts")!;
    expect(puro.texto).not.toMatch(/^\s*import .*from ["'].*supabase/m);
    expect(puro.texto).not.toMatch(/^\s*import .*from ["'].*telegram/m);
    expect(puro.texto).not.toMatch(/^\s*import .*from ["'].*alertas/m);
  });
});

describe("ningún sync protegido puede quedarse sin el guard", () => {
  /**
   * Los archivos que ESCRIBEN una tabla de plata. Sacar el guard de cualquiera
   * de ellos deja el agujero que este PR vino a tapar.
   */
  const SYNCS_PROTEGIDOS = [
    "src/lib/switch-api/sync-empresa.ts", // switch_facturas + switch_estadocuenta + switch_costo_diario
    // 🩸 Faltaba, y costó 3 días de cartera de Boston congelada (1-3 ago 2026):
    // es el ÚNICO camino de confecciones_boston y una cifra imposible de Switch
    // reventaba el UPSERT entero con `numeric field overflow`.
    "src/lib/switch-api/sync-estadocuenta-web.ts", // switch_estadocuenta (reporte web)
    "src/lib/switch-api/sync-utilidad.ts", // switch_factura_utilidad
    "src/lib/switch-api/sync-recibos.ts", // switch_recibos
    "src/lib/switch-api/sync-proveedores.ts", // switch_proveedor_estadocuenta
    "src/lib/switch-api/sync-articulos.ts", // switch_articulo_diario
    "src/lib/switch-api/sync-catalogo.ts", // products / joybees_products / tommy_products
  ];

  it.each(SYNCS_PROTEGIDOS)("%s importa el guard compartido", (rel) => {
    const archivo = FUENTES.find((f) => f.rel === rel);
    expect(archivo, `no encontré ${rel}`).toBeTruthy();
    expect(archivo!.texto).toMatch(/from ["']\.\/monto-guard["']/);
  });

  it.each(SYNCS_PROTEGIDOS)("%s avisa cuando rechaza (no descarta en silencio)", (rel) => {
    const archivo = FUENTES.find((f) => f.rel === rel)!;
    expect(archivo.texto).toMatch(/avisarMontosImposibles/);
  });

  it("el aviso sale por 🔧 SISTEMA desde UN solo lugar", () => {
    const emisores = FUENTES.filter(
      (f) => !esTest(f.rel) && /export async function avisarMontosImposibles/.test(f.texto),
    ).map((f) => f.rel);
    expect(emisores).toEqual(["src/lib/switch-api/monto-guard-io.ts"]);

    const io = FUENTES.find((f) => f.rel === "src/lib/switch-api/monto-guard-io.ts")!;
    expect(io.texto).toMatch(/enviarSistema/);
    // Nadie llama sendTelegramAlert directo (regla del repo).
    expect(io.texto).not.toMatch(/sendTelegramAlert/);
  });

  it("el aviso pasa SIEMPRE por el anti-loop (no puede sonar todos los días)", () => {
    const io = FUENTES.find((f) => f.rel === "src/lib/switch-api/monto-guard-io.ts")!;
    // El envío tiene que estar después de consultar qué ya se avisó.
    const posAntiLoop = io.texto.indexOf("clavesPorAvisar(");
    const posEnvio = io.texto.indexOf("await enviarSistema(");
    expect(posAntiLoop).toBeGreaterThan(-1);
    expect(posEnvio).toBeGreaterThan(posAntiLoop);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boston no avisa por Telegram, pero SIGUE protegido.
//
// 🩸 Daniel, 5-ago-2026: *"en telegram no quiero noti de boston de ese estilo"*.
// Su documento 155-000000129 trae $266.541.352,00 contra un tope de $2M, el
// dato está mal EN SWITCH y él decidió no corregirlo → el aviso se repetiría
// cada semana para siempre sin que nadie actúe.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 silenciar Boston apaga el MENSAJE, no la protección", () => {
  const io = readFileSync(join(process.cwd(), "src/lib/switch-api/monto-guard-io.ts"), "utf8");
  const guard = readFileSync(join(process.cwd(), "src/lib/switch-api/monto-guard.ts"), "utf8");

  it("boston está en la lista de sin-aviso", () => {
    expect(io).toContain('SIN_AVISO_DE_MONTOS = new Set(["confecciones_boston"])');
  });

  it("el corte está en el AVISO, no en el guard", () => {
    // Si el filtro viviera en monto-guard.ts, Boston dejaría de estar PROTEGIDO
    // y la cifra imposible entraría a la base. En los comentarios sí se nombra
    // (documentan el incidente que originó el guard), así que se mira el CÓDIGO.
    const codigo = guard
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(codigo).not.toContain("confecciones_boston");
    expect(io).toContain("if (SIN_AVISO_DE_MONTOS.has(empresaKey)) return;");
  });

  it("las demás empresas SIGUEN avisando", () => {
    expect(io).not.toMatch(/SIN_AVISO_DE_MONTOS = new Set\(\[[^\]]*"vistana"/);
    expect(io).not.toMatch(/SIN_AVISO_DE_MONTOS = new Set\(\[[^\]]*"fashion_wear"/);
  });
});

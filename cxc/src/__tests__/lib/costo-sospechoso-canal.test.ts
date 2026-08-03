// ─────────────────────────────────────────────────────────────────────────────
// El aviso de COSTO SOSPECHOSO **NO SE MANDA** — por ningún canal.
//
// Daniel, 3-ago-2026: *"no quiero mensaje de costos"*. Le seguía llegando por
// confecciones_boston (el artículo "0806 AGUA MINERAL 600ML", con el costo mal
// cargado EN Switch), y no es accionable en el momento en que suena.
//
// 🩸 HISTORIA, porque explica por qué este archivo se llama "canal": el #390 lo
// mudó de 📊 NEGOCIO a 🔧 SISTEMA y le puso un anti-loop de 7 días (sin freno
// habría sido la alerta-que-suena-para-siempre). Cambiar de canal no alcanzó:
// Daniel no lo quiere en ninguno. Ahora el archivo prueba lo contrario de lo que
// probaba — que no sale por NINGÚN canal.
//
// ⚠️ LO QUE SIGUE VIVO Y NO SE PUEDE PERDER: la protección. Se sigue detectando
// el costo sospechoso, la fila se sigue guardando con costo $0 para no dañar el
// margen, y el rastro sigue quedando en `skip_details` (lo único que se conserva
// del #390) para poder auditar después sin escribirle a nadie.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  CAMPO_SKIP_COSTO,
  COSTO_DIAS_ENTRE_AVISOS,
  claveDeCosto,
  clavesPorAvisar,
  detallesDeCostoSospechoso,
} from "@/lib/switch-api/costo-sospechoso-aviso";

const sync = readFileSync(
  path.join(process.cwd(), "src/lib/switch-api/sync-articulos.ts"),
  "utf8",
);

/** El archivo sin comentarios: los comentarios SÍ nombran los canales y el
 *  mensaje viejo, y eso es correcto — documentan por qué ya no se manda. Lo que
 *  no puede volver es el CÓDIGO que envía. */
const codigo = sync
  .split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
  .join("\n");

describe("🔴 no se manda por NINGÚN canal", () => {
  it("no envía por SISTEMA", () => {
    expect(codigo).not.toContain("enviarSistema");
  });

  it("no envía por NEGOCIO", () => {
    expect(codigo).not.toContain("enviarNegocio");
  });

  it("no quedó la función que armaba el aviso", () => {
    expect(codigo).not.toContain("alertarCostosSospechosos");
  });

  it("no quedó el texto del mensaje en el código", () => {
    expect(codigo).not.toContain("⚠️ Costo sospechoso en artículos");
    expect(codigo).not.toContain("Se guardaron con costo $0 para no dañar el margen.");
  });
});

describe("🔴 pero la PROTECCIÓN sigue viva — esto es lo que no se puede perder", () => {
  it("se sigue detectando el costo sospechoso", () => {
    expect(codigo).toContain("esCostoSospechoso(");
  });

  it("la fila se sigue guardando con costo $0, no con el costo corrupto", () => {
    expect(codigo).toContain("costo_total: sospechoso ? 0 : costoTotal");
  });

  it("el conteo sigue viajando en el resultado del sync", () => {
    expect(codigo).toContain("costosSospechosos");
  });

  it("el rastro sigue quedando en skip_details (lo que se conservó del #390)", () => {
    expect(codigo).toContain("detallesDeCostoSospechoso(sospechosos)");
  });
});

// El módulo `costo-sospechoso-aviso.ts` sigue existiendo entero. De él, la parte
// que USA producción es `detallesDeCostoSospechoso` (el rastro en base); las
// piezas del anti-loop quedan disponibles por si algún día se quiere volver a
// avisar, y se siguen cubriendo acá para que no se pudran en silencio.
describe("el anti-loop queda disponible, aunque hoy nada lo use para avisar", () => {
  it("son 7 días, igual que el guard de montos", () => {
    expect(COSTO_DIAS_ENTRE_AVISOS).toBe(7);
  });

  it("la clave de una fila es fecha|codigo|tipo", () => {
    const f = { fecha: "2026-07-31", codigo: "0806", descripcion: "AGUA", tipo: "V", cantidad: 3000, costo: 100003360 };
    expect(claveDeCosto(f)).toBe("2026-07-31|0806|V");
  });

  it("una fila ya avisada NO vuelve a avisar", () => {
    expect(clavesPorAvisar(["a", "b"], ["a"])).toEqual(["b"]);
  });

  it("pero una fila NUEVA sí avisa — la otra dirección", () => {
    expect(clavesPorAvisar(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("si TODAS ya se avisaron, la lista queda vacía", () => {
    expect(clavesPorAvisar(["a"], ["a"])).toEqual([]);
  });

  it("las filas quedan registradas para que la próxima corrida recuerde", () => {
    expect(sync).toContain("detallesDeCostoSospechoso(sospechosos)");
    const d = detallesDeCostoSospechoso([
      { fecha: "2026-07-31", codigo: "0806", descripcion: "", tipo: "V", cantidad: 1, costo: 9 },
    ]);
    expect(d).toEqual([{ campo: "costo_sospechoso", secuencial: "2026-07-31|0806|V" }]);
  });

  it("no se mezcla con los descartes del guard de montos", () => {
    expect(CAMPO_SKIP_COSTO).toBe("costo_sospechoso");
    // El guard de montos usa su propia familia; acá se APENDEA, no se pisa.
    expect(sync).toContain("skipDetails = [...(skipDetails ?? []), ...detallesDeCostoSospechoso(sospechosos)]");
  });
});

describe("⚠️ el guard de montos imposibles no se tocó", () => {
  it("sigue con su propia función y su propia familia", () => {
    expect(sync).toContain("avisarMontosImposibles({");
    expect(sync).toContain('familia: "articulo_diario"');
    expect(sync).toContain('detallesDeRechazo("articulo_diario"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El aviso de COSTO SOSPECHOSO va a 🔧 SISTEMA, no a 📊 NEGOCIO.
//
// Daniel, mostrando el mensaje que le llegó al chat de negocio: *"me llego esto
// a fashion gr negocio, deberia de llegar solo a alertas"*.
//
// 🩸 Y NO PUEDE IR SIN FRENO. Mientras vivía en NEGOCIO no tenía anti-loop
// ninguno: mientras el artículo siguiera mal en Switch, avisaba en CADA corrida.
// En SISTEMA eso lo volvería la alerta-que-suena-para-siempre, que es justo lo
// que Daniel quiso cortar al fijar la lista cerrada. Por eso se le agregó el
// mismo freno del guard de montos: 7 días por fila.
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

describe("🔴 el canal, en las dos direcciones", () => {
  it("manda por SISTEMA", () => {
    expect(sync).toContain('import { enviarSistema } from "@/lib/alertas/canal"');
    const fn = sync.slice(sync.indexOf("async function alertarCostosSospechosos"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).toContain("await enviarSistema(");
  });

  it("y NO por negocio — ni el import quedó", () => {
    expect(sync).not.toContain("enviarNegocio");
  });
});

describe("el texto no se tocó: solo cambió el canal", () => {
  it("mantiene las tres frases que ve Daniel", () => {
    expect(sync).toContain("⚠️ Costo sospechoso en artículos");
    expect(sync).toContain("Se guardaron con costo $0 para no dañar el margen.");
    expect(sync).toContain(
      "Corrige el costo del artículo en Switch y relanza switch-articulos de ese día.",
    );
  });

  it("no escribe el prefijo a mano — lo pone el canal", () => {
    // Se mira el CUERPO de la función, no el archivo: los comentarios sí
    // nombran el canal y eso es correcto.
    const fn = sync.slice(sync.indexOf("async function alertarCostosSospechosos"));
    const cuerpo = fn
      .slice(0, fn.indexOf("\n}\n"))
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(cuerpo).not.toContain("🔧 SISTEMA · ");
  });
});

describe("🔴 el anti-loop, para que no suene todos los días", () => {
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

  it("si TODAS ya se avisaron, no se manda nada", () => {
    expect(clavesPorAvisar(["a"], ["a"])).toEqual([]);
    expect(sync).toContain("if (nuevas.size === 0) return;");
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

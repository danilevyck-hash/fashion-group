// Tests de scripts/lib/backup-inventario.mjs — la lógica que decide si una
// carpeta de fecha del backup es restaurable, y que `restore.mjs --list` usa
// para no mentir.
//
// El caso que motivó el módulo (medido contra el R2 real el 25-jul-2026):
// `--list --source r2` respondía "2026-07-25" a secas —se veía sano— y el
// restore moría con `404 NoSuchKey` en data/2026-07-25/meta.json, porque ese
// día solo había corrido el grupo switch. Una red de seguridad que se reporta
// sana y no lo es.
import { describe, it, expect } from "vitest";
import {
  GRUPOS_META,
  agruparKeysPorFecha,
  diagnosticarFecha,
  formatearFecha,
  problemasDe,
  elegirFechaPorDefecto,
} from "../../../scripts/lib/backup-inventario.mjs";

const metaCore = {
  format: "v2-ndjson-gz",
  datasets: [
    { file: "cheques", table: "cheques", rows: 10 },
    { file: "transportistas", table: "transportistas", rows: 4 },
  ],
};
const metaSwitch = {
  format: "v2-ndjson-gz",
  datasets: [{ file: "switch_recibos", table: "switch_recibos", rows: 37211 }],
};

const archivosDe = (...nombres: string[]) => new Set(nombres);

const COMPLETO = archivosDe(
  "meta.json",
  "meta-switch.json",
  "cheques.ndjson.gz",
  "transportistas.ndjson.gz",
  "switch_recibos.ndjson.gz",
);

describe("agruparKeysPorFecha", () => {
  it("agrupa data/<fecha>/<archivo> por fecha", () => {
    const m = agruparKeysPorFecha([
      "data/2026-07-25/meta-switch.json",
      "data/2026-07-25/switch_recibos.ndjson.gz",
      "data/2026-07-24/meta.json",
    ]);
    expect([...m.keys()].sort()).toEqual(["2026-07-24", "2026-07-25"]);
    expect([...m.get("2026-07-25")].sort()).toEqual(["meta-switch.json", "switch_recibos.ndjson.gz"]);
  });

  it("ignora las keys PLANAS heredadas (sin carpeta de fecha)", () => {
    // 57 de estas viven en el R2 real desde antes de los paths con fecha: no
    // pertenecen a ningún día y no hay meta que las respalde.
    const m = agruparKeysPorFecha([
      "data/cheques.ndjson.gz",
      "data/ventas_raw.ndjson.gz",
      "data/2026-07-25/meta.json",
    ]);
    expect([...m.keys()]).toEqual(["2026-07-25"]);
  });

  it("ignora manifest y prefijos ajenos", () => {
    expect(agruparKeysPorFecha(["manifest.json", "_storage/product-images/a.jpg"]).size).toBe(0);
  });
});

describe("diagnosticarFecha", () => {
  it("los 2 grupos con todos sus archivos → OK y completo", () => {
    const d = diagnosticarFecha("2026-07-26", COMPLETO, { core: metaCore, switch: metaSwitch });
    expect(d.estado).toBe("OK");
    expect(d.completo).toBe(true);
    expect(d.restaurable).toBe(true);
    expect(d.grupos).toEqual(["core", "switch"]);
    expect(d.datasets).toBe(3);
    expect(d.datasetsPorGrupo).toEqual({ core: 2, switch: 1 });
    expect(problemasDe(d)).toEqual([]);
  });

  it("EL CASO REAL 25-jul: solo el grupo switch → PARCIAL, restaurable pero NO completo", () => {
    const archivos = archivosDe("meta-switch.json", "switch_recibos.ndjson.gz");
    const d = diagnosticarFecha("2026-07-25", archivos, { switch: metaSwitch });
    expect(d.estado).toBe("PARCIAL");
    expect(d.completo).toBe(false);
    expect(d.restaurable).toBe(true); // los datasets de switch SÍ se pueden restaurar
    expect(d.grupos).toEqual(["switch"]);
    expect(d.faltan).toEqual([{ grupo: "core", metaFile: "meta.json", motivo: "sin meta" }]);
    expect(formatearFecha(d)).toContain("PARCIAL");
    expect(formatearFecha(d)).toContain("falta el grupo core (meta.json: sin meta)");
  });

  it("backups anteriores al split core/switch → PARCIAL (el grupo switch no existía)", () => {
    const archivos = archivosDe("meta.json", "cheques.ndjson.gz", "transportistas.ndjson.gz");
    const d = diagnosticarFecha("2026-07-10", archivos, { core: metaCore });
    expect(d.estado).toBe("PARCIAL");
    expect(d.grupos).toEqual(["core"]);
    expect(d.datasets).toBe(2);
  });

  it("meta presente pero un dataset SIN su .ndjson.gz → DAÑADO (gana a PARCIAL)", () => {
    const archivos = archivosDe("meta.json", "cheques.ndjson.gz");
    const d = diagnosticarFecha("2026-07-20", archivos, { core: metaCore });
    expect(d.estado).toBe("DAÑADO");
    expect(d.completo).toBe(false);
    expect(d.datasetsFaltantes).toEqual(["core:transportistas"]);
    expect(problemasDe(d).join(" ")).toContain("sin archivo: core:transportistas");
  });

  it("sin ningún meta → INSERVIBLE (no hay índice de datasets)", () => {
    const d = diagnosticarFecha("2026-07-19", archivosDe("cheques.ndjson.gz"), {});
    expect(d.estado).toBe("INSERVIBLE");
    expect(d.restaurable).toBe(false);
    expect(d.datasets).toBe(0);
  });

  it("meta que existe pero no se pudo parsear cuenta como grupo ausente", () => {
    const d = diagnosticarFecha("2026-07-18", COMPLETO, { core: null, switch: metaSwitch });
    expect(d.estado).toBe("PARCIAL");
    expect(d.faltan[0]).toEqual({ grupo: "core", metaFile: "meta.json", motivo: "meta ilegible" });
  });

  it("formato v1 → DAÑADO (este restore solo sabe v2-ndjson-gz)", () => {
    const d = diagnosticarFecha("2026-07-01", COMPLETO, {
      core: { datasets: [] },
      switch: metaSwitch,
    });
    expect(d.estado).toBe("DAÑADO");
    expect(d.formatosMalos[0].grupo).toBe("core");
  });

  it("propaga los errores registrados en el meta del backup", () => {
    const d = diagnosticarFecha("2026-07-17", COMPLETO, {
      core: { ...metaCore, errores: [{ file: "cxc_rows", error: "timeout" }] },
      switch: metaSwitch,
    });
    expect(d.completo).toBe(true); // los archivos están; el aviso es aparte
    expect(d.conErrores).toEqual([{ grupo: "core", files: ["cxc_rows"] }]);
  });

  it("los dos grupos del backup son core y switch", () => {
    expect(GRUPOS_META).toEqual({ core: "meta.json", switch: "meta-switch.json" });
  });
});

describe("elegirFechaPorDefecto (sin --date)", () => {
  const diag = (fecha: string, estado: string) => ({
    fecha,
    estado,
    completo: estado === "OK",
    restaurable: estado !== "INSERVIBLE",
  });

  it("elige la más nueva COMPLETA, no la más nueva a secas", () => {
    // Exactamente el 25-jul: la carpeta más nueva estaba a medias.
    const r = elegirFechaPorDefecto([
      diag("2026-07-25", "PARCIAL"),
      diag("2026-07-24", "OK"),
      diag("2026-07-23", "OK"),
    ]);
    expect(r).toEqual({ fecha: "2026-07-24", completa: true });
  });

  it("si ninguna está completa cae a la más nueva restaurable, marcándolo", () => {
    const r = elegirFechaPorDefecto([diag("2026-07-25", "PARCIAL"), diag("2026-07-24", "DAÑADO")]);
    expect(r).toEqual({ fecha: "2026-07-25", completa: false });
  });

  it("sin nada restaurable → null", () => {
    expect(elegirFechaPorDefecto([diag("2026-07-25", "INSERVIBLE")])).toBeNull();
    expect(elegirFechaPorDefecto([])).toBeNull();
  });
});

describe("formatearFecha", () => {
  it("una fecha OK no lleva coletilla de problemas", () => {
    const linea = formatearFecha(diagnosticarFecha("2026-07-26", COMPLETO, { core: metaCore, switch: metaSwitch }));
    expect(linea).toContain("2026-07-26");
    expect(linea).toContain("OK");
    expect(linea).toContain("3 datasets (core 2, switch 1)");
    expect(linea).not.toContain("—");
  });

  it("recorta la lista de datasets faltantes y dice cuántos quedaron", () => {
    const meta = {
      format: "v2-ndjson-gz",
      datasets: Array.from({ length: 8 }, (_, i) => ({ file: `t${i}`, table: `t${i}`, rows: 1 })),
    };
    const d = diagnosticarFecha("2026-07-15", archivosDe("meta.json"), { core: meta });
    expect(formatearFecha(d)).toMatch(/\(\+3\)/);
  });
});

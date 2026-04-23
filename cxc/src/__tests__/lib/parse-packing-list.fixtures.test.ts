/**
 * Fixture test: corre el parser contra el raw extraído de 42328_PList.pdf
 * y compara con el expected canónico. Los dos JSONs viven en
 * tests/fixtures/packing-lists/ y se regeneran con:
 *
 *   npx tsx scripts/generate-pl-fixture.ts
 *
 * Invariantes que protege este test:
 *   - 20 PLs detectados
 *   - Orden físico de bultos por PL (Bug #1)
 *   - bulto.rawId (label OCPA547980) preservado para bodega
 *   - Sum(bulto.items.qty) === bulto.totalPiezas en cada bulto
 *   - Totales por PL (bultos / piezas) cuadran con header del PDF
 *
 * Si el parser cambia legítimamente: regenerar expected.json y committear
 * el diff junto al cambio de lógica.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseMultiplePackingLists,
  validateParsedPL,
  PARSER_VERSION,
  type RawLine,
} from "@/lib/parse-packing-list";

const FIXTURE_DIR = resolve(__dirname, "../../../tests/fixtures/packing-lists");

interface RawFixture {
  text: string;
  rawLines: RawLine[];
}

interface ExpectedItem {
  estilo: string;
  producto: string;
  qty: number;
  has_m: boolean;
  has_32: boolean;
}

interface ExpectedBulto {
  id: string;
  label: string;
  total_piezas: number;
  size_columns: string[];
  items: ExpectedItem[];
}

interface ExpectedPL {
  numero_pl: string;
  empresa: string;
  fecha_entrega: string;
  total_bultos: number;
  total_piezas: number;
  bulto_order: { id: string; label: string }[];
  bultos: ExpectedBulto[];
}

interface ExpectedFixture {
  parser_version: string;
  total_pls: number;
  pls: ExpectedPL[];
}

const raw = JSON.parse(readFileSync(resolve(FIXTURE_DIR, "42328_raw.json"), "utf-8")) as RawFixture;
const expected = JSON.parse(readFileSync(resolve(FIXTURE_DIR, "42328_expected.json"), "utf-8")) as ExpectedFixture;
const parsed = parseMultiplePackingLists(raw.text, raw.rawLines);

describe("42328_PList.pdf fixture", () => {
  it("parser version del expected matchea la versión vigente (refresca el fixture si esto falla)", () => {
    expect(expected.parser_version).toBe(PARSER_VERSION);
  });

  it("detecta los 20 PLs", () => {
    expect(parsed).toHaveLength(expected.total_pls);
    expect(parsed).toHaveLength(20);
  });

  it("cada PL cuadra numero_pl, empresa, fecha_entrega, totales", () => {
    for (let i = 0; i < expected.pls.length; i++) {
      const exp = expected.pls[i];
      const got = parsed[i];
      expect(got.numeroPL, `PL[${i}] numero`).toBe(exp.numero_pl);
      expect(got.empresa, `PL ${exp.numero_pl} empresa`).toBe(exp.empresa);
      expect(got.fechaEntrega, `PL ${exp.numero_pl} fecha`).toBe(exp.fecha_entrega);
      expect(got.totalBultos, `PL ${exp.numero_pl} total_bultos`).toBe(exp.total_bultos);
      expect(got.totalPiezas, `PL ${exp.numero_pl} total_piezas`).toBe(exp.total_piezas);
    }
  });

  it("respeta orden físico de bultos por PL (Bug #1)", () => {
    for (const exp of expected.pls) {
      const got = parsed.find(p => p.numeroPL === exp.numero_pl);
      expect(got, `PL ${exp.numero_pl} encontrado`).toBeDefined();
      const gotOrder = got!.bultos.map(b => ({ id: b.id, label: b.rawId }));
      expect(gotOrder, `PL ${exp.numero_pl} bulto_order`).toEqual(exp.bulto_order);
    }
  });

  it("cada bulto conserva label físico (OCPA547980 / 996171227910378)", () => {
    for (const exp of expected.pls) {
      const got = parsed.find(p => p.numeroPL === exp.numero_pl)!;
      for (let bi = 0; bi < exp.bultos.length; bi++) {
        const expB = exp.bultos[bi];
        const gotB = got.bultos[bi];
        expect(gotB.rawId, `PL ${exp.numero_pl} bulto ${bi} label`).toBe(expB.label);
        expect(gotB.id, `PL ${exp.numero_pl} bulto ${bi} id`).toBe(expB.id);
      }
    }
  });

  it("items por bulto matchean estilo/qty/hasM/has32", () => {
    for (const exp of expected.pls) {
      const got = parsed.find(p => p.numeroPL === exp.numero_pl)!;
      for (const expB of exp.bultos) {
        const gotB = got.bultos.find(b => b.id === expB.id)!;
        const gotItems = gotB.items.map(it => ({
          estilo: it.estilo,
          producto: it.producto,
          qty: it.qty,
          has_m: it.hasM,
          has_32: it.has32,
        }));
        expect(gotItems, `PL ${exp.numero_pl} bulto ${expB.id} items`).toEqual(expB.items);
      }
    }
  });

  it("validateParsedPL retorna 0 errores en TODOS los PLs (sum(qty) === totalPiezas)", () => {
    for (const pl of parsed) {
      const errors = validateParsedPL(pl);
      expect(errors, `PL ${pl.numeroPL} errores de validación`).toEqual([]);
    }
  });

  it("caso específico — PL 80163244, primer bulto es el 996171227910378 (NO un OCPA)", () => {
    const pl = parsed.find(p => p.numeroPL === "80163244")!;
    expect(pl.bultos[0].id).toBe("7910378");
    expect(pl.bultos[0].rawId).toBe("996171227910378");
    expect(pl.bultos.slice(1).map(b => b.rawId)).toEqual([
      "OCPA547980", "OCPA547981", "OCPA547982", "OCPA547983",
    ]);
  });
});

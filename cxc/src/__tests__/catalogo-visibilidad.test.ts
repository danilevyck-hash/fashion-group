import { describe, it, expect } from "vitest";
import { esVisibleEnCatalogo } from "@/lib/catalogos/visibilidad";

// Regla única de visibilidad de los catálogos Reebok/Joybees — la comparten el
// motor de sync (sync-catalogo.ts) y el toggle "Ocultar del catálogo" del admin
// (PATCH reebok|joybees/products). Estos tests fijan el contrato.

describe("esVisibleEnCatalogo", () => {
  it("visible con existencia >= 1", () => {
    expect(esVisibleEnCatalogo({ existencia: 1 })).toBe(true);
    expect(esVisibleEnCatalogo({ existencia: 166 })).toBe(true);
  });

  it("oculto sin existencia", () => {
    expect(esVisibleEnCatalogo({ existencia: 0 })).toBe(false);
    expect(esVisibleEnCatalogo({ existencia: -2 })).toBe(false);
  });

  it("keep_visible o badge proximamente fuerzan visible aunque existencia=0", () => {
    expect(esVisibleEnCatalogo({ existencia: 0, keepVisible: true })).toBe(true);
    expect(esVisibleEnCatalogo({ existencia: 0, badge: "proximamente" })).toBe(true);
    // otros badges NO fuerzan visibilidad
    expect(esVisibleEnCatalogo({ existencia: 0, badge: "oferta" })).toBe(false);
  });

  it("oculto_manual=true GANA sobre todo (sobrevive al sync)", () => {
    // caso real 100256591: con stock (166) pero no vendible → oculto a mano
    expect(esVisibleEnCatalogo({ existencia: 166, ocultoManual: true })).toBe(false);
    expect(esVisibleEnCatalogo({ existencia: 5, keepVisible: true, ocultoManual: true })).toBe(false);
    expect(esVisibleEnCatalogo({ existencia: 0, badge: "proximamente", ocultoManual: true })).toBe(false);
  });

  it("oculto_manual null/undefined/false = comportamiento normal (pre-migración)", () => {
    expect(esVisibleEnCatalogo({ existencia: 3, ocultoManual: null })).toBe(true);
    expect(esVisibleEnCatalogo({ existencia: 3, ocultoManual: undefined })).toBe(true);
    expect(esVisibleEnCatalogo({ existencia: 3, ocultoManual: false })).toBe(true);
  });
});

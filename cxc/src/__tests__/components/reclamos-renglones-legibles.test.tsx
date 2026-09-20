/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LOS RENGLONES SE LEEN: AIRE ENTRE COLUMNAS Y TALLAS SIN ESPACIOS
 * (20-sep-2026, aprobado por Daniel).
 *
 * DOS defectos que se ven en la misma línea.
 *
 * 🩸 1. «SUBTOTAL» Y «MOTIVO» SALÍAN PEGADOS:
 *
 *        $1,152.00Mercancía manchada
 *
 *    La tabla del detalle llevaba aire arriba y abajo (`py-3`) y **nada a los
 *    lados**, mientras las de edición sí traían `px-5`. Afecta a los 33
 *    reclamos vivos y sus 126 renglones. Ahora el aire sale de UNA constante
 *    (`AIRE_ENTRE_COLUMNAS`) que leen las TRES tablas de renglones: la del
 *    detalle, la de edición del detalle y la del formulario.
 *
 * 🩸 2. LAS TALLAS SE GUARDABAN CON UN ESPACIO ADELANTE — `" TODAS"`, `" 8"`,
 *    `" 34-32"` — y ese espacio **sale en el papel que recibe el proveedor**.
 *    Medido: 32 renglones dicen «TODAS» y ~25 más arrancan con espacio. El
 *    espacio no es un descuido de quien teclea: `ItemsEditor` usa `" "` como
 *    SEÑAL de «Otros». Por eso el recorte va al GUARDAR (`buildReclamoItemRows`,
 *    la puerta que comparten crear y editar) y NO al teclear — recortando
 *    mientras se escribe, la señal se borra y el campo se cierra solo.
 *
 * ⚠️ LO YA GUARDADO NO SE TOCA: no hay migración de limpieza y no la habrá
 * hasta que Daniel la pida.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reclamos",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { ToastProvider } from "@/components/ToastSystem";
import ReclamoDetail from "@/app/reclamos/components/ReclamoDetail";
import { emptyItem } from "@/app/reclamos/components/constants";
import { buildReclamoItemRows } from "@/lib/reclamos/item-rows";
import { AIRE_ENTRE_COLUMNAS } from "@/lib/reclamos/tabla-renglones";
import type { Reclamo } from "@/app/reclamos/components/types";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: (i: number) => [...datos.keys()][i] ?? null, get length() { return datos.size; } } as unknown as Storage;
};
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reclamos-renglones"; });
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const noop = () => {};
const rec: Reclamo = {
  id: "REC-2026-0026", nro_reclamo: "REC-2026-0026", empresa: "Vistana International",
  proveedor: "American Designer Fashion", marca: "Calvin Klein", nro_factura: "3000014229",
  nro_orden_compra: "", fecha_reclamo: "2026-06-19", fecha_factura: "2026-06-19", estado: "Creado",
  notas: "", created_at: "2026-06-19T10:00:00Z", reclamado_en: null,
  reclamo_items: [
    { ...emptyItem(), referencia: "QF8518433", descripcion: "PANTI PARA DAMA", talla: "TODAS", cantidad: 60, precio_unitario: 19.2, motivo: "mercancía manchada" },
  ],
  reclamo_fotos: [], reclamo_seguimiento: [], reclamo_settlements: [],
};

function pintar(editMode = false) {
  render(
    <ToastProvider>
      <ReclamoDetail current={rec} role="admin" contacto={null} nota="" setNota={noop} editMode={editMode} setEditMode={noop}
        editEmpresa="Vistana International" setEditEmpresa={noop} editFacturas={[]} setEditFacturas={noop} editPedido="" setEditPedido={noop}
        editFechaFactura="2026-06-19" setEditFechaFactura={noop} editNotas="" setEditNotas={noop} editFacturaPdfPath={null} setEditFacturaPdfPath={noop}
        editItems={rec.reclamo_items!} setEditItems={noop as never} editSaving={false} onStartEdit={noop} toast={null}
        onBack={noop} onAddNota={noop} onChangeEstado={noop} onDeleteReclamo={noop} onSaveEdit={noop}
        onUploadFoto={noop} onDeleteFoto={noop} onAddSettlement={noop} onRemoveSettlement={noop} showToast={noop} />
    </ToastProvider>,
  );
}

// ═══ 1. El aire entre columnas ══════════════════════════════════════════════
describe("🔴 «Subtotal» y «Motivo» dejan de salir pegados", () => {
  it("la tabla del DETALLE ya no va sin aire a los lados", () => {
    pintar(false);
    const tabla = document.querySelector('[data-vista="tabla"] table')!;
    expect(tabla.className).toContain("[&_td]:px-5");
    expect(tabla.className).toContain("[&_th]:px-5");
  });

  it("la tabla de EDICIÓN lleva el MISMO aire, no uno parecido", () => {
    cleanup();
    pintar(true);
    const tabla = document.querySelector("table")!;
    for (const clase of AIRE_ENTRE_COLUMNAS.split(" ")) {
      expect(tabla.className, clase).toContain(clase);
    }
  });

  it("🔴 las TRES tablas de renglones leen la MISMA constante, ninguna la escribe a mano", () => {
    for (const rel of [
      "src/app/reclamos/components/ReclamoDetail.tsx",
      "src/app/reclamos/components/ItemsEditor.tsx",
    ]) {
      const src = leer(rel);
      expect(src, rel).toContain("AIRE_ENTRE_COLUMNAS");
      // Nadie vuelve a clavar el `px-5` suelto al lado de la constante.
      expect(src.replace(/\/\*[\s\S]*?\*\//g, " "), rel).not.toContain("[&_td]:px-5 [&_th");
    }
    // Y las tres tablas de verdad la usan (dos en el detalle, una en el form).
    const usos = leer("src/app/reclamos/components/ReclamoDetail.tsx").split("${AIRE_ENTRE_COLUMNAS}").length - 1;
    expect(usos).toBe(2);
    expect(leer("src/app/reclamos/components/ItemsEditor.tsx").split("${AIRE_ENTRE_COLUMNAS}").length - 1).toBe(1);
  });

  it("⚠️ el aire va entre columnas, NO en los bordes: la tabla sigue alineada", () => {
    expect(AIRE_ENTRE_COLUMNAS).toContain("[&_td:first-child]:pl-0");
    expect(AIRE_ENTRE_COLUMNAS).toContain("[&_td:last-child]:pr-0");
  });

  it("⚠️ CONTROL: las dos columnas siguen estando, con su contenido", () => {
    pintar(false);
    const tabla = document.querySelector('[data-vista="tabla"] table')!;
    expect(tabla.textContent).toContain("$1,152.00");
    expect(tabla.textContent).toContain("Mercancía manchada");
    // ⚠️ El `textContent` pega las celdas siempre, con aire o sin él: la
    // separación es CSS y se prueba por la clase, arriba. Lo que este caso
    // vigila es que arreglar el aire no se haya llevado un dato por delante.
    expect(tabla.querySelectorAll("tbody td").length).toBe(7);
  });
});

// ═══ 2. Las tallas, sin espacios ════════════════════════════════════════════
describe("🔴 la talla se guarda recortada", () => {
  const fila = (talla: unknown) =>
    buildReclamoItemRows("r1", [{ referencia: "A", descripcion: "B", talla, cantidad: 1, precio_unitario: 1, motivo: "M" }])[0];

  it("los tres casos medidos en producción dejan de llevar el espacio", () => {
    expect(fila(" TODAS").talla).toBe("TODAS");
    expect(fila(" 8").talla).toBe("8");
    expect(fila(" 34-32").talla).toBe("34-32");
  });

  it("el espacio de atrás también, y los dos a la vez", () => {
    expect(fila("TODAS ").talla).toBe("TODAS");
    expect(fila("  M  ").talla).toBe("M");
  });

  it("la SEÑAL de «Otros» —un espacio solo— queda vacía, que es lo que el validador ya rechaza", () => {
    expect(fila(" ").talla).toBe("");
  });

  it("⚠️ una talla normal no se toca, y el espacio de ADENTRO se respeta", () => {
    expect(fila("XL").talla).toBe("XL");
    expect(fila("34 x 32").talla).toBe("34 x 32");
  });

  it("🔴 lo recorta la ÚNICA puerta de escritura, así que vale al crear y al editar", () => {
    const puerta = leer("src/lib/reclamos/item-rows.ts");
    expect(puerta).toContain('String(item.talla || "").trim()');
    for (const rel of [
      "src/app/api/reclamos/route.ts",
      "src/app/api/reclamos/[id]/items/route.ts",
    ]) {
      expect(leer(rel), rel).toContain("buildReclamoItemRows");
    }
  });

  it("⚠️ NO se recorta al teclear: la señal de «Otros» del formulario sigue viva", () => {
    const editor = leer("src/app/reclamos/components/ItemsEditor.tsx");
    expect(editor).toContain('updateItem(idx, "talla", " ")');
  });

  it("⚠️ ninguna migración limpia lo ya guardado (Daniel no la pidió)", () => {
    const dir = path.join(RAIZ, "supabase/migrations");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8")
        .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      expect(sql, `${f} limpia tallas sin que nadie lo pidiera`)
        .not.toMatch(/UPDATE\s+reclamo_items[\s\S]{0,200}?(?:trim|btrim)\s*\(/i);
    }
  });

  it("⚠️ CONTROL: el resto de la fila sigue saliendo igual", () => {
    const f = fila(" M ");
    expect(f).toEqual({
      reclamo_id: "r1", referencia: "A", descripcion: "B", talla: "M", genero: null,
      cantidad: 1, precio_unitario: 1, motivo: "M", nro_factura: "", nro_orden_compra: "",
    });
  });
});

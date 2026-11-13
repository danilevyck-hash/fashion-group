// 13-nov-2026 (Daniel): una factura en una guía «Pendiente Bodega» SÍ se
// etiqueta; en una guía despachada (Completada) sigue bloqueada.
import { describe, it, expect } from "vitest";
import { indicesYaSalio, yaSalioEn, type FacturaDelCliente } from "@/lib/guias/atajos-facturas";
import { facturasParaEtiquetar } from "@/lib/guias/etiquetas";

const EMP = "Vistana International";
const fac = (secuencial: string, extra: Partial<FacturaDelCliente> = {}): FacturaDelCliente => ({
  empresa_key: "vistana", empresa: EMP, switch_factura_id: Number(secuencial.slice(-4)),
  secuencial, fecha: "2026-11-13T15:00:00Z", total: 10, yaSalioEn: null, ...extra,
});

describe("guía pendiente no bloquea Etiquetas", () => {
  const { indice, despachadas } = indicesYaSalio([
    { empresa: EMP, facturas: "11-000003191", guiaNumero: 300, pendiente: true },
    { empresa: EMP, facturas: "11-000003192", guiaNumero: 290, pendiente: false },
    { empresa: EMP, facturas: "11-000003193", guiaNumero: 301, pendiente: true },
    { empresa: EMP, facturas: "11-000003193", guiaNumero: 280, pendiente: false },
  ]);

  it("el índice completo sigue viendo todas (chip de Nueva guía igual)", () => {
    expect(yaSalioEn(indice, EMP, "11-000003191")).toBe(300);
    expect(yaSalioEn(indice, EMP, "11-000003192")).toBe(290);
  });

  it("solo la despachada bloquea; en las dos, bloquea", () => {
    expect(yaSalioEn(despachadas, EMP, "11-000003191")).toBeNull();
    expect(yaSalioEn(despachadas, EMP, "11-000003192")).toBe(290);
    expect(yaSalioEn(despachadas, EMP, "11-000003193")).toBe(280);
  });

  it("la lista ofrece la pendiente y esconde la despachada y la etiquetada", () => {
    const pendiente = fac("11-000003191", { yaSalioEn: 300, yaSalioPendiente: true });
    const despachada = fac("11-000003192", { yaSalioEn: 290, yaSalioPendiente: false });
    const sinDato = fac("11-000003194", { yaSalioEn: 310 });
    const etiquetada = fac("11-000003195", { yaSalioEn: 311, yaSalioPendiente: true });
    const r = facturasParaEtiquetar(
      [pendiente, despachada, sinDato, etiquetada],
      [{ empresa_key: "vistana", switch_factura_id: 3195 } as never],
      true,
    );
    expect(r.visibles).toEqual([pendiente]);
    expect(r.yaSalieron).toBe(2);
    expect(r.escondidas).toBe(1);
  });
});

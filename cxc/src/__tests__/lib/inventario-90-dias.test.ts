import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {}, HAS_SERVICE_ROLE: true }));
import { parseDetalleCsv, parseResumenCsv, cuadrar } from "@/lib/switch-api/ingresos-mercancia";
import { INGRESOS_EMPRESA_KEYS, INGRESOS_SYNC_EMPRESA_KEYS } from "@/lib/switch-api/ingresos-mercancia-web";
import { REFERENCIA_EMPRESA_KEYS } from "@/lib/ventas/referencia";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { MULTIFASHION, VALOR_GRUPO, empresasDe, resumir, type EmpresaHoy } from "@/lib/vista-general/hoy";
import { DIAS_INVENTARIO_NUEVO, INVENTARIO_90_DIAS_2026_11 } from "@/lib/ui/inventario-90-dias-2026-11";

// Encabezado y filas REALES del reporte de Multifashion (27-nov-2026): 16 columnas.
const DET_ACS = [
  "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR; CODIGO  ARTICULO ;ARTICULO;REFERENCIA; CODIGO  BARRA ;PRECIO;TALLA;COLOR;CANTIDAD; COSTO  FOB ; COSTO  CIF ; COSTO  PROMEDIO ; UTILIDAD  % ",
  "2024-05-28;19-000000001;PRINCIPAL; VISTANA  INTERNATIONAL  PANAMA,  S.A. ;002905;Men-Trunk;NU2664-514;72467442;34.90;UNICO;UNICO;1.00;18.0188;18.0188;18.0188;48.3702",
  "2024-05-28;19-000000001;PRINCIPAL; VISTANA  INTERNATIONAL  PANAMA,  S.A. ;010999;Men-Trunk;NU2665;16191127;17.00;UNICO;UNICO;2.00;17.5341;17.5341;17.5341;-3.1418",
].join("\n");
const RES_ACS = [
  "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR;CANTIDAD; COSTO  FOB ; COSTO  CIF ;TOTAL",
  "2024-05-28;19-000000001;PRINCIPAL; VISTANA  INTERNATIONAL  PANAMA,  S.A. ;3.00;53.09;53.09;68.90",
].join("\n");

describe("Multifashion: el reporte de 16 columnas se lee", () => {
  it("lee por NOMBRE y las columnas de más (barra, talla, color) no tumban la fila", () => {
    const d = parseDetalleCsv("american_classic", DET_ACS);
    expect(d.skips).toEqual([]);
    expect(d.filas).toHaveLength(2);
    expect(d.filas[0]).toMatchObject({ codigo_articulo: "002905", cantidad: 1, costo_cif: 18.0188, precio: 34.9, linea: 1 });
    expect(d.filas[1]).toMatchObject({ codigo_articulo: "010999", cantidad: 2, linea: 2 });
    expect(cuadrar(d.filas, parseResumenCsv(RES_ACS).documentos).ok).toBe(true);
  });

  it("una fila con columnas de menos se cuenta como salteada, nunca se adivina", () => {
    const d = parseDetalleCsv("american_classic", `${DET_ACS}\n2024-05-29;19-000000002;PRINCIPAL;X;003;A;R;1;UNICO`);
    expect(d.skips).toHaveLength(1);
    expect(d.skips[0].motivo).toMatch(/esperaba 16 columnas/);
  });
});

describe("Multifashion entra al cron de llegadas, NO a Referencia", () => {
  it("el cron trae las 6 + Multifashion, y Multifashion va primera (su login a las 09:05)", () => {
    expect(INGRESOS_SYNC_EMPRESA_KEYS[0]).toBe("american_classic");
    expect([...INGRESOS_SYNC_EMPRESA_KEYS].sort()).toEqual([...B2B_EMPRESA_KEYS, "american_classic"].sort());
  });
  it("Referencia y Proveedores siguen con las 6", () => {
    expect(INGRESOS_EMPRESA_KEYS).not.toContain("american_classic");
    expect([...INGRESOS_EMPRESA_KEYS].sort()).toEqual([...REFERENCIA_EMPRESA_KEYS].sort());
  });
});

describe("La tarjeta Inventario por antigüedad", () => {
  const conAnt = (nuevo: number, viejo: number, sinFecha: number): EmpresaHoy => ({
    ventas: null,
    inventario: { costo: nuevo + viejo + sinFecha, unidades: 1, antiguedad: { nuevo, viejo, sinFecha } },
  });

  it("prendido, a 90 días", () => {
    expect(INVENTARIO_90_DIAS_2026_11).toBe(true);
    expect(DIAS_INVENTARIO_NUEVO).toBe(90);
  });

  it("Fashion Group suma las 6 y NO Multifashion", () => {
    const empresas: Record<string, EmpresaHoy> = {};
    for (const k of B2B_EMPRESA_KEYS) empresas[k] = conAnt(10, 20, 1);
    empresas[MULTIFASHION] = conAnt(1000, 1000, 1000);
    const r = resumir(empresasDe(VALOR_GRUPO), { mes: 11, empresas } as never);
    expect(r.inventario).toMatchObject({ estado: "ok", valor: { antiguedad: { nuevo: 60, viejo: 120, sinFecha: 6 } } });
    const mf = resumir(empresasDe(MULTIFASHION), { mes: 11, empresas } as never);
    expect(mf.inventario).toMatchObject({ estado: "ok", valor: { antiguedad: { nuevo: 1000, viejo: 1000, sinFecha: 1000 } } });
  });

  it("si a una empresa le falta la antigüedad, el grupo NO se parte (nunca medio número)", () => {
    const empresas: Record<string, EmpresaHoy> = {};
    for (const k of B2B_EMPRESA_KEYS) empresas[k] = conAnt(10, 20, 1);
    empresas[B2B_EMPRESA_KEYS[0]] = { ventas: null, inventario: { costo: 31, unidades: 1 } };
    const r = resumir(empresasDe(VALOR_GRUPO), { mes: 11, empresas } as never);
    expect(r.inventario.estado).toBe("ok");
    if (r.inventario.estado === "ok") {
      expect(r.inventario.valor.antiguedad).toBeUndefined();
      expect(r.inventario.valor.costo).toBe(186);
    }
  });

  it("la pantalla dice los 90 días y nunca «vencido»", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/vista-general/VistaGeneralHoy.tsx"), "utf8");
    expect(src).toMatch(/Hasta \{DIAS_INVENTARIO_NUEVO\} días/);
    expect(src).toMatch(/Más de \{DIAS_INVENTARIO_NUEVO\} días/);
    expect(src.toLowerCase()).not.toMatch(/vencid/);
  });

  it("la función de la base es de SOLO lectura", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20270202120000_inventario_antiguedad.sql"), "utf8").replace(/--.*$/gm, "");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION inventario_antiguedad_v1/);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i);
  });
});

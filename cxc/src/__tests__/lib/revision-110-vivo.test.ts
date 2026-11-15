// Revisión 110 · arreglos tras la revisión en vivo (14-nov-2026). Candados de
// los interruptores de `revision-110-vivo.ts`: todos prendidos, y cada uno
// enchufado donde dice.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as vivo from "@/lib/ui/revision-110-vivo";
import { diasDesde } from "@/lib/reclamos/dias";
import { textoUnidades } from "@/lib/guias/pedidos-bultos";

const leer = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("revisión 110 · en vivo", () => {
  it("todos los interruptores están prendidos", () => {
    for (const [k, v] of Object.entries(vivo)) expect([k, v]).toEqual([k, true]);
  });

  it("14 · Vista general cuenta los días del reclamo con la MISMA función que Reclamos", () => {
    const ruta = leer("app/api/dashboard/vista-general/route.ts");
    expect(ruta).toMatch(/diasDesde\(r\.fecha_factura \?\? r\.fecha_reclamo, hoyPa\)/);
    expect(ruta).toMatch(/const hoyPa = hoyPanama\(\)/);
    // Fecha de Panamá contra fecha: nada de horas de UTC.
    expect(diasDesde("2025-02-02", "2026-11-14")).toBe(650);
  });

  it("unidades con coma de miles, también de cuatro cifras", () => {
    expect(textoUnidades(1552)).toBe("1,552 unidades");
  });

  it("cada interruptor está enchufado en su pantalla", () => {
    const usos: [keyof typeof vivo, string][] = [
      ["AVISO_SE_PARTE", "app/vista-general/InventarioPorEmpresa.tsx"],
      ["MONTAJE_ESTABLE", "components/celular/BarraDeControles.tsx"],
      ["PRODUCTOS_BUSCADOR_ANCHO", "components/ventas/ProductosFiltros.tsx"],
      ["PRODUCTOS_RESUMEN_DOS_LINEAS", "components/productos/FiltrosProductos.tsx"],
      ["DISTINTIVO_BAJO_EL_NOMBRE", "app/asistencia/ReporteTab.tsx"],
      ["DESGLOSE_DEBAJO", "components/comisiones/ComisionesTarjetas.tsx"],
      ["FLECHA_AL_LADO", "components/comisiones/ComisionesConsolidadoView.tsx"],
      ["BUSCADOR_PRIMERO_APROBACIONES", "app/asistencia/AprobacionesTab.tsx"],
      ["GASTOS_DEL_ALTO_DE_SU_LINEA", "app/vista-general/GastosPorEmpresa.tsx"],
      ["COMPARACION_ENTERA", "components/multifashion/ResumenMinimo.tsx"],
      ["DIAS_COMO_RECLAMOS", "app/api/dashboard/vista-general/route.ts"],
      ["ORDEN_ICONO_DE_LINEA", "components/catalogo/CatalogoFilters.tsx"],
      ["RECLAMOS_NOMBRE_COMPLETO", "lib/reclamos/portada.ts"],
      ["UNIDADES_CON_COMA", "lib/guias/pedidos-bultos.ts"],
      ["ABR_MEDIDA_EN_PANTALLA", "components/ventas/ResumenView.tsx"],
      ["RAIL_ALTO_CON_ESCALA", "components/estructura/BarraLateral2026.tsx"],
    ];
    for (const [k, archivo] of usos) expect(leer(archivo), `${k} en ${archivo}`).toContain(k);
    expect(Object.keys(vivo).sort()).toEqual(usos.map(([k]) => k).sort());
  });

  it("04 · Planilla: «elígela arriba: con …» lleva su espacio", () => {
    expect(leer("app/asistencia/PlanillaTab.tsx")).toMatch(/elígela arriba:\{" "\}/);
  });
});

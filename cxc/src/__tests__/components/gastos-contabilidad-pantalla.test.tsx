/**
 * El módulo de Gastos: cómo se llama y qué NO puede volver.
 *
 * 🔴 ESTE ARCHIVO SE VACIÓ EL 13-ago-2026, y el motivo importa: probaba la
 * pantalla del MAYOR CONTABLE (enero de Vistana renderizado, el ISR en su
 * línea, los avisos, "un mes sin contabilidad no se pinta como cero"). Daniel
 * retiró el mayor —textual: *"y entonces borra Mayor contable en el sistema"*—
 * y con él se fueron `DetalleEmpresa`, `ResumenEmpresas`, `EstadoMesTag`,
 * `AvisosDelMes` y `lib/mayor/*`. Un test de una pantalla que no existe no
 * prueba nada.
 *
 * **Lo que probaba NO se perdió**: la regla equivalente para la fuente que
 * queda —que un mes sin dato jamás se vea como $0— vive en
 * `components/gastos-al-dia-pantalla.test.tsx` y en
 * `lib/vista-general-gasto-egresos.test.ts`, los dos sobre Egresos Varios.
 *
 * Acá queda lo que es del MÓDULO y no de la fuente: cómo se llama, que la `key`
 * no se mueva, y que los nombres largos que ya se podaron no vuelvan.
 */
import { describe, it, expect } from "vitest";
import { ALL_MODULES } from "@/lib/modules";
import fs from "fs";
import path from "path";

// 🩸 Historia, porque explica por qué este bloque existe: el #463 estrenó el
// módulo como "Gastos por Empresa" al lado del viejo "Gastos de Empresa" — UNA
// PREPOSICIÓN de diferencia, uno debajo del otro en el menú. Para alguien no
// técnico eso no son dos módulos, es un typo. El candado general de nombres
// parecidos se GENERALIZÓ a todo el catálogo y vive en
// `src/__tests__/lib/saldos-banco-modulo.test.ts`; acá quedan las dos cosas
// propias de ESTE módulo.
describe("el módulo se llama \"Gastos\" y es el único de gastos", () => {
  it("label corto, key intacta, y ningún otro módulo de gastos", () => {
    const gastos = ALL_MODULES.find((m) => m.key === "gastos-contabilidad")!;
    expect(gastos).toBeTruthy();
    expect(gastos.label).toBe("Gastos");
    expect(gastos.href).toBe("/gastos-contabilidad");
    expect(gastos.group).toBe("operacion");

    // 🔴 La `key` NO cambia con el label ni con la fuente: `role_permissions` ya
    // corrió con `gastos-contabilidad`. Retirar el mayor NO la mueve — el módulo
    // es el mismo, lo que cambió es de dónde saca el número.
    expect(ALL_MODULES.find((m) => m.key === "gastos-empresa")).toBeUndefined();
    expect(ALL_MODULES.filter((m) => /gasto/i.test(m.label))).toHaveLength(1);
  });

  it("la pantalla dice el mismo nombre que el menú, y sin los nombres viejos", () => {
    const fuente = fs.readFileSync(
      path.join(__dirname, "..", "..", "app", "gastos-contabilidad", "GastosContabilidadClient.tsx"),
      "utf8",
    );
    expect(fuente).toContain('module="Gastos"');
    expect(fuente).toMatch(/>\s*Gastos\s*<\/h1>/);
    expect(fuente).not.toContain("Gastos según Contabilidad");
    expect(fuente).not.toContain("Gastos por Empresa");
    expect(fuente).not.toContain("Gastos de Empresa");
  });
});

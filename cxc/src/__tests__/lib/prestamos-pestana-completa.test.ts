/* ─────────────────────────────────────────────────────────────────────────────
 * LA PESTAÑA PRÉSTAMOS RECUPERA LO QUE SE PERDIÓ CON «UNA SOLA PUERTA».
 *
 * Daniel, 11-sep-2026: *«sí, arregla lo de préstamos»* (mockup aprobado).
 *
 * 🩸 Del 10 al 11-sep, con `NEXT_PUBLIC_PLANILLA_UNIDA` prendido, la pestaña
 * tenía SOLO «Anotar abono»: no se podía crear un préstamo, ver los movimientos
 * de nadie ni llegar a su ficha, porque `/prestamos/*` entero rebotaba a la
 * pestaña.
 *
 * 🔴 LO QUE SE PROTEGE:
 *   1. «+ Nuevo préstamo» en la pestaña abre el MISMO formulario del módulo
 *      (`ElegirPersonaModal` + `NuevoMovimientoModal`), no una copia.
 *   2. Tocar el nombre lleva a `/prestamos/<id>` — la página de siempre — y esa
 *      página vuelve a la pestaña con «← Préstamos».
 *   3. El formulario pregunta la CUOTA junto al monto (préstamo y terceros, no
 *      daño) y la escribe en la FICHA en una segunda llamada.
 *   4. «Descuento a terceros» es la cuarta tarjeta: existía la cuenta y no había
 *      forma de cargarla desde ninguna pantalla.
 *   5. Los ceros van con guion.
 *   6. La secretaria (solo VER) no recibe ni el botón ni el enlace.
 *   7. Con la planilla unida, la ficha NO ofrece «Pago Quincenal»: el descuento
 *      de la quincena lo escribe el cierre.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MOV_TIPOS } from "@/app/prestamos/components/types";
import { CONCEPTO_DANO, CONCEPTO_PAGO, CONCEPTO_PRESTAMO, CONCEPTO_TERCEROS } from "@/lib/prestamos-conceptos";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const TAB = "src/app/asistencia/PrestamosTab.tsx";
const FICHA = "src/app/prestamos/[id]/page.tsx";
const MODAL = "src/app/prestamos/components/NuevoMovimientoModal.tsx";
const FORM = "src/app/prestamos/components/useMovimientoForm.ts";

describe("1. «+ Nuevo préstamo» reusa el formulario del módulo", () => {
  const tab = sinComentarios(TAB);

  it("monta ElegirPersonaModal y NuevoMovimientoModal del módulo — no dibuja copias", () => {
    expect(tab).toMatch(/import ElegirPersonaModal from "@\/app\/prestamos\/components\/ElegirPersonaModal"/);
    expect(tab).toMatch(/import NuevoMovimientoModal from "@\/app\/prestamos\/components\/NuevoMovimientoModal"/);
    expect(tab).toMatch(/<ElegirPersonaModal/);
    expect(tab).toMatch(/<NuevoMovimientoModal/);
    expect(tab).toContain("+ Nuevo préstamo");
  });

  it("la lista de colaboradores se pide al TOCAR el botón, de /api/prestamos/empleados", () => {
    expect(tab).toMatch(/async function abrirNuevoPrestamo\(\)[\s\S]*?fetch\("\/api\/prestamos\/empleados"/);
    // Y la ficha nace CON SU CÓDIGO, igual que en el módulo: nada por parecido.
    expect(tab).toMatch(/body: JSON\.stringify\(\{ empleado_codigo: c\.codigo \}\)/);
  });

  it("el movimiento se guarda por `useMovimientoForm.crear` (el del módulo), que también escribe la cuota", () => {
    expect(tab).toMatch(/useMovimientoForm\(\{/);
    expect(tab).toMatch(/await movForm\.crear\(payload\)/);
  });
});

describe("2. tocar el nombre abre sus movimientos, y de ahí se vuelve a la pestaña", () => {
  it("el nombre es un enlace a `enlaceAPrestamos(f.id)` — solo para quien puede escribir", () => {
    const tab = sinComentarios(TAB);
    expect(tab).toMatch(/<Link href=\{enlaceAPrestamos\(f\.id\)\}/);
    expect(tab).toMatch(/puedeAnotar\s*\?\s*\(\s*<Link/);
  });

  it("la ficha vuelve con `enlaceVolverAPrestamos()` en la miga, el botón y el rebote", () => {
    const ficha = sinComentarios(FICHA);
    expect(ficha).toMatch(/const volver = enlaceVolverAPrestamos\(\);/);
    expect(ficha).toMatch(/label: "Préstamos", onClick: \(\) => router\.push\(volver\)/);
    expect(ficha).toMatch(/onBack=\{\(\) => router\.push\(volver\)\}/);
    expect(ficha).not.toMatch(/router\.push\("\/prestamos"\)/);
    // Y el botón dice «← Préstamos».
    expect(leer("src/app/prestamos/components/EmpleadoHeader.tsx")).toContain('volverA = "← Préstamos"');
  });
});

describe("3. la cuota se pregunta con el monto y va a la FICHA en una segunda llamada", () => {
  it("el formulario la pregunta en préstamo y terceros, nunca en daño ni en un pago", () => {
    const modal = sinComentarios(MODAL);
    expect(modal).toMatch(/const preguntaCuota = !!cuotaActual && \(concepto === CONCEPTO_PRESTAMO \|\| concepto === CONCEPTO_TERCEROS\);/);
    expect(modal).toContain("Cuota por quincena");
    // Sin `cuotaActual` (el módulo viejo desde la lista) no pregunta nada: nada cambia ahí.
    expect(modal).toMatch(/cuotaActual\?: \{ prestamo: number; terceros: number \} \| null;/);
  });

  it("`crear` separa `cuota` del movimiento y la escribe con PUT en la ficha, después del POST", () => {
    const form = sinComentarios(FORM);
    expect(form).toMatch(/const \{ cuota, \.\.\.movimiento \} = payload;/);
    expect(form).toMatch(/body: JSON\.stringify\(movimiento\)/);
    expect(form).toMatch(/const campo = concepto === CONCEPTO_TERCEROS \? "deduccion_terceros" : "deduccion_quincenal";/);
    expect(form).toMatch(/fetch\(`\/api\/prestamos\/empleados\/\$\{empleadoId\}`, \{\s*method: "PUT"/);
    // El PUT va DESPUÉS del POST: si el movimiento no se guardó, no se toca la ficha.
    expect(form.indexOf("await guardarCuota(")).toBeGreaterThan(form.indexOf('"/api/prestamos/movimientos"'));
    // Y la ruta que recibe el PUT sigue validando la cuota (no negativa).
    const put = sinComentarios("src/app/api/prestamos/empleados/[id]/route.ts");
    expect(put).toMatch(/deduccion_quincenal/);
    expect(put).toMatch(/deduccion_terceros/);
  });

  it("la ficha pasa la cuota actual y el concepto con el que abre", () => {
    const ficha = sinComentarios(FICHA);
    expect(ficha).toMatch(/conceptoInicial=\{conceptoInicial\}/);
    expect(ficha).toMatch(/cuotaActual=\{\{\s*prestamo: Number\(empleado\.deduccion_quincenal \?\? 0\),\s*terceros: Number\(empleado\.deduccion_terceros \?\? 0\),\s*\}\}/);
    expect(ficha).toMatch(/setConceptoInicial\(CONCEPTO_PAGO\)/);
    expect(ficha).toMatch(/setConceptoInicial\(CONCEPTO_PRESTAMO\)/);
    expect(ficha).toContain("Anotar abono");
    expect(ficha).toContain("+ Nuevo préstamo a");
  });
});

describe("4. «Descuento a terceros» es la cuarta tarjeta", () => {
  it("los cuatro conceptos, en este orden", () => {
    expect(MOV_TIPOS.map((t) => t.concepto)).toEqual([
      CONCEPTO_PRESTAMO, CONCEPTO_DANO, CONCEPTO_TERCEROS, CONCEPTO_PAGO,
    ]);
  });
});

describe("5. los ceros van con guion", () => {
  it("préstamo, daño y cuota pasan por `plataOGuion`; el total «Debe» siempre es plata", () => {
    const tab = sinComentarios(TAB);
    expect(tab).toMatch(/function plataOGuion\(n: number \| undefined\)/);
    expect(tab).toMatch(/\{plataOGuion\(f\.saldoPrestamo\)\}/);
    expect(tab).toMatch(/\{plataOGuion\(f\.saldoDano\)\}/);
    expect(tab).toMatch(/\{plataOGuion\(f\.cuota \+ \(f\.cuotaTerceros \?\? 0\)\)\}/);
    expect(tab).toMatch(/font-medium text-gray-900">\{money\(f\.saldo\)\}/);
  });
});

describe("6. la secretaria solo mira", () => {
  it("el botón y el enlace cuelgan de `puedeAnotar`, que lo decide el servidor", () => {
    const tab = sinComentarios(TAB);
    expect(tab).toMatch(/const botonNuevo = puedeAnotar && \(/);
    expect(tab).toMatch(/setPuedeAnotar\(!!j\.puedeAnotar\)/);
  });
});

describe("7. con la planilla unida, «Pago Quincenal» no se ofrece en la ficha", () => {
  it("el botón cuelga de `!PLANILLA_UNIDA`: el descuento de la quincena lo escribe el cierre", () => {
    const ficha = sinComentarios(FICHA);
    expect(ficha).toMatch(/\{!PLANILLA_UNIDA && \(\s*<button[\s\S]*?Pago Quincenal/);
  });
});

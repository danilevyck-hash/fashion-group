// ─────────────────────────────────────────────────────────────────────────────
// La tabla consolidada de Comisiones muestra el NETO (con descuentos restados)
// y esconde a los vendedores ocultos.
//
// 🩸 POR QUÉ (3-ago-2026). Daniel, mirando Fashion Shoes: *"me sale en el web el
// total, y no me resta de la pantalla el descuento, me lo debería de
// descontar"*. La tabla mostraba el SUBTOTAL antes de descuentos mientras el
// modal de detalle sí los restaba — dos números distintos para lo mismo:
//
//     Subtotal comisión        $2.859,65   ← esto salía en la tabla
//     Descuento               −$1.400,00
//     Descuento de adelanto     −$173,08
//     Total a pagar            $1.286,57   ← esto es lo que se paga
//
// El descuento es por (empresa, vendedor), así que se resta de LA CELDA de esa
// empresa, no solo del total de la fila: la columna que Daniel señaló es la de
// Fashion Shoes.
//
// Y *"quita el vendedor aguas, no lo quiero ver"*. AGUAS es un vendedor REAL
// (4 facturas de julio en Vistana por $1.148 → $34,66), así que se saca de la
// tabla **y de los totales**: esconder solo la fila dejaría un total que no
// cuadra con lo que se ve, y eso es lo que hace que nadie vuelva a confiar en
// la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const vista = leer("src/components/ventas/ComisionesConsolidadoView.tsx");
const ruta = leer("src/app/api/ventas/comisiones/descuentos/route.ts");
// 12-ago-2026: la lectura de descuentos se mudó a un módulo compartido y la
// tabla pasó a pedir UNA sola vez, al endpoint consolidado.
const lib = leer("src/lib/comisiones/descuentos.ts");
const consolidado = leer("src/app/api/ventas/comisiones/consolidado/route.ts");

// Réplica exacta de la aritmética de la vista, con los números de la captura.
const round2 = (n: number) => Math.round(n * 100) / 100;

describe("🔴 el neto: los números reales de julio 2026", () => {
  it("Fashion Shoes de Reinaldo pasa de 2859.65 a 1286.57", () => {
    const subtotal = 2859.65;
    const descuentos = 1400.0 + 173.08;
    expect(round2(subtotal - descuentos)).toBe(1286.57);
  });

  it("el total de la fila baja por arrastre, no por una cuenta aparte", () => {
    // Reinaldo: 7415.09 (FW) + 2859.65 (FS) + 386.00 (AS) + 0 (AW) = 10660.74
    const bruto = round2(7415.09 + 2859.65 + 386.0 + 0);
    expect(bruto).toBe(10660.74);
    expect(round2(bruto - (1400.0 + 173.08))).toBe(9087.66);
  });

  it("sacar a AGUAS baja el total del grupo en sus $34.66", () => {
    expect(round2(12678.37 - 34.66)).toBe(12643.71);
  });
});

describe("🔴 la vista aplica el descuento donde se ve", () => {
  it("resta de la CELDA de la empresa, no solo del total", () => {
    expect(vista).toContain("target.porEmpresa[r.empresa_key] = round2(");
    expect(vista).toContain("target.total = round2(target.total - monto)");
  });

  it("redondea a 2 decimales (los montos vienen de dos fuentes)", () => {
    expect(vista).toContain("const round2 =");
  });

  it("un descuento de alguien sin comisión este mes no crea una fila fantasma", () => {
    expect(vista).toContain("if (!target) continue;");
  });

  it("si la consulta de descuentos falla, la tabla NO se cae", () => {
    // Preferible una tabla como antes que una pantalla en blanco. El fail-open
    // se mudó al servidor cuando la tabla pasó a hacer UNA sola llamada: si la
    // lectura de descuentos revienta, se responde con la lista vacía y la tabla
    // sale con los descuentos en 0, igual que antes de que existieran.
    expect(consolidado).toContain("leerDescuentosEfectivos(EMPRESAS_COMISIONAN, year, mes).catch(() => [])");
  });

  it("un error de las COMISIONES sí se propaga (no se disfraza de tabla vacía)", () => {
    // Lo contrario del anterior, y a propósito: sin comisiones no hay nada que
    // mostrar, y una tabla en blanco silenciosa se lee como "este mes no se
    // vendió nada".
    expect(consolidado).toMatch(/status:\s*500/);
  });
});

describe("🔴 vendedores ocultos", () => {
  it("AGUAS está en la lista", () => {
    expect(vista).toContain('VENDEDORES_OCULTOS = new Set(["AGUAS"])');
  });

  it("se excluye ANTES de sumar, así que no entra en los totales", () => {
    expect(vista).toContain("if (estaOculto(v.vendedor)) continue;");
  });

  it("la comparación no depende de mayúsculas ni espacios", () => {
    expect(vista).toContain("v.trim().toUpperCase()");
  });
});

describe("⚠️ el endpoint sirve a los dos consumidores", () => {
  it("con vendedor devuelve la forma de siempre (el modal de detalle)", () => {
    expect(ruta).toContain("if (vendedor) return NextResponse.json({ descuentos })");
  });

  it("sin vendedor agrega el total por vendedor (la tabla)", () => {
    expect(ruta).toContain("porVendedor: totalPorVendedor(descuentos)");
    expect(lib).toContain("porVendedor[d.vendedor]");
  });

  it("solo suma los descuentos ACTIVOS del mes", () => {
    expect(lib).toContain("if (!d.activo || !d.vendedor) continue;");
  });

  it("la regla del `activo` efectivo existe UNA sola vez", () => {
    // Dos copias serían dos totales de comisión posibles para el mismo mes.
    expect(lib).toContain('excById.has(id) ? excById.get(id)! : true');
    for (const [nombre, src] of [["descuentos/route", ruta], ["consolidado/route", consolidado]] as const) {
      expect(src, nombre).toContain("@/lib/comisiones/descuentos");
      expect(src, nombre).not.toContain('.from("comision_descuentos_fijos")');
      // Ojo: el POST de `descuentos/route` SÍ escribe en `excepciones` (guarda
      // la excepción del mes) y eso se queda. Lo que no puede volver a haber es
      // una segunda LECTURA de la regla.
      expect(src, nombre).not.toContain('.select("descuento_id, activo")');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 UNA llamada, no diez (12-ago-2026)", () => {
  // Medido contra el build de producción: abrir /comisiones disparaba
  // `/api/ventas/comisiones` ×5 en el mismo milisegundo y
  // `/api/ventas/comisiones/descuentos` ×5 — 10 peticiones y 15 consultas a la
  // base donde alcanzaban 1 y 7. La causa nunca fue un `useEffect` inestable:
  // era el bucle sobre las 5 empresas con un fetch anidado adentro.
  it("la vista pide UNA sola vez, al endpoint consolidado", () => {
    expect(vista).toContain("/api/ventas/comisiones/consolidado?year=");
    expect((vista.match(/await fetch\(/g) ?? []).length).toBe(1);
  });

  it("la vista NO vuelve a fetchear dentro de un bucle de empresas", () => {
    expect(vista).not.toMatch(/EMPRESAS\.map\(async/);
    expect(vista).not.toContain("/api/ventas/comisiones?empresa=");
    expect(vista).not.toContain("/api/ventas/comisiones/descuentos?empresa=");
  });

  it("los descuentos de las 5 empresas se leen de una vez, no una por empresa", () => {
    // `empresa_key` acá es solo un `.eq()` de filtro: nada obligaba a partirlo.
    expect(lib).toContain('.in("empresa_key", empresas as string[])');
  });

  it("la lista de empresas que comisionan vive en UN solo lugar", () => {
    // Estaba escrita idéntica en las dos vistas y ahora la necesita también el
    // endpoint: tres copias es la forma de que un día se contradigan.
    //
    // 14-ago-2026: la lista dejó de restar joystep, así que dejó de haber un
    // `.filter` que buscar — lo que este candado siempre quiso decir es que se
    // DERIVA de `B2B_EMPRESA_KEYS`, y eso ahora se exige directo. `ComisionesView`
    // se suma a la lista: era la CUARTA copia, escrita a mano.
    expect(leer("src/lib/comisiones/empresas.ts")).toContain("B2B_EMPRESA_KEYS");
    for (const rel of [
      "src/components/ventas/ComisionesConsolidadoView.tsx",
      "src/components/ventas/ComisionesPorEmpresaView.tsx",
      "src/components/ventas/ComisionesView.tsx",
      "src/app/api/ventas/comisiones/consolidado/route.ts",
    ]) {
      expect(leer(rel), rel).toContain("EMPRESAS_COMISIONAN");
    }
  });

  it("las RPC siguen siendo la MISMA comision_b2b_v5, sin tocar el cálculo", () => {
    expect(consolidado).toContain('supabaseServer.rpc("comision_b2b_v5"');
    expect(consolidado).toContain("p_empresa_key: empresa");
  });
});

describe("⚠️ el texto al pie ya no miente", () => {
  it("dice que los descuentos también están restados", () => {
    expect(vista).toContain("Ya están descontados lo devuelto y los descuentos");
  });
});

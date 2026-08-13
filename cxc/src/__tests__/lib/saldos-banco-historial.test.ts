/**
 * Candados del HISTORIAL de saldos de banco.
 *
 * Daniel: *"hagamoslo carga manual, pero que se pueda editar, corregir, ver
 * historial, osea lo necesario para que la contable meta los saldos y vea si lo
 * hizo bien de manera minimalista y simple"*.
 *
 * 🩸 EL CASO REAL QUE PRUEBA QUE HACÍA FALTA, medido en producción el
 * 13-ago-2026 sobre las 52 filas de `bancos_saldos`
 * (`scripts/_diag-gastos-saldos-fusion.ts`, solo lectura): las **3 cargas del
 * 10-ago repiten AL CENTAVO el saldo del 31-jul** de su empresa. Se copiaron los
 * de julio, y la pantalla vieja —que mostraba UN saldo por empresa y nada más—
 * no tenía forma de enseñarlo.
 *
 * Los fixtures de abajo son los DATOS REALES, no inventados: si algún día el
 * criterio de "repite exacto" se afloja, estos tres dejan de marcarse y el build
 * se pone rojo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  empresasConUltimoRepetido,
  historialPorEmpresa,
  mismoMonto,
  ultimoPorEmpresa,
  type FilaSaldo,
} from "@/lib/saldos-banco/historial";

const raiz = join(__dirname, "..", "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

/** `bancos_saldos` tal como está en producción (13-ago-2026): 52 filas, 7
 *  empresas, todas firmadas `created_by = "Contabilidad"`. Se transcriben las
 *  4 empresas que hacen falta para probar las dos direcciones. */
const PRODUCCION: FilaSaldo[] = [
  // active_shoes — 8 cargas; la del 10-ago COPIA la del 31-jul.
  { empresa_key: "active_shoes", fecha_dato: "2026-06-30", saldo: 62911.97, created_by: "Contabilidad" },
  { empresa_key: "active_shoes", fecha_dato: "2026-07-31", saldo: 27647.97, created_by: "Contabilidad" },
  { empresa_key: "active_shoes", fecha_dato: "2026-08-10", saldo: 27647.97, created_by: "Contabilidad" },
  // active_wear — ídem.
  { empresa_key: "active_wear", fecha_dato: "2026-06-30", saldo: 37237.53, created_by: "Contabilidad" },
  { empresa_key: "active_wear", fecha_dato: "2026-07-31", saldo: 60678.97, created_by: "Contabilidad" },
  { empresa_key: "active_wear", fecha_dato: "2026-08-10", saldo: 60678.97, created_by: "Contabilidad" },
  // fashion_shoes — ídem.
  { empresa_key: "fashion_shoes", fecha_dato: "2026-06-30", saldo: 115703.52, created_by: "Contabilidad" },
  { empresa_key: "fashion_shoes", fecha_dato: "2026-07-31", saldo: 74336.02, created_by: "Contabilidad" },
  { empresa_key: "fashion_shoes", fecha_dato: "2026-08-10", saldo: 74336.02, created_by: "Contabilidad" },
  // fashion_wear — 7 cargas, NINGUNA repetida. Es la otra dirección del test:
  // marcar de más sería igual de malo que no marcar.
  { empresa_key: "fashion_wear", fecha_dato: "2026-05-31", saldo: 142813.6, created_by: "Contabilidad" },
  { empresa_key: "fashion_wear", fecha_dato: "2026-06-30", saldo: 189431.88, created_by: "Contabilidad" },
  { empresa_key: "fashion_wear", fecha_dato: "2026-07-31", saldo: 317460.51, created_by: "Contabilidad" },
];

describe("🩸 el caso real: las 3 cargas del 10-ago copiaron las del 31-jul", () => {
  it("las tres se marcan, y ninguna otra", () => {
    expect(empresasConUltimoRepetido(PRODUCCION)).toEqual([
      "active_shoes",
      "active_wear",
      "fashion_shoes",
    ]);
  });

  it("cada una dice CONTRA QUÉ fecha repite (sin eso el aviso no se puede verificar)", () => {
    const h = historialPorEmpresa(PRODUCCION);
    for (const emp of ["active_shoes", "active_wear", "fashion_shoes"]) {
      const ultima = h.get(emp)![0];
      expect(ultima.fecha_dato).toBe("2026-08-10");
      expect(ultima.repiteAnterior).toBe(true);
      expect(ultima.fechaAnterior).toBe("2026-07-31");
    }
  });

  it("🔴 la empresa que NO copió no se marca", () => {
    const fw = historialPorEmpresa(PRODUCCION).get("fashion_wear")!;
    expect(fw.every((c) => !c.repiteAnterior)).toBe(true);
    expect(empresasConUltimoRepetido(PRODUCCION)).not.toContain("fashion_wear");
  });
});

describe("el historial se lee de la más NUEVA a la más vieja", () => {
  it("respeta el orden aunque las filas lleguen desordenadas", () => {
    // PostgREST las devuelve ordenadas por `id` (el orden de PAGINACIÓN), que no
    // es el cronológico: las 52 filas se cargaron mes por mes en una tarde.
    const desordenadas: FilaSaldo[] = [
      { empresa_key: "vistana", fecha_dato: "2026-03-31", saldo: 74886.36 },
      { empresa_key: "vistana", fecha_dato: "2026-01-31", saldo: 28190.14 },
      { empresa_key: "vistana", fecha_dato: "2026-02-28", saldo: 165363.98 },
    ];
    expect(historialPorEmpresa(desordenadas).get("vistana")!.map((c) => c.fecha_dato)).toEqual([
      "2026-03-31",
      "2026-02-28",
      "2026-01-31",
    ]);
  });

  it("🔴 'la anterior' es la de la MISMA empresa, nunca la de otra", () => {
    // Dos empresas distintas con el mismo monto no son un error de carga:
    // marcarlo sería un aviso que no significa nada.
    const dos: FilaSaldo[] = [
      { empresa_key: "vistana", fecha_dato: "2026-07-31", saldo: 1000 },
      { empresa_key: "joystep", fecha_dato: "2026-08-31", saldo: 1000 },
    ];
    expect(empresasConUltimoRepetido(dos)).toEqual([]);
  });

  it("la primera carga de una empresa nunca repite a nadie", () => {
    const una: FilaSaldo[] = [{ empresa_key: "joystep", fecha_dato: "2026-07-31", saldo: 500 }];
    const h = historialPorEmpresa(una).get("joystep")!;
    expect(h[0].repiteAnterior).toBe(false);
    expect(h[0].fechaAnterior).toBeNull();
  });

  it("un repetido en el MEDIO se marca en su fila, pero no dispara el aviso de arriba", () => {
    // El aviso mira el ÚLTIMO: es el que hoy está diciendo cuánta plata hay. Uno
    // viejo ya está marcado en su fila y no hay nada urgente que corregir.
    const conMedio: FilaSaldo[] = [
      { empresa_key: "vistana", fecha_dato: "2026-05-31", saldo: 100 },
      { empresa_key: "vistana", fecha_dato: "2026-06-30", saldo: 100 },
      { empresa_key: "vistana", fecha_dato: "2026-07-31", saldo: 250 },
    ];
    const h = historialPorEmpresa(conMedio).get("vistana")!;
    expect(h.map((c) => c.repiteAnterior)).toEqual([false, true, false]);
    expect(empresasConUltimoRepetido(conMedio)).toEqual([]);
  });
});

describe("igualdad al CENTAVO, que es la precisión que se muestra", () => {
  it("compara a 2 decimales, no en coma flotante cruda", () => {
    // El POST guarda `Math.round(saldo * 100) / 100` y la pantalla muestra 2
    // decimales: "repite exacto" tiene que medirse ahí. En coma flotante,
    // 0.1 + 0.2 !== 0.3, y el aviso dependería de eso.
    expect(mismoMonto(0.1 + 0.2, 0.3)).toBe(true);
    expect(mismoMonto(27647.97, 27647.97)).toBe(true);
  });

  it("un centavo de diferencia NO es repetir", () => {
    expect(mismoMonto(27647.97, 27647.98)).toBe(false);
    const casi: FilaSaldo[] = [
      { empresa_key: "active_shoes", fecha_dato: "2026-07-31", saldo: 27647.97 },
      { empresa_key: "active_shoes", fecha_dato: "2026-08-10", saldo: 27647.98 },
    ];
    expect(empresasConUltimoRepetido(casi)).toEqual([]);
  });

  it("dos ceros seguidos SÍ repiten (una cuenta vacía dos veces se ve igual que copiarla)", () => {
    const ceros: FilaSaldo[] = [
      { empresa_key: "joystep", fecha_dato: "2026-07-31", saldo: 0 },
      { empresa_key: "joystep", fecha_dato: "2026-08-31", saldo: 0 },
    ];
    expect(empresasConUltimoRepetido(ceros)).toEqual(["joystep"]);
  });

  it("los saldos NEGATIVOS entran igual: los sobregiros existen", () => {
    const sobregiro: FilaSaldo[] = [
      { empresa_key: "joystep", fecha_dato: "2026-07-31", saldo: -1200.5 },
      { empresa_key: "joystep", fecha_dato: "2026-08-31", saldo: -1200.5 },
    ];
    expect(empresasConUltimoRepetido(sobregiro)).toEqual(["joystep"]);
  });
});

describe("🔴 el último saldo por empresa NO se movió ni un centavo", () => {
  it("gana la fecha_dato más reciente — el MISMO criterio que la Disponibilidad", () => {
    // Si acá se eligiera otra fila (la más recién cargada, por ejemplo), esta
    // pantalla y la "Disponibilidad" de Vista General mostrarían números
    // distintos del mismo banco. Con los datos reales del 13-ago:
    const ultimos = new Map(ultimoPorEmpresa(PRODUCCION).map((b) => [b.empresa_key, b]));
    expect(ultimos.get("active_shoes")!.saldo).toBe(27647.97);
    expect(ultimos.get("active_shoes")!.fecha_dato).toBe("2026-08-10");
    expect(ultimos.get("active_wear")!.saldo).toBe(60678.97);
    expect(ultimos.get("fashion_shoes")!.saldo).toBe(74336.02);
    // fashion_wear no cargó agosto: su último sigue siendo el 31-jul.
    expect(ultimos.get("fashion_wear")!.fecha_dato).toBe("2026-07-31");
    expect(ultimos.get("fashion_wear")!.saldo).toBe(317460.51);
  });

  it("una fila desordenada no puede ganarle a la más nueva", () => {
    const desorden: FilaSaldo[] = [
      { empresa_key: "vistana", fecha_dato: "2026-07-31", saldo: 132870.42 },
      { empresa_key: "vistana", fecha_dato: "2026-01-31", saldo: 28190.14 },
    ];
    expect(ultimoPorEmpresa(desorden)[0].saldo).toBe(132870.42);
  });

  it("sale ordenado por fecha, de la más nueva a la más vieja", () => {
    expect(ultimoPorEmpresa(PRODUCCION).map((b) => b.empresa_key)).toEqual([
      "active_shoes",
      "active_wear",
      "fashion_shoes",
      "fashion_wear",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Barridos estáticos: la escritura y la lectura de `bancos_saldos` NO cambian
// ─────────────────────────────────────────────────────────────────────────────

describe("⚠️ `bancos_saldos` se sigue escribiendo y leyendo igual que siempre", () => {
  const api = leer("src/app/api/saldos-banco/route.ts");

  it("mismo upsert por (empresa_key, fecha_dato) — corrige el día, nunca duplica", () => {
    expect(api).toContain('.from("bancos_saldos")');
    expect(api).toContain('onConflict: "empresa_key,fecha_dato"');
    // 🔴 Corregir una fecha vieja NO puede borrar nada: sin DELETE, un error de
    // fecha se arregla escribiendo esa fecha otra vez y punto.
    expect(api).not.toMatch(/\.delete\(\)/);
  });

  it("se lee con `leerTodoPaginado` — `db-max-rows` = 1000 corta EN SILENCIO", () => {
    // Y acá un truncado NO se vería como un error: se vería como "esta empresa
    // no tiene saldo", que es la peor forma de fallar en una pantalla de plata.
    // La tabla crece ~84 filas/año y el historial las manda TODAS.
    expect(api).toContain("leerTodoPaginado");
    expect(api).toMatch(/\.order\("id"/);
    expect(api).not.toMatch(/\.limit\(\s*\d{4,}\s*\)/);
  });

  it("el historial y el último saldo salen de las MISMAS funciones puras", () => {
    // Si la ruta se calculara su propio "último", el número de arriba y el
    // historial de abajo podrían contradecirse — que es justo lo que esta
    // pantalla vino a hacer visible.
    expect(api).toContain('from "@/lib/saldos-banco/historial"');
    expect(api).toContain("ultimoPorEmpresa(");
    expect(api).toContain("historialPorEmpresa(");
  });

  it("la pantalla usa las mismas funciones y NO reimplementa la comparación", () => {
    const tab = leer("src/app/gastos-contabilidad/components/saldos/SaldosBancarios.tsx");
    // La marca viaja en el dato (`repiteAnterior`), no se recalcula en el
    // navegador: dos comparaciones distintas son dos avisos posibles.
    expect(tab).toContain("repiteAnterior");
    expect(tab).not.toMatch(/Math\.round\([^)]*\*\s*100\)\s*===/);
  });
});

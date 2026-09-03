// Candado de "compras del año" — la definición que comparten la ficha del
// cliente y la columna nueva del listado.
//
// Lo que este archivo protege NO es la aritmética (sumar es fácil): es que el
// listado y la ficha no puedan decir dos números distintos para el mismo
// cliente, y que el año siga cortándose en hora de Panamá.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ymdPanama,
  anioEnCursoPanama,
  ventanaAnioPanama,
  montoFirmado,
  aCentavos,
  aEnteroEscalado,
  escaladoACentavos,
  sumarCentavos,
  TIPOS_QUE_SUMAN,
} from "@/lib/clientes-ytd";
import { esMostrador } from "@/lib/clientes/mostrador";

describe("el año se corta en hora de PANAMÁ, no en UTC", () => {
  // Es el bug que esta casa ya pagó dos veces (Proveedores y el YTD que se
  // cortaba en hora de Londres). Panamá es UTC−5 fijo, sin horario de verano.

  it("el 31-dic 19:00 de Panamá todavía es del año viejo (aunque en UTC ya sea enero)", () => {
    const instante = new Date("2027-01-01T00:00:00.000Z"); // = 31-dic-2026 19:00 Panamá
    expect(ymdPanama(instante.toISOString())).toBe("2026-12-31");
    expect(anioEnCursoPanama(instante)).toBe(2026);
  });

  it("el 31-dic 23:59 de Panamá sigue siendo del año viejo", () => {
    const instante = new Date("2027-01-01T04:59:59.000Z");
    expect(anioEnCursoPanama(instante)).toBe(2026);
  });

  it("recién a las 00:00 del 1-ene de Panamá cambia el año", () => {
    expect(anioEnCursoPanama(new Date("2027-01-01T05:00:00.000Z"))).toBe(2027);
  });

  it("la ventana es semiabierta y arranca a las 05:00 UTC del 1-ene", () => {
    const v = ventanaAnioPanama(new Date("2026-07-27T12:00:00.000Z"));
    expect(v).toEqual({
      anio: 2026,
      desde: "2026-01-01T05:00:00.000Z",
      hasta: "2027-01-01T05:00:00.000Z",
    });
  });

  it("una factura del 31-dic 19:00 de Panamá cae DENTRO del año que le toca", () => {
    const v = ventanaAnioPanama(new Date("2026-12-31T23:00:00.000Z"));
    const factura = "2027-01-01T00:30:00.000Z"; // 31-dic-2026 19:30 Panamá
    expect(factura >= v.desde && factura < v.hasta).toBe(true);
  });

  it("una factura del 1-ene 00:30 de Panamá NO cuenta para el año anterior", () => {
    const v = ventanaAnioPanama(new Date("2026-06-01T12:00:00.000Z")); // año 2026
    const factura = "2027-01-01T05:30:00.000Z"; // 1-ene-2027 00:30 Panamá
    expect(factura < v.hasta).toBe(false);
  });
});

describe("signo por tipo de comprobante", () => {
  it("Factura, Tiquete, Transacción y Nota de Débito SUMAN", () => {
    for (const tipo of TIPOS_QUE_SUMAN) {
      expect(montoFirmado(tipo, 100)).toBe(100);
    }
  });

  it("Nota de Crédito RESTA — es lo que hace que las compras sean netas", () => {
    expect(montoFirmado("Nota de Crédito", 100)).toBe(-100);
  });

  it("un tipo desconocido vale 0, no se cuela como venta", () => {
    expect(montoFirmado("Cotización", 100)).toBe(0);
    expect(montoFirmado(null, 100)).toBe(0);
    expect(montoFirmado(undefined, 100)).toBe(0);
  });

  it("acepta el numeric como string, que es como lo manda PostgREST", () => {
    expect(montoFirmado("Factura", "1234.56")).toBe(1234.56);
    expect(montoFirmado("Nota de Crédito", "10.5")).toBe(-10.5);
  });

  it("un monto ilegible vale 0 en vez de contaminar la suma con NaN", () => {
    expect(montoFirmado("Factura", "no es un número")).toBe(0);
    expect(montoFirmado("Factura", null)).toBe(0);
  });

  it("reproduce el número de D-108 medido en producción (sin ITBMS)", () => {
    // Muestra reducida con la misma forma que la real: facturas menos NCs.
    const docs = [
      { tipo: "Factura", monto: 186_215.7 },
      { tipo: "Nota de Débito", monto: 12_000 },
      { tipo: "Nota de Crédito", monto: 1_297.5 },
      { tipo: "Cotización", monto: 999_999 }, // no cuenta
    ];
    const suma = docs.reduce((s, d) => s + montoFirmado(d.tipo, d.monto), 0);
    expect(aCentavos(suma)).toBe(196_918.2);
  });
});

describe("sumar plata no puede depender del ORDEN de las filas", () => {
  // 🩸 Medido contra producción: City Mall Paso Canoa daba 1.073.515,50 en el
  // listado y 1.073.515,49 en la ficha. Misma definición, mismos documentos —
  // la única diferencia era el orden en que llegaban (el listado los lee
  // paginados por id). Sumar decimales no es asociativo y el error se coló al
  // centavo. Ahora se acumula en enteros.

  /** Montos con decimales "feos" a propósito, del orden de magnitud real. */
  const montos = [
    12_345.67, 8_901.23, 4_567.89, 1_234.56, 99_999.99, 7_777.77,
    3_333.33, 66_666.66, 22_222.22, 555.55, 88_888.88, 4_444.44,
  ];

  const acumularEscalado = (xs: number[]) =>
    escaladoACentavos(xs.reduce((s, x) => s + aEnteroEscalado(x), 0));

  it("da el mismo centavo en cualquier orden", () => {
    const alDerecho = acumularEscalado(montos);
    const alReves = acumularEscalado([...montos].reverse());
    const mezclado = acumularEscalado([...montos].sort((a, b) => a - b));
    expect(alReves).toBe(alDerecho);
    expect(mezclado).toBe(alDerecho);
  });

  it("sumar por grupos da lo mismo que sumar todo junto", () => {
    // Es el caso real: la ficha suma por empresa y el listado sumaba todo junto.
    const mitad = Math.floor(montos.length / 2);
    const porGrupos = sumarCentavos([
      acumularEscalado(montos.slice(0, mitad)),
      acumularEscalado(montos.slice(mitad)),
    ]);
    expect(porGrupos).toBe(acumularEscalado(montos));
  });

  it("respeta las 4 decimales de numeric(14,4) sin perder precisión", () => {
    // Cuatro documentos de 0,0001 tienen que sumar 0,0004 → 0,00 en centavos,
    // no cuatro redondeos a cero por separado que igual dan cero, pero tampoco
    // un centavo inventado.
    expect(acumularEscalado([0.0001, 0.0001, 0.0001, 0.0001])).toBe(0);
    // 0,005 × 2 = 0,01 exacto.
    expect(acumularEscalado([0.005, 0.005])).toBe(0.01);
  });

  it("sumarCentavos no arrastra colas binarias", () => {
    expect(sumarCentavos([0.1, 0.2])).toBe(0.3);
    expect(sumarCentavos([44_307.63, 124_472.26, 29_252.2])).toBe(198_032.09);
  });
});

describe("redondeo a centavos", () => {
  it("no deja colas binarias llegar a la pantalla", () => {
    // 44307.630000000005 fue un valor REAL de la suma de vistana para D-108.
    expect(aCentavos(44_307.630000000005)).toBe(44_307.63);
    expect(aCentavos(0.1 + 0.2)).toBe(0.3);
  });
});

describe("SIN ITBMS — la base es subtotal_descuento, no total", () => {
  // Decisión de Daniel (27-jul-2026): "Sin ITBMS" para ventas. El impuesto se
  // cobra para el fisco y nunca fue ingreso de la empresa. Medido en D-108:
  // 210.702,50 con ITBMS → 196.918,20 sin (−13.784,30).
  const raiz = path.join(__dirname, "..", "..");
  const consulta = fs.readFileSync(path.join(raiz, "lib/clientes-ytd-consulta.ts"), "utf8");
  const ficha = fs.readFileSync(path.join(raiz, "app/api/clientes/[codigo]/route.ts"), "utf8");
  const migracion = fs.readFileSync(
    path.join(raiz, "..", "supabase/migrations/20260727230000_clientes_del_grupo_visibles_y_ficha_sin_itbms.sql"),
    "utf8");

  it("el listado lee subtotal_descuento", () => {
    expect(consulta).toContain("tipo_comprobante, subtotal_descuento");
    expect(consulta).not.toContain("tipo_comprobante, total");
  });

  it("la ficha (refetch) lee subtotal_descuento", () => {
    expect(ficha).toContain("tipo_comprobante, subtotal_descuento");
    expect(ficha).not.toContain("tipo_comprobante, total");
  });

  it("la RPC de la ficha también, vía migración", () => {
    expect(migracion).toContain("sf.subtotal_descuento");
    expect(migracion).toContain("CREATE OR REPLACE FUNCTION cliente_ficha_ventas");
  });

  it("CXC y cobros NO se tocan: siguen con ITBMS", () => {
    // switch_estadocuenta_aging.total y switch_recibos.total son "lo que hay
    // que cobrar" / "lo que entró" — llevan ITBMS a propósito.
    expect(ficha).toContain('.from("switch_estadocuenta_aging")');
    expect(ficha).toContain('.from("switch_recibos")');
    expect(migracion).not.toContain("switch_estadocuenta");
    expect(migracion).not.toContain("switch_recibos");
  });
});

describe("las empresas del grupo vuelven al ranking SIN mover los totales", () => {
  const raiz = path.join(__dirname, "..", "..");
  const migracion = fs.readFileSync(
    path.join(raiz, "..", "supabase/migrations/20260727230000_clientes_del_grupo_visibles_y_ficha_sin_itbms.sql"),
    "utf8");

  it("saca a las empresas del grupo de la lista de exclusión del ranking", () => {
    const filtro = migracion.slice(migracion.indexOf("filtered AS ("), migracion.indexOf("keyed AS ("));
    expect(filtro).not.toContain("MULTI FASHION HOLDING");
    expect(filtro).not.toContain("CONFECCIONES BOSTON");
  });

  it("en su día dejó excluidos los genéricos de mostrador POR NOMBRE", () => {
    // 🩸 ESTE TEST CAMBIÓ DE DIRECCIÓN EL 2-SEP-2026, Y NO SE BORRA: es la foto
    // del criterio que costó plata. Esta migración (27-jul) sacaba al mostrador
    // por su NOMBRE, y ese archivo es historia — se lee tal cual quedó.
    //
    // Lo que el criterio no podía saber es que el mostrador **se llama distinto
    // en cada empresa**: `Contado` en joystep/active_wear/active_shoes, `VENTAS`
    // en fashion_wear/vistana y `VENTAS LOCA` —truncado— en fashion_shoes. La
    // lista mataba cinco de seis y dejaba pasar al sexto de casualidad, porque
    // dice `VENTAS LOCALES` y Switch escribe `VENTAS LOCA`. La fila ámbar de
    // Ventas › Clientes terminó mostrando $25.835,65 de $54.478,59.
    //
    // La regla vigente está abajo: se reconoce por CÓDIGO (`TCKCTA`).
    const filtro = migracion.slice(migracion.indexOf("filtered AS ("), migracion.indexOf("keyed AS ("));
    for (const generico of ["CONTADO", "VENTAS", "VENTAS LOCALES", "(Sin nombre)"]) {
      expect(filtro).toContain(generico);
    }
  });

  it("🔴 HOY el mostrador se reconoce por CÓDIGO, y la última migración manda", () => {
    // La migración en vigor deja pasar a `TCKCTA` para que la pantalla pueda
    // mostrarlo APARTE — sigue fuera del ranking, pero ahora llegan los seis.
    // Comparar por nombre volvió a ser lo que era: un colador.
    // La vigente es la última que recrea el ranking. 20260909120000 (el corte
    // del año anterior por DÍA) es copia de 20260908120000 en todo lo demás.
    const vigente = fs.readFileSync(
      path.join(raiz, "..", "supabase/migrations/20260909120000_clientes_vs_anio_anterior_mismos_dias.sql"),
      "utf8");
    const ejecutable = vigente.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
    const filtros = [...ejecutable.matchAll(/filtered AS \(([\s\S]*?)\n\s*\),/g)].map(m => m[1]);
    expect(filtros.length, "las dos ramas del ranking tienen que decir lo mismo").toBe(2);
    for (const f of filtros) expect(f).toContain("'TCKCTA'");
    expect(esMostrador("TCKCTA")).toBe(true);
    for (const nombre of ["Contado", "VENTAS", "VENTAS LOCA", "VENTAS LOCAL"]) {
      expect(esMostrador(nombre), nombre).toBe(false);
    }
  });

  it("marca es_del_grupo sin filtrar ni restar nada", () => {
    expect(migracion).toContain("AS es_del_grupo");
    expect(migracion).toContain("BOOL_OR(es_del_grupo)");
    // La marca NO puede aparecer en ningún WHERE: sería una exclusión disfrazada.
    for (const linea of migracion.split("\n")) {
      if (/\bWHERE\b/.test(linea)) expect(linea).not.toContain("es_del_grupo");
    }
  });

  it("NO toca ninguna fuente de totales de venta", () => {
    // Los totales ya incluían a Multi Fashion Holding (medido: 4.656.824,38 en
    // ventas_dashboard_summary = suma cruda CON él). Si esta migración tocara
    // esas fuentes, los totales se moverían y Daniel vería otro número.
    // Se mira el SQL EJECUTABLE, no los comentarios (el encabezado cita esas
    // fuentes justamente para dejar la medición asentada).
    const sql = migracion.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
    for (const fuenteDeTotales of [
      "ventas_dashboard_summary",
      "ventas_rollup_mensual_mv",
      "ventas_topclientes_summary",
      "ventas_clientes_detalle_summary",
    ]) {
      expect(sql).not.toContain(fuenteDeTotales);
    }
  });
});

describe("UNA sola definición: la ficha no reimplementa el cálculo", () => {
  const raiz = path.join(__dirname, "..", "..");
  const ficha = fs.readFileSync(path.join(raiz, "app/api/clientes/[codigo]/route.ts"), "utf8");
  const ytdEndpoint = fs.readFileSync(path.join(raiz, "app/api/clientes/ytd/route.ts"), "utf8");

  it("la ficha importa el módulo compartido", () => {
    expect(ficha).toMatch(/from "@\/lib\/clientes-ytd"/);
  });

  it("el endpoint del listado importa el MISMO módulo", () => {
    expect(ytdEndpoint).toMatch(/from "@\/lib\/clientes-ytd"/);
  });

  it("la ficha ya no lleva su propia lista de tipos ni su propio offset de Panamá", () => {
    // Estas dos líneas eran la copia local que podía divergir del listado.
    expect(ficha).not.toContain('const POS = new Set(');
    expect(ficha).not.toContain("5 * 3600 * 1000");
  });

  it("la ficha ya no saca el año del reloj del servidor", () => {
    // Era `new Date(new Date().getFullYear(), 0, 1)`: en un servidor UTC eso
    // adelanta el cambio de año 5 horas respecto de Panamá.
    expect(ficha).not.toContain("new Date(new Date().getFullYear()");
    expect(ficha).toContain("ventanaAnioPanama()");
  });
});

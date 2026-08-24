/**
 * Candados del detalle de línea de facturas y notas de crédito.
 *
 * Los fixtures son las respuestas REALES de producción medidas el 24-ago-2026
 * (Active Shoes: factura 1390 y NC 1399). No son inventados: el bug que este
 * módulo tiene que evitar es exactamente el de las dos convenciones de signo
 * que Switch mezcla, y con datos inventados se prueba otra cosa.
 */
import { describe, it, expect } from "vitest";
import {
  lineasDeDocumento,
  numeroDeSwitch,
  signoDeTipo,
  tieneDetalle,
  unidadesNetas,
  ventaNeta,
  empresasConDetalleDeLinea,
  TIPOS_CON_DETALLE,
  type CabeceraDocumento,
} from "@/lib/switch-api/factura-lineas-parse";
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

const cabFactura: CabeceraDocumento = {
  empresa_key: "active_shoes",
  tipo_comprobante: "Factura",
  switch_factura_id: 1390,
  secuencial: "11-000020322",
  fecha: "2026-08-07T17:23:30+00:00",
  cliente_switch_id: 69,
  cliente_nombre: "City Mall Paso Canoa",
  vendedor_switch_id: 2,
  vendedor_nombre: "REINALDO ESPINOSA",
};

const cabNC: CabeceraDocumento = {
  ...cabFactura,
  tipo_comprobante: "Nota de Crédito",
  switch_factura_id: 1399,
  secuencial: "13-000000183",
};

/** Línea REAL de una factura (Active Shoes, 24-ago-2026). Cantidad POSITIVA. */
const LINEA_FACTURA = {
  id: 9048,
  codigoBarraId: 1618,
  articuloId: 1324,
  codigoArticulo: "100250388",
  rubro: "SHOES",
  subrubro: "FEMALE",
  marca: "FOOTWEAR",
  cantidad: "24.0000",
  precio: "30.0000",
  descuento: "0.0000",
  subTotalConDescuento: "720.0000",
  descripcion: "VERSE",
};

/** Línea REAL de una NC. 🔴 Cantidad NEGATIVA, monto POSITIVO, y SIN `id`. */
const LINEA_NC = {
  codigoBarraId: 2435,
  articuloId: 2040,
  codigoArticulo: "A01",
  rubro: "DISPLAY & PROMO",
  subrubro: "DISPLAY & PROMO",
  marca: "AT CRAZE 3",
  cantidad: "-1.0000",
  precio: "758.2700",
  descuento: "0.0000",
  subTotalConDescuento: "758.2700",
  descripcion: "AJUSTE DE PRECIO",
};

describe("los montos de Switch llegan como texto y a veces con coma de miles", () => {
  it("una coma de miles NO produce NaN", () => {
    // Number("78,270.0000") da NaN, y un NaN que entra a una suma la vuelve NaN
    // entera sin un solo error a la vista. Es un valor REAL: así viene el
    // subTotal de la cotización 45 de active_shoes.
    expect(numeroDeSwitch("78,270.0000")).toBe(78270);
  });
  it("acepta número, texto y decimales", () => {
    expect(numeroDeSwitch("24.0000")).toBe(24);
    expect(numeroDeSwitch(30)).toBe(30);
    expect(numeroDeSwitch("-1.0000")).toBe(-1);
  });
  it("lo que no es un número es null, nunca 0", () => {
    // Un 0 diría "se vendieron cero unidades"; null dice "no vino el dato".
    expect(numeroDeSwitch(null)).toBeNull();
    expect(numeroDeSwitch("")).toBeNull();
    expect(numeroDeSwitch("   ")).toBeNull();
    expect(numeroDeSwitch("abc")).toBeNull();
    expect(numeroDeSwitch(Number.NaN)).toBeNull();
  });
});

describe("🔴 se guardan MAGNITUDES — las dos convenciones de Switch se unifican", () => {
  it("una línea de FACTURA guarda su cantidad tal cual", () => {
    const [l] = lineasDeDocumento(cabFactura, [LINEA_FACTURA]);
    expect(l.cantidad).toBe(24);
    expect(l.subtotal_con_descuento).toBe(720);
  });

  it("una línea de NC guarda la cantidad en POSITIVO aunque venga negativa", () => {
    const [l] = lineasDeDocumento(cabNC, [LINEA_NC]);
    expect(l.cantidad).toBe(1); // vino "-1.0000"
    expect(l.subtotal_con_descuento).toBe(758.27);
  });

  it("ninguna magnitud puede quedar negativa (lo mismo que exige el CHECK)", () => {
    const filas = [
      ...lineasDeDocumento(cabFactura, [LINEA_FACTURA]),
      ...lineasDeDocumento(cabNC, [LINEA_NC, { ...LINEA_NC, subTotalConDescuento: "-5" }]),
    ];
    for (const f of filas) {
      expect(f.cantidad).toBeGreaterThanOrEqual(0);
      expect(f.subtotal_con_descuento).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("🔴 el signo lo pone la LECTURA — una NC RESTA", () => {
  it("signoDeTipo distingue los dos tipos", () => {
    expect(signoDeTipo("Factura")).toBe(1);
    expect(signoDeTipo("Nota de Crédito")).toBe(-1);
  });

  it("⚠️ el tipo lleva TILDE — sin ella el signo no se aplica y nada avisa", () => {
    // Este es el modo de fallo silencioso que ya costó dos alarmas falsas en
    // este repo: el CASE compara contra 'Nota de Credito' y la base dice
    // 'Nota de Crédito'.
    expect(signoDeTipo("Nota de Credito")).toBe(1);
  });

  it("la firma del error: sumar sin signo da EXACTO el doble de las NC", () => {
    const lineas = [
      ...lineasDeDocumento(cabFactura, [LINEA_FACTURA]), // +24 u, +$720
      ...lineasDeDocumento(cabNC, [{ ...LINEA_NC, cantidad: "-4.0000", subTotalConDescuento: "120.0000" }]),
    ];
    const neto = unidadesNetas(lineas);
    const bruto = lineas.reduce((t, l) => t + l.cantidad, 0);
    expect(neto).toBe(20);
    expect(bruto).toBe(28);
    expect(bruto - neto).toBe(2 * 4); // el doble de las NC, la firma exacta
    expect(ventaNeta(lineas)).toBe(600);
  });
});

describe("🔴 la llave es el ORDEN, porque la línea de una NC no trae id", () => {
  it("la línea de una NC no tiene id y la de una factura sí", () => {
    expect("id" in LINEA_NC).toBe(false);
    expect("id" in LINEA_FACTURA).toBe(true);
  });

  it("dos líneas del MISMO artículo en el mismo documento no colapsan", () => {
    // Sin el orden en la llave, un documento con el mismo código repetido
    // guardaría una sola línea y la mitad de las unidades desaparecería.
    const lineas = lineasDeDocumento(cabFactura, [LINEA_FACTURA, LINEA_FACTURA]);
    expect(lineas).toHaveLength(2);
    expect(lineas.map((l) => l.linea_orden)).toEqual([0, 1]);
    expect(unidadesNetas(lineas)).toBe(48);
  });

  it("el orden arranca en 0 y es consecutivo", () => {
    const lineas = lineasDeDocumento(cabFactura, [LINEA_FACTURA, LINEA_NC, LINEA_FACTURA]);
    expect(lineas.map((l) => l.linea_orden)).toEqual([0, 1, 2]);
  });
});

describe("la cabecera viaja a cada línea — es lo que permite el cruce nuevo", () => {
  it("el CLIENTE queda en la línea", () => {
    // Es la columna que no existía en ninguna tabla de la base.
    const [l] = lineasDeDocumento(cabFactura, [LINEA_FACTURA]);
    expect(l.cliente_switch_id).toBe(69);
    expect(l.cliente_nombre).toBe("City Mall Paso Canoa");
    expect(l.codigo).toBe("100250388");
    expect(l.descripcion).toBe("VERSE");
  });

  it("los textos vacíos quedan en null, no en cadena vacía", () => {
    const [l] = lineasDeDocumento(cabFactura, [{ ...LINEA_FACTURA, marca: "  ", rubro: "" }]);
    expect(l.marca).toBeNull();
    expect(l.rubro).toBeNull();
  });

  it("un detalle vacío devuelve cero líneas, no una fila fantasma", () => {
    expect(lineasDeDocumento(cabFactura, [])).toEqual([]);
  });
});

describe("solo los dos tipos que TIENEN endpoint de detalle", () => {
  it("factura y nota de crédito sí", () => {
    expect(tieneDetalle("Factura")).toBe(true);
    expect(tieneDetalle("Nota de Crédito")).toBe(true);
  });
  it("🔴 tiquete, transacción y nota de débito NO", () => {
    // No tienen endpoint de detalle: pedirlo devuelve vacío, y guardar eso
    // como "documento sin líneas" sería afirmar que no se vendió nada.
    for (const t of ["Tiquete", "Transacción", "Nota de Débito", "", null, undefined]) {
      expect(tieneDetalle(t as string)).toBe(false);
    }
  });
  it("la lista de tipos es exactamente esa", () => {
    expect([...TIPOS_CON_DETALLE]).toEqual(["Factura", "Nota de Crédito"]);
  });
});

describe("qué empresas entran, y por qué las otras dos no", () => {
  it("las 6 de Fashion Group, DERIVADAS y no escritas a mano", () => {
    expect(empresasConDetalleDeLinea()).toEqual([...B2B_EMPRESA_KEYS]);
    expect(empresasConDetalleDeLinea()).toHaveLength(6);
  });

  it("🔴 Multifashion y Boston quedan fuera", () => {
    const lista = empresasConDetalleDeLinea();
    // american_classic es retail: sus 27.938 facturas son tiquetes de mostrador
    // a nombre de `Contado`, así que "qué le vendo a cada cliente" no tiene
    // respuesta ahí. Boston se lleva fuera de este sistema.
    expect(lista).not.toContain("american_classic");
    expect(lista).not.toContain("confecciones_boston");
  });
});

describe("🔴 el sync_type tiene su DDL — es lo que NO se hizo dos veces antes", () => {
  it("factura_lineas está en la lista del código", () => {
    expect(SYNC_LOG_TYPES).toContain("factura_lineas");
  });

  it("y el CHECK vigente de la base lo admite", () => {
    // Sin esto el logger es degradable: se traga el error del INSERT y la
    // corrida no deja fila ni de éxito ni de error. Pasó con catalogo_tommy y
    // con articulo_marca, las dos veces con meses de invisibilidad.
    const dir = path.join(RAIZ, "supabase", "migrations");
    const checks = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .filter((sql) => sql.includes("switch_sync_log_sync_type_check"));
    const ultimo = checks[checks.length - 1];
    expect(ultimo).toBeTruthy();
    expect(ultimo).toContain("'factura_lineas'");
  });
});

describe("la migración es aditiva y no destruye nada", () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, "supabase", "migrations", "20260824140000_switch_factura_lineas.sql"),
    "utf8",
  );
  // Los barridos de este repo BORRAN LOS COMENTARIOS PRIMERO: ya falló cuatro
  // veces un candado que se cumplía con su propia explicación.
  const cuerpo = sql.replace(/--[^\n]*/g, "");

  it("no borra ni vacía ninguna tabla", () => {
    expect(cuerpo).not.toMatch(/DROP\s+TABLE/i);
    expect(cuerpo).not.toMatch(/TRUNCATE/i);
    expect(cuerpo).not.toMatch(/DELETE\s+FROM/i);
  });

  it("la columna nueva de switch_facturas se agrega, no se reemplaza", () => {
    expect(cuerpo).toMatch(/ADD COLUMN IF NOT EXISTS lineas_synced_at/);
    expect(cuerpo).not.toMatch(/ALTER TABLE switch_facturas\s+DROP/i);
  });

  it("🔴 no toca `detalle_synced_at`, que es de OTRO sync", () => {
    // Esa marca es del descuento global de Multifashion (acs-fidelizacion).
    // Reusarla mezclaría dos syncs sin relación y uno le apagaría el trabajo
    // al otro sin que nada avise.
    expect(cuerpo).not.toContain("detalle_synced_at");
  });

  it("la llave única incluye el orden de la línea", () => {
    expect(cuerpo).toMatch(
      /UNIQUE \(empresa_key, tipo_comprobante, switch_factura_id, linea_orden\)/,
    );
  });

  it("el CHECK de magnitudes existe", () => {
    expect(cuerpo).toMatch(/cantidad >= 0 AND subtotal_con_descuento >= 0/);
  });
});

describe("🔴 el sync no puede marcar un documento antes de escribir sus líneas", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "src", "lib", "switch-api", "sync-factura-lineas.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  it("el upsert de líneas va ANTES del update de la marca", () => {
    // Al revés, un fallo del upsert dejaría el documento marcado como hecho y
    // sus líneas no se bajarían NUNCA MÁS: un hueco permanente y en silencio.
    const iUpsert = src.indexOf('.from("switch_factura_lineas")');
    const iMarca = src.indexOf("lineas_synced_at: new Date()");
    expect(iUpsert).toBeGreaterThan(-1);
    expect(iMarca).toBeGreaterThan(-1);
    expect(iUpsert).toBeLessThan(iMarca);
  });

  it("la lectura de pendientes PAGINA", () => {
    // db-max-rows = 1000 corta en silencio: sin paginar, un backfill de 3.000
    // facturas bajaría 1.000 y se anotaría success.
    expect(src).toContain("leerTodoPaginado");
    expect(src).toMatch(/\.order\("fecha"/);
    expect(src).toMatch(/\.order\("switch_factura_id"/);
  });

  it("las empresas se recorren SERIALMENTE (sesión única de Switch)", () => {
    // Un Promise.all sobre empresas abriría varias sesiones y se tumbarían el
    // token entre sí (code 0006).
    expect(src).toMatch(/for \(const empresaKey of empresas\)/);
    expect(src).not.toMatch(/Promise\.all\(\s*empresas/);
  });

  it("la sesión se cierra en el finally", () => {
    expect(src).toContain("logoutAllSwitchSessions");
    expect(src).toMatch(/finally\s*\{[\s\S]*logoutAllSwitchSessions/);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL SILENCIO NO CUENTA COMO QUE ESTÁ BIEN
 *
 * Las dos alertas hermanas nacidas del incidente del 1-sep-2026, cuando el
 * módulo Gastos estuvo dos días sin recibir datos:
 *   A · un sync trajo CERO donde siempre trae cientos, con `status = success`.
 *   B · una tabla de negocio dejó de recibir escrituras.
 *
 * Este archivo protege las DOS direcciones, y la segunda importa más que la
 * primera: que disparen cuando tienen que disparar, y —sobre todo— que NO
 * disparen por los ceros legítimos que hay medidos en producción. Una alerta que
 * grita por un cero legítimo se gana que Daniel la ignore, y entonces la que
 * importa tampoco se lee.
 *
 * Las series de «CEROS LEGÍTIMOS» de abajo NO son inventadas: están copiadas de
 * switch_sync_log de producción, con su fecha, y cada una tiene el motivo
 * escrito al lado.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import {
  A_MIN_HISTORIA,
  A_PISO_MEDIANA,
  DIAS_ENTRE_AVISOS,
  HORAS_SIN_ESCRIBIR,
  SYNCS_DE_UNIVERSO_COMPLETO,
  TABLAS_VIGILADAS,
  agruparPorModulo,
  evaluarSyncEnCero,
  evaluarTablaQuieta,
  medianaDe,
  mensajeSilencio,
  tipoDeModulo,
  type CorridaDeSync,
  type Hallazgo,
} from "@/lib/alertas/silencio-de-datos";

/** Corridas de la más NUEVA a la más VIEJA — el orden en que las lee PostgREST.
 *  Se pasa el volumen del día más reciente primero. */
function corridas(volumenes: number[]): CorridaDeSync[] {
  return volumenes.map((v, i) => ({
    // Una corrida por día hacia atrás desde el 2-sep-2026.
    cuando: new Date(Date.UTC(2026, 8, 2, 10, 35) - i * 86_400_000).toISOString(),
    volumen: v,
  }));
}

const rep = (v: number, n: number): number[] => Array.from({ length: n }, () => v);

describe("ALERTA A — un sync trajo cero donde siempre trae cientos", () => {
  it("dispara: vistana/egresos_varios traía 378 todos los días y hoy trajo cero", () => {
    const h = evaluarSyncEnCero("vistana", "egresos_varios", corridas([0, ...rep(378, 15)]));
    expect(h).not.toBeNull();
    expect(h?.clase).toBe("sync-en-cero");
    if (h?.clase === "sync-en-cero") {
      expect(h.modulo).toBe("Gastos");
      expect(h.mediana).toBe(378);
    }
  });

  it("dispara aunque la racha de ceros lleve varios días: el 'desde' es el PRIMER cero", () => {
    const h = evaluarSyncEnCero("vistana", "egresos_varios", corridas([0, 0, 0, ...rep(378, 15)]));
    expect(h?.clase).toBe("sync-en-cero");
    if (h?.clase === "sync-en-cero") {
      // El tercer cero hacia atrás = 31-ago, no el de hoy.
      expect(h.desdeIso.slice(0, 10)).toBe("2026-08-31");
    }
  });

  // ── LOS CEROS LEGÍTIMOS, MEDIDOS EN PRODUCCIÓN ────────────────────────────

  it("CERO LEGÍTIMO · joystep y american_classic no tienen egresos varios: 0 todos los días desde el 13-ago", () => {
    expect(evaluarSyncEnCero("joystep", "egresos_varios", corridas(rep(0, 20)))).toBeNull();
    expect(evaluarSyncEnCero("american_classic", "egresos_varios", corridas(rep(0, 20)))).toBeNull();
  });

  it("CERO LEGÍTIMO · el 1-jul-2026 seis pares de recibos trajeron 0: era el primero de mes", () => {
    // vistana/recibos venía en 31, 31, 35 y el 1-jul cargó julio, que estaba vacío.
    expect(evaluarSyncEnCero("vistana", "recibos", corridas([0, 35, 31, 31, ...rep(30, 16)]))).toBeNull();
  });

  it("CERO LEGÍTIMO · joystep/utilidad trajo 0 ocho días seguidos (6-13 ago): no vendió nada", () => {
    expect(evaluarSyncEnCero("joystep", "utilidad", corridas([...rep(0, 8), ...rep(10, 12)]))).toBeNull();
  });

  it("CERO LEGÍTIMO · active_wear y joystep facturan 0 en 1 de cada 3 corridas", () => {
    expect(evaluarSyncEnCero("active_wear", "facturas", corridas([0, ...rep(6, 15)]))).toBeNull();
  });

  it("CERO LEGÍTIMO · ventas_tipos es un centinela: su normal ES cero", () => {
    expect(evaluarSyncEnCero("vistana", "ventas_tipos", corridas(rep(0, 41)))).toBeNull();
  });

  it("CERO LEGÍTIMO · active_shoes/egresos_varios tuvo 4 ceros reales entre el 13 y el 16-ago", () => {
    // Está en la lista de universo completo, así que lo que lo salva es el
    // candado estadístico: un cero en la historia y el par no se vigila.
    const h = evaluarSyncEnCero(
      "active_shoes",
      "egresos_varios",
      corridas([0, ...rep(47, 10), 0, 0, 0, 0, ...rep(47, 3)]),
    );
    expect(h).toBeNull();
  });

  it("CERO LEGÍTIMO · un catálogo que corre 4 veces al día y ya se recuperó no se avisa", () => {
    // Trajo 0 a las 14:30 y 127 a las 17:00. La reconciliación de las 18:00 mira
    // la ÚLTIMA corrida, que ya trae datos: no hay nada que decir.
    expect(evaluarSyncEnCero("active_shoes", "catalogo_reebok", corridas([127, 0, ...rep(127, 15)]))).toBeNull();
  });

  it("SIN HISTORIA no se opina: un par nuevo con 9 corridas se calla", () => {
    // Los conteos van LITERALES a propósito: escritos como `A_MIN_HISTORIA - 1`
    // se moverían junto con la constante y el candado no protegería nada.
    expect(evaluarSyncEnCero("vistana", "egresos_varios", corridas([0, ...rep(378, 9)]))).toBeNull();
    expect(evaluarSyncEnCero("vistana", "egresos_varios", corridas([0, ...rep(378, 10)]))).not.toBeNull();
  });

  it("🔴 los dos pisos están clavados: 10 corridas de historia y mediana 10", () => {
    // 10 corridas no es un número redondo al azar: es lo que la poda de
    // switch_sync_log garantiza conservar de cada par (podar_switch_sync_log).
    // Aflojar cualquiera de los dos es reabrir las falsas alarmas que el
    // backtest de 96 días midió en 14.
    expect(A_MIN_HISTORIA).toBe(10);
    expect(A_PISO_MEDIANA).toBe(10);
  });

  it("DEBAJO DEL PISO no se opina: un par que trae 3 filas no vale una alerta", () => {
    // fashion_shoes/proveedores: mediana 3, sin un solo cero en 54 corridas.
    expect(evaluarSyncEnCero("fashion_shoes", "proveedores", corridas([0, ...rep(3, 20)]))).toBeNull();
    expect(
      evaluarSyncEnCero("fashion_shoes", "proveedores", corridas([0, ...rep(A_PISO_MEDIANA, 20)])),
    ).not.toBeNull();
  });

  it("🔴 la lista de universo completo NO puede admitir un sync de volumen variable", () => {
    // Si alguien mete uno de estos, el backtest de 96 días pasa de 0 disparos a 14
    // y los 14 son falsas alarmas. La lista es cerrada a propósito.
    for (const prohibido of [
      "facturas", // ventana de días: una empresa chica factura 0 y está sana
      "recibos", // carga el mes en curso: el día 1 vale 0 por definición
      "utilidad", // ídem, con 8 días seguidos en cero medidos en joystep
      "articulos", // escritura selectiva: 30 de 58 corridas de active_wear en 0
      "factura_lineas",
      "ingresos_mercancia",
      "ventas_tipos", // es un centinela: su normal ES cero
    ]) {
      expect(SYNCS_DE_UNIVERSO_COMPLETO[prohibido]).toBeUndefined();
    }
  });

  it("la mediana es MEDIANA, no promedio: un día raro no mueve el umbral", () => {
    expect(medianaDe([1, 1, 1, 1, 100000])).toBe(1);
  });
});

describe("ALERTA B — un módulo dejó de recibir datos", () => {
  const gastos = TABLAS_VIGILADAS.find((t) => t.tabla === "egresos_varios")!;
  const AHORA = Date.UTC(2026, 8, 2, 10, 0); // pasada de las 10:00 UTC del 2-sep
  const haceHoras = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();

  it("dispara con dos días perdidos: 47 h sin una sola escritura", () => {
    const h = evaluarTablaQuieta(gastos, "vistana", haceHoras(47), AHORA);
    expect(h?.clase).toBe("tabla-quieta");
    if (h?.clase === "tabla-quieta") expect(h.modulo).toBe("Gastos");
  });

  it("NO dispara con UN día perdido (31 h): la corrida de mañana lo repara sola", () => {
    expect(evaluarTablaQuieta(gastos, "vistana", haceHoras(31), AHORA)).toBeNull();
  });

  it("NO dispara sano: en la pasada de las 10:00 el dato del día anterior ya tiene 23,5 h", () => {
    expect(evaluarTablaQuieta(gastos, "vistana", haceHoras(23.5), AHORA)).toBeNull();
  });

  it("🔴 NUNCA TUVO DATOS no es un problema: joystep y Boston no tienen egresos varios", () => {
    expect(evaluarTablaQuieta(gastos, "joystep", null, AHORA)).toBeNull();
    expect(evaluarTablaQuieta(gastos, "confecciones_boston", null, AHORA)).toBeNull();
  });

  it("🔴 se mira CUÁNDO SE ESCRIBIÓ, nunca la fecha del dato", () => {
    // El reporte de egresos viene con más de un mes de atraso porque así lo carga
    // la contadora: el egreso más nuevo de Vistana hoy es del 31-jul y eso es lo
    // normal. Si esta alerta mirara la fecha del documento sonaría para siempre.
    for (const t of TABLAS_VIGILADAS) {
      expect(["created_at", "synced_at", "updated_at"]).toContain(t.columna);
      expect(["fecha", "mes", "fecha_dato", "fecha_creacion"]).not.toContain(t.columna);
    }
  });

  it("🔴 no vigila tablas de escritura SELECTIVA ni las que ya mira la regla 1", () => {
    const tablas = TABLAS_VIGILADAS.map((t) => t.tabla);
    // Medido el 2-sep-2026: active_wear lleva 144 h sin escribir switch_recibos y
    // joystep 132 h sin escribir switch_factura_lineas, y las dos están sanas.
    expect(tablas).not.toContain("switch_recibos");
    expect(tablas).not.toContain("switch_factura_lineas");
    // Cartera y ventas ya son la regla 1 (`datos-frescos.ts`): repetirlas acá
    // sería el mensaje doble que esta alerta justamente evita.
    expect(tablas).not.toContain("switch_estadocuenta");
    expect(tablas).not.toContain("switch_facturas");
    // Y no la fila del MECANISMO: `egresos_importaciones` se escribe aunque el
    // reporte venga vacío (2-sep-2026: decía 4,9 h con el módulo muerto hacía
    // dos días, mientras `egresos_varios` decía 52,9 h).
    expect(tablas).not.toContain("egresos_importaciones");
  });

  it("el umbral deja pasar un día perdido y no deja pasar dos", () => {
    expect(HORAS_SIN_ESCRIBIR).toBeGreaterThan(31); // un día perdido, visto a las 18:00
    expect(HORAS_SIN_ESCRIBIR).toBeLessThan(47); // dos días perdidos, vistos a las 10:00
  });
});

describe("UN SOLO MENSAJE — A y B por el mismo hecho no pueden mandar dos", () => {
  const hallazgos: Hallazgo[] = [
    {
      clase: "sync-en-cero",
      modulo: "Gastos",
      empresaKey: "vistana",
      syncType: "egresos_varios",
      desdeIso: "2026-09-01T10:35:00.000Z",
      mediana: 378,
    },
    {
      clase: "tabla-quieta",
      modulo: "Gastos",
      empresaKey: "vistana",
      tabla: "egresos_varios",
      que: "los gastos de caja y banco",
      ultimaIso: "2026-08-31T10:35:00.000Z",
      horas: 47,
    },
    {
      clase: "tabla-quieta",
      modulo: "Gastos",
      empresaKey: "fashion_wear",
      tabla: "egresos_varios",
      que: "los gastos de caja y banco",
      ultimaIso: "2026-08-31T10:36:00.000Z",
      horas: 47,
    },
  ];

  it("los tres hallazgos caen en UN solo módulo, o sea un solo mensaje y una sola clave de dedup", () => {
    const grupos = agruparPorModulo(hallazgos);
    expect(grupos.size).toBe(1);
    expect(grupos.get("Gastos")).toHaveLength(3);
  });

  it("la clave del anti-loop es el MÓDULO, y es distinta por módulo", () => {
    expect(tipoDeModulo("Gastos")).not.toBe(tipoDeModulo("Ventas › Referencia"));
    expect(tipoDeModulo("Gastos")).toContain("Gastos");
  });

  it("el anti-loop es de 7 días, el mismo del guard de montos y el de renglones ilegibles", () => {
    expect(DIAS_ENTRE_AVISOS).toBe(7);
  });
});

describe("EL TEXTO — qué pasó / qué significa / qué hacer, sin jerga", () => {
  const msg = mensajeSilencio("Gastos", [
    {
      clase: "sync-en-cero",
      modulo: "Gastos",
      empresaKey: "vistana",
      syncType: "egresos_varios",
      desdeIso: "2026-09-01T15:35:00.000Z",
      mediana: 378,
    },
    {
      clase: "tabla-quieta",
      modulo: "Gastos",
      empresaKey: "fashion_wear",
      tabla: "egresos_varios",
      que: "los gastos de caja y banco",
      ultimaIso: "2026-08-31T15:36:00.000Z",
      horas: 47,
    },
  ]);

  it("nombra el MÓDULO que Daniel abre", () => {
    expect(msg).toContain("Gastos");
  });

  it("dice qué significa y qué hacer", () => {
    expect(msg).toContain("Qué significa:");
    expect(msg).toContain("Qué hacer:");
  });

  it("🔴 no lleva nombres de tabla, sync_type, códigos HTTP ni HTML del proveedor", () => {
    expect(msg).not.toMatch(/egresos_varios|switch_sync_log|sync_type|records_inserted/);
    expect(msg).not.toMatch(/HTTP \d\d\d|<!DOCTYPE|<html/i);
  });

  it("avisa que se repite una vez por semana, para que el silencio posterior no confunda", () => {
    expect(msg).toContain("una vez por semana");
  });

  it("nombra las empresas con su nombre de pantalla, no con la key interna", () => {
    expect(msg).not.toContain("fashion_wear");
    expect(msg).toContain("Fashion Wear");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADOS ESTRUCTURALES — lo que no se puede leer desde una función pura.
 * ────────────────────────────────────────────────────────────────────────── */

import fs from "fs";
import path from "path";

const IO = fs.readFileSync(
  path.join(process.cwd(), "src/lib/alertas/silencio-de-datos-io.ts"),
  "utf8",
);
const RECONCILIACION = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/switch-reconciliacion/route.ts"),
  "utf8",
);
const VERCEL = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as { crons: Array<{ path: string }> };

describe("CANDADOS ESTRUCTURALES", () => {
  it("🔴 el anti-loop existe y se consulta ANTES de mandar", () => {
    // Sin esto la alerta suena en cada pasada de la reconciliación —3 veces al
    // día— hasta que alguien arregle Switch. Es el modo de fallo con el que este
    // repo ya se quemó dos veces.
    expect(IO).toContain("yaAvisadoPorModulo");
    const iDedup = IO.indexOf("await yaAvisadoPorModulo(modulo");
    const iEnvio = IO.indexOf("await enviarSistema(mensajeSilencio");
    expect(iDedup).toBeGreaterThan(-1);
    expect(iEnvio).toBeGreaterThan(-1);
    expect(iDedup).toBeLessThan(iEnvio);
  });

  it("🔴 la llave del dedup se ESCRIBE antes del envío, no después", () => {
    // Si se registrara después, un fallo de Telegram dejaría la llave sin poner y
    // la pasada siguiente volvería a intentar de inmediato. Mismo orden que la
    // regla 1 en `datos-frescos.ts`.
    // El match exige que la llamada abra la sentencia (`^\s*await`), no que
    // aparezca en algún lado: envuelta en un `if` que nunca entra, el archivo
    // seguiría conteniendo el texto y el candado no vería nada.
    const m = IO.match(/^[ \t]*await logCronError\(\s*$/m);
    expect(m).not.toBeNull();
    const iLog = IO.indexOf(m![0]);
    const iEnvio = IO.indexOf("await enviarSistema(mensajeSilencio");
    expect(iEnvio).toBeGreaterThan(-1);
    expect(iLog).toBeLessThan(iEnvio);
  });

  it("🩸 la lectura del log va PAGINADA, nunca con un .limit() pelado", () => {
    // Medido el 2-sep-2026: estos mismos sync_type dan 1.003 filas en 14 días, ya
    // por encima del db-max-rows = 1000 que PostgREST aplica EN SILENCIO. Una
    // lectura plana dejaría pares sin evaluar sin que nadie se entere — el mismo
    // modo de fallo que esta alerta viene a cerrar.
    // Se exige la LLAMADA, no que la palabra aparezca: dejarla solo en el import
    // pasaría un `toContain` sin paginar una sola fila.
    expect(IO).toMatch(/await leerTodoPaginado<FilaLog>\(/);
    expect(IO).toMatch(/\.order\("started_at"[\s\S]{0,80}\.order\("id"/);
  });

  it("🔴 NO estrena un cron: cuelga de la reconciliación, que ya corre 3 veces al día", () => {
    expect(RECONCILIACION).toContain("revisarSilencioDeDatos");
    expect(RECONCILIACION).toContain("checkSilencioDeDatos()");
    const paths = VERCEL.crons.map((c) => c.path);
    expect(paths.some((p) => p.includes("silencio"))).toBe(false);
    // Y la reconciliación sigue teniendo sus tres pasadas.
    expect(paths.filter((p) => p.startsWith("/api/cron/switch-reconciliacion")).length).toBe(3);
  });

  it("sale por enviarSistema — el canal 🔧 SISTEMA, con su prefijo y su regla de tres", () => {
    expect(IO).toContain('from "@/lib/alertas/canal"');
    expect(IO).toContain("enviarSistema(");
    expect(IO).not.toContain("enviarNegocio");
  });
});

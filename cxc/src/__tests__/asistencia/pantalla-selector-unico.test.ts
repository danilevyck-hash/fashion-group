// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UN SOLO SELECTOR DE PERÍODO PARA TODO EL MÓDULO (24-sep-2026) — el candado
//
// 🩸 EL DEFECTO, medido contra el código el 24-sep-2026: **cuatro selectores,
// tres memorias y dos listas de quincenas que no coinciden**.
//
//   · Asistencia → `RangoFechas` + 4 atajos, llave `asistencia_reporte`.
//   · Aprobaciones → el MISMO calendario con llave PROPIA `asistencia_aprobaciones`
//     (`AprobacionesTab.tsx:302`): cambiar el período en una pestaña NO cambiaba
//     el de la otra.
//   · Planilla → 4 botones de quincena + «Cortar el reloj el».
//   · Préstamos › Movimientos → un `<select>` de **24** quincenas.
//
// 🔴 Hoy es UNA barra («‹ 16 – 30 sep 2026 ›» + 📅), UNA clave en la dirección
// (`?desde=&hasta=`, con `replace`) y UNA memoria (`fg_last_asistencia_periodo`).
//
// 🔴 NINGÚN NÚMERO CAMBIA: este módulo no calcula un centavo. Lo prueba
// `pantalla-no-mueve-un-numero.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  ASISTENCIA_PANTALLA_2026_09, PARAM_ABRE, PARAM_DESDE, PARAM_HASTA,
  RECORDAR_PERIODO, VACIAR_EL_CORTE, anchoDelCodigo, columnasDelReporte, cortoDelCorte,
  esQuincenaExacta, haySiguienteQuincena, pasoDeQuincena,
  periodoCompartidoInicial, quincenaDeHoy, quincenaDelPeriodo, quincenaSiguiente,
  rotuloDeAvisos, rotuloDelPeriodo, rutaAsistenciaDePersona,
} from "@/lib/asistencia/pantalla-2026-09";
import { CLAVES_DE_PANTALLA } from "@/lib/hooks/useUrlState";

const RAIZ = process.cwd();
const crudo = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8");
/** El archivo SIN comentarios: lo que se barre es el código, no las notas. */
const leer = (f: string) =>
  crudo(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Las cuatro pestañas que comparten el período. */
const PESTANAS = [
  "src/app/asistencia/ReporteTab.tsx",
  "src/app/asistencia/AprobacionesTab.tsx",
  "src/app/asistencia/PlanillaTab.tsx",
  "src/app/asistencia/MovimientosQuincenaTab.tsx",
];

describe("🔴 el interruptor existe y se puede apagar", () => {
  it("hoy está PRENDIDO, y apagarlo devuelve las pantallas de antes", () => {
    expect(ASISTENCIA_PANTALLA_2026_09).toBe(true);
    const src = crudo("src/lib/asistencia/pantalla-2026-09.ts");
    expect(src).toMatch(/export const ASISTENCIA_PANTALLA_2026_09 = true;/);
  });

  it("cada pantalla que cambió lo consulta, nunca decide por su cuenta", () => {
    // ⚠️ Movimientos salió de esta lista el 25-sep-2026: ya no tiene camino
    // apagado que consultar. Su lista de 24 quincenas se FUE del archivo («3a»
    // del mockup), así que le queda un solo camino — el selector de arriba— y
    // preguntar por el interruptor no decidiría nada. Lo cubre, más fuerte, el
    // caso «Préstamos › Movimientos ya no tiene su lista de 24».
    const CONSULTAN = [
      "src/app/asistencia/ReporteTab.tsx",
      "src/app/asistencia/AprobacionesTab.tsx",
      "src/app/asistencia/PlanillaTab.tsx",
      "src/app/asistencia/AsistenciaClient.tsx",
      "src/app/asistencia/ConfiguracionTab.tsx",
    ];
    for (const f of CONSULTAN) {
      expect(leer(f), f).toContain("ASISTENCIA_PANTALLA_2026_09");
    }
  });
});

describe("🔴 UNA sola clave y UNA sola memoria", () => {
  it("la clave de la dirección es la que Asistencia ya usaba, y la memoria es NUEVA y única", () => {
    expect(PARAM_DESDE).toBe("desde");
    expect(PARAM_HASTA).toBe("hasta");
    expect(RECORDAR_PERIODO).toBe("asistencia_periodo");
  });

  it("las CUATRO pestañas leen el período por el MISMO hook", () => {
    for (const f of PESTANAS) {
      expect(leer(f), f).toContain("usePeriodoAsistencia");
    }
  });

  it("🩸 la memoria propia de Aprobaciones dejó de mandar", () => {
    const apro = leer("src/app/asistencia/AprobacionesTab.tsx");
    // La llave vieja queda SOLO en el camino apagado: el efecto que la lee sale
    // antes de tocar nada, y el calendario viejo vive en el `else`.
    expect(apro).toContain("if (ASISTENCIA_PANTALLA_2026_09) return;");
    expect(apro).toMatch(/\) : \(\s*<RangoFechas/);
    expect(apro).toContain("ASISTENCIA_PANTALLA_2026_09 ? compartido.desde : desdeViejo");
  });

  it("🔴 el período es un FILTRO: va con `replace`, y el Atrás no cicla por fechas", () => {
    // `useUrlState` empuja historial solo para las claves de PANTALLA. Que
    // `desde`/`hasta` NO estén ahí es lo que hace que el Atrás del celular
    // vuelva a la portada y no a la fecha anterior.
    expect(CLAVES_DE_PANTALLA).not.toContain(PARAM_DESDE);
    expect(CLAVES_DE_PANTALLA).not.toContain(PARAM_HASTA);
    const sel = leer("src/components/asistencia/SelectorPeriodo.tsx");
    expect(sel).not.toMatch(/history:\s*"push"/);
    // El hook escribe la dirección él mismo (las dos fechas JUNTAS): tiene que
    // ser `replace`, y nunca `push`.
    expect(sel).toContain("router.replace(");
    expect(sel).not.toMatch(/router\.push\(/);
  });

  it("🩸 Préstamos › Movimientos ya no tiene su lista de 24, y `?quincena=` sigue llegando", () => {
    const mov = leer("src/app/asistencia/MovimientosQuincenaTab.tsx");
    expect(mov).toContain("SelectorPeriodo");
    // 🔴 25-sep-2026 («3a»): el `<select>` de 24 quincenas ya no existe NI
    // apagado. Antes este caso admitía que viviera en el camino de atrás; hoy
    // exige que no esté en el archivo, que es más fuerte.
    expect(mov).not.toContain("<select");
    expect(mov).not.toContain("CUANTAS_QUINCENAS");
    expect(mov).not.toContain("quincenasHasta");
    // Un enlace viejo GANA sobre el período compartido: nadie se queda sin ver
    // la quincena que le mandaron.
    expect(mov).toMatch(/if \(q\) return q;/);
  });
});

describe("🩸 las dos fechas se escriben JUNTAS, en una sola vuelta", () => {
  it("🩸 EL DEFECTO: dos `useUrlState` seguidos pierden una — quedaba `desde=16 · hasta=15`", () => {
    // Cada setter de `useUrlState` arma la dirección nueva a partir de la que
    // había AL PINTAR, así que el segundo pisa al primero. Por eso el hook arma
    // UNA dirección con las dos fechas y llama al router una sola vez.
    const sel = leer("src/components/asistencia/SelectorPeriodo.tsx");
    expect(sel).toContain("params.set(PARAM_DESDE, d)");
    expect(sel).toContain("params.set(PARAM_HASTA, h)");
    // Y NO puede volver a los dos setters sueltos.
    expect(sel).not.toMatch(/setDesdeUrl|setHastaUrl/);
  });
});

describe("🔴 las flechas saltan de QUINCENA, y nunca al futuro", () => {
  it("la quincena de hoy es la que lo contiene", () => {
    expect(quincenaDeHoy("2026-09-24").desde).toBe("2026-09-16");
    expect(quincenaDeHoy("2026-09-24").hasta).toBe("2026-09-30");
    expect(quincenaDeHoy("2026-09-03").desde).toBe("2026-09-01");
    expect(quincenaDeHoy("2026-09-03").hasta).toBe("2026-09-15");
  });

  it("«‹» y «›» dan la quincena de al lado, y el fin de año no es un caso especial", () => {
    expect(pasoDeQuincena("2026-09-16", -1)).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
    expect(pasoDeQuincena("2026-09-01", -1)).toEqual({ desde: "2026-08-16", hasta: "2026-08-30" });
    expect(pasoDeQuincena("2026-09-16", 1)).toEqual({ desde: "2026-10-01", hasta: "2026-10-15" });
    expect(quincenaSiguiente(quincenaDelPeriodo("2026-12-16")).desde).toBe("2027-01-01");
    expect(pasoDeQuincena("2026-01-01", -1)).toEqual({ desde: "2025-12-16", hasta: "2025-12-30" });
  });

  it("🔴 mirando un día suelto, el salto SIGUE siendo de quincena", () => {
    // Un paso que a veces es «un día» y a veces «una quincena» es un control
    // que no se puede predecir.
    expect(pasoDeQuincena("2026-09-18", -1)).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
  });

  it("🔴 «›» se apaga cuando la quincena que sigue todavía no empezó", () => {
    expect(haySiguienteQuincena("2026-09-16", "2026-09-24")).toBe(false);
    expect(haySiguienteQuincena("2026-09-01", "2026-09-24")).toBe(true);
    expect(haySiguienteQuincena("2026-09-16", "2026-10-01")).toBe(true);
  });

  it("el día 31 nunca sale en el rótulo: la quincena termina el día que PAGA", () => {
    expect(rotuloDelPeriodo("2026-08-16", "2026-08-30")).toBe("16 – 30 ago 2026");
    expect(rotuloDelPeriodo("2026-07-16", "2026-07-30")).toBe("16 – 30 jul 2026");
  });
});

describe("🔴 el rótulo dice lo que se está mirando, sin mentir", () => {
  it("una quincena se lee como quincena", () => {
    expect(esQuincenaExacta("2026-09-16", "2026-09-30")).toBe(true);
    expect(rotuloDelPeriodo("2026-09-16", "2026-09-30")).toBe("16 – 30 sep 2026");
  });
  it("UN día se lee como un día, y un rango libre como un rango", () => {
    expect(esQuincenaExacta("2026-09-18", "2026-09-18")).toBe(false);
    expect(rotuloDelPeriodo("2026-09-18", "2026-09-18")).toBe("18 sep 2026");
    expect(rotuloDelPeriodo("2026-09-18", "2026-09-22")).toBe("18 sep – 22 sep 2026");
    expect(rotuloDelPeriodo("2025-12-28", "2026-01-04")).toBe("28 dic 2025 – 4 ene 2026");
  });
  it("con basura no se dibuja nada, nunca una fecha inventada", () => {
    expect(rotuloDelPeriodo("", "")).toBe("");
    expect(rotuloDelPeriodo("2026-09-30", "2026-09-01")).toBe("");
  });
});

describe("🔴 con qué período abre el módulo", () => {
  const hoy = "2026-09-24";
  it("manda la dirección", () => {
    expect(periodoCompartidoInicial({
      url: { desde: "2026-08-01", hasta: "2026-08-15" }, recordado: null, hoy,
    })).toEqual({ desde: "2026-08-01", hasta: "2026-08-15" });
  });
  it("después la memoria compartida", () => {
    expect(periodoCompartidoInicial({
      url: {}, recordado: { desde: "2026-07-16", hasta: "2026-07-30" }, hoy,
    })).toEqual({ desde: "2026-07-16", hasta: "2026-07-30" });
  });
  it("y al final la quincena EN CURSO — nunca «hace 14 días»", () => {
    // 🩸 Asistencia abría en un rango de 14 días, que no es ninguna quincena:
    // las flechas habrían estado mintiendo desde el primer segundo.
    expect(periodoCompartidoInicial({ url: {}, recordado: null, hoy }))
      .toEqual({ desde: "2026-09-16", hasta: "2026-09-30" });
  });
  it("media dirección o un rango al revés se descartan ENTEROS", () => {
    expect(periodoCompartidoInicial({ url: { desde: "2026-08-01" }, recordado: null, hoy }).desde).toBe("2026-09-16");
    expect(periodoCompartidoInicial({ url: { desde: "2026-08-15", hasta: "2026-08-01" }, recordado: null, hoy }).desde).toBe("2026-09-16");
  });
});

describe("🔴 el corte del reloj: la «×» y la línea gris, sin el botón ni el chip", () => {
  it("la línea de antes sigue siendo la de antes (el camino APAGADO no se tocó)", () => {
    expect(cortoDelCorte("2026-09-13")).toBe("13 sep");
  });

  it("🩸 «Quincena entera» y el chip «Corte N» se retiraron de la pantalla", () => {
    const pl = leer("src/app/asistencia/PlanillaTab.tsx");
    // Los dos solo pueden quedar en el camino APAGADO: en el prendido, ni uno.
    const prendido = pl.split("PLANILLA_UNIDA && ASISTENCIA_PANTALLA_2026_09")[1] ?? "";
    expect(prendido.slice(0, 1600)).not.toContain("Quincena entera");
    expect(prendido.slice(0, 1600)).not.toContain("Corte {fechaCortaCorte");
    // Y lo que SÍ está: la «×» del campo.
    expect(pl).toContain("VACIAR_EL_CORTE");
    expect(VACIAR_EL_CORTE).toBe("Quitar el corte");
    // 🩸 «· cambiar» se retiró el 25-sep-2026: el calendario está al lado, y el
    // enlace mandaba a un campo que se ve. Daniel: *«ese mensaje no tiene que
    // decir desde el 28 si ya está en el calendario»*. La línea nueva vive en
    // `corte-del-reloj.ts` y tiene su propio candado.
    expect(pl).not.toContain("CAMBIAR_EL_CORTE");
  });

  it("🔑 el corte NO cambia lo que se paga: sigue viajando igual al servidor", () => {
    const pl = leer("src/app/asistencia/PlanillaTab.tsx");
    // El pedido se arma con el mismo `corte` de siempre; no hay una segunda
    // forma de calcularlo en la pantalla.
    expect(pl).toContain("elegirCorte");
    expect(pl).not.toMatch(/corte\s*=\s*.*Math\./);
  });
});

describe("🔴 7a — de la Planilla a la Asistencia de esa persona, en un toque", () => {
  it("la dirección lleva la empresa, la MISMA quincena y el código", () => {
    expect(rutaAsistenciaDePersona({
      codigo: "305", empresa: "american_classic", desde: "2026-09-16", hasta: "2026-09-30",
    })).toBe("/asistencia?tab=asistencia&empresa=american_classic&desde=2026-09-16&hasta=2026-09-30&abre=305");
  });
  it("sin empresa no se inventa una, y una fecha rota no viaja", () => {
    expect(rutaAsistenciaDePersona({ codigo: "2", empresa: null, desde: "", hasta: "" }))
      .toBe("/asistencia?tab=asistencia&abre=2");
  });
  it("la Planilla la usa en la tabla Y en la tarjeta del celular", () => {
    const pl = leer("src/app/asistencia/PlanillaTab.tsx");
    expect((pl.match(/rutaAsistenciaDePersona\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("y Asistencia abre a quien le pidan, por `?abre=`", () => {
    expect(PARAM_ABRE).toBe("abre");
    const rep = leer("src/app/asistencia/ReporteTab.tsx");
    expect(rep).toContain("PARAM_ABRE");
    expect(rep).toMatch(/if \(c\) setAbierta\(c\);/);
  });
});

describe("🔴 2e — la columna «Sale» se retiró y el código va a la izquierda", () => {
  it("la tabla pasó de once columnas a diez", () => {
    expect(columnasDelReporte(true)).toBe(10);
    expect(columnasDelReporte(false)).toBe(11);
  });
  it("los códigos se alinean entre sí: el nombre arranca siempre igual", () => {
    expect(anchoDelCodigo(["2", "3", "301", "306"])).toBe(3);
    expect(anchoDelCodigo([])).toBe(1);
  });
  it("la hora de salida NO se perdió: sale en burbuja al lado del nombre", () => {
    const rep = leer("src/app/asistencia/ReporteTab.tsx");
    expect(rep).toContain("burbujaSalida");
    expect(rep).toContain("Hora de salida de su ficha");
  });
});

describe("🔴 el panel de arriba: los avisos y los relojes, en una línea", () => {
  it("la línea de los avisos dice cuántos son, y con ninguno no se dibuja", () => {
    expect(rotuloDeAvisos(0)).toBeNull();
    expect(rotuloDeAvisos(1)).toBe("1 aviso del período");
    expect(rotuloDeAvisos(3)).toBe("3 avisos del período");
  });
  // 🩸 ACÁ SE PROBABA `resumenDeRelojes`, RETIRADA EL 25-sep-2026: decía «1 de 2
  // relojes no están entrando», un conteo que obliga a abrir algo para saber
  // CUÁL. La pastilla nueva nombra al que falla y vive en
  // `relojes-en-la-fila.ts`, con su candado en `fila-de-mandos.test.tsx`.
  it("🩸 los cuatro atajos «Hoy · Ayer · Esta quincena · Quincena pasada» solo quedan APAGADOS", () => {
    const rep = leer("src/app/asistencia/ReporteTab.tsx");
    // El bloque de los atajos vive dentro del `else` del interruptor.
    const [prendido] = rep.split("ASISTENCIA_PANTALLA_2026_09 ? (")[1]?.split(") : (") ?? [""];
    expect(prendido).not.toContain("atajos.map");
  });
});

describe("🔴 6b — nunca un total del grupo, y en el celular la lista solo informa", () => {
  it("el tablero no tiene una sola operación de suma entre empresas", () => {
    const puro = leer("src/lib/asistencia/tablero-cierre.ts");
    expect(puro).not.toMatch(/reduce\(/);
    const vista = leer("src/app/asistencia/TableroCierre.tsx");
    expect(vista).not.toMatch(/reduce\(/);
  });
  it("«solo informa» esconde el botón de cerrar, y lo DICE", () => {
    const vista = leer("src/app/asistencia/TableroCierre.tsx");
    expect(vista).toContain("!soloInforma && sePuedeCerrar(f, puedeCerrar)");
    expect(vista).toContain("TABLERO_SOLO_INFORMA");
  });
  it("y el cierre de cada empresa sigue siendo por SU propia puerta", () => {
    const vista = leer("src/app/asistencia/TableroCierre.tsx");
    expect(vista).not.toMatch(/cerrar todas|cerrarTodas/i);
  });
});

describe("🔴 4b — la tabla de la Planilla se desliza dentro de SU caja", () => {
  it("la caja tiene su propio scroll y la cabecera queda pegada a ella", () => {
    const pl = leer("src/app/asistencia/PlanillaTab.tsx");
    expect(pl).toContain("max-h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-white");
    expect(pl).toContain('sticky top-0 z-20 bg-white');
  });
  it("y la columna del nombre sigue fija a la izquierda", () => {
    const pl = leer("src/app/asistencia/PlanillaTab.tsx");
    expect(pl).toContain("sticky left-0");
  });
  it("🔴 NINGUNA columna se pliega: la contadora las ve todas", () => {
    const pl = leer("src/app/asistencia/PlanillaTab.tsx");
    expect(pl).toContain("ROTULOS_DINERO_PLANILLA.map");
    expect(pl).not.toMatch(/columnasEnCero|plegarColumnas/);
  });
});

describe("🔴 las barras pegajosas nuevas usan la clase de la casa", () => {
  it("el selector no se pega a nada por su cuenta", () => {
    const sel = leer("src/components/asistencia/SelectorPeriodo.tsx");
    expect(sel).not.toMatch(/\bsticky\b/);
  });
});

describe("🔴 español neutro, tuteo, sin voseo", () => {
  const VOSEO = /\b(eleg[ií]|escrib[ií]|revis[áa]|guard[áa]|toc[áa]|mir[áa]|ten[ée]s|pod[ée]s|vos|ac[áa]\b)\b/i;
  it("los módulos nuevos y sus pantallas", () => {
    for (const f of [
      "src/lib/asistencia/pantalla-2026-09.ts",
      "src/lib/asistencia/celular-asistencia.ts",
      "src/components/asistencia/SelectorPeriodo.tsx",
      "src/app/asistencia/PortadaCelular.tsx",
    ]) {
      // Solo el TEXTO que ve la gente: los comentarios los barre
      // `nada-de-voseo.test.ts` con su propia lista de excepciones.
      const textos = crudo(f).match(/"[^"\n]{4,}"/g) ?? [];
      for (const t of textos) expect(VOSEO.test(t), `${f} → ${t}`).toBe(false);
    }
  });
});

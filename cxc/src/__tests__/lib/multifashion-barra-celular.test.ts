/**
 * 🔴 CANDADO — MULTIFASHION EN EL CELULAR CON EL ENCABEZADO COMPARTIDO
 * (`MULTIFASHION_BARRA_2026_10`, 11-oct-2026).
 *
 * La regla: en el Resumen del celular el título es la ÚNICA navegación (sin los
 * cuatro renglones) y no hay línea gris de hábitos; su dibujo se prueba en
 * `multifashion-celular.test.tsx` (`soloElMes`).
 * Lo que no debe cambiar: los nombres de las secciones son los de las pestañas,
 * la línea de hoy lleva los MISMOS dos montos que la línea gris de antes, la
 * frescura sigue siendo `LineaDeFrescura`, y apagado queda el encabezado de antes.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  baseDeHoyAnioPasado, instanteUnAnioAntes, lineaDeHoy, mesConHoy, montoCorto, seccionesDeLaBarra, subtituloHoyAyer, ventaDeHoyParaElMes,
} from "@/lib/multifashion/celular";
import { PESTANAS_MULTIFASHION } from "@/lib/multifashion/pestanas";
import { graficaDelMes, lineaDeLaGrafica } from "@/lib/multifashion/grafica-mes";
import {
  TITULO_HISTORICO, bloqueDeHoras, diaDeMayorVenta, etiquetaHoras, historicoDeVentas, horasDeFacturas,
  lineasDelHistorico, mesesDelHistorico, ventanaDelHistorico,
} from "@/lib/multifashion/historico";

const shell = fs.readFileSync(path.join(process.cwd(), "src/app/multifashion/MultifashionShell.tsx"), "utf8");

describe("Multifashion › celular › encabezado compartido", () => {
  it("el Resumen sin renglones ni hábitos cuelga del MISMO interruptor (apagado = como antes)", () => {
    expect(shell).toContain("soloElMes: barra");
    const inicio = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/celular/InicioCelular.tsx"), "utf8");
    expect(inicio).toContain("soloElMes = false");
    expect(inicio).toMatch(/\{!soloElMes && \(\s*<ul data-celular="renglones"/);
    expect(inicio).toContain("const habitos = !soloElMes &&");
    // La gráfica alta (240 px) solo la pide el celular con el interruptor; sin la prop mide lo de siempre.
    expect(inicio).toContain("alta={soloElMes}");
    const grafica = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/GraficaDelMes.tsx"), "utf8");
    expect(grafica).toContain('alta = false');
    expect(grafica).toContain('alta ? "h-[240px]" : "h-[120px]"');
    expect(grafica).toContain("sm:h-[180px]");
    // En su lugar, «Últimos 12 meses»: solo con el interruptor.
    expect(inicio).toContain("{soloElMes && <HistoricoCelular />}");
  });

  it("el título ofrece Resumen y las cuatro secciones, con los nombres de las pestañas", () => {
    expect(seccionesDeLaBarra(PESTANAS_MULTIFASHION, 2026).map((s) => s.label))
      .toEqual(["Resumen", "Año 2026", "Vendedoras", "Productos", "Clientes"]);
    expect(seccionesDeLaBarra(PESTANAS_MULTIFASHION, 2026).filter((s) => s.value !== "anio").map((s) => s.value))
      .toEqual(PESTANAS_MULTIFASHION.map((p) => p.id));
  });

  it("🔴 la línea de hoy dice los mismos montos que la línea gris de antes", () => {
    const hoy = { hayVentas: true, ventas: 1866.4, ayer: 1795.2 };
    const l = lineaDeHoy(hoy)!;
    expect(l).toEqual({ hoy: "$1,866", ayer: "ayer $1,795" });
    expect(`hoy ${l.hoy} · ${l.ayer}`).toBe(subtituloHoyAyer({ dias: 11, hoy }));
    expect(l.hoy).toBe(montoCorto(hoy.ventas));
  });

  it("sin ventas no se escribe $0, y fuera del mes de hoy no hay línea", () => {
    expect(lineaDeHoy({ hayVentas: false, ventas: 0, ayer: 1795 })!.hoy).toBe("sin ventas todavía");
    expect(lineaDeHoy(null)).toBeNull();
    expect(lineaDeHoy(undefined)).toBeNull();
  });

  it("el encabezado es la barra compartida, detrás del interruptor, y el de antes sigue para apagado", () => {
    expect(shell).toContain("useBarraCelular(MULTIFASHION_BARRA_2026_10)");
    expect(shell).toMatch(/\{barra && \(\s*<BarraDeControles/);
    expect(shell).toContain("{MULTIFASHION_CELULAR && !barra && (");
    // La frescura no se dibuja a mano: sigue siendo el componente común, uno solo en el celular.
    expect(shell.match(/<LineaDeFrescura\s+forma="celular"/g)).toHaveLength(1);
  });
});

describe("Multifashion › celular › «Últimos 12 meses»", () => {
  const HOY = "2026-10-11"; // domingo
  const DIAS = [
    { fecha: "2025-10-10", ventas: 90000 }, // un día ANTES de la ventana: no entra
    { fecha: "2025-10-11", ventas: 1000 },  // sábado, primer día de la ventana
    { fecha: "2026-09-05", ventas: 3000 },  // sábado
    { fecha: "2026-09-06", ventas: 4500 },  // domingo: UNO solo, el día más alto
    { fecha: "2026-09-13", ventas: 0 },     // domingo sin venta
    { fecha: "2026-10-10", ventas: 2000 },  // sábado, AYER: último día
    { fecha: "2026-10-11", ventas: 99999 }, // HOY: no entra
  ];
  const HORAS = [[10, 100], [15, 300], [16, 900], [17, 800], [18, 700], [19, 200]].map(([hora, ventas]) => ({ hora, ventas }));

  it("la ventana se nombra y son los 365 días que terminan AYER", () => {
    expect(TITULO_HISTORICO).toBe("Últimos 12 meses");
    expect(ventanaDelHistorico(HOY)).toEqual({ desde: "2025-10-11", hasta: "2026-10-10" });
    const meses = mesesDelHistorico(HOY);
    expect(meses).toHaveLength(13);
    // Los dos meses del borde entran en parte; los once del medio, enteros.
    expect(meses[0]).toEqual({ anio: 2025, mes: 10, desde: "2025-10-11", hasta: "2025-10-31", entero: false });
    expect(meses[12]).toEqual({ anio: 2026, mes: 10, desde: "2026-10-01", hasta: "2026-10-10", entero: false });
    expect(meses.slice(1, 12).every((m) => m.entero)).toBe(true);
  });

  it("🔴 HOY no entra, y el día de mayor venta es por TOTAL, no por promedio de los días con venta", () => {
    const h = historicoDeVentas(DIAS, HORAS, HOY);
    // Sábado: 1000 + 3000 + 2000 en 3 días. Domingo: 4500 en 1 día (el promedio más alto, y no gana).
    expect(h.semana[6]).toEqual({ dow: 6, total: 6000, dias: 3 });
    expect(h.semana[0]).toEqual({ dow: 0, total: 4500, dias: 1 });
    expect(diaDeMayorVenta(h)).toEqual({ dow: 6, pct: 57 }); // 6000 de 10500
  });

  it("el horario son las 3 horas SEGUIDAS que más venden, con su parte de la venta", () => {
    const h = historicoDeVentas(DIAS, HORAS, HOY);
    expect(bloqueDeHoras(h)).toEqual({ desde: 16, hasta: 19, pct: 80 }); // 2400 de 3000
    expect(etiquetaHoras(16, 19)).toBe("4–7 pm");
    expect(etiquetaHoras(11, 14)).toBe("11 am–2 pm");
    // Las facturas de los meses del borde se cuentan por hora de Panamá (UTC−5).
    expect(horasDeFacturas([{ fecha_ts: "2026-10-10T21:30:00+00:00", subtotal: "10.5" }, { fecha_ts: "2026-10-10T21:59:00Z", subtotal: -0.5 }]))
      .toEqual([{ hora: 16, ventas: 10 }]);
  });

  it("dos líneas que nombran la ventana; lo que no se puede calcular se omite", () => {
    const h = historicoDeVentas(DIAS, HORAS, HOY);
    expect(lineasDelHistorico(h)).toEqual([
      "Últimos 12 meses · día de mayor venta: sábado (57 %)",
      "Horario de mayor venta: 4–7 pm (80 %)",
    ]);
    expect(lineasDelHistorico(historicoDeVentas(DIAS, [], HOY))).toEqual(["Últimos 12 meses · día de mayor venta: sábado (57 %)"]);
    expect(lineasDelHistorico(historicoDeVentas([], HORAS, HOY))).toEqual(["Últimos 12 meses · horario de mayor venta: 4–7 pm (80 %)"]);
    // Sin ningún dato no hay línea (ni con solo la venta de HOY).
    expect(lineasDelHistorico(historicoDeVentas([], [], HOY))).toEqual([]);
    expect(lineasDelHistorico(historicoDeVentas([{ fecha: HOY, ventas: 500 }], [], HOY))).toEqual([]);
  });

  it("es una línea gris sin caja, y la frescura va en el renglón de hoy con el componente común", () => {
    const inicio = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/celular/InicioCelular.tsx"), "utf8");
    const pieza = inicio.slice(inicio.indexOf("function HistoricoCelular"), inicio.indexOf("function RenglonFila"));
    expect(pieza).toMatch(/<p data-celular="historico" className="[^"]*text-sm text-gray-500/);
    expect(pieza).toContain('className="block"'); // una línea por dato, sin caja
    expect(pieza).not.toMatch(/border|rounded|uppercase|<ul|<li/);
    const renglon = shell.slice(shell.indexOf('data-celular="hoy-y-frescura"'), shell.indexOf("{MULTIFASHION_CELULAR && !barra && ("));
    expect(renglon).toContain("flex flex-wrap"); // si no cabe, baja: nunca se corta
    expect(renglon).toContain('data-celular="hoy"');
    expect(renglon).toContain("{frescuraCel}");
    expect(renglon).not.toMatch(/truncate|overflow-hidden/);
  });
});

describe("Multifashion › celular › el número del mes con la venta de hoy", () => {
  const base = { esMesActual: true, anio: 2026, mes: 10, diaActual: 10 };
  const hoy = { fecha: "2026-10-11", hayVentas: true, ventas: 2140.25 };

  it("🔴 número grande = días completos + la venta de hoy, cuando hoy existe y es el día que sigue al corte", () => {
    expect(ventaDeHoyParaElMes({ ...base, hoy })).toBe(2140.25);
    expect(montoCorto(26616.37 + ventaDeHoyParaElMes({ ...base, hoy })!)).toBe("$28,757");
  });

  it("sin dato, sin ventas, en otro mes o con el día corrido, queda el número de siempre: nunca se adivina", () => {
    expect(ventaDeHoyParaElMes({ ...base, hoy: undefined })).toBeNull();
    expect(ventaDeHoyParaElMes({ ...base, hoy: { ...hoy, hayVentas: false, ventas: 0 } })).toBeNull();
    expect(ventaDeHoyParaElMes({ ...base, esMesActual: false, hoy })).toBeNull();
    // El detalle ya cortó en el 11 (pasó la medianoche) y «hoy» sigue siendo el 11: no se suma dos veces.
    expect(ventaDeHoyParaElMes({ ...base, diaActual: 11, hoy })).toBeNull();
    expect(ventaDeHoyParaElMes({ ...base, hoy: { ...hoy, fecha: "2026-10-12" } })).toBeNull();
  });

  it("🔴 el % llega hasta la misma hora del año pasado; sin las dos lecturas del MISMO instante, queda el de días completos", () => {
    const corte = "2026-10-11T23:00:12.000Z"; // 6:00:12 pm de Panamá
    expect(instanteUnAnioAntes("2026-10-11", corte)).toEqual({ fecha: "2025-10-11", instante: "2025-10-11T18:00:12-05:00", mismoDia: true });
    // 29-feb: el año pasado no tuvo ese día; el 28 ya está entero en la base.
    expect(instanteUnAnioAntes("2028-02-29", "2028-02-29T20:00:00Z")).toEqual({ fecha: "2027-02-28", instante: "2027-02-28T15:00:00-05:00", mismoDia: false });
    // Un sync que no es de hoy no sirve para cortar.
    expect(instanteUnAnioAntes("2026-10-11", "2026-10-11T03:00:00Z")).toBeNull();

    const comp = { fecha: "2026-10-11", corte, ventasPrev: 1234.5 };
    expect(baseDeHoyAnioPasado({ corteDeHoy: corte, fechaDeHoy: "2026-10-11", comparativo: comp })).toBe(1234.5);
    expect(baseDeHoyAnioPasado({ corteDeHoy: corte, fechaDeHoy: "2026-10-11", comparativo: { ...comp, ventasPrev: 0 } })).toBe(0);
    // Otro sync, otro día, sin dato o sin hora: nada que sumar.
    expect(baseDeHoyAnioPasado({ corteDeHoy: "2026-10-11T23:30:00.000Z", fechaDeHoy: "2026-10-11", comparativo: comp })).toBeNull();
    expect(baseDeHoyAnioPasado({ corteDeHoy: corte, fechaDeHoy: "2026-10-12", comparativo: comp })).toBeNull();
    expect(baseDeHoyAnioPasado({ corteDeHoy: corte, fechaDeHoy: "2026-10-11", comparativo: { ...comp, ventasPrev: null } })).toBeNull();
    expect(baseDeHoyAnioPasado({ corteDeHoy: null, fechaDeHoy: "2026-10-11", comparativo: comp })).toBeNull();
    expect(baseDeHoyAnioPasado({ corteDeHoy: corte, fechaDeHoy: "2026-10-11", comparativo: undefined })).toBeNull();
  });

  it("hoy entra de los DOS lados del % o de ninguno; la proyección y el promedio siguen en días completos", () => {
    const inicio = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/celular/InicioCelular.tsx"), "utf8");
    // La cuenta es UNA para el celular y la computadora (`mesConHoy`, 11-oct-2026).
    expect(inicio).toContain("const conHoy = mesConHoy({ ventas: totales.ventas, prev: data.yoy.ventas, ventaHoy, prevHoy });");
    expect(inicio).toContain("variacionPct(conHoy.ventasPct, conHoy.prevPct)");
    expect(mesConHoy({ ventas: 26616.22, prev: 14262, ventaHoy: 2140.4, prevHoy: 1268.49 }))
      .toEqual({ numero: 26616.22 + 2140.4, ventasPct: 26616.22 + 2140.4, prevPct: 14262 + 1268.49, conHoy: true, hastaAhora: true });
    // Sin la base de hoy del año pasado: el número trae hoy, el % queda en días completos.
    expect(mesConHoy({ ventas: 26616.22, prev: 14262, ventaHoy: 2140.4, prevHoy: null }))
      .toEqual({ numero: 26616.22 + 2140.4, ventasPct: 26616.22, prevPct: 14262, conHoy: true, hastaAhora: false });
    // Sin la venta de hoy: nada cambia, aunque llegue la base.
    expect(mesConHoy({ ventas: 26616.22, prev: 14262, ventaHoy: null, prevHoy: 1268.49 }))
      .toEqual({ numero: 26616.22, ventasPct: 26616.22, prevPct: 14262, conHoy: false, hastaAhora: false });
    expect(inicio).toContain("data.is_mes_actual ? totales.proyeccion_cierre : null");
    expect(inicio).toContain("{montoCorto(conHoy.numero)}");
    const grafica = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/GraficaDelMes.tsx"), "utf8");
    // La gráfica recibe los MISMOS días: el promedio no ve la venta de hoy.
    expect(grafica).toContain("graficaDelMes({ dias, year, mes, esMesActual, diaActual, feriados })");
    // Con la venta de hoy, la barra destacada es la de HOY y el último día completo vuelve al gris.
    expect(grafica).toContain('d.estado === "hoy" && altoHoy != null ? BARRA_HOY_EN_CURSO');
    expect(grafica).toContain('d.estado === "ultimo" && altoHoy != null ? BARRA.venta : BARRA[d.estado]');
    // Con los dos interruptores apagados no se pide ni se suma nada; el celular solo depende del suyo.
    const vista = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/MultifashionResumenView.tsx"), "utf8");
    expect(vista).toContain("const sumaHoy = MULTIFASHION_SUMA_HOY_2026_10 || celular?.soloElMes === true;");
    expect(vista).toContain("useVentaHoy(syncTick, sumaHoy)");
    expect(vista).toContain("const corteDeHoy = sumaHoy ? ventaHoy?.sync?.ultimo ?? null : null;");
    expect(vista).toContain("ventaHoy={celular.soloElMes ? hoyDelMes : null}");
  });

  it("en la barra el mes va entero, como en Ventas; fuera de la barra sigue corto", () => {
    const sel = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/PeriodoSelect.tsx"), "utf8");
    expect(sel).toContain("mesCompleto = false");
    expect(sel).toContain("rotuloCorto={mesCompleto ? undefined : corto}");
    expect(shell).toContain("mesCompleto={barra}");
  });
});

describe("Multifashion › celular › la línea de la gráfica dice qué promedia y de qué días", () => {
  const dias = (n: number) => Array.from({ length: n }, (_, i) => ({ dia: i + 1, ventas: i < 10 ? 2662 : 500, n_tickets: 5 }));
  const octubre = (diaActual: number) => graficaDelMes({ dias: dias(31), year: 2026, mes: 10, esMesActual: true, diaActual, feriados: [] });

  it("«Venta promedio diaria $X · 1–10 oct», con el MISMO número; apagado y en la computadora, el texto de siempre", () => {
    const g = octubre(10);
    expect(lineaDeLaGrafica(g, 2026, 10, null, true)).toBe("Venta promedio diaria $2,662 · 1–10 oct");
    expect(lineaDeLaGrafica(g, 2026, 10, null)).toBe("Promedio diario $2,662 · 10 días");
    // Un solo día completo, y un mes cerrado entero.
    expect(lineaDeLaGrafica(octubre(1), 2026, 10, null, true)).toBe("Venta promedio diaria $2,662 · 1 oct");
    const sep = graficaDelMes({ dias: dias(30), year: 2026, mes: 9, esMesActual: false, diaActual: 30, feriados: [] });
    expect(lineaDeLaGrafica(sep, 2026, 9, null, true)).toMatch(/^Venta promedio diaria \$[\d,]+ · 1–30 sep$/);
  });

  it("sin ningún día completo no dice nada (como hoy), y el día tocado no cambia", () => {
    expect(lineaDeLaGrafica(octubre(0), 2026, 10, null, true)).toBeNull();
    expect(lineaDeLaGrafica(octubre(0), 2026, 10, null)).toBeNull();
    const g = octubre(10);
    expect(lineaDeLaGrafica(g, 2026, 10, 3, true)).toBe(lineaDeLaGrafica(g, 2026, 10, 3));
    const grafica = fs.readFileSync(path.join(process.cwd(), "src/components/multifashion/GraficaDelMes.tsx"), "utf8");
    expect(grafica).toContain("lineaDeLaGrafica(g, year, mes, tocado, alta)");
  });
});

describe("Multifashion › «Últimos 12 meses» se lee una vez al día, y el permiso en cada pedido", () => {
  const ruta = fs.readFileSync(path.join(process.cwd(), "src/app/api/multifashion/historico/route.ts"), "utf8");

  it("lo guardado va por el día de Panamá, sin nada de quien lo pide", () => {
    expect(ruta).toContain('unstable_cache(leerHistorico, ["multifashion-historico"], { revalidate: 86_400 })');
    expect(ruta).toContain("historicoDelDia(hoyPanama())");
    // Lo que se guarda no recibe la petición ni la sesión: solo la fecha.
    expect(ruta).toMatch(/async function leerHistorico\(hoy: string\)/);
  });

  it("🔴 el permiso se revisa ANTES de leer lo guardado, y no hay caché pública", () => {
    const get = ruta.slice(ruta.indexOf("export async function GET"));
    expect(get.indexOf("requireRole(req, ROLES_MULTIFASHION)")).toBeGreaterThan(-1);
    expect(get.indexOf("requireRole(req, ROLES_MULTIFASHION)")).toBeLessThan(get.indexOf("historicoDelDia("));
    expect(get.indexOf("if (auth instanceof NextResponse) return auth;")).toBeLessThan(get.indexOf("historicoDelDia("));
    expect(ruta).not.toMatch(/Cache-Control|s-maxage|public,/);
  });
});


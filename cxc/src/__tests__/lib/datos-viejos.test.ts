// REGLA 1 — "Un dato que mirás está viejo". La única alerta de datos.
//
// Aprobada por Daniel el 30-jul-2026 junto con las otras dos: (2) algo se rompió
// y no se arregló solo = dos fallos seguidos del mismo proceso (ya implementado en
// `alert-policy.ts`, no se duplica acá), y (3) la base en problemas de verdad =
// solo arriba del 80% de memoria (`db-recursos.ts`). Todo lo demás se calla.
//
// 🩸 QUÉ REEMPLAZA. El watchdog viejo alertaba por CRON: "Una tarea automática
// lleva más de un día sin completarse. Detalle: switch-sync:all-0630". Daniel
// recibió ese mensaje el 27, 28 y 29 de julio mientras las ventas de
// american_classic de ese mismo run entraban perfecto (06:31:23). Medir el
// mecanismo en lugar del resultado falla en las dos direcciones, y ésta es la
// dirección que le costó la paciencia.
import { describe, it, expect, vi } from "vitest";

// `datos-frescos.ts` importa el cliente de Supabase para su parte de I/O. Lo que
// se testea acá son las funciones PURAS (clasificar / mensaje / universo de
// empresas), así que el cliente se stubea y nunca se toca la red.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import {
  HORAS_DATO_VIEJO,
  HORAS_ENTRE_AVISOS,
  clasificarDatosViejos,
  mensajeDatosViejos,
  empresasDe,
  type EstadoDato,
} from "@/lib/datos-frescos";
import {
  empresasConCxc,
  empresasConEstadoCuenta,
  empresasConEstadoCuentaEnCron,
  empresasConFacturas,
  empresasCarteraAparte,
  EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON,
} from "@/lib/switch-api/empresas";
import { SWITCH_CRON_ENTRADAS } from "@/lib/cron-telemetry";

const cartera = (empresa: string, horas: number | null): EstadoDato => ({
  dato: "cartera",
  empresa,
  ultimaIso: horas === null ? null : new Date(Date.now() - horas * 3600e3).toISOString(),
  horas,
});
const ventas = (empresa: string, horas: number | null): EstadoDato => ({
  dato: "ventas",
  empresa,
  ultimaIso: horas === null ? null : new Date(Date.now() - horas * 3600e3).toISOString(),
  horas,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el umbral es 24 horas, el que eligió Daniel", () => {
  it("son 24, no 12 (mi propuesta era 12 y la cambió)", () => {
    expect(HORAS_DATO_VIEJO).toBe(24);
  });

  it("justo en 24 todavía NO avisa; arriba de 24 sí", () => {
    expect(clasificarDatosViejos([cartera("vistana", 24)])).toEqual([]);
    expect(clasificarDatosViejos([cartera("vistana", 23.9)])).toEqual([]);
    expect(clasificarDatosViejos([cartera("vistana", 24.1)])).toHaveLength(1);
  });

  it("un dato fresco no aparece", () => {
    expect(clasificarDatosViejos([cartera("vistana", 2), ventas("joystep", 0.5)])).toEqual([]);
  });

  it("un dato que NUNCA se actualizó cuenta como viejo (fail-closed)", () => {
    // `horas: null` = no hay ni una fila. Es lo más viejo posible, no "sin datos
    // así que no opino": una cartera que nunca sincronizó es exactamente el caso
    // que hay que avisar.
    const r = clasificarDatosViejos([cartera("vistana", null)]);
    expect(r).toHaveLength(1);
    expect(r[0].horas).toBeNull();
  });

  it("solo reporta los viejos, sin arrastrar a los frescos de la misma tanda", () => {
    const r = clasificarDatosViejos([
      cartera("vistana", 40),
      cartera("fashion_wear", 3),
      ventas("joystep", 30),
      ventas("active_shoes", 1),
    ]);
    expect(r.map((x) => `${x.dato}:${x.empresa}`)).toEqual(["cartera:vistana", "ventas:joystep"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("qué empresas se vigilan", () => {
  it("ventas = las 8 empresas con facturas", () => {
    expect(empresasDe("ventas").sort()).toEqual([...empresasConFacturas()].sort());
    expect(empresasDe("ventas")).toHaveLength(8);
  });

  it("cartera = TODA cartera que traemos: las 6 del grupo + la de Boston", () => {
    // El universo se DERIVA de `EMPRESA_SYNC_CAPABILITIES` (estadoCuenta:true), o
    // sea de "¿traemos sus saldos?", que es lo mismo que "¿hay una pantalla donde
    // alguien les cree?". Una empresa que mañana empiece a traer saldos nace
    // vigilada, sin que nadie se acuerde de agregarla acá.
    expect(empresasDe("cartera").sort()).toEqual([...empresasConEstadoCuenta()].sort());
    expect(empresasDe("cartera")).toHaveLength(7);
    // Las 6 del grupo siguen adentro: sumar a Boston no puede haber sacado a nadie.
    for (const e of empresasConCxc()) expect(empresasDe("cartera")).toContain(e);
  });

  it("🔴 la cartera de Boston SÍ se vigila (el motivo de excluirla se venció)", () => {
    // 🩸 24-ago-2026. Boston estaba excluida por `EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`
    // con el motivo "su cartera hoy no se sincroniza por cron". Eso fue verdad
    // CUATRO DÍAS: el 30-jul nació `/api/cron/boston-cartera`. La lista siguió
    // siendo correcta para lo suyo —gobierna el bloque `all-0630` y los pares de
    // la reconciliación, donde Boston sigue sin caber—, pero acá se la leyó como
    // si dijera otra cosa. Precio: del 20 al 24 de agosto la cartera de Boston
    // estuvo congelada (Switch cambió el motor de sus reportes el 19-ago 12:37) y
    // esta regla NO sonó ni una vez. Cinco días de silencio.
    expect(empresasDe("cartera")).toContain("confecciones_boston");
    // Y sus VENTAS se siguen vigilando, como siempre.
    expect(empresasDe("ventas")).toContain("confecciones_boston");
    // La lista del API sigue existiendo y sigue teniendo a Boston — lo que cambió
    // es que ya NO gobierna esta alerta. Si alguien la vuelve a usar de filtro
    // acá, este test se pone rojo.
    expect(EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON).toContain("confecciones_boston");
    for (const fuera of EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON) {
      expect(
        empresasDe("cartera"),
        `${fuera} tiene cartera propia y un cron propio: no puede quedar fuera de la vigilancia`,
      ).toContain(fuera);
    }
  });

  it("no se vigila ninguna empresa sin un cron que la refresque (anti alerta-eterna)", () => {
    // El único motivo legítimo para NO vigilar una cartera es que nada la
    // refresque: ahí la alerta sonaría todos los días para siempre, que es el modo
    // de fallo que estas reglas vinieron a eliminar. Así que la condición se
    // invierte y se prueba: TODA empresa vigilada tiene un cron que le trae la
    // cartera. Hoy son dos caminos y no hay un tercero.
    //
    //   • las 6 del grupo → `switch-sync estadocuenta` (empresasConEstadoCuentaEnCron)
    //   • confecciones_boston → su cron propio `boston-cartera` (08:10 UTC)
    //
    // ⚠️ `switch-sync all 0630` también NOMBRA a confecciones_boston, pero NO le
    // trae la cartera (la excluye `empresasConEstadoCuentaEnCron`): certificarla
    // por esa entrada sería darla por vigilada sin que nadie la refresque.
    const CRON_CARTERA_DEDICADO = "boston-cartera";
    const porCronDedicado = new Set(
      SWITCH_CRON_ENTRADAS.filter((e) => e.cron === CRON_CARTERA_DEDICADO).flatMap((e) => e.empresas),
    );
    // Guard contra el paso en falso: si la entrada desapareciera, el set quedaría
    // vacío y el test de abajo fallaría por el motivo correcto — pero se dice acá.
    expect(porCronDedicado.size, `no encontré la entrada de cron ${CRON_CARTERA_DEDICADO}`)
      .toBeGreaterThan(0);

    const enCron = new Set<string>(empresasConEstadoCuentaEnCron());
    const huerfanas = empresasDe("cartera").filter(
      (e) => !enCron.has(e) && !porCronDedicado.has(e),
    );
    expect(
      huerfanas,
      "Estas empresas se vigilan pero ningún cron les refresca la cartera: la alerta " +
        "sonaría todos los días para siempre. O les das un cron, o no las vigiles.",
    ).toEqual([]);

    // Y la simétrica: la que va por cron dedicado es exactamente la cartera aparte.
    expect([...porCronDedicado].sort()).toEqual([...empresasCarteraAparte()].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el mensaje habla como Daniel, no como un log", () => {
  const texto = mensajeDatosViejos([cartera("vistana", 40), cartera("fashion_wear", 30)]);

  it("dice QUÉ dato, en palabras del negocio", () => {
    expect(texto).toContain("la cartera (lo que te deben)");
  });

  it("dice CUÁNTO lleva, con el peor caso al frente", () => {
    // vistana lleva 40h y fashion_wear 30h: manda el 40.
    expect(texto).toContain("40 horas");
    expect(texto).not.toContain("30 horas");
  });

  it("nombra las empresas para saber dónde mirar", () => {
    expect(texto).toContain("vistana");
    expect(texto).toContain("fashion_wear");
  });

  it("explica qué significa, sin asustar de más", () => {
    // Un dato viejo no es un dato MALO: lo que hay sigue siendo correcto.
    expect(texto).toMatch(/no es lo de hoy/i);
    expect(texto).toMatch(/siguen siendo correctos/i);
  });

  it("no vomita jerga: ni tablas, ni nombres de cron, ni HTML", () => {
    for (const jerga of [
      "switch_estadocuenta",
      "switch_sync_log",
      "synced_at",
      "switch-sync",
      "all-0630",
      "heartbeat",
      "<!DOCTYPE",
      "undefined",
      "NaN",
    ]) {
      expect(texto, `no debe decir "${jerga}"`).not.toContain(jerga);
    }
  });

  it("el caso 'nunca se actualizó' se lee bien (no dice 'null horas')", () => {
    const t = mensajeDatosViejos([cartera("vistana", null)]);
    expect(t).toContain("nunca se actualizó");
    expect(t).not.toContain("null");
    expect(t).not.toContain("NaN");
  });

  it("distingue singular de plural", () => {
    expect(mensajeDatosViejos([cartera("vistana", 40)])).toContain("un dato de la app que está viejo");
    expect(mensajeDatosViejos([cartera("vistana", 40), ventas("joystep", 40)])).toContain(
      "datos de la app que están viejos",
    );
  });

  it("cuando la que está vieja es la de Boston, la NOMBRA (no se esconde tras 'la cartera')", () => {
    const t = mensajeDatosViejos([cartera("confecciones_boston", 120)]);
    expect(t).toContain("confecciones_boston");
    expect(t).toContain("120 horas");
    // 🔴 Y no arrastra a ninguna del grupo: el mensaje dice de quién habla.
    for (const e of empresasConCxc()) expect(t).not.toContain(e);
  });

  it("agrupa por dato: cartera y ventas no se mezclan en una sola línea", () => {
    const t = mensajeDatosViejos([cartera("vistana", 40), ventas("joystep", 50)]);
    expect(t).toContain("la cartera (lo que te deben)");
    expect(t).toContain("las ventas");
    // Cada uno con su propio peor caso.
    expect(t).toContain("40 horas");
    expect(t).toContain("50 horas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("no se repite hasta el cansancio", () => {
  it("la ventana de dedup es menor que un día (la reconciliación corre 3×/día)", () => {
    // Sin dedup, las pasadas de 10/14/18 UTC mandarían el MISMO mensaje 3 veces
    // al día — el ruido que esta regla vino a eliminar.
    expect(HORAS_ENTRE_AVISOS).toBeLessThan(24);
    expect(HORAS_ENTRE_AVISOS).toBeGreaterThanOrEqual(12);
  });
});

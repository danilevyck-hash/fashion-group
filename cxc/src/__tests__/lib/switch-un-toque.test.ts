// ─────────────────────────────────────────────────────────────────────────────
// ENVIAR A SWITCH EN UN SOLO TOQUE (12-ago-2026) — las dos piezas puras.
//
//  · `switch-prevalidacion.ts` — ¿el toque sigue de largo o se detiene?
//  · `permiso-precio.ts` — el permiso 0001 se pregunta UNA vez por empresa.
//
// Daniel: *"porque doble? se puede hacer en un solo paso?"* → *"nos podemos
// ahorrar un paso"*. Lo que estos candados protegen es la ASIMETRÍA: dejar
// pasar de largo algo que había que decidir crea un pedido REAL en el ERP que
// después hay que borrar A MANO desde el panel de Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  WARNING_SEVERIDAD,
  avisosBloqueantes,
  hayQueDetenerse,
  textosDeAvisos,
  type AvisoEnvio,
  type WarningCodigo,
} from "@/lib/catalogo/switch-prevalidacion";
import {
  PROCESO_CAMBIO_PRECIO,
  TEXTO_PERMISO_NO_VERIFICADO,
  TEXTO_SIN_PERMISO_PRECIO,
  TTL_PERMISO_OK_MS,
  _resetCachePermisoPrecio,
  permisoCambiarPrecio,
} from "@/lib/catalogo/permiso-precio";

const SRC = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const aviso = (codigo: WarningCodigo, texto = "x"): AvisoEnvio => ({ codigo, texto });

// ── ¿Se detiene o sigue? ─────────────────────────────────────────────────────

describe("hayQueDetenerse — el corazón del toque único", () => {
  it("todo limpio → NO se detiene (el pedido se crea sin preguntar)", () => {
    expect(hayQueDetenerse({ errores: [], avisos: [] })).toBe(false);
    expect(hayQueDetenerse({})).toBe(false);
  });

  it("🔴 cualquier error de pre-validación DETIENE", () => {
    expect(hayQueDetenerse({ errores: ["SKU X no existe en Switch (active_shoes)"] })).toBe(true);
    expect(hayQueDetenerse({ errores: ["SKU X tiene precio 0 en Switch — corregirlo en el panel antes de enviar"] })).toBe(true);
    expect(hayQueDetenerse({ errores: [TEXTO_SIN_PERMISO_PRECIO] })).toBe(true);
  });

  it("un error DETIENE aunque venga acompañado de avisos informativos", () => {
    expect(hayQueDetenerse({ errores: ["e"], avisos: [aviso("precio_distinto")] })).toBe(true);
  });

  it("precio ≠ lista NO detiene — editar el precio es una función legítima", () => {
    // Daniel edita precios todos los días y Switch respeta el enviado. Además
    // la diferencia ya se ve INLINE mientras edita: cuando llega al toque, la
    // vio. Frenar acá sería frenarle el trabajo.
    expect(hayQueDetenerse({ errores: [], avisos: [aviso("precio_distinto")] })).toBe(false);
  });

  it("los avisos informativos de siempre no detienen", () => {
    expect(hayQueDetenerse({ avisos: [aviso("variantes_talla_color"), aviso("tallas_no_verificadas")] })).toBe(false);
  });

  it("permiso 0001 NO VERIFICADO no detiene (fail-open, igual que antes)", () => {
    expect(hayQueDetenerse({ avisos: [aviso("permiso_no_verificado")] })).toBe(false);
  });

  it("un aviso BLOQUEANTE detiene, y `avisosBloqueantes` deja pasar solo a ése", () => {
    // Hoy los cuatro son informativos; el mecanismo se prueba invirtiendo la
    // severidad de uno para que el candado sirva el día que aparezca uno.
    const original = WARNING_SEVERIDAD.precio_distinto;
    try {
      (WARNING_SEVERIDAD as Record<WarningCodigo, string>).precio_distinto = "bloqueante";
      const avisos = [aviso("precio_distinto", "ojo"), aviso("variantes_talla_color", "meh")];
      expect(hayQueDetenerse({ errores: [], avisos })).toBe(true);
      expect(avisosBloqueantes(avisos).map((a) => a.texto)).toEqual(["ojo"]);
    } finally {
      (WARNING_SEVERIDAD as Record<WarningCodigo, string>).precio_distinto = original;
    }
  });

  it("`warnings[]` se DERIVA de los avisos — no son dos listas que se puedan separar", () => {
    expect(textosDeAvisos([aviso("precio_distinto", "a"), aviso("tallas_no_verificadas", "b")])).toEqual(["a", "b"]);
    expect(textosDeAvisos(null)).toEqual([]);
  });
});

describe("la severidad va por CÓDIGO, no por texto", () => {
  it("todo código declarado tiene severidad (el Record es exhaustivo)", () => {
    const codigos: WarningCodigo[] = [
      "precio_distinto", "variantes_talla_color", "tallas_no_verificadas", "permiso_no_verificado",
    ];
    for (const c of codigos) expect(["informativo", "bloqueante"]).toContain(WARNING_SEVERIDAD[c]);
    expect(Object.keys(WARNING_SEVERIDAD).sort()).toEqual([...codigos].sort());
  });

  it("🔴 el motor NUNCA empuja un aviso sin código — si no, la clasificación es un colador", () => {
    const src = SRC("src/lib/catalogo/switch-envio.ts");
    // Ni un solo `warnings.push(` suelto: todos los avisos pasan por `avisos`
    // con su `codigo`, que TypeScript obliga a declarar en el union.
    expect(src).not.toMatch(/warnings\.push\(/);
    // `avisosItem` es la lista por línea (la resolución va en paralelo y cada
    // una junta lo suyo antes de volcarse EN ORDEN); vale lo mismo.
    for (const m of src.matchAll(/avisos(?:Item)?\.push\(\{\s*codigo:\s*"([a-z_]+)"/g)) {
      expect(Object.keys(WARNING_SEVERIDAD)).toContain(m[1]);
    }
    expect([...src.matchAll(/avisos(?:Item)?\.push\(\{/g)].length).toBeGreaterThanOrEqual(4);
  });
});

// ── El candado at-most-once NO se toca ───────────────────────────────────────

describe("🔴 candado at-most-once del envío — INTACTO", () => {
  const src = SRC("src/lib/catalogo/switch-envio.ts");

  it("el intento se registra ANTES del POST a Switch", () => {
    const insert = src.indexOf('.insert({ order_id: p.orderId, estado: "pendiente"');
    const post = src.indexOf("client.apipedidoTerminar(payload)");
    expect(insert).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(-1);
    expect(insert).toBeLessThan(post);
  });

  it("un envío no-fallido bloquea otro intento (idempotencia por order_id)", () => {
    expect(src).toMatch(/\.eq\("order_id", p\.orderId\)[\s\S]{0,80}\.neq\("estado", "error"\)/);
    expect(src).toContain('return { kind: "ya_enviado"');
  });

  it("la carrera del índice parcial (23505) sigue devolviendo `carrera`", () => {
    expect(src).toContain('if (envioErr?.code === "23505") return { kind: "carrera" };');
  });

  it("`ya_enviado` y `carrera` siguen siendo 409 en el handler", () => {
    const route = SRC("src/lib/catalogo/enviar-switch-route.ts");
    expect(route).toMatch(/case "ya_enviado":[\s\S]{0,200}status: 409/);
    expect(route).toMatch(/case "carrera":[\s\S]{0,200}status: 409/);
  });

  it("🔴 la pre-validación NO se puede saltear: la decide el SERVIDOR", () => {
    // ⏱️ CAMBIO 12-ago-2026 (un solo viaje). Antes la pantalla mandaba un
    // `dry:true`, miraba el resultado y RECIÉN ahí mandaba el POST real — o sea
    // que el pedido se cruzaba con Switch DOS veces (medido: ~95 s con 30
    // líneas). Ahora manda `auto:true` y el motor pre-valida y crea en la misma
    // llamada, deteniéndose solo si `hayQueDetenerse` dice que sí.
    //
    // La garantía es la MISMA y encima más fuerte: antes vivía en el navegador
    // (un cliente hecho a mano podía saltearla), ahora vive en el servidor,
    // ANTES de cualquier escritura. Lo que se escribe o no se escribe está
    // fijado por `switch-envio-paralelo.test.ts`, que corre el motor de verdad.
    const ui = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    expect(ui).toContain("await crearEnSwitch(true);");
    expect(ui).toContain('JSON.stringify(auto ? { auto: true } : {})');

    const motor = SRC("src/lib/catalogo/switch-envio.ts");
    // El corte por `auto` va ANTES del registro del intento y del POST.
    const corte = motor.indexOf("p.auto && hayQueDetenerse(");
    const insert = motor.indexOf('.insert({ order_id: p.orderId, estado: "pendiente"');
    expect(corte).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(corte);
    // …y los errores de pre-validación siguen cortando antes que todo.
    expect(motor.indexOf('return { kind: "prevalidacion"')).toBeLessThan(corte);

    // Y una capa más: el ref que come el segundo toque.
    expect(ui).toContain("if (enviandoRef.current) return;");
  });
});

// ── Permiso 0001 ─────────────────────────────────────────────────────────────

describe("permisoCambiarPrecio — una consulta por empresa, no una por toque", () => {
  beforeEach(() => _resetCachePermisoPrecio());

  it("el proceso es el 0001 y los textos son ÚNICOS (los comparten pantalla y motor)", () => {
    expect(PROCESO_CAMBIO_PRECIO).toBe("0001");
    expect(TEXTO_SIN_PERMISO_PRECIO).toContain("proceso 0001");
    expect(TEXTO_PERMISO_NO_VERIFICADO).toContain("se intenta el envío igual");
    // El motor NO reescribe los textos a mano.
    const envio = SRC("src/lib/catalogo/switch-envio.ts");
    expect(envio).toContain("TEXTO_SIN_PERMISO_PRECIO");
    expect(envio).toContain("TEXTO_PERMISO_NO_VERIFICADO");
    expect(envio).not.toMatch(/errores: \["El usuario de Switch no tiene permiso/);
  });

  it("el SÍ se consulta UNA vez y después sale del caché", async () => {
    const verificar = vi.fn(async () => true);
    expect(await permisoCambiarPrecio("active_shoes", verificar)).toEqual({ permiso: true, verificado: true });
    expect(await permisoCambiarPrecio("active_shoes", verificar)).toEqual({ permiso: true, verificado: true });
    expect(await permisoCambiarPrecio("active_shoes", verificar)).toEqual({ permiso: true, verificado: true });
    expect(verificar).toHaveBeenCalledTimes(1);
  });

  it("⚠️ el caché es POR EMPRESA — cada marca es una empresa de Switch distinta", async () => {
    const verificar = vi.fn(async () => true);
    await permisoCambiarPrecio("active_shoes", verificar);
    await permisoCambiarPrecio("joystep", verificar);
    await permisoCambiarPrecio("fashion_shoes", verificar);
    await permisoCambiarPrecio("vistana", verificar);
    expect(verificar).toHaveBeenCalledTimes(4);
  });

  it("🔴 el NO no se cachea: en cuanto el admin lo da, el reintento lo ve", async () => {
    const verificar = vi.fn(async () => false);
    expect(await permisoCambiarPrecio("active_shoes", verificar)).toEqual({ permiso: false, verificado: true });
    expect(await permisoCambiarPrecio("active_shoes", verificar)).toEqual({ permiso: false, verificado: true });
    expect(verificar).toHaveBeenCalledTimes(2);
    // …y en cuanto Switch dice que sí, se ve al toque siguiente.
    expect(await permisoCambiarPrecio("active_shoes", async () => true)).toEqual({ permiso: true, verificado: true });
  });

  it("un SÍ cacheado se vuelve a preguntar cuando vence el TTL", async () => {
    const verificar = vi.fn(async () => true);
    const t0 = 1_000_000;
    await permisoCambiarPrecio("active_shoes", verificar, t0);
    await permisoCambiarPrecio("active_shoes", verificar, t0 + TTL_PERMISO_OK_MS - 1);
    expect(verificar).toHaveBeenCalledTimes(1);
    await permisoCambiarPrecio("active_shoes", verificar, t0 + TTL_PERMISO_OK_MS + 1);
    expect(verificar).toHaveBeenCalledTimes(2);
  });

  it("🔴 FAIL-OPEN: si no se puede verificar → permiso true, verificado false", async () => {
    const verificar = vi.fn(async () => { throw new Error("Switch caído"); });
    expect(await permisoCambiarPrecio("active_shoes", verificar)).toEqual({ permiso: true, verificado: false });
  });

  it("el fallo se cachea un rato: Switch caído no se martilla a cada tecla", async () => {
    const verificar = vi.fn(async () => { throw new Error("nope"); });
    await permisoCambiarPrecio("active_shoes", verificar);
    await permisoCambiarPrecio("active_shoes", verificar);
    expect(verificar).toHaveBeenCalledTimes(1);
  });
});

// ── Poda del texto ───────────────────────────────────────────────────────────

describe('poda: el botón dice "Enviar a Switch" a secas', () => {
  const ARCHIVOS = [
    "src/components/catalogo/PedidoDetalleClient.tsx",
    "src/components/catalogo/CheckoutClient.tsx",
  ];

  it('🔴 "Confirmar y enviar a Switch" NO puede volver a ningún lado del módulo', () => {
    // Daniel: *"cambia de 'Confirmar y enviar a Switch' a 'Enviar a Switch' en
    // todas partes del catalogo"*.
    for (const f of ARCHIVOS) expect(SRC(f)).not.toContain("Confirmar y enviar a Switch");
  });

  it("las dos puertas de envío dicen lo mismo", () => {
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).toContain('"Enviar a Switch"');
    expect(SRC("src/components/catalogo/CheckoutClient.tsx")).toContain('"Enviar a Switch"');
  });

  it("⚠️ el pedido PÚBLICO no se toca: ahí confirma el CLIENTE y no manda nada a Switch", () => {
    // El botón del link público sigue diciendo "Confirmar pedido": es otra
    // acción, hecha por otra persona.
    const publico = SRC("src/components/catalogo/PedidoPublicoClient.tsx");
    expect(publico).toContain("Confirmar pedido");
    expect(publico).not.toContain("Enviar a Switch");
  });
});

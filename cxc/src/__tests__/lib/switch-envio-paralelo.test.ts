// ─────────────────────────────────────────────────────────────────────────────
// EL ENVÍO A SWITCH RESUELVE LOS SKU EN PARALELO Y DECIDE EN EL SERVIDOR.
//
// 🩸 LO MEDIDO (12-ago-2026). Daniel, con el TOM-015 clavado en "Revisando el
// pedido contra Switch…": *"este proceso demora mas que al hacer el pedido
// desde 0, porque?"*. Dos causas, las dos en este archivo:
//
//   (1) cada línea costaba DOS llamadas a Switch (`/apiarticulos/lista` +
//       `/apiarticulos/tallacolor`) y salían de a UNA, en fila india. Medido
//       contra producción (Tommy, `scripts/_medir-envio-switch.ts`, dry-run):
//       3 líneas 12,1 s · 10 líneas 14,5 s · **30 líneas 49,5 s**.
//   (2) el camino del detalle hacía DOS viajes al servidor —`dry:true` y
//       después el POST real— y **cada uno volvía a resolver TODOS los SKU**,
//       o sea que el pedido se cruzaba con Switch dos veces (~95 s con 30
//       líneas). El checkout del carrito nunca tuvo ese problema: crea y envía
//       en una sola llamada.
//
// Este archivo fija lo que NO se puede romper al arreglarlo:
//   · el ORDEN de las líneas del pedido,
//   · que un SKU que no cruza siga dando SU error sin tumbar a los demás,
//   · que nunca haya más de `SKU_CONCURRENCIA` llamadas en vuelo (sesión única
//     de Switch: la concurrencia solo es segura por el de-dup de login de
//     `client.ts` — ver `catalogo-stock-paralelo.test.ts`),
//   · y el candado at-most-once: si hay algo que decidir NO se escribe NADA, y
//     un segundo envío sigue rebotando.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// (vitest iza los `vi.mock` por encima de estos imports)
import { enviarPedidoSwitch } from "@/lib/catalogo/switch-envio";
import { WARNING_SEVERIDAD } from "@/lib/catalogo/switch-prevalidacion";
import { _resetCachePermisoPrecio } from "@/lib/catalogo/permiso-precio";

vi.mock("@/lib/alertas/canal", () => ({
  enviarNegocio: vi.fn(async () => true),
  enviarSistema: vi.fn(async () => true),
}));
// Se importa DESPUÉS del mock (vitest iza los `vi.mock`): es el doble, y sirve
// para leer el texto exacto del aviso que sale al canal.
import { enviarNegocio } from "@/lib/alertas/canal";

// ── Doble de Switch ──────────────────────────────────────────────────────────

interface ArticuloFalso { id: number; codigo: string; descripcion: string; codigoBarraId: number | null; precio: string }

const switchState = {
  /** Artículos que "existen" en Switch, por código. */
  articulos: new Map<string, ArticuloFalso>(),
  /** Demora por código (ms) — para probar el orden con el lento primero. */
  demoras: new Map<string, number>(),
  /** Códigos cuya consulta revienta (Switch caído). */
  revientan: new Set<string>(),
  /** Variantes talla/color por articuloId. */
  variantes: new Map<number, number[]>(),
  permiso: true,
  enVuelo: 0,
  pico: 0,
  llamadas: [] as string[],
  clientes: 0,
  terminarLlamado: 0,
  /** POST a /apicotizacion/terminar (la segunda salida, 24-ago-2026). */
  cotizacionLlamado: 0,
  /** GET a /apicotizacion/info (la verificación de esa salida). */
  cotizacionInfoLlamado: 0,
  /** GET a /apipedido/info. */
  pedidoInfoLlamado: 0,
  /** La respuesta de la cotización llega SIN id (el borde no medido). */
  sinIdEnCotizacion: false,
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function conMedicion<T>(etiqueta: string, ms: number, fn: () => T): Promise<T> {
  switchState.llamadas.push(etiqueta);
  switchState.enVuelo++;
  switchState.pico = Math.max(switchState.pico, switchState.enVuelo);
  try {
    await espera(ms);
    return fn();
  } finally {
    switchState.enVuelo--;
  }
}

vi.mock("@/lib/switch-api/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/switch-api/client")>();
  return {
    ...real,
    createSwitchClient: () => {
      switchState.clientes++;
      return {
        async getArticulos({ filtro }: { filtro?: string }) {
          const sku = filtro || "";
          return conMedicion(`lista:${sku}`, switchState.demoras.get(sku) ?? 1, () => {
            if (switchState.revientan.has(sku)) throw new Error("ECONNRESET");
            const a = switchState.articulos.get(sku);
            return { articulos: a ? [a] : [] };
          });
        },
        async apiarticulosTallaColor({ articuloId }: { articuloId: number }) {
          return conMedicion(`tallacolor:${articuloId}`, 1, () => ({
            tallacolor: (switchState.variantes.get(articuloId) ?? [1]).map((codigoBarraId) => ({ codigoBarraId })),
          }));
        },
        async verificarPermiso() { return switchState.permiso; },
        async apipedidoTerminar() {
          switchState.terminarLlamado++;
          return { pedidoId: 777, numeroInterno: "16-000000777" };
        },
        async apipedidoInfo() { switchState.pedidoInfoLlamado++; return { detalle: [] }; },
        // La segunda salida. Devuelve `cotizacionId` (no `pedidoId`), que es lo
        // que el motor tiene que saber leer.
        async apicotizacionTerminar() {
          switchState.cotizacionLlamado++;
          // ⚠️ El borde NO es "el campo falta" (eso lo saltea el `continue` del
          // helper): es un campo que VIENE y no es un id. `Number("SIN-ID")` es
          // NaN y `Number(null)` es 0 — los dos se escribirían como id.
          return switchState.sinIdEnCotizacion
            ? { cotizacionId: "SIN-ID", numeroInterno: "16-000000555", mensaje: "OK" }
            : { cotizacionId: 555, numeroInterno: "16-000000555", mensaje: "OK" };
        },
        async apicotizacionInfo() { switchState.cotizacionInfoLlamado++; return { detalle: [] }; },
      };
    },
  };
});

// ── Doble de Supabase (la tabla de envíos) ───────────────────────────────────

interface FilaEnvio { id: string; order_id: string; estado: string; numero_interno?: string | null }

function dbFalso(existentes: FilaEnvio[] = []) {
  const filas = [...existentes];
  const registro = { inserts: 0, updates: 0, ordenDeEventos: [] as string[] };
  const db = {
    filas,
    registro,
    from() {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: filas.find((f) => f.estado !== "error") ?? null, error: null }),
              }),
            }),
          }),
        }),
        insert(fila: Record<string, unknown>) {
          registro.inserts++;
          registro.ordenDeEventos.push("insert");
          const nueva = { id: `e${filas.length + 1}`, ...fila } as unknown as FilaEnvio;
          filas.push(nueva);
          return { select: () => ({ single: async () => ({ data: { id: nueva.id }, error: null }) }) };
        },
        update() {
          registro.updates++;
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
  return db;
}

/**
 * La MISMA tabla, pero con el DDL 20260824160000 todavía sin correr: el insert
 * con `documento` revienta como lo hace PostgREST y el motor tiene que
 * reintentar sin la columna.
 */
function dbSinColumnaDocumento() {
  const db = dbFalso();
  const fromReal = db.from.bind(db);
  db.from = () => {
    const t = fromReal();
    const insertReal = t.insert.bind(t);
    return {
      ...t,
      insert(fila: Record<string, unknown>) {
        if ("documento" in fila) {
          return {
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: "42703", message: `column "documento" of relation "x" does not exist` },
              }),
            }),
          };
        }
        return insertReal(fila);
      },
    };
  };
  return db;
}

// ── Pedido de prueba ─────────────────────────────────────────────────────────


type Codigo = keyof typeof WARNING_SEVERIDAD;

function sembrarArticulo(sku: string, id: number, precio = "10.00") {
  switchState.articulos.set(sku, { id, codigo: sku, descripcion: `DESC ${sku}`, codigoBarraId: id * 100, precio });
}

function items(skus: string[]) {
  return skus.map((sku, i) => ({
    product_id: `p${i + 1}`,
    sku,
    name: `Producto ${sku}`,
    quantity: 1,
    unit_price: 10,
  }));
}

function enviar(
  skus: string[],
  extra: Partial<Parameters<typeof enviarPedidoSwitch>[0]> = {},
  db = dbFalso(),
) {
  return enviarPedidoSwitch({
    empresaKey: "fashion_shoes",
    enviosTable: "tommy_switch_envios",
    db: db as never,
    orderId: "o1",
    orderNumber: "TOM-015",
    marcaLabel: "Tommy Hilfiger",
    items: items(skus),
    bultoSize: () => 12,
    categoryByProduct: new Map(),
    bultoPzasByProduct: new Map(),
    clienteId: 1,
    vendedorId: 2,
    ...extra,
  });
}

beforeEach(() => {
  switchState.articulos.clear();
  switchState.demoras.clear();
  switchState.revientan.clear();
  switchState.variantes.clear();
  switchState.permiso = true;
  switchState.enVuelo = 0;
  switchState.pico = 0;
  switchState.llamadas = [];
  switchState.clientes = 0;
  switchState.terminarLlamado = 0;
  switchState.cotizacionLlamado = 0;
  switchState.cotizacionInfoLlamado = 0;
  switchState.pedidoInfoLlamado = 0;
  switchState.sinIdEnCotizacion = false;
  _resetCachePermisoPrecio();
});

// ─────────────────────────────────────────────────────────────────────────────
// Orden y concurrencia
// ─────────────────────────────────────────────────────────────────────────────

describe("la resolución va en paralelo pero el pedido conserva su orden", () => {
  it("🔴 las líneas salen EN EL ORDEN DEL PEDIDO, no en el de respuesta de Switch", async () => {
    // El primero es el MÁS LENTO a propósito: si el resultado se armara por
    // orden de llegada, este test lo cazaría.
    const skus = ["A", "B", "C", "D", "E"];
    skus.forEach((s, i) => sembrarArticulo(s, i + 1));
    switchState.demoras.set("A", 40);
    switchState.demoras.set("C", 20);

    const r = await enviar(skus, { dry: true });
    expect(r.kind).toBe("preview");
    if (r.kind !== "preview") return;
    expect(r.preview.lineas.map((l) => l.sku)).toEqual(skus);
  });

  it("nunca hay más de 4 llamadas a Switch en vuelo — y sí paraleliza", async () => {
    const skus = Array.from({ length: 12 }, (_, i) => `S${i}`);
    skus.forEach((s, i) => sembrarArticulo(s, i + 1));
    switchState.demoras.set("S0", 5);

    await enviar(skus, { dry: true });
    expect(switchState.pico).toBeLessThanOrEqual(4);
    expect(switchState.pico).toBeGreaterThan(1);
  });

  it("🔴 UNA sola sesión de Switch para todo el pedido", async () => {
    // Sesión única por empresa: un cliente por envío. La concurrencia solo es
    // segura porque `client.ts` deduplica el login en vuelo.
    const skus = ["A", "B", "C", "D", "E", "F"];
    skus.forEach((s, i) => sembrarArticulo(s, i + 1));
    await enviar(skus, { dry: true });
    expect(switchState.clientes).toBe(1);
  });

  it("hace 2 llamadas por línea (lista + tallas), ni una de más", async () => {
    sembrarArticulo("A", 1);
    sembrarArticulo("B", 2);
    await enviar(["A", "B"], { dry: true });
    expect(switchState.llamadas.filter((l) => l.startsWith("lista:"))).toHaveLength(2);
    expect(switchState.llamadas.filter((l) => l.startsWith("tallacolor:"))).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Los errores por línea se ACUMULAN
// ─────────────────────────────────────────────────────────────────────────────

describe("un SKU que no cruza no tumba a los demás", () => {
  it("🔴 el error es el de siempre y las otras líneas siguen resolviéndose", async () => {
    sembrarArticulo("A", 1);
    sembrarArticulo("C", 3); // "B" no existe en Switch

    const r = await enviar(["A", "B", "C"], { dry: true });
    expect(r.kind).toBe("prevalidacion");
    if (r.kind !== "prevalidacion") return;
    expect(r.errores).toEqual(["SKU B no existe en Switch (fashion_shoes)"]);
    // …y las que sí cruzaron viajan igual, EN ORDEN, para poder verlas.
    expect(r.lineas.map((l) => l.sku)).toEqual(["A", "C"]);
  });

  it("VARIOS errores se acumulan, cada uno con su texto", async () => {
    sembrarArticulo("A", 1);
    sembrarArticulo("CERO", 2, "0.00");
    switchState.articulos.set("SINBARRA", { id: 3, codigo: "SINBARRA", descripcion: "x", codigoBarraId: null, precio: "5.00" });

    const r = await enviar(["A", "NOEXISTE", "CERO", "SINBARRA"], { dry: true });
    expect(r.kind).toBe("prevalidacion");
    if (r.kind !== "prevalidacion") return;
    expect(r.errores).toEqual([
      "SKU NOEXISTE no existe en Switch (fashion_shoes)",
      "SKU CERO tiene precio 0 en Switch — corregirlo en el panel antes de enviar",
      "SKU SINBARRA no tiene código de barra en Switch — agregarlo en el panel antes de enviar",
    ]);
    expect(r.lineas.map((l) => l.sku)).toEqual(["A"]);
  });

  it("una línea sin SKU da su error sin ir a Switch", async () => {
    sembrarArticulo("A", 1);
    const r = await enviarPedidoSwitch({
      empresaKey: "fashion_shoes", enviosTable: "t", db: dbFalso() as never,
      orderId: "o1", orderNumber: "TOM-015", marcaLabel: "Tommy",
      items: [{ product_id: "p1", sku: null, name: "Sin código", quantity: 1, unit_price: 10 }, ...items(["A"])],
      bultoSize: () => 12, categoryByProduct: new Map(), bultoPzasByProduct: new Map(),
      clienteId: 1, vendedorId: 2, dry: true,
    });
    expect(r.kind).toBe("prevalidacion");
    if (r.kind !== "prevalidacion") return;
    expect(r.errores).toEqual(['"Sin código" no tiene SKU — no se puede cruzar con Switch']);
  });

  it("los AVISOS también salen en el orden del pedido", async () => {
    sembrarArticulo("A", 1, "99.00"); // precio ≠ lista
    sembrarArticulo("B", 2);
    sembrarArticulo("C", 3, "77.00"); // precio ≠ lista
    switchState.variantes.set(2, [10, 20]); // B con dos variantes

    const r = await enviar(["A", "B", "C"], { dry: true });
    expect(r.kind).toBe("preview");
    if (r.kind !== "preview") return;
    expect(r.preview.avisos.map((a) => a.codigo)).toEqual([
      "precio_distinto", "variantes_talla_color", "precio_distinto",
    ]);
    expect(r.preview.avisos[0].texto).toContain("SKU A");
    expect(r.preview.avisos[2].texto).toContain("SKU C");
  });

  it("🔴 Switch caído en UNA línea corta la tanda entera: `switch_caido`, no un error de SKU", async () => {
    sembrarArticulo("A", 1);
    sembrarArticulo("C", 3);
    switchState.revientan.add("B");

    const r = await enviar(["A", "B", "C"], { dry: true });
    expect(r.kind).toBe("switch_caido");
    if (r.kind !== "switch_caido") return;
    expect(r.error).toContain("No se pudo consultar Switch");
    expect(r.error).toContain("Intenta de nuevo en unos minutos");
  });

  it("si no se pueden verificar las tallas, es un AVISO y la línea sigue", async () => {
    sembrarArticulo("A", 1);
    const r = await enviar(["A"], { dry: true });
    expect(r.kind).toBe("preview");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Toque único: la decisión vive en el SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 `auto` — pre-valida y crea en UN solo viaje", () => {
  it("todo limpio → CREA el pedido, y el intento se registra ANTES del POST", async () => {
    sembrarArticulo("A", 1);
    sembrarArticulo("B", 2);
    const db = dbFalso();

    const r = await enviar(["A", "B"], { auto: true }, db);
    expect(r.kind).toBe("ok");
    expect(switchState.terminarLlamado).toBe(1);
    expect(db.registro.inserts).toBe(1);
    expect(db.registro.ordenDeEventos[0]).toBe("insert"); // at-most-once
  });

  it("🔴 con un error de pre-validación NO se escribe NADA: ni en el ERP ni en la tabla de envíos", async () => {
    sembrarArticulo("A", 1);
    const db = dbFalso();

    const r = await enviar(["A", "NOEXISTE"], { auto: true }, db);
    expect(r.kind).toBe("prevalidacion");
    expect(switchState.terminarLlamado).toBe(0);
    expect(db.registro.inserts).toBe(0);
  });

  it("🔴 con un aviso BLOQUEANTE se detiene y devuelve el preview, sin escribir nada", async () => {
    // Hoy los cuatro avisos son informativos; el mecanismo se prueba invirtiendo
    // la severidad de uno, igual que en `switch-un-toque.test.ts`.
    const original = WARNING_SEVERIDAD.precio_distinto;
    try {
      (WARNING_SEVERIDAD as Record<Codigo, string>).precio_distinto = "bloqueante";
      sembrarArticulo("A", 1, "99.00"); // precio ≠ lista → aviso
      const db = dbFalso();

      const r = await enviar(["A"], { auto: true }, db);
      expect(r.kind).toBe("preview");
      expect(switchState.terminarLlamado).toBe(0);
      expect(db.registro.inserts).toBe(0);
    } finally {
      (WARNING_SEVERIDAD as Record<Codigo, string>).precio_distinto = original;
    }
  });

  it("un aviso INFORMATIVO no detiene: el pedido se crea igual", async () => {
    sembrarArticulo("A", 1, "99.00"); // precio ≠ lista, informativo
    const r = await enviar(["A"], { auto: true });
    expect(r.kind).toBe("ok");
    expect(switchState.terminarLlamado).toBe(1);
  });

  it("el permiso 0001 NEGADO detiene el toque único, sin escribir nada", async () => {
    switchState.permiso = false;
    sembrarArticulo("A", 1, "99.00"); // precio editado → se consulta el permiso
    const db = dbFalso();

    const r = await enviar(["A"], { auto: true }, db);
    expect(r.kind).toBe("prevalidacion");
    if (r.kind !== "prevalidacion") return;
    expect(r.errores[0]).toContain("proceso 0001");
    expect(switchState.terminarLlamado).toBe(0);
    expect(db.registro.inserts).toBe(0);
  });

  it("`dry` NUNCA escribe, ni con todo limpio", async () => {
    sembrarArticulo("A", 1);
    const db = dbFalso();
    const r = await enviar(["A"], { dry: true }, db);
    expect(r.kind).toBe("preview");
    expect(switchState.terminarLlamado).toBe(0);
    expect(db.registro.inserts).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El candado at-most-once, intacto
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el candado sigue rechazando el segundo envío", () => {
  it("un envío no-fallido bloquea otro intento, también con `auto`", async () => {
    sembrarArticulo("A", 1);
    const db = dbFalso([{ id: "e1", order_id: "o1", estado: "enviado", numero_interno: "16-000000111" }]);

    const r = await enviar(["A"], { auto: true }, db);
    expect(r.kind).toBe("ya_enviado");
    if (r.kind !== "ya_enviado") return;
    expect(r.detalle).toBe("16-000000111");
    expect(switchState.terminarLlamado).toBe(0);
    // Ni siquiera se consultó Switch: el candado corta antes.
    expect(switchState.llamadas).toHaveLength(0);
  });

  it("dos envíos seguidos del MISMO pedido: el segundo rebota", async () => {
    sembrarArticulo("A", 1);
    const db = dbFalso();

    const primero = await enviar(["A"], { auto: true }, db);
    const segundo = await enviar(["A"], { auto: true }, db);
    expect(primero.kind).toBe("ok");
    expect(segundo.kind).toBe("ya_enviado");
    expect(switchState.terminarLlamado).toBe(1); // UN solo pedido en Switch
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PEDIDO O COTIZACIÓN — el mismo motor, dos salidas (24-ago-2026)
//
// Daniel: ***"que estén los dos"***. Lo que se fija acá es que la salida nueva
// no abrió un segundo camino: MISMA pre-validación, MISMO registro del intento
// antes del POST, MISMO candado at-most-once. Lo único que cambia es a qué
// endpoint sale el POST y con cuál se verifica.
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la cotización sale por /apicotizacion/terminar y NADA MÁS cambia", () => {
  it("`documento: 'cotizacion'` NO toca /apipedido/terminar", async () => {
    sembrarArticulo("A", 1);
    const db = dbFalso();
    const r = await enviar(["A"], { auto: true, documento: "cotizacion" }, db);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(switchState.cotizacionLlamado).toBe(1);
    expect(switchState.terminarLlamado).toBe(0); // ← ningún pedido en el ERP
    expect(r.numeroInterno).toBe("16-000000555");
    expect(r.documento).toBe("cotizacion");
  });

  it("sin `documento` sigue siendo un PEDIDO — el default no se movió", async () => {
    sembrarArticulo("A", 1);
    const r = await enviar(["A"], { auto: true });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(switchState.terminarLlamado).toBe(1);
    expect(switchState.cotizacionLlamado).toBe(0);
    expect(r.documento).toBe("pedido");
  });

  it("la verificación usa la ruta de SU documento, no la del otro", async () => {
    sembrarArticulo("A", 1);
    await enviar(["A"], { auto: true, documento: "cotizacion" });
    expect(switchState.cotizacionInfoLlamado).toBe(1);
    expect(switchState.pedidoInfoLlamado).toBe(0);
  });

  it("lee el id de la cotización aunque se llame `cotizacionId`", async () => {
    sembrarArticulo("A", 1);
    const r = await enviar(["A"], { auto: true, documento: "cotizacion" });
    if (r.kind !== "ok") throw new Error("esperaba ok");
    expect(r.pedidoSwitchId).toBe(555);
  });

  it("🔴 la MISMA pre-validación: un SKU que no cruza tampoco cotiza", async () => {
    sembrarArticulo("A", 1);
    const db = dbFalso();
    const r = await enviar(["A", "NOEXISTE"], { auto: true, documento: "cotizacion" }, db);
    expect(r.kind).toBe("prevalidacion");
    expect(switchState.cotizacionLlamado).toBe(0);
    expect(db.registro.inserts).toBe(0);
  });

  it("🔴 el candado at-most-once NO distingue salidas: cotizar consume el envío", async () => {
    // Decisión explícita: el índice parcial sigue siendo (order_id) y un pedido
    // admite UN envío no-fallido, salga como pedido o como cotización. Para
    // vender lo que se cotizó, se DUPLICA el pedido.
    sembrarArticulo("A", 1);
    const db = dbFalso();
    const primero = await enviar(["A"], { auto: true, documento: "cotizacion" }, db);
    const segundo = await enviar(["A"], { auto: true, documento: "pedido" }, db);
    expect(primero.kind).toBe("ok");
    expect(segundo.kind).toBe("ya_enviado");
    expect(switchState.terminarLlamado).toBe(0); // el pedido NO se creó
    expect(switchState.cotizacionLlamado).toBe(1);
  });

  it("el intento se registra ANTES del POST también cotizando, y guarda qué fue", async () => {
    sembrarArticulo("A", 1);
    const db = dbFalso();
    await enviar(["A"], { auto: true, documento: "cotizacion" }, db);
    expect(db.registro.ordenDeEventos[0]).toBe("insert");
    expect((db.filas[0] as unknown as Record<string, unknown>).documento).toBe("cotizacion");
  });

  it("🔴 con el DDL pendiente (columna `documento` ausente) la cotización SALE IGUAL", async () => {
    // Quedarse sin poder enviar por una etiqueta sería peor que no tener la
    // etiqueta: la escritura reintenta sin la columna.
    sembrarArticulo("A", 1);
    const db = dbSinColumnaDocumento();
    const r = await enviar(["A"], { auto: true, documento: "cotizacion" }, db);
    expect(r.kind).toBe("ok");
    expect(switchState.cotizacionLlamado).toBe(1);
    expect(db.registro.inserts).toBe(1);
    expect((db.filas[0] as unknown as Record<string, unknown>).documento).toBeUndefined();
  });

  it("🔴 un id que Switch no devolvió NO se inventa: queda null y NO se verifica", async () => {
    // `Number(undefined)` es NaN y `Number(null)` es 0: cualquiera de los dos
    // escrito en `pedido_switch_id` sería un id que no existe, y después se
    // verificaría contra él. Un id inventado es peor que ningún id.
    switchState.sinIdEnCotizacion = true;
    sembrarArticulo("A", 1);
    const r = await enviar(["A"], { auto: true, documento: "cotizacion" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.pedidoSwitchId).toBeNull();
    expect(r.numeroInterno).toBe("16-000000555"); // la cotización SÍ se creó
    expect(switchState.cotizacionInfoLlamado).toBe(0); // no hay contra qué verificar
    expect(r.verificado).toBe(false);
  });

  // 🔴 25-ago-2026 — ESTE CANDADO CAMBIÓ DE DIRECCIÓN. Exigía la etapa
  // deletreada ("COTIZACIÓN enviada a Switch") y la línea de que no aparta
  // mercancía, o sea que FIJABA justo lo que Daniel podó: *"lo quiero más
  // simple… solo quiero lo útil"*. Lo que siempre quiso decir —y sigue
  // exigiendo— es que el aviso DIGA CUÁL DE LAS DOS FUE: hoy lo dicen el emoji
  // (📝 vs 📦) y la primera palabra, que es lo primero que se ve en el canal.
  it("🔴 el aviso de Telegram DICE cuál de las dos salió, en dos líneas", async () => {
    sembrarArticulo("A", 1);
    await enviar(["A"], { auto: true, documento: "cotizacion" });
    const texto = String(vi.mocked(enviarNegocio).mock.calls.at(-1)![0]);
    expect(texto.startsWith("📝 Cotización TOM-015 · ")).toBe(true);
    expect(texto).toContain("16-000000555");
    expect(texto.split("\n").length).toBe(2);
    // Lo podado no puede volver por este camino.
    expect(texto).not.toContain("COTIZACIÓN enviada a Switch");
    expect(texto).not.toContain("No aparta mercancía");
    expect(texto).not.toContain("Vendedor:");

    vi.mocked(enviarNegocio).mockClear();
    await enviar(["A"], { auto: true }, dbFalso());
    const otro = String(vi.mocked(enviarNegocio).mock.calls.at(-1)![0]);
    expect(otro.startsWith("📦 Pedido TOM-015 · ")).toBe(true);
    expect(otro).not.toContain("Cotización");
    expect(otro).not.toContain("No aparta mercancía");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Candado estático — la concurrencia depende del de-dup de login
// ─────────────────────────────────────────────────────────────────────────────

describe("la concurrencia no puede existir sin el de-dup de login", () => {
  const leer = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  const motor = leer("src/lib/catalogo/switch-envio.ts");

  it("si SKU_CONCURRENCIA > 1, client.ts TIENE que deduplicar el login", () => {
    const m = motor.match(/const SKU_CONCURRENCIA = (\d+);/);
    expect(m, "no encontré SKU_CONCURRENCIA").toBeTruthy();
    const n = Number(m![1]);
    expect(n).toBeGreaterThanOrEqual(1);
    // 4 es lo PROBADO (el sync de catálogos). Subirlo exige medir de nuevo.
    expect(n).toBeLessThanOrEqual(4);
    if (n > 1) {
      expect(
        leer("src/lib/switch-api/client.ts"),
        "el envío resuelve SKU en paralelo pero client.ts no deduplica el login: " +
          "N llamadas con el token vencido dispararían N /autenticacion y Switch " +
          "(sesión única por empresa) mataría la sesión en cada uno.",
      ).toContain("loginEnVuelo");
    }
  });

  it("usa el helper compartido, no un pool escrito de nuevo", () => {
    expect(motor).toContain('from "@/lib/switch-api/en-paralelo"');
    expect(motor).toContain("await enParalelo(p.items, SKU_CONCURRENCIA");
  });

  it("🔴 el motor NO cierra la sesión: eso es del caller (su finally)", () => {
    // Cerrarla acá cortaría la sesión entre la pre-validación y el POST.
    // (La cabecera SÍ la nombra para explicarlo; lo que no puede haber es una
    // llamada.)
    expect(motor).not.toMatch(/logoutAllSwitchSessions\(/);
    expect(motor).not.toMatch(/import[^;]*logoutAllSwitchSessions/);
  });
});

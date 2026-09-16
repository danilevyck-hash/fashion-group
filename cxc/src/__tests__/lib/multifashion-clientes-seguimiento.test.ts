// ─────────────────────────────────────────────────────────────────────────────
// CANDADO: MULTIFASHION › CLIENTES — seguimiento y postventa (16-sep-2026).
//
// Daniel: *«quiero que Jennifer pueda entrar para poder hacerle seguimiento a
// los clientes que han comprado, con botón para escribirle al whatsapp»* ·
// *«¿no prefieres mantenerlo más minimalista para vendedoras de tercer
// mundo?»* · *«una vendedora no ordena: abre y baja»* · *«desde la tienda, el
// ya se escribió debe de ser general por módulo, no por usuario ni nada de
// eso»* · del texto del botón de WhatsApp: *«vacío»*.
//
// 🔴 LAS CINCO COSAS QUE ESTE ARCHIVO VIGILA:
//
//  1. **VIENEN TODOS, NO 50.** La lista sale del universo paginado, no de la
//     RPC del ranking. 🩸 Medido contra producción: `multifashion_retail_
//     recurrentes_v2` tiene un tope DURO de 500 filas adentro de la función
//     —pedirle 2.000 devuelve 500— y para el año 2026 declara 587
//     identificados y entrega 500. Los clientes con compras son **967**.
//  2. **`db-max-rows` NO PUEDE MORDER.** Las tres lecturas del módulo
//     (clientes, facturas, contactos) van con `leerTodoPaginado` y con un
//     `.order()` estable. `switch_clientes` de ACS ya son 1.060 filas: sin
//     paginar se perderían 60 clientes sin un solo error.
//  3. **UN SOLO ORDEN, el del que más tiempo lleva sin comprar.** ⚠️ Esto
//     REEMPLAZA el «sort por última compra y por último contacto» que Daniel
//     pidió el 15-sep: al ver el mockup cambió de opinión.
//  4. **SIN TELÉFONO NO SE DIBUJA EL BOTÓN.** Medido: 105 de los 967 no tienen
//     teléfono en el maestro de Switch. No se inventa un número ni se deja un
//     botón muerto.
//  5. **EL REGISTRO ES DEL MÓDULO, NO DEL USUARIO.** Se guarda quién escribió,
//     pero NINGUNA lectura filtra por eso.
//
// 🔴 Y una transversal: **la identidad es el CÓDIGO de Switch, nunca el
// nombre.** Medido el mismo día: por nombre, tres personas distintas caen bajo
// «JOSE MORALES» y el código 425 sale PARTIDO en dos grafías («rafael
// rodriguez» $295,28 + «RAFAEL RODRIGUEZ» $115,40 = $410,68).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

import {
  armarUniverso,
  correrDias,
  diasEntre,
  subtotalFirmado,
  type ClienteUniverso,
  type FilaFactura,
  type FilaRegistrado,
} from "@/lib/multifashion/clientes-universo";
import {
  CHIPS,
  CHIP_INICIAL,
  ROTULO_CHIP,
  baseDeSeguimiento,
  conteoPorChip,
  esChip,
  filtrarPorChip,
  lineaDelRenglon,
  listaDeSeguimiento,
  ordenarParaSeguimiento,
} from "@/lib/multifashion/clientes-seguimiento";
import {
  FUERA_DE_SEGUIMIENTO,
  estaFueraDeSeguimiento,
} from "@/lib/multifashion/fuera-de-seguimiento";
import {
  CANALES_CONTACTO,
  diasDesdeContacto,
  esCanalContacto,
  textoUltimoContacto,
  ultimoContactoPorCliente,
} from "@/lib/multifashion/contacto-registro";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

/** El archivo SIN comentarios. 🩸 Un barrido que lee comentarios se cumple a sí
 *  mismo con su propia explicación — este repo ya lo pagó tres veces. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const lectura = leer("src/lib/multifashion/clientes-lectura.ts");
const rutaFidel = leer("src/app/api/multifashion/fidelizacion/route.ts");
const rutaContactos = leer("src/app/api/multifashion/contactos/route.ts");
const lista = leer("src/components/multifashion/ListaSeguimientoClientes.tsx");
const pestana = leer("src/components/multifashion/ClientesMultifashionSubtab.tsx");
const MIGRACION = "supabase/migrations/20261129120000_multifashion_contactos.sql";

const HOY = "2026-09-16";

// ─── Ayudantes para armar un universo de mentira, pero con la forma real ────

function reg(id: number, extra: Partial<FilaRegistrado> = {}): FilaRegistrado {
  return {
    cliente_switch_id: id,
    nombre: `CLIENTE ${id}`,
    telefono: "6212-0673",
    celular: null,
    raw_data: null,
    ...extra,
  };
}

function fac(id: number, fecha: string, extra: Partial<FilaFactura> = {}): FilaFactura {
  return {
    cliente_switch_id: id,
    cliente_nombre: `CLIENTE ${id}`,
    fecha: `${fecha}T15:00:00+00:00`,
    tipo_comprobante: "Factura",
    subtotal_descuento: 100,
    is_wholesale: false,
    ...extra,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. VIENEN TODOS, NO 50 — y no salen de la RPC del ranking
// ═════════════════════════════════════════════════════════════════════════════

describe("1 · la lista trae a TODOS los clientes identificados", () => {
  it("🔴 el universo NO se recorta: 120 clientes entran 120", () => {
    // Desde el 100 para no chocar con los códigos de `fuera-de-seguimiento`.
    const registrados = Array.from({ length: 120 }, (_, i) => reg(i + 100));
    const facturas = registrados.map((r) => fac(r.cliente_switch_id, "2026-01-10"));
    const { clientes } = armarUniverso(registrados, facturas, HOY);
    expect(clientes.length).toBe(120);
    expect(baseDeSeguimiento(clientes).length).toBe(120);
    expect(listaDeSeguimiento(clientes, "todos").length).toBe(120);
  });

  it("🔴 la lista NO sale de `multifashion_retail_recurrentes_v2` (tope duro de 500)", () => {
    // La RPC del ranking tiene `IF p_limit > 500 THEN p_limit := 500` adentro y
    // agrupa por NOMBRE. Si alguien la vuelve a enchufar acá «para
    // simplificar», la lista se queda en 500 y se parte por homónimos.
    expect(plano(lista)).not.toContain("retail-recurrentes");
    expect(plano(lista)).not.toContain("retail_recurrentes");
    expect(plano(rutaFidel)).not.toContain("retail_recurrentes");
    expect(plano(lectura)).not.toContain("retail_recurrentes");
  });

  it("🔴 ninguna lectura del universo pone un `.limit(`", () => {
    expect(plano(lectura)).not.toMatch(/\.limit\(/);
    expect(plano(rutaContactos)).not.toMatch(/\.limit\(/);
  });

  it("la pestaña le pasa a la lista el universo entero, no un recorte", () => {
    expect(plano(pestana)).toContain("<ListaSeguimientoClientes clientes={fidel.clientes}");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. `db-max-rows` = 1000 y corta EN SILENCIO
// ═════════════════════════════════════════════════════════════════════════════

describe("2 · las tres lecturas paginan, con orden estable", () => {
  it("🔴 clientes y facturas van con `leerTodoPaginado`", () => {
    const src = plano(lectura);
    expect(src).toContain("leerTodoPaginado");
    // Las dos lecturas: `switch_clientes` y `switch_facturas`.
    expect((src.match(/leerTodoPaginado</g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('.from("switch_clientes")');
    expect(src).toContain('.from("switch_facturas")');
  });

  it("🔴 el contacto también pagina: la tabla crece con cada mensaje", () => {
    // La LLAMADA, no el import: dejar el import y leer de un solo tiro es
    // exactamente el error que esto vigila.
    expect(plano(rutaContactos)).toContain("await leerTodoPaginado<FilaContacto>(");
  });

  it("🔴 toda página va ordenada por `id`, que es único y estable", () => {
    // Paginar SIN orden no arregla nada: PostgREST puede repetir o saltear
    // filas entre páginas, y acá todo se AGREGA.
    const src = plano(lectura);
    expect((src.match(/\.order\("id", \{ ascending: true \}\)/g) ?? []).length).toBe(2);
    expect(plano(rutaContactos)).toContain('.order("id", { ascending: true })');
  });

  it("🔴 CONTROL: el contacto ordena PRIMERO por fecha — el último es el que vale", () => {
    const src = plano(rutaContactos);
    expect(src.indexOf('.order("created_at", { ascending: false })'))
      .toBeLessThan(src.indexOf('.order("id", { ascending: true })'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. UN SOLO ORDEN, y no hay orden por encabezado
// ═════════════════════════════════════════════════════════════════════════════

describe("3 · el orden es uno: el que más tiempo lleva sin comprar", () => {
  const universo: ClienteUniverso[] = armarUniverso(
    [reg(10), reg(20), reg(30)],
    [fac(10, "2026-09-10"), fac(20, "2025-12-06"), fac(30, "2026-07-07")],
    HOY,
  ).clientes;

  it("🔴 el más viejo va PRIMERO", () => {
    expect(ordenarParaSeguimiento(universo).map((c) => c.cliente_switch_id))
      .toEqual([20, 30, 10]);
  });

  it("🔴 empate: desempata por CÓDIGO, que es único — la fila no se mueve sola", () => {
    const empatados = armarUniverso(
      [reg(77), reg(11), reg(44)],
      [fac(77, "2026-06-01"), fac(11, "2026-06-01"), fac(44, "2026-06-01")],
      HOY,
    ).clientes;
    expect(ordenarParaSeguimiento(empatados).map((c) => c.cliente_switch_id))
      .toEqual([11, 44, 77]);
    // Y dos veces seguidas da lo mismo (no depende del orden de entrada).
    const alReves = [...empatados].reverse();
    expect(ordenarParaSeguimiento(alReves).map((c) => c.cliente_switch_id))
      .toEqual([11, 44, 77]);
  });

  it("no muta el arreglo que recibe", () => {
    const antes = universo.map((c) => c.cliente_switch_id);
    ordenarParaSeguimiento(universo);
    expect(universo.map((c) => c.cliente_switch_id)).toEqual(antes);
  });

  it("🔴 NO hay orden por encabezado en la pantalla", () => {
    const src = plano(lista);
    expect(src).not.toMatch(/onClick=\{\(\) => setOrden/);
    expect(src).not.toContain("ordenarPor");
    expect(src).not.toContain("<thead");
    // Un solo `sort`, el del módulo puro; la pantalla no ordena por su cuenta.
    expect(src).not.toMatch(/\.sort\(/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. TRES CHIPS, y el que abre es «No vuelven»
// ═════════════════════════════════════════════════════════════════════════════

describe("4 · los chips", () => {
  it("🔴 son TRES y «Frecuentes» se retiró", () => {
    expect(CHIPS).toEqual(["no_vuelven", "nuevos", "todos"]);
    expect(Object.values(ROTULO_CHIP)).toEqual(["No vuelven", "Nuevos", "Todos"]);
    expect(Object.values(ROTULO_CHIP)).not.toContain("Frecuentes");
  });

  it("🔴 abre en «No vuelven» — Daniel: «lo usaré al principio más a los viejos»", () => {
    expect(CHIP_INICIAL).toBe("no_vuelven");
  });

  it("un valor raro en la URL no rompe la pantalla", () => {
    expect(esChip("no_vuelven")).toBe(true);
    expect(esChip("frecuentes")).toBe(false);
    expect(esChip(undefined)).toBe(false);
    expect(plano(lista)).toContain("esChip(chipUrl) ? chipUrl : CHIP_INICIAL");
  });

  it("🔴 la base son los que YA COMPRARON: el registrado sin compras no entra", () => {
    const { clientes } = armarUniverso(
      [reg(5), reg(6)],
      [fac(5, "2026-01-02")],
      HOY,
    );
    expect(clientes.length).toBe(2);
    expect(baseDeSeguimiento(clientes).map((c) => c.cliente_switch_id)).toEqual([5]);
  });

  it("«No vuelven» son los dormidos: 60+ días sin comprar", () => {
    const { clientes } = armarUniverso(
      [reg(1), reg(2)],
      [fac(1, correrDias(HOY, -61)), fac(2, correrDias(HOY, -59))],
      HOY,
    );
    const base = baseDeSeguimiento(clientes);
    expect(filtrarPorChip(base, "no_vuelven").map((c) => c.cliente_switch_id)).toEqual([1]);
    expect(conteoPorChip(clientes)).toEqual({ no_vuelven: 1, nuevos: 0, todos: 2 });
  });

  // 🔄 CAMBIÓ DE DIRECCIÓN EL 16-sep-2026. Pedía que «Nuevos» usara la misma
  // definición que la tarjeta —registrado este mes—. Daniel lo corrigió al ver
  // los números: *«no existe registrar y no compró»*. En la lista, «Nuevos» es
  // quien COMPRÓ por primera vez este mes; la TARJETA sigue contando los
  // registrados, y por eso los dos números pueden diferir (31 contra 33,
  // medidos ese día). Este bloque exige las DOS cosas, para que nadie los
  // vuelva a igualar sin querer.
  it("🔴 «Nuevos» es quien COMPRÓ por primera vez este mes", () => {
    const { clientes } = armarUniverso(
      [reg(1), reg(2)],
      // El 1 compra por primera vez este mes. El 2 ya compraba desde agosto.
      [fac(1, "2026-09-03"), fac(2, "2026-08-03"), fac(2, "2026-09-04")],
      HOY,
    );
    expect(filtrarPorChip(baseDeSeguimiento(clientes), "nuevos").map((c) => c.cliente_switch_id))
      .toEqual([1]);
  });

  it("🔴 y NO es «lo registraron este mes»: el que se registró y no compró queda afuera", () => {
    const { clientes, cards } = armarUniverso(
      // Registrado este mes, compró por primera vez hace un año.
      [reg(1, { raw_data: { fechaCreacion: "2026-09-02" } }),
       // Registrado el año pasado, compró por primera vez este mes.
       reg(2, { raw_data: { fechaCreacion: "2025-01-02" } }),
       // Registrado este mes y sin comprar nunca: cuenta en la TARJETA y no en la lista.
       reg(3, { raw_data: { fechaCreacion: "2026-09-05" } })],
      [fac(1, "2025-09-03"), fac(2, "2026-09-04")],
      HOY,
    );
    expect(filtrarPorChip(baseDeSeguimiento(clientes), "nuevos").map((c) => c.cliente_switch_id))
      .toEqual([2]);
    // ⚠️ Y la TARJETA sigue contando los registrados: DOS, no uno.
    expect(cards.nuevos_mes).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4-bis. EL REVENDEDOR NO ES UN CLIENTE DE TIENDA
// ═════════════════════════════════════════════════════════════════════════════

describe("4-bis · a Maher no se le hace postventa", () => {
  const conMaher = armarUniverso(
    [reg(47, { nombre: "VENTAS MAHER" }), reg(48, { nombre: "VENTAS MAHER" }),
     reg(49, { nombre: "VENTAS MAHER" }), reg(500, { nombre: "JOISY CAMARENA" })],
    [fac(47, "2026-09-15"), fac(48, "2024-06-05"), fac(49, "2024-06-05"), fac(500, "2025-12-22")],
    HOY,
  ).clientes;

  it("🔴 sale de la lista, con los TRES chips", () => {
    for (const chip of CHIPS) {
      expect(filtrarPorChip(baseDeSeguimiento(conMaher), chip).map((c) => c.cliente_switch_id))
        .not.toContain(47);
    }
    expect(baseDeSeguimiento(conMaher).map((c) => c.cliente_switch_id)).toEqual([500]);
  });

  it("🔴 son SUS TRES CÓDIGOS, no uno: 48 y 49 ni siquiera tienen ficha", () => {
    expect(FUERA_DE_SEGUIMIENTO.map((f) => f.codigo)).toEqual([47, 48, 49]);
    for (const c of [47, 48, 49]) expect(estaFueraDeSeguimiento(c)).toBe(true);
    expect(estaFueraDeSeguimiento(500)).toBe(false);
    expect(estaFueraDeSeguimiento(null)).toBe(false);
  });

  it("🔴 se compara por CÓDIGO, nunca por nombre — una «MAHERLIN» no desaparece", () => {
    const maherlin = armarUniverso(
      [reg(501, { nombre: "MAHERLIN PEREZ" })],
      [fac(501, "2025-12-22")],
      HOY,
    ).clientes;
    expect(baseDeSeguimiento(maherlin).map((c) => c.cliente_switch_id)).toEqual([501]);
    // Y el módulo no tiene una sola comparación de texto.
    const src = plano(leer("src/lib/multifashion/fuera-de-seguimiento.ts"));
    expect(src).not.toMatch(/ILIKE|includes\(|toLowerCase\(|\.test\(/);
  });

  it("🔴 cada código dice POR QUÉ está afuera", () => {
    for (const f of FUERA_DE_SEGUIMIENTO) {
      expect(f.porque.length, `${f.codigo} sin motivo`).toBeGreaterThan(20);
      expect(f.nombre.length).toBeGreaterThan(0);
    }
    expect(FUERA_DE_SEGUIMIENTO[0].porque).toMatch(/[Rr]evendedor/);
  });

  it("⚠️ pero las CUATRO TARJETAS lo siguen contando: son otra pregunta", () => {
    const { cards } = armarUniverso(
      [reg(47, { nombre: "VENTAS MAHER" })],
      [fac(47, correrDias(HOY, -90))],
      HOY,
    );
    // Dormido en la tarjeta, afuera de la lista. Es a propósito.
    expect(cards.dormidos).toBe(1);
    expect(baseDeSeguimiento(armarUniverso(
      [reg(47, { nombre: "VENTAS MAHER" })],
      [fac(47, correrDias(HOY, -90))],
      HOY,
    ).clientes)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. SIN TELÉFONO NO SE DIBUJA EL BOTÓN
// ═════════════════════════════════════════════════════════════════════════════

describe("5 · el botón de WhatsApp", () => {
  it("🔴 sin teléfono, `telefono_wa` es null", () => {
    const { clientes } = armarUniverso(
      [reg(1, { telefono: null, celular: null }), reg(2, { telefono: "6212-0673", celular: null })],
      [fac(1, "2026-01-02"), fac(2, "2026-01-02")],
      HOY,
    );
    expect(clientes.find((c) => c.cliente_switch_id === 1)!.telefono_wa).toBeNull();
    expect(clientes.find((c) => c.cliente_switch_id === 2)!.telefono_wa)
      .toBe("https://wa.me/50762120673");
  });

  it("🔴 y la fila solo lo dibuja si lo hay — nada ocupa su lugar", () => {
    const src = plano(lista);
    expect(src).toContain("{cliente.telefono_wa && (");
    // CONTROL: no quedó un botón apagado ni un «sin tel.» de relleno.
    expect(src).not.toContain("sin tel.");
    expect(src).not.toMatch(/disabled/);
  });

  it("🔴 el WhatsApp va VACÍO: ningún texto sugerido viaja en el enlace", () => {
    // Daniel, textual: «vacío». `waLink` arma `wa.me/<dígitos>` y nada más.
    const src = plano(lista);
    expect(src).toContain("href={cliente.telefono_wa}");
    expect(src).not.toContain("?text=");
    expect(src).not.toContain("&text=");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. EL REGISTRO ES DEL MÓDULO, NO DEL USUARIO
// ═════════════════════════════════════════════════════════════════════════════

describe("6 · «ya le escribieron» es de la tienda entera", () => {
  it("🔴 el último contacto de cada cliente sale sin mirar quién escribió", () => {
    const porCliente = ultimoContactoPorCliente([
      { cliente_switch_id: 7, canal: "whatsapp", created_at: "2026-09-14T10:00:00Z" },
      { cliente_switch_id: 7, canal: "whatsapp", created_at: "2026-09-01T10:00:00Z" },
      { cliente_switch_id: 9, canal: "whatsapp", created_at: "2026-09-04T10:00:00Z" },
    ]);
    expect(porCliente[7]).toEqual({ canal: "whatsapp", fecha: "2026-09-14" });
    expect(porCliente[9]).toEqual({ canal: "whatsapp", fecha: "2026-09-04" });
  });

  it("🔴 la función NO recibe ningún usuario: no lo podría filtrar aunque quisiera", () => {
    expect(ultimoContactoPorCliente.length).toBe(1);
  });

  it("🔴 el GET no lee ni filtra `contactado_por`", () => {
    const src = plano(rutaContactos);
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
    expect(get).not.toContain("contactado_por");
    expect(get).not.toContain("userName");
    expect(get).not.toMatch(/\.eq\(\s*["']contactado_por["']/);
  });

  it("🔴 pero el POST SÍ lo guarda: un registro sin firma no sirve", () => {
    const src = plano(rutaContactos);
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post).toContain("contactado_por: auth.userName");
  });

  it("🔴 la identidad es el CÓDIGO, nunca el nombre", () => {
    const src = plano(rutaContactos);
    expect(src).toContain("cliente_switch_id");
    expect(src).not.toContain("cliente_nombre");
    expect(src).not.toContain("nombre_norm");
  });

  it("un canal fuera de la lista se rechaza", () => {
    expect(CANALES_CONTACTO).toEqual(["whatsapp"]);
    expect(esCanalContacto("whatsapp")).toBe(true);
    expect(esCanalContacto("correo")).toBe(false);
    expect(esCanalContacto(null)).toBe(false);
  });

  it("una fila con canal inválido o sin código se ignora, no rompe la pantalla", () => {
    const porCliente = ultimoContactoPorCliente([
      { cliente_switch_id: null, canal: "whatsapp", created_at: "2026-09-14T10:00:00Z" },
      { cliente_switch_id: 3, canal: "paloma", created_at: "2026-09-14T10:00:00Z" },
    ]);
    expect(porCliente).toEqual({});
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. LA FILA: cuatro cosas, y las palabras exactas
// ═════════════════════════════════════════════════════════════════════════════

describe("7 · el renglón", () => {
  it("«283 días sin comprar · le escribieron hace 3 días»", () => {
    expect(lineaDelRenglon({ dias_sin_comprar: 283 }, { canal: "whatsapp", fecha: "2026-09-13" }, HOY))
      .toEqual({ dias: "283 días sin comprar", contacto: "le escribieron hace 3 días" });
  });

  it("sin contacto, la mitad gris no se dibuja", () => {
    expect(lineaDelRenglon({ dias_sin_comprar: 70 }, null, HOY))
      .toEqual({ dias: "70 días sin comprar", contacto: null });
  });

  it("hoy y ayer se dicen con palabras, no con «hace 0 días»", () => {
    expect(textoUltimoContacto(0)).toBe("le escribieron hoy");
    expect(textoUltimoContacto(1)).toBe("le escribieron ayer");
    expect(textoUltimoContacto(null)).toBeNull();
  });

  it("singular y plural del día", () => {
    expect(lineaDelRenglon({ dias_sin_comprar: 1 }, null, HOY).dias).toBe("1 día sin comprar");
    expect(lineaDelRenglon({ dias_sin_comprar: 0 }, null, HOY).dias).toBe("compró hoy");
  });

  it("🔴 el contacto NO caduca: a los 12 días se sigue diciendo", () => {
    // En el CXC la marca dura 7 días porque ahí la pregunta es «¿ya le cobré
    // esta semana?». Acá es «¿alguien ya intentó recuperarlo?», y eso no vence:
    // el mockup que Daniel aprobó muestra «le escribieron hace 12 días».
    expect(textoUltimoContacto(12)).toBe("le escribieron hace 12 días");
    expect(textoUltimoContacto(400)).toBe("le escribieron hace 400 días");
  });

  it("los días se cuentan entre dos fechas, sin inventar husos", () => {
    expect(diasDesdeContacto("2026-09-01", HOY)).toBe(15);
    expect(diasEntre("2026-09-01", HOY)).toBe(15);
    expect(diasDesdeContacto(null, HOY)).toBeNull();
  });

  it("🔴 UNA sola fila: no hay diseño doble de tabla y tarjetas", () => {
    const src = plano(lista);
    expect(src).not.toContain('data-vista="tabla"');
    expect(src).not.toContain('data-vista="tarjetas"');
    expect(src).not.toContain("lg:hidden");
    expect(src).not.toContain("lg:block");
  });

  it("tocar el nombre abre su ficha: cuánto compró, cuántas veces y la fecha", () => {
    const src = plano(lista);
    expect(src).toContain('rotulo="Compró"');
    expect(src).toContain('rotulo="Veces"');
    expect(src).toContain('rotulo="Última compra"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. EL MONTO — la misma cuenta de la RPC, cambiándole la llave
// ═════════════════════════════════════════════════════════════════════════════

describe("8 · «cuánto compró»", () => {
  it("🔴 la nota de crédito RESTA y la de débito suma", () => {
    expect(subtotalFirmado(fac(1, "2026-01-02", { tipo_comprobante: "Factura", subtotal_descuento: 50 }))).toBe(50);
    expect(subtotalFirmado(fac(1, "2026-01-02", { tipo_comprobante: "Nota de Crédito", subtotal_descuento: 50 }))).toBe(-50);
    expect(subtotalFirmado(fac(1, "2026-01-02", { tipo_comprobante: "Nota de Débito", subtotal_descuento: 50 }))).toBe(50);
    expect(subtotalFirmado(fac(1, "2026-01-02", { tipo_comprobante: "Cotización", subtotal_descuento: 50 }))).toBe(0);
  });

  it("🔴 compró y devolvió todo: queda en 0 y se muestra igual", () => {
    // Es el caso real del código 453 («CARLOS LARA»), medido el 16-sep-2026.
    const { clientes } = armarUniverso(
      [reg(453)],
      [
        fac(453, "2025-12-05", { subtotal_descuento: 49.9 }),
        fac(453, "2025-12-27", { tipo_comprobante: "Nota de Crédito", subtotal_descuento: 49.9 }),
      ],
      HOY,
    );
    expect(clientes[0].total_comprado).toBe(0);
  });

  it("🔴 el mayoreo NO entra al monto — es la misma base que el ranking", () => {
    const { clientes } = armarUniverso(
      [reg(1)],
      [
        fac(1, "2026-01-02", { subtotal_descuento: 100, is_wholesale: false }),
        fac(1, "2026-01-03", { subtotal_descuento: 900, is_wholesale: true }),
      ],
      HOY,
    );
    expect(clientes[0].total_comprado).toBe(100);
  });

  it("🔴 las VISITAS solo cuentan «Factura» — una nota de crédito no es una visita", () => {
    // Tocar esto MUEVE las cuatro tarjetas de arriba, que el encargo no toca.
    const { clientes } = armarUniverso(
      [reg(1)],
      [
        fac(1, "2026-09-01"),
        fac(1, "2026-09-02", { tipo_comprobante: "Nota de Crédito" }),
      ],
      HOY,
    );
    expect(clientes[0].visitas).toBe(1);
    expect(clientes[0].tickets).toBe(1);
    expect(clientes[0].ultima_compra).toBe("2026-09-01");
  });

  it("dos facturas el MISMO día son UNA visita pero DOS tickets", () => {
    const { clientes } = armarUniverso(
      [reg(1)],
      [fac(1, "2026-09-01"), fac(1, "2026-09-01")],
      HOY,
    );
    expect(clientes[0].visitas).toBe(1);
    expect(clientes[0].tickets).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. LA MIGRACIÓN — escrita, sin correr, y tolerante mientras no corra
// ═════════════════════════════════════════════════════════════════════════════

describe("9 · `multifashion_contactos`", () => {
  const sql = existsSync(path.join(raiz, MIGRACION)) ? leer(MIGRACION) : "";
  /** El SQL sin sus comentarios `--`: la explicación NOMBRA lo que prohíbe. */
  const ddl = sql.replace(/^\s*--.*$/gm, "");

  it("la migración existe", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("🔴 la llave del cliente es el CÓDIGO, y no hay ninguna columna de nombre", () => {
    expect(sql).toContain("cliente_switch_id integer NOT NULL");
    expect(ddl).not.toMatch(/\bcliente_nombre\b/);
    expect(ddl).not.toMatch(/\bnombre_norm\b/);
  });

  it("⚠️ NO lleva `empresa_key`: Multifashion ES `american_classic`, una constante", () => {
    // Una columna de empresa invita a que algún día llegue por la URL, que es
    // justo lo que el candado de acceso del módulo prohíbe.
    expect(ddl).not.toMatch(/empresa_key/);
  });

  it("el canal es una lista cerrada, con CHECK", () => {
    expect(sql).toContain("CHECK (canal IN ('whatsapp'))");
  });

  it("tiene índice por cliente y fecha, y RLS de service_role", () => {
    expect(sql).toContain("multifashion_contactos_cliente_fecha_idx");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY service_role_all");
  });

  it("🔴 deja escrito, en la base, que el registro es del MÓDULO", () => {
    expect(sql).toContain("COMMENT ON COLUMN multifashion_contactos.contactado_por");
    expect(sql).toMatch(/NINGUNA lectura filtra/);
  });

  it("🔴 FALLA ABIERTA mientras la DDL no corra: el botón sigue abriendo", () => {
    const src = plano(rutaContactos);
    expect(src).toContain("function faltaLaTabla");
    // El GET devuelve el mapa vacío en vez de tumbar la pantalla.
    expect(src).toContain("porCliente: {} }");
    // Y el POST no le muestra un error a quien ya mandó el mensaje.
    expect(src).toContain("sinTabla: true");
  });

  it("y la pantalla revierte la marca si el servidor no pudo anotarla", () => {
    expect(plano(lista)).toContain("cuerpo?.sinTabla");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. LO QUE NO SE TOCÓ
// ═════════════════════════════════════════════════════════════════════════════

describe("10 · lo que el encargo dice NO tocar", () => {
  it("🔴 las CUATRO tarjetas siguen ahí, con sus mismos rótulos", () => {
    for (const r of ["Frecuentes", "Nuevos del mes", "Dormidos", "5% pendiente"]) {
      expect(pestana).toContain(`label="${r}"`);
    }
  });

  it("🔴 y la cuenta de las tarjetas no cambió: `cards` sigue saliendo del universo", () => {
    const { cards } = armarUniverso(
      [
        reg(1, { raw_data: { fechaCreacion: "2026-09-01" } }),
        reg(2),
        reg(3),
      ],
      [
        fac(1, correrDias(HOY, -3)), fac(1, correrDias(HOY, -2)),
        fac(2, correrDias(HOY, -90)),
      ],
      HOY,
    );
    expect(cards).toEqual({ frecuentes: 1, nuevos_mes: 1, dormidos: 1, cinco_pendiente: 2 });
  });

  it("🔴 la línea de cobertura y el bucket anónimo siguen en la pestaña", () => {
    expect(pestana).toContain("Mostrador anónimo va aparte");
    expect(pestana).toContain("Anónimos (mostrador)");
  });

  it("🔴 Mayoreo conserva su tabla ancha y sus tarjetas", () => {
    expect(pestana).toContain('title="Mayoreo"');
    expect(pestana).toContain('data-vista="tabla"');
    expect(pestana).toContain('data-vista="tarjetas"');
  });

  it("🔴 los permisos no se tocaron: la ruta nueva usa la lista del módulo", () => {
    expect(plano(rutaContactos)).toContain("requireRole(req, ROLES_MULTIFASHION)");
    expect(plano(rutaContactos)).not.toMatch(/"gerente_acs"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guías › Pedidos — TRES estados y el detalle con BULTOS (6-oct-2026)
//
// 🔴 Decisiones de Daniel, 6-oct-2026. Reemplazan las del 5-oct-2026, que
// quedan apagadas detrás de `PEDIDOS_BULTOS_2026_10` (`false` = la pantalla de
// hoy, con sus dos estados, intacta).
//
//   1. Los pedidos SIEMPRE nacen en Switch. Aquí no se crea ninguno.
//   2. Quién ve qué, POR EMPRESA y nunca por vendedor (`EMPRESAS_POR_PERSONA`).
//      El recorte es DURO, como el de Boston: si piden otra empresa, no la ven,
//      y lo decide el SERVIDOR.
//   3. Los estados pasan de dos a TRES, con NOMBRES DE ERP (`docs/nombres-erp.md`):
//        Pendiente → **Preparado** (lo marca bodega o la secretaria)
//                  → **Verificado** (lo marca la secretaria) → y de ahí a Etiquetas.
//      🔴 Daniel CAMBIA A PROPÓSITO su decisión del 5-oct-2026 («SOLO 2
//      estados»): «no se puede confiar solo en bodega».
//      🔑 «Preparado» ya era el nombre aprobado el 5-oct y NO se toca —ni en la
//      pantalla ni en la base—. «Verificado» es el término de ERP para la
//      segunda revisión: ni «Recibido» ni «Terminado», que eran nombres míos.
//      🔴 LA MISMA PERSONA NO HACE LOS DOS PASOS, ni siquiera admin: si la
//      secretaria lo preparó, otra persona lo verifica. Siempre dos ojos.
//      «Verificado» es por pedido COMPLETO: ahí ya está listo para imprimir
//      etiqueta y facturar.
//   4. El detalle del pedido se ve como el PDF de pedido de Switch, SIN la
//      columna «Código barra»: Código · Referencia · Descripción · Cantidad ·
//      Precio · Total · Bulto. Bodega selecciona varias líneas con casillas y
//      toca «Poner en bulto…», escribe el número y esas líneas quedan ahí.
//   5. Imprimir: un papel ordenado por bulto, con el estilo de papel de la casa.
//   6. Al marcar «Verificado» se crea el envío de Etiquetas ya puesto.
//
// 🔑 LO MEDIDO (6-oct-2026): un envío real tuvo **416 bultos y 56 líneas**, así
// que nada de esta pantalla puede ser O(bultos × líneas) ni pedir una lista de
// 416 opciones: el bulto se ESCRIBE, no se elige de un desplegable.
//
// 🔑 SWITCH NO MANDA TALLA NI COLOR SEPARADOS: van dentro de `descripcion` y
// así se muestran. No se parten ni se adivinan.
//
// ⚠️ «Referencia» NO LA MANDA EL API — MEDIDO CONTRA SWITCH, no leído en la doc
// (6-oct-2026, `scripts/_diag-pedido-referencia.ts`, Vistana, pedido 16-000002362).
// La línea REAL trae MÁS campos que los documentados —`id · codigoBarraId ·
// codigobarra · articuloId · codigoArticulo · imagen · cantidad · precio ·
// descuento · descuentoGlobal · descuentoTotal · impuestoTotal ·
// subTotalConDescuento · total · vendedorId · articuloImpuesto ·
// articuloImpuestoCodigo · descripcion · detalle · tipoArticulo ·
// descuentoLineaTotal · estatusLote · talla · color`— y entre TODOS ellos no hay
// ninguno que sea la referencia. Tampoco está en la cabecera.
// 🔴 Así que NO SE INVENTA: la columna se muestra vacía («—») hasta que Daniel
// diga de dónde sale. 🩸 El primer borrador la derivaba con `modeloDe` (quitar 3
// caracteres), y el PDF de Switch prueba que eso está MAL: ahí la referencia es
// más LARGA que el código (`4RG822G200` → `4RG822G200-HMT`), no más corta.
//
// 🔑 Y DOS COSAS QUE SÍ MANDA Y NO SABÍAMOS:
//   · `talla` y `color` vienen SEPARADOS (en Vistana llegan como «-», pero los
//     campos existen). La `descripcion` es la CATEGORÍA («Men-Trunk»), no un
//     nombre comercial — igual que en el PDF de Switch.
//   · `total` por línea viene CALCULADO por Switch, con sus descuentos. No se
//     recalcula: la regla de la casa es que los números de Switch no se tocan.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/**
 * 🔴 PRENDIDO el 6-oct-2026 con el «sí» de Daniel, después de ver las capturas
 * y el papel con el pie de Switch. Las dos migraciones (`20261231120000` y
 * `20261231130000`) quedaron aplicadas antes de prenderlo.
 *
 * `false` devuelve la pantalla de antes: dos estados (Pendiente/Preparado), sin
 * detalle, sin bultos, sin enlace a Etiquetas. Es la vuelta atrás, y sigue
 * funcionando porque los lectores de la lista toleran que falten las columnas.
 */
export const PEDIDOS_BULTOS_EN_CODIGO = true;

/**
 * El mismo escape que `PAPELES_ESTILO_UNICO`: se puede prender en LOCAL con
 * `NEXT_PUBLIC_PEDIDOS_BULTOS=1` para sacar las capturas del «después» sin
 * tocar el código ni publicar nada. 🔴 En producción manda la constante de
 * arriba: la variable no existe en Vercel.
 */
export const PEDIDOS_BULTOS_2026_10: boolean =
  PEDIDOS_BULTOS_EN_CODIGO ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PEDIDOS_BULTOS === "1");

// ─── 2 · Quién ve qué, POR EMPRESA ───────────────────────────────────────────

/**
 * Las empresas de Pedidos que ve cada PERSONA, por su nombre de usuario.
 * Lista ESCRITA A MANO, como `empresa-fiscal.ts` y `DESPACHADORES_BASE`: no se
 * deriva del rol ni del vendedor de Switch (Daniel, 6-oct-2026: «por empresa,
 * no por vendedor»).
 *
 * 🔴 Quien NO está en esta lista ve las 6, como hoy (falla ABIERTA): el recorte
 * es para las personas que Daniel nombró, no un permiso nuevo para todos.
 * Admin pasa siempre, como en todo el sistema.
 */
// ⚠️ Solo gente de BODEGA. La secretaria NO entra: ve las 6 (Daniel, 6-oct-2026).
export const EMPRESAS_POR_PERSONA: Readonly<Record<string, readonly string[]>> = {
  julio: ["fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"],
  rodrigo: ["vistana"],
  jorman: ["vistana"],
};

/** Las empresas que esta persona puede ver. Admin y los no listados, las 6. */
export function empresasQueVe(userName: string | null | undefined, role: string | null | undefined): readonly string[] {
  if (role === "admin") return B2B_EMPRESA_KEYS;
  const recorte = EMPRESAS_POR_PERSONA[(userName ?? "").trim().toLowerCase()];
  return recorte ?? B2B_EMPRESA_KEYS;
}

/** ¿Puede esta persona tocar un pedido de esa empresa? Lo decide el SERVIDOR. */
export function veLaEmpresa(
  empresaKey: string,
  userName: string | null | undefined,
  role: string | null | undefined,
): boolean {
  return empresasQueVe(userName, role).includes(empresaKey);
}

// ─── 3 · Los TRES estados ────────────────────────────────────────────────────

export const ESTADOS_BULTOS = ["pendiente", "preparado", "verificado"] as const;
export type EstadoBultos = (typeof ESTADOS_BULTOS)[number];

export const ROTULO_ESTADO_BULTOS: Record<EstadoBultos, string> = {
  pendiente: "Pendiente",
  preparado: "Preparado",
  verificado: "Verificado",
};

export function esEstadoBultos(v: unknown): v is EstadoBultos {
  return typeof v === "string" && (ESTADOS_BULTOS as readonly string[]).includes(v);
}

/**
 * 🔑 NO HACE FALTA RENOMBRAR NADA EN LA BASE: lo guardado hoy es
 * `pendiente` | `preparado`, y los dos siguen siendo estados válidos. El estado
 * nuevo solo AGREGA `verificado`. Un valor desconocido cae a «pendiente», que
 * es lo que significa no tener fila.
 */
export function estadoLeido(v: unknown): EstadoBultos {
  return esEstadoBultos(v) ? v : "pendiente";
}

/** El siguiente paso del flujo; `verificado` ya es el final. */
export function siguienteEstado(e: EstadoBultos): EstadoBultos | null {
  return e === "pendiente" ? "preparado" : e === "preparado" ? "verificado" : null;
}

/** El paso de atrás, para deshacer un toque. `pendiente` no tiene atrás. */
export function estadoAnterior(e: EstadoBultos): EstadoBultos | null {
  return e === "verificado" ? "preparado" : e === "preparado" ? "pendiente" : null;
}

/**
 * 🔴 «Preparado» lo marca BODEGA —en sus empresas— O LA SECRETARIA
 * (Daniel, 6-oct-2026). ⚠️ `vendedor` queda afuera: no es bodega ni secretaría.
 */
export const ROLES_PREPARADO: readonly string[] = ["admin", "secretaria", "bodega"];

/**
 * 🔴 «Verificado» lo marca SOLO LA SECRETARIA (y admin), nunca bodega: «no se
 * puede confiar solo en bodega» (Daniel, 6-oct-2026).
 */
export const ROLES_VERIFICADO: readonly string[] = ["admin", "secretaria"];

/**
 * 🔴 QUIÉN VE LA PLATA DEL PEDIDO (Daniel, 6-oct-2026): «bodega NO ve Precio ni
 * Total, ni en la lista ni en el detalle; la secretaria y admin SÍ». 🔑 Lo
 * decide el SERVIDOR: a bodega NO se le mandan esos números, no se le esconden
 * columnas en el navegador — escondidas seguirían viajando y se leen en dos
 * toques. El papel es la ÚNICA excepción, y por eso se dibuja en el servidor.
 */
export const ROLES_VEN_PRECIO: readonly string[] = ["admin", "secretaria"];

export function veLaPlata(role: string | null | undefined): boolean {
  return !!role && ROLES_VEN_PRECIO.includes(role);
}

export function rolesDelEstado(destino: EstadoBultos): readonly string[] {
  return destino === "verificado" ? ROLES_VERIFICADO : ROLES_PREPARADO;
}

export interface QuienMarca {
  role: string | null | undefined;
  userName: string | null | undefined;
}

export type Veredicto = { ok: true } | { ok: false; error: string };

/**
 * ¿Puede esta persona mover ESTE pedido a ESE estado? Una sola función, que
 * leen la pantalla y el servidor.
 *
 * Reglas, todas del 6-oct-2026:
 *   1. Solo se avanza o se retrocede UN paso (sin saltarse Preparado).
 *   2. El rol tiene que estar en la lista del estado DESTINO: «Preparado» lo
 *      marcan bodega y la secretaria; «Verificado», SOLO la secretaria.
 *   3. 🔴 NADIE HACE LOS DOS PASOS DEL MISMO PEDIDO, NI SIQUIERA ADMIN
 *      (Daniel, 6-oct-2026). Quien lo marcó Preparado no puede verificarlo:
 *      tiene que ser otra persona. Es el control que hace que el segundo par de
 *      ojos sirva de algo — y vale también si lo preparó la secretaria.
 *   4. Y la empresa del pedido tiene que ser una de las suyas.
 */
export function puedeMover(
  args: {
    desde: EstadoBultos;
    hasta: EstadoBultos;
    empresa_key: string;
    /** Quién dejó el pedido en «Preparado», si alguien lo hizo. */
    preparado_por: string | null;
  },
  quien: QuienMarca,
): Veredicto {
  const { desde, hasta, empresa_key, preparado_por } = args;
  if (desde === hasta) return { ok: false, error: "El pedido ya está así" };
  if (siguienteEstado(desde) !== hasta && estadoAnterior(desde) !== hasta) {
    return { ok: false, error: "Ese pedido tiene que pasar primero por Preparado" };
  }
  if (!veLaEmpresa(empresa_key, quien.userName, quien.role)) {
    return { ok: false, error: "Ese pedido no es de una de tus empresas" };
  }
  if (!quien.role || !rolesDelEstado(hasta).includes(quien.role)) {
    return {
      ok: false,
      error: hasta === "verificado" ? "«Verificado» lo marca la secretaria" : "No puedes marcar pedidos",
    };
  }
  // 🔴 Ni siquiera admin: el segundo par de ojos tiene que ser de otra persona.
  if (hasta === "verificado" && mismaPersona(preparado_por, quien.userName)) {
    return { ok: false, error: "«Verificado» lo marca otra persona, no quien lo preparó" };
  }
  return { ok: true };
}

/** Igualdad EXACTA normalizada (minúsculas y espacios), nunca por parecido. */
export function mismaPersona(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const x = n(a);
  return !!x && x === n(b);
}

// ─── 4 · El detalle con bultos ───────────────────────────────────────────────

/** Una línea del pedido, como la deja `/apipedido/info` en `pedidos_lineas`. */
export interface LineaPedido {
  /** `codigoBarraId` de Switch: la identidad de la línea dentro del pedido. */
  codigo_barra_id: number;
  codigo: string;
  /** La CATEGORÍA que manda Switch («Men-T-Shirts S/S»), no un nombre comercial. */
  descripcion: string;
  /** Vienen SEPARADAS del API; Switch manda «-» cuando la empresa no las usa. */
  talla: string | null;
  color: string | null;
  cantidad: number;
  /**
   * 🔴 LA PLATA DEPENDE DE QUIÉN MIRA (Daniel, 6-oct-2026): a BODEGA no le
   * viajan ni el precio ni el total —`null`, decidido en el SERVIDOR, no
   * escondiendo columnas en el navegador—. La secretaria y admin sí los reciben.
   * 🔑 El papel SIEMPRE los lleva, lo imprima quien lo imprima: por eso se dibuja
   * en el SERVIDOR (`/api/guias/pedidos/detalle/papel`).
   */
  precio: number | null;
  /** 🔑 El total de la línea lo CALCULA Switch, con sus descuentos. No se recalcula. */
  total: number | null;
  /** El bulto donde quedó, o `null` si todavía no se asignó. */
  bulto: number | null;
}

/** «-» y «» son el «no tengo dato» de Switch: no se dibujan. */
export function dato(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return !t || t === "-" ? null : t;
}

/** «Men-T-Shirts S/S · M · Azul» — lo que se lee en pantalla y en el papel. */
export function descripcionCompleta(l: Pick<LineaPedido, "descripcion" | "talla" | "color">): string {
  return [l.descripcion, dato(l.talla), dato(l.color)].filter(Boolean).join(" · ");
}

/** Las columnas de la pantalla y del papel, en el orden del PDF de Switch. */
/**
 * 🔴 EL BULTO VA PRIMERO (Daniel, 6-oct-2026, al aprobar): «es lo que bodega
 * llena, así que manda». El resto conserva el orden del papel de Switch.
 */
export const COLUMNAS_DETALLE = [
  "Bulto",
  "Código",
  "Descripción",
  "Cantidad",
  "Precio",
  "Total",
] as const;

/** Las que ve quien NO puede ver plata: las mismas, sin Precio ni Total. */
export const COLUMNAS_DETALLE_SIN_PLATA = COLUMNAS_DETALLE.filter(
  (c) => c !== "Precio" && c !== "Total",
);

/**
 * 🔴 EL PIE DEL PAPEL VA COMO EL DE SWITCH (medido en el PDF real que mandó
 * Daniel, `PEDIDO CITY MALL PASOCANOAS REEBOK.pdf`, última página):
 *
 *     Subtotal:   43,620.00
 *      ITBMS:      3,053.40
 *        Total:   46,673.40
 *
 *     Cantidad de artículos: 984.00
 *
 * 🔑 Los tres montos los MANDA Switch (`/apipedido/lista`: `subTotal`,
 * `impuesto`, `total`) y se guardan tal cual: **no se recalculan ni se derivan
 * uno del otro**. Si el sync todavía no pasó llegan en `null`, y entonces el
 * papel calla ese renglón en vez de inventar un cero —un ITBMS inventado es un
 * número fiscal falso—. Las unidades sí se suman de las líneas: ésas las
 * tenemos completas.
 */
export interface PieDelPedido {
  /** De Switch. `null` = todavía no se sabe. */
  subtotal: number | null;
  /** El ITBMS de Switch. `null` = todavía no se sabe; NUNCA un cero inventado. */
  impuesto: number | null;
  total: number | null;
  /** Sumadas de las líneas, que sí están completas. */
  unidades: number;
}

export function totalesDelPedido(
  lineas: readonly Pick<LineaPedido, "cantidad" | "total">[],
  deSwitch?: { subtotal?: number | null; impuesto?: number | null; total?: number | null },
): PieDelPedido {
  const unidades = Math.round(lineas.reduce((a, l) => a + l.cantidad, 0) * 100) / 100;
  const conDinero = lineas.filter((l) => l.total != null);
  // El total cae a la suma de las líneas solo si Switch no lo mandó.
  const sumado = conDinero.length === 0 ? null : Math.round(conDinero.reduce((a, l) => a + (l.total ?? 0), 0) * 100) / 100;
  return {
    subtotal: deSwitch?.subtotal ?? null,
    impuesto: deSwitch?.impuesto ?? null,
    total: deSwitch?.total ?? sumado,
    unidades,
  };
}

/** Los renglones del pie, en el ORDEN de Switch; sin dato, el renglón no sale. */
export function renglonesDelPie(p: PieDelPedido): { rotulo: string; monto: number }[] {
  return [
    { rotulo: "Subtotal:", monto: p.subtotal },
    { rotulo: "ITBMS:", monto: p.impuesto },
    { rotulo: "Total:", monto: p.total },
  ].filter((r): r is { rotulo: string; monto: number } => r.monto != null);
}

export const MIN_BULTO = 1;
/** Un envío real tuvo 416 bultos; el tope deja aire y atrapa un dedazo. */
export const MAX_BULTO = 9999;

/** El número que se escribió en «Poner en bulto…». Entero de 1 a 9999. */
export function validarBulto(v: unknown): Veredicto & { valor?: number } {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isInteger(n) || n < MIN_BULTO || n > MAX_BULTO) {
    return { ok: false, error: `Escribe el número del bulto, de ${MIN_BULTO} a ${MAX_BULTO}` };
  }
  return { ok: true, valor: n };
}

/**
 * «18 de 24 artículos asignados · 6 bultos» — la línea de arriba del detalle.
 * Cuenta LÍNEAS (cada línea es un artículo), no piezas.
 */
export function resumenAsignacion(lineas: readonly Pick<LineaPedido, "bulto">[]): string {
  const total = lineas.length;
  const puestas = lineas.filter((l) => l.bulto != null).length;
  const bultos = new Set(lineas.map((l) => l.bulto).filter((b): b is number => b != null)).size;
  const art = `${puestas} de ${total} ${total === 1 ? "artículo" : "artículos"} ${puestas === 1 ? "asignado" : "asignados"}`;
  return `${art} · ${bultos} ${bultos === 1 ? "bulto" : "bultos"}`;
}

/** ¿Está el pedido entero en algún bulto? Es lo que habilita «Verificado». */
export function todoAsignado(lineas: readonly Pick<LineaPedido, "bulto">[]): boolean {
  return lineas.length > 0 && lineas.every((l) => l.bulto != null);
}

/** Cuántos bultos distintos tiene el pedido: los `cajas` del envío de Etiquetas. */
export function cuantosBultos(lineas: readonly Pick<LineaPedido, "bulto">[]): number {
  return new Set(lineas.map((l) => l.bulto).filter((b): b is number => b != null)).size;
}

export interface BultoDelPapel {
  bulto: number;
  lineas: LineaPedido[];
}

/**
 * Los bultos para el papel: del 1 al último, cada uno con sus líneas en el
 * orden del pedido. Lo que todavía no tiene bulto queda FUERA y se dice en el
 * papel: una hoja no puede callar que falta mercancía.
 *
 * O(n log n) sobre las líneas, nunca sobre los bultos (416 medidos).
 */
export function bultosDelPapel(lineas: readonly LineaPedido[]): BultoDelPapel[] {
  const porBulto = new Map<number, LineaPedido[]>();
  for (const l of lineas) {
    if (l.bulto == null) continue;
    const g = porBulto.get(l.bulto);
    if (g) g.push(l);
    else porBulto.set(l.bulto, [l]);
  }
  return [...porBulto.entries()].sort((a, b) => a[0] - b[0]).map(([bulto, ls]) => ({ bulto, lineas: ls }));
}

/** Las líneas que todavía no están en ningún bulto, en el orden del pedido. */
export function sinBulto(lineas: readonly LineaPedido[]): LineaPedido[] {
  return lineas.filter((l) => l.bulto == null);
}

/**
 * «Pedido 2732 · Fashion Wear · D-25 OUTLET DAVID» — el título del papel de
 * bultos. La fecha de impresión la pone la cabecera del papel de la casa.
 */
export function tituloPapelBultos(secuencial: string, empresa: string, cliente: string): string {
  return `Pedido ${secuencial} · ${empresa} · ${cliente}`;
}

// ─── 1 · Quién marcó cada paso, y cuándo ─────────────────────────────────────
//
// 🔴 Daniel, 6-oct-2026: «guarda y muestra quién y cuándo marcó cada paso», en
// la pantalla y en el papel. Por eso cada paso tiene SU firma en la base
// (`preparado_por/_en` · `verificado_por/_en`): con una sola columna
// `cambiado_por` el segundo toque borraba el primero y no quedaba rastro de
// quién lo preparó — que es justo el dato del que depende la regla de los dos
// pares de ojos.

/** Las dos firmas de un pedido, como vienen de `pedidos_bodega_estado`. */
export interface FirmasPedido {
  preparado_por: string | null;
  preparado_en: string | null;
  verificado_por: string | null;
  verificado_en: string | null;
}

/** «10:42 a. m.», hora de Panamá. */
export function horaPanama(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit" })
    .replace(/\s+/g, " ");
}

/**
 * «Preparado por Julio · 10:42 a. m.» — la línea que se lee en la pantalla y en
 * el papel. `null` cuando ese paso todavía no ocurrió: no se inventa una firma.
 */
export function firmaDelPaso(
  paso: "preparado" | "verificado",
  por: string | null,
  en: string | null,
): string | null {
  const quien = (por ?? "").trim();
  if (!quien || !en) return null;
  return `${ROTULO_ESTADO_BULTOS[paso]} por ${quien} · ${horaPanama(en)}`;
}

/**
 * Lo que va en la columna «Preparado por» / «Verificado por» de la lista:
 * «Julio · 10:42 a. m.». El rótulo lo pone el encabezado, así que acá no se
 * repite. `null` = ese paso todavía no ocurrió.
 */
export function firmaEnColumna(por: string | null | undefined, en: string | null | undefined): string | null {
  const quien = (por ?? "").trim();
  return quien && en ? `${quien} · ${horaPanama(en)}` : null;
}

/**
 * 🔴 UNA SOLA COLUMNA DE FIRMA (Daniel, 6-oct-2026: *«Verificado por ocupa
 * mucho… que no se coma el ancho de la descripción»*). Se muestra el ÚLTIMO
 * paso dado —«Verificado · Angela · 4:15 p. m.»— porque es el que contesta la
 * pregunta de la lista: ¿en qué va este pedido? El paso anterior sigue
 * disponible al tocar (`tituloDeFirmas`), así que no se pierde nada.
 *
 * `null` = nadie marcó nada todavía.
 */
export function ultimaFirma(f: FirmasPedido): string | null {
  const [, ultimo] = [firmaDelPaso("preparado", f.preparado_por, f.preparado_en), firmaDelPaso("verificado", f.verificado_por, f.verificado_en)];
  const compacta = (paso: "preparado" | "verificado", por: string | null, en: string | null) => {
    const t = firmaEnColumna(por, en);
    return t ? `${ROTULO_ESTADO_BULTOS[paso]} · ${t}` : null;
  };
  return (
    (ultimo && compacta("verificado", f.verificado_por, f.verificado_en)) ||
    compacta("preparado", f.preparado_por, f.preparado_en)
  );
}

/** Las dos firmas para el `title`: lo que no entra en la columna, al tocar. */
export function tituloDeFirmas(f: FirmasPedido): string | undefined {
  const t = firmasEnOrden(f);
  return t.length ? t.join("\n") : undefined;
}

/** Las firmas que haya, de arriba abajo. Vacío = nadie marcó nada todavía. */
export function firmasEnOrden(f: FirmasPedido): string[] {
  return [
    firmaDelPaso("preparado", f.preparado_por, f.preparado_en),
    firmaDelPaso("verificado", f.verificado_por, f.verificado_en),
  ].filter((t): t is string => !!t);
}

// ─── 6 · El envío de Etiquetas que nace al marcar «Verificado» ──────────────

/** 15 letras es el tope de la nota de una etiqueta (`MAX_NOTA`). */
export const MAX_NOTA_ETIQUETA = 15;

/**
 * La nota del traslado que se crea en Etiquetas: «PEDIDO 2732», recortada al
 * tope. Un pedido no tiene factura todavía (Activo = falta facturar), así que
 * el envío entra por el camino de TRASLADO, que sí acepta un pedido sin factura.
 */
export function notaDelPedido(secuencial: string): string {
  return `PEDIDO ${String(secuencial ?? "").trim()}`.toUpperCase().slice(0, MAX_NOTA_ETIQUETA).trim();
}

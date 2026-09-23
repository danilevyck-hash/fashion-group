// ─────────────────────────────────────────────────────────────────────────────
// EL UNIVERSO DE CLIENTES DE MULTIFASHION — módulo PURO (ni Supabase ni red).
//
// Quién es cliente de la tienda, cuántas veces vino, cuándo fue la última y en
// qué segmento cae. Es la MISMA cuenta que hacía `/api/multifashion/
// fidelizacion` escrita adentro de su handler; se sacó a un módulo propio el
// 16-sep-2026 para que la pestaña Clientes (seguimiento y postventa) lea el
// mismo universo y no nazca una SEGUNDA definición de «cliente identificado».
//
// 🔴 LA IDENTIDAD ES EL CÓDIGO DE SWITCH (`cliente_switch_id`), NUNCA EL
// NOMBRE. `nombre_norm` se conserva porque la pantalla de hoy todavía parea el
// ranking de retail por nombre, pero nada de acá se ata por parecido: las
// visitas, la última compra y el segmento se agregan por el id, y el registro
// de contacto (`multifashion_contactos`) también se guarda por el id.
//
// ── LO MEDIDO CONTRA PRODUCCIÓN (16-sep-2026) ───────────────────────────────
//   · `switch_clientes` de `american_classic`: **1.060 filas**. ⚠️ Pasa el
//     corte silencioso de `db-max-rows` = 1000, así que la lectura va SIEMPRE
//     con `leerTodoPaginado` (ver `clientes-lectura.ts`).
//   · Con nombre útil: 1.057 · con teléfono o celular: **938 (89 %)**.
//   · **Con compras: 967**. De esos, **867 (90 %) tienen teléfono**,
//     **670 no compran hace 60 días o más** y **114 de esos ya habían venido
//     dos veces o más**.
//   · 93 registrados nunca compraron.
//
// 🩸 EL «500 · 292 · 81» DEL ENCARGO ERA UNA LISTA RECORTADA. Salía de
// `multifashion_retail_recurrentes_v2` con `p_limit = 500`, que es el tope de
// la ruta: para el año 2026 la RPC declara **587 identificados y devuelve 500**.
// Los clientes de verdad son 967. Es exactamente por lo que Daniel pidió traer
// a todos: ordenar por fecha una lista ya sesgada por monto no dice nada.
//
// ── 🔴 POR QUÉ LA LISTA NO SALE DE `multifashion_retail_recurrentes_v2` ─────
// Medido el 16-sep-2026, porque es justo lo que alguien va a querer
// «simplificar» dentro de seis meses reusando la RPC que ya existe:
//   1. **Tope DURO de 500 filas.** `IF p_limit > 500 THEN p_limit := 500` está
//      adentro de la función: pedirle 2.000 devuelve 500. Para el año 2026 la
//      propia RPC declara 587 identificados y entrega 500.
//   2. **Agrupa por NOMBRE**, no por código: `REGEXP_REPLACE(TRIM(cliente),
//      '\s+', ' ')`. Ver el bloque del monto, abajo, para lo que eso cuesta.
//   3. **324 meses por cliente** si se le pide todo el histórico, y **6 s** de
//      consulta. Está hecha para un ranking de un período, no para una lista.
//
// ── EL MONTO: la MISMA cuenta, cambiándole la llave ─────────────────────────
// `total_comprado` copia línea por línea la fórmula de esa RPC (migración
// `20260619000000`): `subtotal_descuento` FIRMADO —la Nota de Crédito RESTA, la
// de Débito suma—, solo `is_wholesale = false`. **Verificado: reproduce la RPC
// en 500 de 500 clientes.** Lo único que cambia es la llave, de nombre a
// código, que es la regla de la casa («LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO»).
//
// 🩸 LO QUE ESO DESTAPA, medido: el total NO se mueve —$88.951,42 de las dos
// formas, al centavo— pero se reparte en otras filas. **63 de 961 clientes
// cambian de número** y los otros 898 quedan idénticos. Dos casos, y los dos
// son la razón por la que la llave es el código:
//
//   · **Un nombre que hoy suma DOS O MÁS personas** — 28 nombres, $6.908,76 en
//     juego. «JOSE MORALES» $691,44 son TRES personas ($332,10 · $327,42 ·
//     $31,92). «DAYANA CORTEZ» $990,03 son dos, y una compró $35,90.
//   · **Una persona PARTIDA en dos grafías** — 3 códigos. 🔑 **El código 425 es
//     «rafael rodriguez» $295,28 + «RAFAEL RODRIGUEZ» $115,40 = $410,68**, y
//     ese cliente estaba EN EL MOCKUP que Daniel aprobó, con $295,28: o sea que
//     la pantalla le mostraba medio cliente. Al 589 (Mónica Ríos) lo partía un
//     acento: «Monica Rios» $0,00 y «Monica Ríos» $287,20.
//
// 🔴 Si alguien vuelve a agrupar por nombre «para simplificar», esos dos casos
// son lo que se rompe. No es teoría: está medido y tiene nombre y apellido.
//
// ⚠️ El monto sale SOLO de retail (`is_wholesale = false`), igual que el
// ranking de la pantalla. Medido: en toda la historia de ACS hay 3 códigos con
// factura de mayoreo y NINGUNO tiene además retail, así que no le esconde plata
// a nadie.
//
// ⚠️ Un cliente puede quedar en **$0,00** y se muestra igual: el 453 («CARLOS
// LARA») compró y devolvió todo. Es cierto, no es un dato roto.
//
// ✅ **DECIDIDO (23-sep-2026): VENTAS MAHER ES UN CLIENTE COMO CUALQUIERA.**
// Daniel, textual: *«métel[o] para no hacer excepciones por solo una
// persona»*. Ya entraba al ranking (la RPC v3 dejó de excluirlo por nombre) y
// desde hoy también entra a la lista de llamar: `fuera-de-seguimiento.ts`
// quedó VACÍO. Este universo nunca lo sacó, así que las cuatro tarjetas no se
// movieron; lo que cambió es la lista de abajo («Todos» 983 → 986).
//
// 🔑 Y el monto sigue sin copiar las exclusiones por NOMBRE del ranking (las 8
// empresas del grupo): ésas dicen **quién aparece en un ranking**, no
// **cuánto compró una persona**. Acá se suman las facturas de ESE código y
// punto. Para los 500 clientes que el ranking sí muestra da exactamente lo
// mismo —ninguno cae en esas exclusiones—, y por eso la verificación de 500 de
// 500 sigue valiendo.
// ─────────────────────────────────────────────────────────────────────────────

import { waLink } from "@/lib/phone-wa";

/** El mostrador de la tienda. No es un cliente: no se le hace postventa. */
export const MOSTRADOR_ID = 1;

/** Nombres que no identifican a nadie. Lista cerrada. */
export const NOMBRES_GENERICOS = new Set([
  "CONTADO",
  "CONSUMIDOR FINAL",
  "VENTAS",
  "VENTAS LOCALES",
]);

/** 2+ visitas en esta ventana = frecuente. */
export const DIAS_FRECUENTE = 90;
/** Sin comprar hace tanto o más = dormido. */
export const DIAS_DORMIDO = 60;

/** Misma normalización de identidad que el RPC del ranking (TRIM + colapsa espacios). */
export const normNombre = (s: unknown): string =>
  String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();

/** Corre `n` días sobre un `YYYY-MM-DD` (negativo = hacia atrás). */
export function correrDias(isoDay: string, dias: number): string {
  return new Date(new Date(`${isoDay}T00:00:00Z`).getTime() + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Días enteros entre dos `YYYY-MM-DD`. `null` si falta alguna. */
export function diasEntre(desde: string | null | undefined, hasta: string): number | null {
  if (!desde) return null;
  const a = Date.parse(`${String(desde).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(hasta).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ─── Lo que entra ───────────────────────────────────────────────────────────

/** Una fila de `switch_clientes` (ACS), en lo que a este módulo le importa. */
export interface FilaRegistrado {
  cliente_switch_id: number;
  nombre: string | null;
  telefono: string | null;
  celular: string | null;
  raw_data: { fechaCreacion?: string } | null;
}

/** Una fila de `switch_facturas` de ACS, de cualquier tipo de comprobante. */
export interface FilaFactura {
  cliente_switch_id: number;
  cliente_nombre: string | null;
  fecha: string;
  tipo_comprobante: string | null;
  /** Base pre-impuesto. Es la que suma la RPC del ranking. */
  subtotal_descuento?: number | string | null;
  is_wholesale?: boolean | null;
  /** Ausente mientras la migración 20260704090000 no haya corrido. */
  descuento_global_pct?: number | null;
}

/**
 * Los tipos que SUMAN en la base contable de Multifashion. La Nota de Crédito
 * RESTA y cualquier otro vale 0. Copiado de la vista `_multifashion_sf_vw`.
 */
const TIPOS_QUE_SUMAN = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);

/** Redondeo a centavos: sumar flotantes de a uno arrastra 0,0000000001. */
const aCentavos = (n: number): number => Math.round(n * 100) / 100;

/** El `subtotal` firmado de una fila, igual que `_multifashion_sf_vw`. */
export function subtotalFirmado(fila: FilaFactura): number {
  const sub = Number(fila.subtotal_descuento ?? 0);
  if (!Number.isFinite(sub)) return 0;
  const tipo = String(fila.tipo_comprobante ?? "");
  if (TIPOS_QUE_SUMAN.has(tipo)) return sub;
  if (tipo === "Nota de Crédito") return -sub;
  return 0;
}

// ─── Lo que sale ────────────────────────────────────────────────────────────

export interface ClienteUniverso {
  /** 🔴 La identidad. El código del cliente en Switch. */
  cliente_switch_id: number;
  nombre: string;
  /** Solo para parear con listas viejas que agrupan por nombre. No es identidad. */
  nombre_norm: string;
  /** Link `wa.me` listo, o `null` si no hay teléfono normalizable. */
  telefono_wa: string | null;
  registrado: boolean;
  fecha_registro: string | null;
  /** Días DISTINTOS con compra. Dos facturas del mismo día son una visita. */
  visitas: number;
  visitas_90d: number;
  /** Facturas emitidas. Es lo que la pantalla llama «tickets». */
  tickets: number;
  /**
   * Cuánto compró en toda su historia, en la base contable de la tienda
   * (subtotal firmado, retail). Ver el bloque del monto en el encabezado.
   * Puede ser 0 —compró y devolvió— y eso se muestra tal cual.
   */
  total_comprado: number;
  ultima_compra: string | null;
  /** El día de su PRIMERA compra. `null` si nunca compró. */
  primera_compra: string | null;
  /**
   * ¿Compró por PRIMERA VEZ en el mes en curso de Panamá?
   *
   * 🔑 NO es lo mismo que `nuevo_mes`, y la diferencia es deliberada
   * (16-sep-2026). `nuevo_mes` es «lo REGISTRARON este mes» (sale de
   * `raw_data.fechaCreacion`) y es lo que cuenta la TARJETA de arriba; esto es
   * «COMPRÓ por primera vez este mes» y es lo que filtra el chip «Nuevos» de la
   * lista. Daniel, textual: *«no existe registrar y no compró»* — en la tienda
   * te registran cuando compras, así que para él son la misma pregunta. Se
   * separan igual porque la tarjeta no se toca y los dos números pueden
   * diferir: medido hoy, 31 registrados contra 33 primeras compras.
   */
  primera_compra_este_mes: boolean;
  /** Días desde la última compra. `null` si nunca compró. */
  dias_sin_comprar: number | null;
  estado5: "disponible" | "usado" | null;
  frecuente: boolean;
  dormido: boolean;
  nuevo_mes: boolean;
  cinco_pendiente: boolean;
}

export interface CardsUniverso {
  frecuentes: number;
  nuevos_mes: number;
  dormidos: number;
  cinco_pendiente: number;
}

/**
 * Arma el universo. `hoy` es la fecha de PANAMÁ (`hoyPanama()`), nunca la del
 * servidor: Vercel corre en UTC y entre 00:00 y 05:00 UTC allá todavía es ayer.
 *
 * ⚠️ El orden de salida NO es de presentación: sale en el orden en que entran
 * los registrados y después los huérfanos. Quien presente, que ordene.
 */
export function armarUniverso(
  registrados: readonly FilaRegistrado[],
  facturas: readonly FilaFactura[],
  hoy: string,
): { clientes: ClienteUniverso[]; cards: CardsUniverso } {
  const corte90 = correrDias(hoy, -DIAS_FRECUENTE);
  const corte60 = correrDias(hoy, -DIAS_DORMIDO);
  const mesActual = hoy.slice(0, 7);

  interface Agg {
    dias: Set<string>;
    primera: string;
    ultima: string;
    tickets: number;
    total: number;
    uso5: boolean;
    nombreFactura: string | null;
  }
  const porCliente = new Map<number, Agg>();
  const vacio = (): Agg =>
    ({ dias: new Set<string>(), primera: "", ultima: "", tickets: 0, total: 0, uso5: false, nombreFactura: null });

  for (const f of facturas) {
    const a = porCliente.get(f.cliente_switch_id) ?? vacio();

    // 🔴 VISITAS, ÚLTIMA COMPRA Y EL 5 % CUENTAN SOLO LAS «Factura», tal como
    // lo hacía este cálculo desde que nació: una nota de crédito NO es una
    // visita a la tienda. Tocar esto MUEVE las cuatro tarjetas de arriba, que
    // el encargo del 16-sep-2026 dice expresamente no tocar.
    if (String(f.tipo_comprobante ?? "") === "Factura") {
      const dia = String(f.fecha).slice(0, 10);
      a.dias.add(dia);
      a.tickets += 1;
      if (dia > a.ultima) a.ultima = dia;
      if (!a.primera || dia < a.primera) a.primera = dia;
      if (Number(f.descuento_global_pct) === 5) a.uso5 = true;
      if (!a.nombreFactura && f.cliente_nombre) a.nombreFactura = f.cliente_nombre;
    }

    // El MONTO sí mira todos los comprobantes, y solo retail: es la base
    // contable de la tienda (la NC resta). Ver el encabezado.
    if (f.is_wholesale === false) a.total += subtotalFirmado(f);

    porCliente.set(f.cliente_switch_id, a);
  }

  const clientes: ClienteUniverso[] = [];
  const vistos = new Set<number>();

  for (const r of registrados) {
    const nombre = String(r.nombre ?? "").trim();
    if (!nombre || NOMBRES_GENERICOS.has(normNombre(nombre))) continue;
    vistos.add(r.cliente_switch_id);
    const a = porCliente.get(r.cliente_switch_id);
    const visitas = a?.dias.size ?? 0;
    const ultima = a?.ultima || null;
    const fechaRegistro = String(r.raw_data?.fechaCreacion ?? "").slice(0, 10) || null;
    const uso5 = a?.uso5 ?? false;
    const visitas90 = a ? [...a.dias].filter((d) => d >= corte90).length : 0;
    clientes.push({
      cliente_switch_id: r.cliente_switch_id,
      nombre,
      nombre_norm: normNombre(nombre),
      telefono_wa: waLink(r.telefono, r.celular),
      registrado: true,
      fecha_registro: fechaRegistro,
      visitas,
      visitas_90d: visitas90,
      tickets: a?.tickets ?? 0,
      total_comprado: aCentavos(a?.total ?? 0),
      ultima_compra: ultima,
      primera_compra: a?.primera || null,
      primera_compra_este_mes: (a?.primera ?? "").slice(0, 7) === mesActual,
      dias_sin_comprar: diasEntre(ultima, hoy),
      estado5: uso5 ? "usado" : "disponible",
      frecuente: visitas90 >= 2,
      dormido: visitas > 0 && ultima !== null && ultima < corte60,
      nuevo_mes: fechaRegistro !== null && fechaRegistro.slice(0, 7) === mesActual,
      cinco_pendiente: visitas <= 1 && !uso5,
    });
  }

  // Huérfanos: facturados con id pero fuera del directorio (residual conocido).
  for (const [cid, a] of porCliente) {
    if (vistos.has(cid)) continue;
    const nombre = String(a.nombreFactura ?? "").trim();
    if (!nombre || NOMBRES_GENERICOS.has(normNombre(nombre))) continue;
    const visitas90 = [...a.dias].filter((d) => d >= corte90).length;
    clientes.push({
      cliente_switch_id: cid,
      nombre,
      nombre_norm: normNombre(nombre),
      telefono_wa: null,
      registrado: false,
      fecha_registro: null,
      visitas: a.dias.size,
      visitas_90d: visitas90,
      tickets: a.tickets,
      total_comprado: aCentavos(a.total),
      ultima_compra: a.ultima || null,
      primera_compra: a.primera || null,
      primera_compra_este_mes: a.primera.slice(0, 7) === mesActual,
      dias_sin_comprar: diasEntre(a.ultima || null, hoy),
      estado5: null,
      frecuente: visitas90 >= 2,
      dormido: a.dias.size > 0 && a.ultima < corte60,
      nuevo_mes: false,
      cinco_pendiente: false,
    });
  }

  const cards: CardsUniverso = {
    frecuentes: clientes.filter((c) => c.frecuente).length,
    nuevos_mes: clientes.filter((c) => c.nuevo_mes).length,
    dormidos: clientes.filter((c) => c.dormido).length,
    cinco_pendiente: clientes.filter((c) => c.registrado && c.cinco_pendiente).length,
  };

  return { clientes, cards };
}

/**
 * Los que de verdad se pueden seguir: los que YA COMPRARON.
 *
 * 🔴 Postventa es «vuelve a comprar», así que un registrado que nunca compró no
 * entra (93 medidos el 16-sep-2026). No es lo mismo que la tarjeta «5 %
 * pendiente», que sí los cuenta: ésa mide el incentivo de registro.
 */
export function soloConCompras(clientes: readonly ClienteUniverso[]): ClienteUniverso[] {
  return clientes.filter((c) => c.visitas > 0);
}

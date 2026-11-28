// ─────────────────────────────────────────────────────────────────────────────
// VISTA GENERAL › «VENDIDO POR TIPO» (28-nov-2026, `VG_UTILIDAD_Y_VENDIDO_POR_TIPO_2026_11`).
// Módulo PURO: lo leen la ruta, la pantalla, las pruebas y el cuadre
// (`scripts/_verif-vendido-por-tipo.ts`).
//
// Piezas vendidas por TIPO de artículo (calzado, camisetas…), y las notas de
// crédito RESTAN. Cada empresa clasifica con SU diccionario, escrito a mano a
// partir de lo medido en producción (28-nov-2026):
//   · Las seis del grupo: el renglón de factura (`switch_factura_lineas`) trae
//     `subrubro` y `rubro`. Según la época, Switch guarda el tipo en uno o en el
//     otro (y el género en el que sobra), así que se mira PRIMERO el subrubro y
//     después el rubro: gana el primero que el diccionario de la empresa conoce.
//     Active Shoes tiene el tipo en el rubro y el género en el subrubro; da igual,
//     su diccionario solo conoce tipos.
//   · Multifashion no tiene esos renglones: el tipo sale de la marca de Switch,
//     que es marca + departamento («TH FOOTWEAR», «CK KIDS»…).
//   · Boston: Switch no trae el tipo de sus artículos → la tarjeta lo dice.
// 🔑 Igualdad EXACTA después de normalizar (mayúsculas, espacios, y un prefijo
// de género «MEN-», «WOMEN-»… que Switch pega a veces), nunca por parecido. Lo
// que el diccionario no conoce cae en «Otros», y se ve.
// ─────────────────────────────────────────────────────────────────────────────

import { VG_VENTAS_CON_UTILIDAD_Y_ANIOS_2026_11 } from "@/lib/ui/vista-general-ventas-anios-2026-11";

export const OTROS = "Otros";
/** Tipos con nombre que se dibujan; el resto se pliega en «Otros». */
export const MAX_TIPOS = 6;

const BOSTON = "confecciones_boston";
const MULTIFASHION = "american_classic";

/** tipo → los valores de Switch que lo forman. */
type Diccionario = Readonly<Record<string, readonly string[]>>;

const CAMISAS_WOVEN = [
  "SHIRTS WOVEN L-S", "SHIRTS WOVEN S-S", "SHIRTS WOVEN LS", "SHIRTS L-S", "SHIRTS S-S", "DRESS SHIRTS",
  "SHIRTS-WOVEN S-S", "SHIRTS-WOVEN L-S", "SHIRTS - WOVEN TOPS S-S", "SHIRTS - WOVEN TOPS L-S",
] as const;
const PANTALONES = [
  "SHORTS WOVEN", "DENIM PANTS", "DENIM PANTS CORE", "PANT NON-DENIM", "PANT NON-DENIM CORE", "SHORTS DENIM",
  "SHORT KNIT", "PANT KNIT", "SWIMSHORTS", "WOVEN BOTTOMS",
] as const;

export const DICCIONARIOS: Readonly<Record<string, Diccionario>> = {
  active_shoes: {
    Calzado: ["SHOES"],
    Camisetas: ["T-SHIRTS"],
    Ropa: ["APPAREL", "SHORTS", "TOPS", "JACKETS", "BRA"],
    Medias: ["SOCKS"],
    Gorras: ["HEADWEAR"],
  },
  fashion_shoes: {
    Chancletas: ["FLIP FLOPS"],
    Tenis: ["SNEAKERS"],
    Sandalias: ["SANDALS"],
    Zapatos: ["SHOES", "BOOTS"],
    Pantuflas: ["SLIPPERS"],
  },
  active_wear: {
    Camisetas: ["T-SHIRTS S-S", "HEAVYWEIGHT", "T-SHIRTS", "T-SHIRT", "T-SHIRT MEN", "T-SHIRT WOMEN", "GIRLS T-SHIRT", "T-SHIRT (SHORT SLEEVE)"],
    // Daniel, 28-nov-2026: las camisetas de la selección van aparte; shorts a Pantalones.
    "Camisetas de selección": ["CAMISETA SELECCION"],
    Polos: ["POLOS S-S"],
    "Suéteres": ["SWEATERS", "HOODIE"],
    Bolsos: ["BAGS", "BAG"],
    Pantalones: ["PANT NON-DENIM", "SHORTS"],
    "Brasieres deportivos": ["WORKOUT BRA - LIGHT SUPPORT"],
    Medias: ["SOCKS"],
    Gorras: ["HEADWEAR", "CAP"],
    Chancletas: ["FLIP FLOPS"],
  },
  fashion_wear: {
    Camisetas: ["T-SHIRTS S-S", "T-SHIRTS S-S CORE", "T-SHIRTS S-S 3PK", "T-SHIRTS L-S", "OTHER KNIT TOPS", "HEAVYWEIGHT"],
    "Polos y camisas": ["POLOS S-S", "POLOS S-S CORE", "POLO S-S CORE", "POLOS L-S", ...CAMISAS_WOVEN],
    "Pantalones y shorts": PANTALONES,
    Medias: ["SOCKS SPORT", "SOCKS SPORT 3PK", "SOCKS DRESS"],
    Accesorios: [
      "HATS", "BELTS", "BAGS", "SMALL LEATHER", "SMALL LEATHER GOODS", "OTHER ACCESSORIES", "TIGHTS", "WATCHES",
      "LUGGAGE", "TIES - NECKWEAR", "TIES NECKWEAR",
    ],
    "Toallas y hogar": ["TOWELS", "HOME"],
  },
  vistana: {
    "Camisetas y polos": ["T-SHIRTS S-S", "T-SHIRTS L-S", "T-SHIRTS", "OTHER KNIT TOPS", "HEAVYWEIGHT", "POLOS S-S", "POLOS L-S"],
    "Ropa interior": ["PANTIES", "PANTIES 5PK", "BOXER BRIEF", "BRAS", "TRUNK", "BRIEF", "SLEEPWEAR", "WOVEN BOXERS", "SHAPEWEAR"],
    Calzado: ["FLIP FLOPS", "SNEAKERS", "SANDALS"],
    Medias: ["SOCKS SPORT", "SOCKS DRESS"],
    Accesorios: ["HATS", "BAGS", "SMALL LEATHER", "BELTS", "OTHER ACCESSORIES"],
    "Camisas y pantalones": ["SHIRTS WOVEN TOPS L-S", "SHIRTS WOVEN TOPS S-S", "SHIRTS", ...CAMISAS_WOVEN, ...PANTALONES],
  },
  joystep: {
    Zuecos: ["ACTIVE CLOG", "VARSITY CLOG"],
    Sandalias: ["LAKESHORE SANDAL", "RIVIERA SANDAL", "EVERYDAY SANDAL", "TREKKING SLIDE"],
    Chancletas: ["VARSITY FLIP", "CASUAL FLIP", "ADULT CASUAL FLIP"],
    "Zapatos planos": ["FRIDAY FLAT"],
    Zapatos: ["TREKKING SHOE"],
    Popinz: ["POPINZ"],
    Paquetes: ["4 PACK"],
  },
  [MULTIFASHION]: {
    Ropa: [
      "TH MENSWEAR", "TH MEN", "TH WOMENSWEAR", "TH WOMESWEAR", "TH WOMEN", "TH TOMMY JEANS", "TOMMY JEANS",
      "CK JEANS", "CK MENSWEAR", "CK WOMENSWEAR", "CK WOMEN", "KL MENSWEAR", "KL WOMENSWEAR", "RBK APPAREL",
    ],
    Calzado: ["TH FOOTWEAR", "CK FOOTWEAR", "KL FOOTWEAR", "RBK FOOTWEAR", "FOOTWEAR", "JOYBEES"],
    "Ropa de niños": ["TH KIDS", "CK KIDS"],
    Accesorios: [
      "TH ACCESSORIES", "TH ACCESORIES", "CK ACCESSORIES", "CK ACCESORIES", "KL ACCESSORIES", "TH LEGWEAR",
      "CK LEGWEAR", "RBK HARDWARE",
    ],
    "Ropa interior y baño": ["TH UNDERWEAR", "CK UNDERWEAR", "TH SWIMWEAR", "CK SWIMWEAR"],
  },
};

/** ¿La empresa tiene de dónde sacar el tipo? Boston no. */
export const tieneTipo = (empresa: string): boolean => empresa in DICCIONARIOS;

export const esMultifashion = (empresa: string): boolean => empresa === MULTIFASHION;
export const esBoston = (empresa: string): boolean => empresa === BOSTON;

const PREFIJO_GENERO = /^(?:KIDS UNISEX|UNISEX|WOMEN|MEN|BOYS|GIRLS|KIDS)-/;

/** Mayúsculas, espacios simples y sin el prefijo de género «MEN-POLOS S-S» → «POLOS S-S». */
export function normalizar(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/\s+/g, " ").trim().replace(PREFIJO_GENERO, "");
}

const INDICES = new Map<string, Map<string, string>>(
  Object.entries(DICCIONARIOS).map(([empresa, dic]) => [
    empresa,
    new Map(Object.entries(dic).flatMap(([tipo, valores]) => valores.map((v) => [normalizar(v), tipo] as const))),
  ]),
);

/**
 * Joystep (Joybees) nombra por MODELO, y Switch lo guardó de varias formas en
 * 2025: con el género pegado con espacio («WOMEN LAKESHORE SANDAL»), modelos que
 * el diccionario no tenía («ADULT TREKKING CLOG») o solo «KIDS» en el rubro y el
 * modelo en la descripción («Kids Varsity Clog Solid…»). Daniel, 28-nov-2026:
 * se clasifican por la PALABRA del modelo. Igualdad de palabra entera, nunca por
 * parecido; la descripción solo cuenta, en sus tres primeras palabras, si no
 * hay subrubro.
 */
export const PALABRAS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  joystep: {
    CLOG: "Zuecos",
    SANDAL: "Sandalias",
    SLIDE: "Sandalias",
    FLIP: "Chancletas",
    FLAT: "Zapatos planos",
    SHOE: "Zapatos",
    POPINZ: "Popinz",
  },
};

const GENERO_CON_ESPACIO = /^(?:KIDS|WOMEN|MEN|ADULT|BOYS|GIRLS|UNISEX) /;

/**
 * El tipo de un artículo: el PRIMER valor que el diccionario de la empresa
 * conoce (grupo: `[subrubro, rubro]`; Multifashion: `[marca]`). Si ninguno y la
 * empresa tiene `PALABRAS`: el mismo valor sin el género pegado con espacio, y
 * después la palabra del modelo (rubro antes que subrubro, que en esas filas trae
 * el COLOR; y al final la descripción). Si nada → «Otros».
 */
export function tipoDe(empresa: string, valores: readonly (string | null | undefined)[], descripcion?: string | null): string {
  const idx = INDICES.get(empresa);
  if (!idx) return OTROS;
  for (const v of valores) {
    const t = idx.get(normalizar(v));
    if (t) return t;
  }
  const palabras = PALABRAS[empresa];
  if (!palabras) return OTROS;
  // La descripción solo cuando Switch no trae subrubro (las filas «KIDS» de 2025):
  // los muebles «GENERAL» la tienen y no se leen («MUEBLE POPINZ» no es un Popinz).
  const desc = normalizar(valores[0]) ? "" : normalizar(descripcion).split(" ").slice(0, 3).join(" ");
  const todos = [...valores.map(normalizar).reverse(), desc].filter(Boolean);
  for (const v of todos) {
    const t = idx.get(v.replace(GENERO_CON_ESPACIO, ""));
    if (t) return t;
  }
  for (const v of todos) {
    for (const w of v.split(/[^A-Z]+/)) if (palabras[w]) return palabras[w];
  }
  return OTROS;
}

// ── El período (su propio desplegable; el resto de la Vista general es «hoy») ──

export type PeriodoTipo = "anio" | "mes" | "12m" | `a${number}`;

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/**
 * Años anteriores en el desplegable (28-nov-2026, Daniel: «Si y así con todas
 * las empresas»): los DOS años cerrados anteriores. 2023 queda fuera: su rubro
 * traía la línea («REEBOK CLASSICS CORE FTW MEN») y no el tipo, y caía en «Otros».
 */
export const ANIOS_ATRAS = 2;

/**
 * Desde qué año hay ventas con renglón por empresa (medido 28-nov-2026). Solo
 * se anotan las que empiezan DENTRO de la ventana: Joystep no tiene 2024.
 */
export const PRIMER_ANIO_CON_VENTAS: Readonly<Record<string, number>> = { joystep: 2025 };

/** Los años anteriores que se ofrecen para estas empresas (alguna con tipo y con ventas ese año). */
export function aniosAnteriores(hoy: string, empresas: readonly string[]): number[] {
  if (!VG_VENTAS_CON_UTILIDAD_Y_ANIOS_2026_11) return [];
  const y = Number(hoy.slice(0, 4));
  const out: number[] = [];
  for (let a = y - 1; a >= y - ANIOS_ATRAS; a--) {
    if (empresas.some((e) => tieneTipo(e) && (PRIMER_ANIO_CON_VENTAS[e] ?? 0) <= a)) out.push(a);
  }
  return out;
}

/** El primero es el que abre (el año en curso); después los años anteriores, el mes y 12 meses. */
export function opcionesPeriodoTipo(hoy: string, empresas: readonly string[] = []): { valor: PeriodoTipo; etiqueta: string }[] {
  const anio = hoy.slice(0, 4);
  return [
    { valor: "anio", etiqueta: `Año ${anio}` },
    ...aniosAnteriores(hoy, empresas).map((a) => ({ valor: `a${a}` as PeriodoTipo, etiqueta: `Año ${a}` })),
    { valor: "mes", etiqueta: `${MESES[Number(hoy.slice(5, 7)) - 1]} ${anio}` },
    { valor: "12m", etiqueta: "Últimos 12 meses" },
  ];
}

/** Lo que no se entiende, o un año fuera de la ventana, abre en el año en curso. */
export function periodoTipoValido(v: string | null | undefined, hoy: string): PeriodoTipo {
  if (v === "mes" || v === "12m") return v;
  const m = /^a(\d{4})$/.exec(v ?? "");
  const y = Number(hoy.slice(0, 4));
  if (VG_VENTAS_CON_UTILIDAD_Y_ANIOS_2026_11 && m && Number(m[1]) < y && Number(m[1]) >= y - ANIOS_ATRAS) return v as PeriodoTipo;
  return "anio";
}

/**
 * Días de Panamá, ambos inclusive, hasta HOY. «Últimos 12 meses» = 12 meses de
 * calendario que terminan en el mes en curso (la ventana de Ventas, `periodo.ts`).
 * Un año anterior va entero: 1-ene al 31-dic.
 */
export function rangoPeriodoTipo(p: PeriodoTipo, hoy: string): { desde: string; hasta: string } {
  const y = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7));
  if (p.startsWith("a") && p !== "anio") return { desde: `${p.slice(1)}-01-01`, hasta: `${p.slice(1)}-12-31` };
  if (p === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  if (p === "anio") return { desde: `${y}-01-01`, hasta: hoy };
  const total = y * 12 + (m - 1) - 11;
  const mm = String((total % 12) + 1).padStart(2, "0");
  return { desde: `${Math.floor(total / 12)}-${mm}-01`, hasta: hoy };
}

// ── Las sumas ───────────────────────────────────────────────────────────────

/** Un artículo con sus piezas netas del período (facturas − notas de crédito). */
export interface ArticuloVendido {
  empresa: string;
  codigo: string;
  descripcion: string;
  tipo: string;
  piezas: number;
}

export interface FilaTipo {
  tipo: string;
  piezas: number;
  /** 0–1 del total; null si las piezas no son positivas. */
  parte: number | null;
}

export interface VendidoPorTipo {
  /** Todas las piezas del período, también las de «Otros» (cuadra con la fuente). */
  total: number;
  /** Los tipos con nombre (mayor a menor) y «Otros» al final si es > 0. */
  filas: FilaTipo[];
  /** tipo del artículo → el que se dibuja (lo plegado va a «Otros»). */
  visible: (tipo: string) => string;
  /**
   * «Otros» cuando su neto es NEGATIVO (un ajuste de precio o devoluciones sin
   * tipo): no se dibuja como barra, se dice aparte para que las filas + esto =
   * `total`. 0 si «Otros» no es negativo.
   */
  otrosNegativo: number;
}

/**
 * 🔴 «Camisetas» y «Ropa» no van por separado (Daniel, 28-nov-2026): donde
 * aparecen los DOS (Active Shoes, o Fashion Group sumando las seis), las
 * camisetas son ropa y se suman a «Ropa». Donde solo hay «Camisetas» (Fashion
 * Wear, Active Wear) se quedan con su nombre.
 */
export const SE_SUMA_A: Readonly<Record<string, string>> = { Camisetas: "Ropa" };

/**
 * Suma por tipo. Con varias empresas («Fashion Group») los tipos del MISMO
 * nombre se suman entre empresas («Camisetas» de Active Shoes + Fashion Wear +
 * Active Wear); después, en todos los casos, quedan los `MAX_TIPOS` con más
 * piezas y el resto se pliega en «Otros». «Otros» con 0 o menos no se dibuja como
 * barra; si es negativo se dice aparte (`otrosNegativo`) y el total cuadra.
 */
export function agruparPorTipo(articulos: readonly ArticuloVendido[]): VendidoPorTipo {
  const presentes = new Set(articulos.map((a) => a.tipo));
  const fusion = (t: string) => (SE_SUMA_A[t] && presentes.has(SE_SUMA_A[t]) ? SE_SUMA_A[t] : t);
  const porTipo = new Map<string, number>();
  let total = 0;
  for (const a of articulos) {
    const t = fusion(a.tipo);
    porTipo.set(t, (porTipo.get(t) ?? 0) + a.piezas);
    total += a.piezas;
  }
  const conNombre = [...porTipo.entries()]
    .filter(([t, q]) => t !== OTROS && q > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const quedan = new Set(conNombre.slice(0, MAX_TIPOS).map(([t]) => t));
  const visible = (t: string) => (quedan.has(fusion(t)) ? fusion(t) : OTROS);
  const otros = [...porTipo.entries()].filter(([t]) => !quedan.has(t)).reduce((s, [, q]) => s + q, 0);
  // Con «Otros» negativo, el % se toma sobre lo que se dibuja (si no, las filas pasan del 100 %).
  const base = otros < 0 ? total - otros : total;
  const parte = (q: number) => (base > 0 && q > 0 ? q / base : null);
  const filas: FilaTipo[] = conNombre.slice(0, MAX_TIPOS).map(([tipo, piezas]) => ({ tipo, piezas, parte: parte(piezas) }));
  if (otros > 0) filas.push({ tipo: OTROS, piezas: otros, parte: parte(otros) });
  return { total, filas, visible, otrosNegativo: otros < 0 ? otros : 0 };
}

/** Los artículos que forman una fila (lo que se ve al tocar la barra), de más a menos piezas. */
export function articulosDeFila(articulos: readonly ArticuloVendido[], r: VendidoPorTipo, tipo: string): ArticuloVendido[] {
  return articulos
    .filter((a) => r.visible(a.tipo) === tipo)
    .sort((a, b) => b.piezas - a.piezas || a.codigo.localeCompare(b.codigo));
}

/** «1,234» · «−175». */
export const piezasTexto = (n: number): string => `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

/** «51%» · «<1%». */
export function parteTexto(p: number | null): string {
  if (p == null) return "";
  return p < 0.01 ? "<1%" : `${Math.round(p * 100)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — NO TOCA LA BASE. Las guías se arman A MANO en este archivo.
//
// VERIFICA EL PDF GENERADO DE VERDAD: lo escribe a disco y lo lee con
// `pdftotext` (poppler). No mira el código fuente: mira el TEXTO que sale del
// documento que alguien firma.
//
// Qué defectos atrapa, uno por uno:
//
//  1. «EL ENCABEZADO ANUNCIA UN N° QUE NO ES EL DE TODAS LAS LÍNEAS».
//     Con varios números distintos, poner uno arriba es una mentira impresa.
//     Regla: `numeroTranspUnicoImpreso` (modo-despacho.ts).
//  2. «EL N° DE UNA LÍNEA SALE EN LA FILA DE OTRA» — se comprueba que cada
//     número esté en el MISMO renglón que su cliente, no solo "en el papel".
//  3. «CON UN SOLO N° EL ENCABEZADO NO LO ANUNCIA» — el caso simétrico.
//  4. «UNA LÍNEA SIN N° PROPIO NO HEREDA EL DE LA CABECERA» — las guías viejas
//     traen el número solo en la cabecera; si no se hereda, el papel sale vacío.
//  5. «SE IMPRIME UN "0" PELADO» — ni como placa ni como N°. Nadie tiene una
//     placa "0": es lo que alguien tecleó para destrabar el botón.
//  6. «EL PIE LEGAL SE ACORTÓ O SE CAMBIÓ» — es la cláusula que hace
//     responsable al transportista; se compara palabra por palabra.
//  7. «SALE `__other__` EN DESPACHADO POR» — el centinela del desplegable
//     impreso como si fuera el nombre de una persona.
//  8. «EL LOTE DIBUJA DISTINTO QUE EL PDF DE UNA» — `construirPdfGuias([g])`
//     tiene que dar EL MISMO documento que `construirPdfGuia(g)` (salvo la
//     fecha de creación), o habría dos generadores y uno se quedaría viejo.
//  9. «HOJA EN BLANCO AL PRINCIPIO» — un `addPage()` de más en el lote.
// 10. «EL LOTE PIERDE GUÍAS» — 3 guías tienen que dar 3 páginas.
//
// Uso:  npx tsx scripts/_verif-guias-papel-pdf.ts
// Requiere `pdftotext` y `pdfinfo` (brew install poppler).
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { construirPdfGuia, construirPdfGuias } from "../src/lib/guias/pdf-guia";
import type { Guia, GuiaItem } from "../src/app/guias/components/types";

const SALIDA = "/tmp/verif-guias-papel-pdf";
const fallas: string[] = [];
const ok = (m: string) => console.log(`  ✅ ${m}`);
const mal = (m: string) => {
  fallas.push(m);
  console.log(`  🔴 ${m}`);
};

// ─── Las guías, armadas a mano (nunca se consulta Supabase) ──────────────────

function item(p: Partial<GuiaItem> & { orden: number; cliente: string }): GuiaItem {
  return {
    direccion: "Panamá",
    empresa: "Fashion Wear",
    facturas: "F-000",
    bultos: 1,
    numero_guia_transp: "",
    ...p,
  } as GuiaItem;
}

function guia(p: Partial<Guia> & { numero: number }): Guia {
  return {
    id: `g-${p.numero}`,
    fecha: "2026-08-25",
    transportista: "Transporte Sol",
    placa: "AB-1234",
    observaciones: "",
    total_bultos: 0,
    item_count: 0,
    monto_total: 0,
    estado: "Completada",
    entregado_por: "Julio",
    tipo_despacho: "externo",
    modo_entrega: "transportista",
    ...p,
  } as Guia;
}

/** CASO 1 — UN SOLO N°: las tres líneas traen el mismo. */
const UNO = guia({
  numero: 301,
  numero_guia_transp: "725",
  guia_items: [
    item({ orden: 1, cliente: "AMERICA CLASIC", facturas: "F-1001", bultos: 4, numero_guia_transp: "725" }),
    item({ orden: 2, cliente: "JERUSALEM PANAMA", facturas: "F-1002", bultos: 3, numero_guia_transp: "725" }),
    item({ orden: 3, cliente: "CITY MALL DAVID", facturas: "F-1003", bultos: 2, numero_guia_transp: "725" }),
  ],
});

/** CASO 2 — VARIOS DISTINTOS: 725 · 724 · 726, uno por envío. */
const VARIOS = guia({
  numero: 302,
  numero_guia_transp: "725",
  guia_items: [
    item({ orden: 1, cliente: "AMERICA CLASIC", facturas: "F-2001", bultos: 5, numero_guia_transp: "725" }),
    item({ orden: 2, cliente: "JERUSALEM PANAMA", facturas: "F-2002", bultos: 6, numero_guia_transp: "724" }),
    item({ orden: 3, cliente: "CITY MALL DAVID", facturas: "F-2003", bultos: 7, numero_guia_transp: "726" }),
  ],
});

/** CASO 3 — HERENCIA: la línea 1 no trae número y tiene que imprimir el de la cabecera. */
const HERENCIA = guia({
  numero: 303,
  numero_guia_transp: "TR-4471",
  guia_items: [
    item({ orden: 1, cliente: "SPORTING SHOES", facturas: "F-3001", bultos: 2, numero_guia_transp: "" }),
    item({ orden: 2, cliente: "WOLF MALL CENTER", facturas: "F-3002", bultos: 3, numero_guia_transp: "TR-9999" }),
  ],
});

/** CASO 4 — EL "0" PELADO y el centinela `__other__`. */
const CEROS = guia({
  numero: 304,
  placa: "0",
  numero_guia_transp: "0",
  entregado_por: "__other__",
  guia_items: [
    item({ orden: 1, cliente: "DOLLAR MALL", facturas: "F-4001", bultos: 1, numero_guia_transp: "0" }),
    item({ orden: 2, cliente: "GRUPO HANNA", facturas: "F-4002", bultos: 1, numero_guia_transp: "" }),
  ],
});

// ─── Herramientas ────────────────────────────────────────────────────────────

function escribir(nombre: string, doc: ReturnType<typeof construirPdfGuia>): string {
  const ruta = path.join(SALIDA, nombre);
  writeFileSync(ruta, Buffer.from(doc.output("arraybuffer")));
  return ruta;
}

function texto(ruta: string, opts: { pagina?: number } = {}): string {
  const args = ["-layout"];
  if (opts.pagina) args.push("-f", String(opts.pagina), "-l", String(opts.pagina));
  args.push(ruta, "-");
  const t = execFileSync("pdftotext", args, { encoding: "utf8" });
  // 🩸 GUARD ANTI-VACUO: si el extractor devolviera vacío (poppler roto, PDF
  // ilegible), TODAS las comprobaciones de "no aparece X" pasarían en verde sin
  // haber mirado nada. Un verificador que miente en verde es peor que ninguno.
  if (!/GUIA DE TRANSPORTE INTERIOR/.test(t) || t.length < 400) {
    throw new Error(`pdftotext devolvió un texto que no parece una guía (${t.length} chars): ${ruta}`);
  }
  return t;
}

function paginas(ruta: string): number {
  const info = execFileSync("pdfinfo", [ruta], { encoding: "utf8" });
  return Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? -1);
}

/** El renglón (línea de texto) donde aparece ese cliente. */
function renglonDe(txt: string, cliente: string): string | null {
  return txt.split("\n").find((l) => l.includes(cliente)) ?? null;
}

/**
 * Los bytes del PDF sin lo que cambia en cada generación: la fecha de creación
 * y el ID del documento. Lo demás tiene que ser idéntico.
 */
function huella(buf: Buffer): string {
  return buf
    .toString("latin1")
    .replace(/\/CreationDate\s*\(D:[^)]*\)/g, "/CreationDate(X)")
    .replace(/\/ID\s*\[[^\]]*\]/g, "/ID[X]");
}

// ─── A) EL PDF, GENERADO Y LEÍDO ─────────────────────────────────────────────

function main() {
  mkdirSync(SALIDA, { recursive: true });
  console.log(`Carpeta de salida: ${SALIDA}\n`);

  // ── 1. VARIOS DISTINTOS ────────────────────────────────────────────────────
  console.log("1) VARIOS N° DISTINTOS (725 · 724 · 726) — GT-302");
  const rVarios = escribir("varios.pdf", construirPdfGuia(VARIOS));
  const tVarios = texto(rVarios);
  writeFileSync(path.join(SALIDA, "varios.txt"), tVarios);

  // (defecto 1) el encabezado NO puede anunciar uno solo
  if (/N GUIA TRANSP\.:/.test(tVarios)) {
    mal('el ENCABEZADO anuncia "N GUIA TRANSP.:" con tres números distintos en la guía');
  } else {
    ok("el encabezado NO anuncia ningún N° (correcto: hay tres distintos)");
  }

  // (defecto 2) cada número, en la fila de SU envío
  const esperado: Array<[string, string]> = [
    ["AMERICA CLASIC", "725"],
    ["JERUSALEM PANAMA", "724"],
    ["CITY MALL DAVID", "726"],
  ];
  for (const [cliente, numero] of esperado) {
    const fila = renglonDe(tVarios, cliente);
    if (!fila) mal(`no se encontró el renglón de ${cliente} en el texto extraído`);
    else if (!new RegExp(`\\b${numero}\\b`).test(fila)) {
      mal(`el renglón de ${cliente} NO lleva su N° ${numero} · fila: ${fila.trim()}`);
    } else {
      // y que no lleve el de otro envío
      const ajenos = esperado.filter(([c]) => c !== cliente).map(([, n]) => n);
      const colado = ajenos.find((n) => new RegExp(`\\b${n}\\b`).test(fila));
      if (colado) mal(`el renglón de ${cliente} lleva TAMBIÉN el ${colado}`);
      else ok(`${cliente} → ${numero} (en su propia fila, sin números ajenos)`);
    }
  }

  // ── 2. UN SOLO N° ──────────────────────────────────────────────────────────
  console.log("\n2) UN SOLO N° (725 en las tres líneas) — GT-301");
  const rUno = escribir("uno.pdf", construirPdfGuia(UNO));
  const tUno = texto(rUno);
  writeFileSync(path.join(SALIDA, "uno.txt"), tUno);
  if (/N GUIA TRANSP\.:\s*725/.test(tUno)) ok('el encabezado SÍ lo anuncia: "N GUIA TRANSP.: 725"');
  else mal(`el encabezado NO anuncia el 725 habiendo uno solo en toda la guía`);

  // ── 3. HERENCIA cabecera → línea ───────────────────────────────────────────
  console.log("\n3) HERENCIA (cabecera TR-4471, línea 1 sin número) — GT-303");
  const rHer = escribir("herencia.pdf", construirPdfGuia(HERENCIA));
  const tHer = texto(rHer);
  writeFileSync(path.join(SALIDA, "herencia.txt"), tHer);
  const filaSporting = renglonDe(tHer, "SPORTING SHOES");
  if (filaSporting && /TR-4471/.test(filaSporting)) ok("la línea sin número propio imprime el de la cabecera (TR-4471)");
  else mal(`la línea sin número NO heredó el de la cabecera · fila: ${filaSporting?.trim() ?? "(no encontrada)"}`);
  const filaWolf = renglonDe(tHer, "WOLF MALL CENTER");
  if (filaWolf && /TR-9999/.test(filaWolf) && !/TR-4471/.test(filaWolf)) ok("la línea con número propio imprime el suyo (TR-9999)");
  else mal(`la línea con número propio no imprime TR-9999 sola · fila: ${filaWolf?.trim() ?? "(no encontrada)"}`);
  if (/N GUIA TRANSP\.:/.test(tHer)) mal("el encabezado anuncia un N° habiendo dos distintos (TR-4471 / TR-9999)");
  else ok("el encabezado se calla (hay dos distintos tras la herencia)");

  // ── 4. EL "0" PELADO y `__other__` ─────────────────────────────────────────
  console.log('\n4) EL "0" PELADO y el centinela `__other__` — GT-304');
  const rCero = escribir("ceros.pdf", construirPdfGuia(CEROS));
  const tCero = texto(rCero);
  writeFileSync(path.join(SALIDA, "ceros.txt"), tCero);
  const lineaPlaca = tCero.split("\n").find((l) => /PLACA \/ VEHICULO:/.test(l)) ?? "";
  if (/PLACA \/ VEHICULO:\s*0\b/.test(lineaPlaca)) mal(`se imprimió la placa "0" · ${lineaPlaca.trim()}`);
  else ok('la placa "0" NO se imprime');
  if (/N GUIA TRANSP\.:/.test(tCero)) mal('se anunció un N° siendo "0"');
  else ok('el N° "0" de la cabecera NO se anuncia');
  for (const cliente of ["DOLLAR MALL", "GRUPO HANNA"]) {
    const fila = renglonDe(tCero, cliente);
    // La columna del N° es la ÚLTIMA de la tabla: si el "0" se imprimiera,
    // el renglón terminaría en "0".
    if (!fila) mal(`no se encontró el renglón de ${cliente}`);
    else if (/\b0\s*$/.test(fila)) mal(`el renglón de ${cliente} termina en "0" (se imprimió el N° "0") · ${fila.trim()}`);
    else ok(`${cliente}: sin "0" impreso en su N° · «${fila.trim().slice(-32)}»`);
  }
  const lineaDesp = tCero.split("\n").find((l) => /DESPACHADO POR:/.test(l)) ?? "";
  if (/__other__/.test(tCero)) mal(`\`__other__\` aparece en el papel · ${lineaDesp.trim()}`);
  else ok("`__other__` NO aparece en ninguna parte del papel");

  // ── 4b. CONTROLES POSITIVOS ────────────────────────────────────────────────
  // Sin esto, un extractor mudo haría pasar en verde todos los "NO aparece X".
  console.log("\n4b) CONTROLES POSITIVOS (que el lector SÍ ve lo que sí está)");
  if (/PLACA \/ VEHICULO:\s*AB-1234/.test(tVarios)) ok("GT-302 SÍ imprime su placa real AB-1234");
  else mal("GT-302 no imprime su placa AB-1234 — ¿el lector está viendo el documento?");
  if (/DESPACHADO POR:\s*Julio/.test(tVarios)) ok("GT-302 SÍ imprime «DESPACHADO POR: Julio»");
  else mal("GT-302 no imprime el nombre de quien despacha");

  // ── 5. EL PIE LEGAL, palabra por palabra ───────────────────────────────────
  console.log("\n5) EL PIE LEGAL");
  const LEGAL =
    "La firma del transportista constituye aceptacion expresa de la mercancia detallada en este " +
    "documento, en la cantidad y condicion indicadas. Cualquier faltante o dano no reportado al " +
    "momento de la recepcion sera responsabilidad exclusiva del transportista.";
  for (const [nombre, t] of [["GT-301", tUno], ["GT-302", tVarios], ["GT-303", tHer], ["GT-304", tCero]] as const) {
    const plano = t.replace(/\s+/g, " ");
    if (plano.includes(LEGAL)) ok(`${nombre}: el pie legal sale completo y textual`);
    else mal(`${nombre}: el pie legal NO coincide palabra por palabra`);
  }

  // ── 6. UNA GUÍA: `construirPdfGuias([g])` === `construirPdfGuia(g)` ────────
  console.log("\n6) EL LOTE CON UNA SOLA GUÍA ES EL MISMO DOCUMENTO");
  const bufUna = Buffer.from(construirPdfGuia(VARIOS).output("arraybuffer"));
  const bufLote1 = Buffer.from(construirPdfGuias([VARIOS]).output("arraybuffer"));
  writeFileSync(path.join(SALIDA, "lote-1.pdf"), bufLote1);
  if (huella(bufUna) === huella(bufLote1)) {
    ok(`byte por byte idénticos salvo la fecha de creación (${bufUna.length} bytes)`);
  } else {
    mal(`el lote de UNA guía difiere del PDF de siempre (${bufUna.length} vs ${bufLote1.length} bytes)`);
  }
  const pagsLote1 = paginas(path.join(SALIDA, "lote-1.pdf"));
  if (pagsLote1 === 1) ok("1 página — no hay hoja en blanco al principio");
  else mal(`el lote de una guía tiene ${pagsLote1} páginas (debería ser 1: hoja en blanco de más)`);

  // ── 7. TRES GUÍAS = TRES PÁGINAS, en orden y sin hoja en blanco ───────────
  console.log("\n7) TRES GUÍAS = TRES PÁGINAS");
  const rLote3 = escribir("lote-3.pdf", construirPdfGuias([VARIOS, UNO, HERENCIA]));
  const pags3 = paginas(rLote3);
  if (pags3 === 3) ok("3 páginas exactas");
  else mal(`3 guías dieron ${pags3} páginas`);
  const p1 = texto(rLote3, { pagina: 1 });
  if (/GUIA DE TRANSPORTE INTERIOR/.test(p1) && /GT-302/.test(p1)) {
    ok("la página 1 ES la primera guía (GT-302), no una hoja en blanco");
  } else {
    mal(`la página 1 no es GT-302 · primeras líneas: ${p1.split("\n").slice(0, 3).join(" | ")}`);
  }
  const ordenEsperado = ["GT-302", "GT-301", "GT-303"];
  ordenEsperado.forEach((n, i) => {
    const p = texto(rLote3, { pagina: i + 1 });
    if (p.includes(n)) ok(`página ${i + 1} → ${n} (orden recibido)`);
    else mal(`página ${i + 1} no contiene ${n}`);
  });
  // y el lote conserva las reglas: la página de GT-302 sigue sin anunciar N°
  const pVarios = texto(rLote3, { pagina: 1 });
  if (/N GUIA TRANSP\.:/.test(pVarios)) mal("dentro del lote, GT-302 volvió a anunciar un N° en el encabezado");
  else ok("dentro del lote, GT-302 sigue sin anunciar N° (el lote no dibuja distinto)");

  // ── 8. CONTROL DE MUTACIÓN sobre el TEXTO (no toca `src/`) ────────────────
  // 🩸 Un verificador que no puede fallar no verifica nada: se le dan a las
  // MISMAS comprobaciones textos ROTOS a propósito y se exige que los denuncien.
  console.log("\n8) CONTROL DE MUTACIÓN (textos rotos a propósito)");
  const controles: Array<[string, boolean]> = [
    [
      "el encabezado anuncia un N° habiendo tres distintos",
      /N GUIA TRANSP\.:/.test(tVarios.replace("TIPO: Transportista externo", "TIPO: Transportista externo   N GUIA TRANSP.: 725")),
    ],
    [
      "un renglón lleva el N° de otro envío",
      /\b724\b/.test((renglonDe(tVarios, "AMERICA CLASIC") ?? "") + " 724"),
    ],
    [
      'se imprime la placa "0"',
      /PLACA \/ VEHICULO:\s*0\b/.test(tCero.replace("PLACA / VEHICULO:", "PLACA / VEHICULO: 0")),
    ],
    ["`__other__` sale impreso", /__other__/.test(tCero + " __other__")],
    [
      "el pie legal se acorta",
      !tVarios.replace(/responsabilidad exclusiva del transportista\./, "").replace(/\s+/g, " ").includes(LEGAL),
    ],
  ];
  let cazadas = 0;
  for (const [nombre, detectado] of controles) {
    if (detectado) { cazadas++; ok(`CAZADA — ${nombre}`); }
    else mal(`el control de mutación NO cazó: ${nombre}`);
  }
  console.log(`  → ${cazadas} de ${controles.length} mutaciones cazadas`);

  // ── 9. EL CANDADO QUE IMPIDE QUE EL PDF SE SEPARE DEL PAPEL ───────────────
  // `guia-pdf-compartir.test.ts` lee los DOS archivos y exige que todo campo
  // que `PrintDocument` pinta esté también en `pdf-guia`. Se corre acá para que
  // la verificación del papel y la del código vivan en el mismo comando.
  console.log("\n9) CANDADO src/__tests__/lib/guia-pdf-compartir.test.ts");
  try {
    const salida = execFileSync(
      "npx",
      ["vitest", "run", "src/__tests__/lib/guia-pdf-compartir.test.ts"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const resumen = /Tests\s+(.+)/.exec(salida)?.[1]?.trim() ?? "";
    if (!resumen) mal("no se pudo leer el resumen de vitest — la corrida no colectó nada");
    else if (/failed/.test(resumen)) mal(`el candado FALLA → ${resumen}`);
    else ok(`el candado PASA → ${resumen}`);
  } catch (e) {
    mal(`el candado FALLA o no se pudo correr: ${(e as Error).message.split("\n")[0]}`);
  }

  console.log(
    fallas.length === 0
      ? "\n🟢 PDF: TODO OK\n"
      : `\n🔴 PDF: ${fallas.length} FALLAS\n${fallas.map((f) => "  · " + f).join("\n")}\n`,
  );
  process.exit(fallas.length === 0 ? 0 : 1);
}

main();

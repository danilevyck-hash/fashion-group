// VERIFICACIÓN de que NINGÚN NÚMERO CAMBIÓ al pasar a tarjetas en celular/iPad.
//
// 🩸 POR QUÉ SE BUSCA POR `data-`, NUNCA POR CLASE DE BREAKPOINT. Un verificador
// que localice la tarjeta por `.md\:hidden` o la tabla por `.hidden.md\:block`
// devuelve una lista VACÍA en cuanto alguien mueve el corte — y comparar dos
// listas vacías **pasa**. El chequeo se declararía verde sin haber comparado
// nada. Por eso la tarjeta y la fila de tabla llevan los MISMOS atributos
// estables (`data-<modulo>-fila` / `data-<modulo>-campo`), que no dependen de
// ningún breakpoint, y este script **exige encontrar filas en los dos anchos**:
// cero filas en cualquiera de los dos = FALLA, no "todo bien".
//
// QUÉ COMPARA. Abre cada pantalla en un ancho donde se ven TARJETAS y en otro
// donde se ve la TABLA, lee campo por campo y los compara por id de fila:
//
//   Préstamos › ficha    fecha · concepto · notas · MONTO · SALDO · estado
//   Caja › Períodos      FONDO · GASTADO · SALDO
//   Caja › Detalle       descripción · categoría · TOTAL
//   Cheques › Lista      cliente · MONTO · estado
//
// La plata se compara por su NÚMERO, no por su texto: la tarjeta de Préstamos
// rotula "Saldo $1,234.56" y la celda de la tabla dice "$1,234.56" — mismo
// número, distinto texto alrededor. Cualquier otra diferencia se reporta.
//
// ⚠️ Solo lectura: se navega por URL y no se hace click en NINGÚN botón. Estas
// pantallas tienen depositar, eliminar y cerrar período.
//
//   node scripts/_verif-caja-prestamos-cheques.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3173";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHO_TARJETAS = Number(process.env.ANCHO_TARJETAS ?? 390);
const ANCHO_TABLA = Number(process.env.ANCHO_TABLA ?? 1440);

// Campos que son PLATA: se comparan por el número, no por el texto.
const PLATA = new Set(["monto", "saldo", "fondo", "gastado", "total"]);

const norm = (campo, txt) => {
  const t = (txt ?? "").replace(/\s+/g, " ").trim();
  if (PLATA.has(campo)) {
    const m = t.match(/-?[−–]?\s*\$?\s*[\d.,]*\d/);
    if (!m) return t === "—" || t === "" ? "—" : t;
    // el signo puede venir como '-', '−' o '+' pegado o suelto
    const signo = /[−–-]\s*\$/.test(t) || /^[−–-]/.test(t) ? "-" : /^\+/.test(t) ? "+" : "";
    return signo + m[0].replace(/[^\d.,]/g, "");
  }
  return t === "" ? "—" : t;
};

// 🩸 Solo las filas VISIBLES. Tailwind esconde la vista que no toca con
// `display:none`, así que las DOS siguen en el DOM en los dos anchos: sin este
// filtro se leerían 114 filas donde hay 57 y se estaría comparando la tabla
// contra sí misma. Se filtra por geometría real (`offsetParent` + caja con
// tamaño), NO por clase de breakpoint — ver el encabezado.
const LEER = (marca) => `(() => {
  const visible = (el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const filas = [...document.querySelectorAll("[data-${marca}-fila]")].filter(visible);
  return filas.map((f) => {
    const campos = {};
    for (const c of f.querySelectorAll("[data-${marca}-campo]")) {
      campos[c.getAttribute("data-${marca}-campo")] = (c.textContent || "").replace(/\\s+/g, " ").trim();
    }
    return { id: f.getAttribute("data-${marca}-fila"), campos };
  });
})()`;

async function abrir(navegador, ancho, url, espera) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: 1,
    hasTouch: ancho < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["caja", "cheques", "prestamos", "cxc", "admin"]));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(espera);
  return { ctx, page };
}

async function pedirJson(ruta) {
  const res = await fetch(BASE + ruta, { headers: { cookie: `cxc_session=${COOKIE}` } });
  if (!res.ok) throw new Error(`${ruta} → ${res.status}`);
  return res.json();
}

const periodos = await pedirJson("/api/caja/periodos");
const listaPeriodos = Array.isArray(periodos) ? periodos : (periodos.periodos ?? []);
const periodoId = (listaPeriodos.find((p) => (p.total_gastado ?? 0) > 0) ?? listaPeriodos[0])?.id;
const empleados = await pedirJson("/api/prestamos/empleados");
const listaEmp = Array.isArray(empleados) ? empleados : (empleados.empleados ?? []);
const empleadoId = listaEmp
  .map((e) => ({ id: e.id, n: (e.prestamos_movimientos ?? []).length }))
  .sort((a, b) => b.n - a.n)[0]?.id;

const CASOS = [
  { id: "prestamos-ficha", marca: "mov", url: `/prestamos/${empleadoId}`, espera: 9000 },
  { id: "caja-periodos", marca: "periodo", url: "/caja", espera: 8000 },
  { id: "caja-detalle", marca: "gasto", url: `/caja/${periodoId}`, espera: 9000 },
  { id: "cheques-lista", marca: "cheque", url: "/cheques", espera: 9000 },
];

const navegador = await chromium.launch();
let fallas = 0;

for (const c of CASOS) {
  const a = await abrir(navegador, ANCHO_TARJETAS, c.url, c.espera);
  const tarjetas = await a.page.evaluate(LEER(c.marca));
  await a.ctx.close();

  const b = await abrir(navegador, ANCHO_TABLA, c.url, c.espera);
  const tabla = await b.page.evaluate(LEER(c.marca));
  await b.ctx.close();

  // CONTROL DE VACÍO: sin filas en alguno de los dos anchos, un "0 diferencias"
  // no prueba nada. Es exactamente la trampa que este script viene a evitar.
  if (tarjetas.length === 0 || tabla.length === 0) {
    console.error(`❌ ${c.id.padEnd(18)} SIN FILAS (tarjetas=${tarjetas.length} tabla=${tabla.length}) — no se comparó nada`);
    fallas++;
    continue;
  }

  const mapaTabla = new Map(tabla.map((f) => [f.id, f.campos]));
  const difs = [];
  let celdas = 0;
  for (const f of tarjetas) {
    const otra = mapaTabla.get(f.id);
    if (!otra) { difs.push(`fila ${f.id} no está en la tabla`); continue; }
    for (const [campo, val] of Object.entries(f.campos)) {
      if (!(campo in otra)) { difs.push(`${f.id}: la tabla no trae "${campo}"`); continue; }
      celdas++;
      const x = norm(campo, val), y = norm(campo, otra[campo]);
      if (x !== y) difs.push(`${f.id} · ${campo}: tarjeta="${x}" tabla="${y}"`);
    }
  }
  for (const f of tabla) {
    if (!tarjetas.some((t) => t.id === f.id)) difs.push(`fila ${f.id} está en la tabla y NO en tarjetas`);
  }

  const ok = difs.length === 0;
  if (!ok) fallas++;
  console.error(
    `${ok ? "✅" : "❌"} ${c.id.padEnd(18)} filas ${String(tarjetas.length).padStart(3)}@${ANCHO_TARJETAS} vs ` +
    `${String(tabla.length).padStart(3)}@${ANCHO_TABLA} · ${String(celdas).padStart(4)} celdas comparadas · ` +
    `${difs.length} diferencias`,
  );
  for (const d of difs.slice(0, 10)) console.error(`      ${d}`);
}

await navegador.close();
console.error(fallas === 0 ? "\nNINGÚN NÚMERO CAMBIÓ." : `\n${fallas} pantalla(s) con diferencias.`);
process.exit(fallas === 0 ? 0 : 1);

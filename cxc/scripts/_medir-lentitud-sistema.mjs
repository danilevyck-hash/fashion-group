// ¿POR QUÉ SE SIENTE LENTO EL SISTEMA? — medición antes/después, contra el
// build de producción.
//
// Daniel: "siento que todo el sistema es lento aveces". La auditoría midió que
// NO son las fotos: es que la pantalla pide DOS VECES los mismos datos (el
// servidor los renderiza y apenas llega el HTML el cliente los vuelve a pedir)
// y que casi nada se cachea. Este script mide exactamente eso, por pantalla:
//
//   · `htmlMs`      — cuánto tarda el servidor en devolver el HTML (el trabajo
//                     de base de datos del server component).
//   · `listoMs`     — hasta que la pantalla dejó de pedir datos: el máximo
//                     entre `load` y el fin de la ÚLTIMA llamada a /api. Es lo
//                     que de verdad espera la persona.
//   · `apiLlamadas` — cuántas peticiones a /api dispara UNA visita. Este es el
//                     número que le importa a la base: Supabase está en compute
//                     Micro y se cayó 4 veces esta semana. Bajar llamadas es el
//                     objetivo real, no solo bajar segundos.
//   · `jsKb`        — JavaScript transferido (peso muerto: Sentry Replay, libs
//                     de Excel/PDF cargadas sin exportar nada).
//
// ⚠️ ARRANQUE EN FRÍO ≠ LENTITUD. La primera visita a una ruta compila/arranca
// la función y da picos que no representan nada. Por eso cada pantalla se
// CALIENTA una vez (esa corrida se descarta) y recién después se miden N.
// Se reporta la MEDIANA, no el promedio: un solo pico no debe mover el número.
//
// ⚠️ NO SATURAR LA BASE. Las corridas van de a una, en serie, con una pausa
// entre visitas. Nada de paralelismo.
//
// GOTCHAS de medición de la casa (heredados, no inventar otros):
//   * cookie de sesión firmada en `/tmp/fg-cookie.txt`
//   * sembrar `sessionStorage.cxc_role` + `fg_modules`, o todo redirige al login
//   * `delete Navigator.prototype.serviceWorker` ANTES de navegar: si no, el SW
//     sirve chunks de caché y el peso de JS sale falsamente en 0.
//   * contexto NUEVO por corrida = caché fría, que es la visita que duele.
//
// Solo lectura: se navega y se mira. No se toca ningún botón que ejecute nada.
//
//   BASE=http://localhost:3172 ETAPA=antes node scripts/_medir-lentitud-sistema.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3172";
const SALIDA = process.env.SALIDA ?? "/tmp/t166";
const ETAPA = process.env.ETAPA ?? "antes";
const CORRIDAS = Number(process.env.CORRIDAS ?? 3);
const PERFIL = process.env.PERFIL ?? "escritorio"; // escritorio | celular
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const PANTALLAS = [
  { id: "ventas", titulo: "Ventas", url: "/ventas" },
  { id: "clientes", titulo: "Clientes", url: "/clientes" },
  { id: "multifashion", titulo: "Multifashion", url: "/multifashion" },
  { id: "reclamos", titulo: "Reclamos", url: "/reclamos" },
  { id: "comisiones", titulo: "Comisiones", url: "/comisiones" },
  { id: "home", titulo: "Home", url: "/home" },
  { id: "asistencia", titulo: "Asistencia", url: "/asistencia" },
];

const VIEWPORT =
  PERFIL === "celular"
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 };

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function nuevoContexto(navegador) {
  const ctx = await navegador.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: PERFIL === "celular",
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
  });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_name", "Daniel Levy");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem(
      "fg_modules",
      JSON.stringify([
        "vista-general", "ventas", "cxc", "multifashion", "directorio", "proveedores",
        "catalogos", "guias", "packing-lists", "reclamos", "cargar", "comisiones",
        "marketing", "caja", "gastos-contabilidad", "saldos-banco", "prestamos",
        "cheques", "asistencia", "referencia", "usuarios", "data-health",
      ]),
    );
  });
  return ctx;
}

// Una visita: contexto nuevo (caché fría), se anota cada request y cuándo
// terminó, relativo al arranque de la navegación.
async function unaVisita(navegador, pantalla) {
  const ctx = await nuevoContexto(navegador);
  const page = await ctx.newPage();

  const eventos = [];
  const pendientes = [];

  // 🩸 Los `requestfinished` del HTML y de los primeros chunks llegan ANTES de
  // que `page.goto` devuelva, así que acá no se puede restar todavía el origen
  // de tiempo de la navegación: se guarda el instante ABSOLUTO (epoch) y la
  // resta se hace al final. Restar contra un origen que todavía vale 0 daba
  // "listo" en 1.786.579.485.519 ms, o sea la hora del reloj.
  page.on("requestfinished", (req) => {
    const tarea = (async () => {
      try {
        const res = await req.response();
        const timing = req.timing();
        let bytes = 0;
        try {
          const sizes = await req.sizes();
          bytes = (sizes.responseBodySize ?? 0) + (sizes.responseHeadersSize ?? 0);
        } catch {}
        eventos.push({
          url: req.url(),
          tipo: req.resourceType(),
          finAbs: timing.startTime + Math.max(timing.responseEnd, 0),
          durMs: Math.max(timing.responseEnd - Math.max(timing.requestStart, 0), 0),
          estado: res ? res.status() : 0,
          bytes,
        });
      } catch {}
    })();
    pendientes.push(tarea);
  });

  const inicio = Date.now();
  const resp = await page.goto(BASE + pantalla.url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const timingDoc = resp ? resp.request().timing() : null;
  const t0 = timingDoc ? timingDoc.startTime : 0;
  const htmlMs = timingDoc ? Math.round(timingDoc.responseEnd - timingDoc.requestStart) : -1;

  // Esperar a que la pantalla deje de pedir datos. `networkidle` es lo que
  // define "ya no está cargando" desde el punto de vista de quien mira.
  try {
    await page.waitForLoadState("networkidle", { timeout: 25000 });
  } catch {
    // Si algo mantiene la conexión abierta, igual medimos lo que hubo.
  }
  await page.waitForTimeout(500);
  const paredMs = Date.now() - inicio;
  await Promise.all(pendientes); // que ningún request quede sin contabilizar

  const apis = eventos.filter((e) => e.url.includes("/api/"));
  const js = eventos.filter(
    (e) => e.tipo === "script" || /\.js(\?|$)/.test(e.url.split("#")[0]),
  );
  const finApis = apis.length ? Math.max(...apis.map((e) => e.finAbs - t0)) : 0;

  const status = resp ? resp.status() : 0;

  await ctx.close();

  // El túnel de Sentry (`/api/<projectId>/envelope/`) también cae bajo /api/
  // pero NO toca la base: se cuenta aparte para no inflar el número que le
  // importa a Supabase.
  const datos = apis.filter((a) => !/\/api\/\d+\/envelope\//.test(a.url));

  // Agrupar las llamadas repetidas: el síntoma que se persigue en Comisiones
  // (5 llamadas idénticas en el mismo milisegundo) sólo se ve agrupando.
  const porRuta = {};
  for (const a of datos) {
    const ruta = new URL(a.url).pathname;
    porRuta[ruta] = porRuta[ruta] ?? { veces: 0, msTotal: 0, peorMs: 0 };
    porRuta[ruta].veces += 1;
    porRuta[ruta].msTotal += Math.round(a.durMs);
    porRuta[ruta].peorMs = Math.max(porRuta[ruta].peorMs, Math.round(a.durMs));
  }

  return {
    status,
    htmlMs,
    listoMs: Math.round(Math.max(paredMs, finApis)),
    paredMs,
    apiLlamadas: datos.length,
    apiSentry: apis.length - datos.length,
    apiMsSumados: Math.round(datos.reduce((s, a) => s + a.durMs, 0)),
    jsKb: Math.round(js.reduce((s, e) => s + e.bytes, 0) / 1024),
    jsArchivos: js.length,
    porRuta,
  };
}

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const filas = [];

for (const p of PANTALLAS) {
  // Calentamiento: se descarta. Es el arranque en frío de la función.
  const calor = await unaVisita(navegador, p);
  console.error(
    `[${ETAPA}/${PERFIL}] ${p.titulo.padEnd(13)} calentamiento (DESCARTADO): ` +
      `${calor.listoMs} ms · ${calor.apiLlamadas} api · status ${calor.status}`,
  );

  const corridas = [];
  for (let i = 0; i < CORRIDAS; i++) {
    await new Promise((r) => setTimeout(r, 1200)); // no saturar la base
    const r = await unaVisita(navegador, p);
    corridas.push(r);
    console.error(
      `[${ETAPA}/${PERFIL}] ${p.titulo.padEnd(13)} #${i + 1}: html ${String(r.htmlMs).padStart(5)} ms · ` +
        `listo ${String(r.listoMs).padStart(5)} ms · ${String(r.apiLlamadas).padStart(2)} api ` +
        `(${r.apiMsSumados} ms) · ${r.jsKb} KB js · status ${r.status}`,
    );
  }

  // Las rutas repetidas se toman de la ÚLTIMA corrida (todas dan igual; se
  // muestra el detalle para poder señalar la llamada duplicada por su nombre).
  const ultima = corridas[corridas.length - 1];
  const repetidas = Object.entries(ultima.porRuta)
    .filter(([, v]) => v.veces > 1)
    .map(([ruta, v]) => `${ruta} ×${v.veces}`);

  filas.push({
    etapa: ETAPA,
    perfil: PERFIL,
    pantalla: p.titulo,
    url: p.url,
    status: ultima.status,
    htmlMs: mediana(corridas.map((c) => c.htmlMs)),
    listoMs: mediana(corridas.map((c) => c.listoMs)),
    apiLlamadas: mediana(corridas.map((c) => c.apiLlamadas)),
    apiSentry: mediana(corridas.map((c) => c.apiSentry)),
    apiMsSumados: mediana(corridas.map((c) => c.apiMsSumados)),
    jsKb: mediana(corridas.map((c) => c.jsKb)),
    repetidas,
    // Las corridas una por una, sin promediar: la #1 es la fría (caché de
    // servidor vencida) y las siguientes pueden caer en la caché de 60 s. Sin
    // este detalle, una mediana "caliente" contaría un cuento demasiado lindo.
    corridas: corridas.map((c) => ({
      htmlMs: c.htmlMs, listoMs: c.listoMs, apiLlamadas: c.apiLlamadas,
      apiSentry: c.apiSentry, jsKb: c.jsKb,
    })),
    detalleApis: ultima.porRuta,
  });
}

await navegador.close();

const archivo = path.join(SALIDA, `lentitud-${PERFIL}-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(filas, null, 2));

console.log("");
console.log(`=== ${ETAPA.toUpperCase()} · ${PERFIL} · mediana de ${CORRIDAS} corridas (calentamiento descartado) ===`);
console.log(
  "Pantalla".padEnd(14) +
    "HTML".padStart(8) +
    "LISTO".padStart(9) +
    "APIs".padStart(6) +
    "Sentry".padStart(8) +
    "API ms".padStart(9) +
    "JS KB".padStart(8),
);
for (const f of filas) {
  console.log(
    f.pantalla.padEnd(14) +
      `${f.htmlMs}`.padStart(8) +
      `${f.listoMs}`.padStart(9) +
      `${f.apiLlamadas}`.padStart(6) +
      `${f.apiSentry}`.padStart(8) +
      `${f.apiMsSumados}`.padStart(9) +
      `${f.jsKb}`.padStart(8) +
      (f.repetidas.length ? `   🔁 ${f.repetidas.join(", ")}` : ""),
  );
}
console.log("");
console.log(`Detalle en ${archivo}`);

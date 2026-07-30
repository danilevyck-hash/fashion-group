// Ayudante de inspección: abre una pantalla con sesión sembrada y lista sus
// links, botones y texto, para poder escribir escenarios de medición sin
// adivinar selectores. SOLO LECTURA.
//
//   RUTA=/caja node scripts/_ver-pantalla.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3131";
const RUTA = process.env.RUTA ?? "/home";
const ANCHO = Number(process.env.ANCHO ?? 1440);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: ANCHO, height: 900 } });
await c.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await c.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await c.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
  sessionStorage.setItem("fg_is_owner", "1");
});
const p = await c.newPage();
p.on("pageerror", (e) => console.error("JS ERROR:", e.message));
await p.goto(BASE + RUTA, { waitUntil: "networkidle" });
await p.waitForTimeout(Number(process.env.ESPERA ?? 3000));

const info = await p.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (el) => (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const raiz = document.querySelector("[data-modulo], main, #__next") || document.body;
  return {
    url: location.pathname,
    links: [...document.querySelectorAll("a")].filter(vis).map((a) => a.getAttribute("href") + " :: " + txt(a)),
    botones: [...document.querySelectorAll("button")].filter(vis).map(txt).filter(Boolean),
    inputs: [...document.querySelectorAll("input,select,textarea")].filter(vis).map(
      (i) => i.tagName + "[" + (i.type || "") + "] id=" + i.id + " ph=" + (i.placeholder || "") + " role=" + (i.getAttribute("role") || ""),
    ),
    texto: raiz.innerText.replace(/\s+/g, " ").slice(0, 900),
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();

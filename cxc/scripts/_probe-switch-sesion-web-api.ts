/** SOLO LECTURA y SIN EXPULSAR A NADIE: ¿la sesión del API y la del panel web
 *  se tumban entre sí? El login web va SIEMPRE con changesession=NO: si ya hay
 *  alguien adentro, Switch manda a /users/opensession y NO se toma la sesión.
 *  Todo se cierra en finally. */
import fs from "node:fs";
import { resolveSwitchEnvKey } from "../src/lib/switch-api/empresas";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("="); process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const emp = process.argv[2] ?? "joystep";
const up = resolveSwitchEnvKey(emp);
const base = (process.env[`SWITCH_${up}_API_URL`] ?? "").replace(/\/+$/, "");
const user = process.env[`SWITCH_${up}_WEB_USER`] ?? "", password = process.env[`SWITCH_${up}_WEB_PASSWORD`] ?? "";

type Jar = Map<string, string>;
const cookieHeader = (jar: Jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
function store(jar: Jar, res: Response) { for (const c of res.headers.getSetCookie()) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) jar.set(m[1], m[2]); } }
async function wf(url: string, jar: Jar, init: RequestInit = {}, hops = 0) {
  let res = await fetch(url, { ...init, redirect: "manual", headers: { "User-Agent": UA, Cookie: cookieHeader(jar), ...(init.headers as any || {}) } });
  store(jar, res); let cur = url;
  while (hops > 0 && res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    const loc = res.headers.get("location")!; cur = loc.startsWith("http") ? loc : new URL(loc, cur).toString();
    res = await fetch(cur, { method: "GET", redirect: "manual", headers: { "User-Agent": UA, Cookie: cookieHeader(jar) } }); store(jar, res); hops--;
  }
  return { res, url: cur, text: await res.text() };
}
/** Login web con changesession=NO. Devuelve "opensession" | "dashboard" | "login" */
async function webLoginNo(jar: Jar): Promise<string> {
  const { text } = await wf(`${base}/users/login`, jar, { headers: { Accept: "text/html" } });
  const tok = text.match(/name="_token"[^>]*value="([^"]+)"/)?.[1] ?? text.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
  if (!tok) throw new Error("sin _token");
  const fd = new FormData(); fd.set("_token", tok); fd.set("usuario", user); fd.set("password", password); fd.set("changesession", "NO");
  const { url } = await wf(`${base}/users/login`, jar, { method: "POST", body: fd, headers: { Origin: base, Referer: `${base}/users/login` } }, 4);
  if (/\/users\/opensession/.test(url)) return "opensession";
  if (/\/users\/login/.test(url)) return "login";
  return `dashboard (${url.replace(base, "")})`;
}
async function webViva(jar: Jar): Promise<string> {
  const { res, url } = await wf(`${base}/reportesventa/comprobantes`, jar, { headers: { Accept: "text/html" } }, 3);
  return res.status === 200 && !/\/users\/login/.test(url) ? "VIVA (200)" : `MUERTA (${res.status} → ${url.replace(base, "")})`;
}
async function apiLogin() { const r = await fetch(`${base}/autenticacion`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ usuario: user, password }) }); const j: any = await r.json(); return j?.data?.token as string; }
async function apiPing(t: string) { const r = await fetch(`${base}/parametro?codigo=0072`, { headers: { Accept: "application/json", Authorization: t } }); const j = await r.text(); return r.status === 200 ? "VIVO (200)" : `MUERTO (${r.status} ${j.slice(0, 80)})`; }
async function apiLogout(t: string) { const r = await fetch(`${base}/cierresesion`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: t }, body: "{}" }); return r.status; }

async function main() {
  const tokens: string[] = []; const jars: Jar[] = [];
  console.log(`\n=== ${emp} · ${base} · usuario ${user} · ${new Date().toISOString()}`);
  try {
    // 0) ¿hay alguien en el panel web ahora? (sin expulsar)
    const j0: Jar = new Map(); const w0 = await webLoginNo(j0); console.log("0) login web changesession=NO →", w0);
    const tengoWeb = w0.startsWith("dashboard"); if (tengoWeb) jars.push(j0);
    // 1) login API
    const t1 = await apiLogin(); tokens.push(t1); console.log("1) login API → token1", await apiPing(t1));
    // 2) ¿la sesión web sobrevivió al login del API?
    if (tengoWeb) console.log("2) mi sesión web tras el login API →", await webViva(j0));
    else { const j: Jar = new Map(); const w = await webLoginNo(j); console.log("2) login web NO tras el login API →", w, w === "opensession" ? "(la sesión web de otro SOBREVIVIÓ)" : "(¡el login API la tumbó, o se cerró sola!)"); if (w.startsWith("dashboard")) jars.push(j); }
    // 3) ¿el token API sobrevivió a la sesión web?
    console.log("3) token1 con sesión web abierta →", await apiPing(t1));
    // 4) dirección inversa: con token API vivo, un login web NUEVO (solo si no hay nadie adentro)
    if (jars.length) {
      const jx = jars[jars.length - 1];
      await wf(`${base}/users/logout`, jx, { headers: { Accept: "text/html" } }, 3); console.log("4) logout web →", await webViva(jx), "· token1 tras logout web →", await apiPing(t1));
      const j4: Jar = new Map(); const w4 = await webLoginNo(j4); console.log("   login web nuevo con token1 vivo →", w4); if (w4.startsWith("dashboard")) jars.push(j4);
      console.log("   token1 tras el login web nuevo →", await apiPing(t1));
      console.log("   sesión web nueva tras 2º login API →", (tokens.push(await apiLogin()), await webViva(j4)));
    }
  } finally {
    for (const j of jars) { try { await wf(`${base}/users/logout`, j, { headers: { Accept: "text/html" } }, 3); console.log("  logout web ok"); } catch (e) { console.log("  logout web falló", e); } }
    for (const t of tokens) console.log("  cierresesion API →", await apiLogout(t));
  }
}
main().catch((e) => { console.error("ERROR", e); process.exit(1); });

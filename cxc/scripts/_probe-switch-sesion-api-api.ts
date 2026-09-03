/** SOLO LECTURA: ¿la sesión única del API es por usuario+empresa o cruza empresas?
 *  A) misma empresa: login1, login2 → ¿token1 sigue vivo?
 *  B) dos empresas, mismo usuario: login A, login B → ¿token A sigue vivo?
 *  Todo se cierra en finally. */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("="); process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
import { resolveSwitchEnvKey } from "../src/lib/switch-api/empresas";
function cfg(emp: string) { const up = resolveSwitchEnvKey(emp); return { url: (process.env[`SWITCH_${up}_API_URL`]??"").replace(/\/+$/,""), user: process.env[`SWITCH_${up}_WEB_USER`]??"", password: process.env[`SWITCH_${up}_WEB_PASSWORD`]??"" }; }
async function call(url: string, endpoint: string, method: "GET"|"POST", token?: string, body?: unknown) {
  const headers: Record<string,string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = token;
  const res = await fetch(`${url}${endpoint}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); return { status: res.status, text: text.slice(0, 160).replace(/\s+/g," ") };
}
const login = async (emp: string) => { const c = cfg(emp); const r = await fetch(`${c.url}/autenticacion`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ usuario: c.user, password: c.password }) }); const j: any = await r.json().catch(()=>null); return { url: c.url, token: j?.data?.token as string|undefined, raw: JSON.stringify(j).slice(0,200) }; };
const ping = (url: string, token: string) => call(url, "/parametro?codigo=0072", "GET", token);
const abiertos: Array<{url:string; token:string}> = [];
async function main() {
try {
  const [empA, empB] = [process.argv[2] ?? "joystep", process.argv[3] ?? "active_wear"];
  console.log(`\n── A) ${empA}: dos logins del MISMO usuario en la MISMA empresa`);
  const a1 = await login(empA); if (!a1.token) throw new Error("login1 falló " + a1.raw); abiertos.push({url:a1.url, token:a1.token});
  console.log("  token1 recién creado →", JSON.stringify(await ping(a1.url, a1.token)));
  const a2 = await login(empA); console.log("  login2 →", a2.token ? "OK, token nuevo" : "FALLÓ " + a2.raw); if (a2.token) abiertos.push({url:a2.url, token:a2.token});
  console.log("  token1 tras login2 →", JSON.stringify(await ping(a1.url, a1.token)));
  if (a2.token) console.log("  token2 →", JSON.stringify(await ping(a2.url, a2.token)));
  console.log(`\n── B) ${empA} + ${empB}: mismo usuario, DOS empresas`);
  const b1 = await login(empA); if (!b1.token) throw new Error("login B1 falló"); abiertos.push({url:b1.url, token:b1.token});
  console.log(`  token ${empA} recién creado →`, JSON.stringify(await ping(b1.url, b1.token)));
  const b2 = await login(empB); if (!b2.token) throw new Error("login B2 falló " + b2.raw); abiertos.push({url:b2.url, token:b2.token});
  console.log(`  login ${empB} OK; token ${empA} tras login en ${empB} →`, JSON.stringify(await ping(b1.url, b1.token)));
  console.log(`  token ${empB} →`, JSON.stringify(await ping(b2.url, b2.token)));
} finally {
  for (const s of abiertos) { const r = await call(s.url, "/cierresesion", "POST", s.token, {}); console.log("  cierresesion", s.url.replace("https://",""), r.status, r.text.slice(0,60)); }
}
}
main().catch((e)=>{console.error("ERROR",e);process.exit(1);});

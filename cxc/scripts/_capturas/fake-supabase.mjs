// Supabase FALSO para capturas (17-nov-2026). Ninguna captura toca producción:
// el servidor local apunta aquí y este proceso contesta con datos de ejemplo.
//
//   FIXTURES=/ruta/a/fixtures PORT=54999 node scripts/_capturas/fake-supabase.mjs
//
// Qué contesta:
//   GET /rest/v1/user_sessions…        → [{ id: 1 }]  (la sesión firmada «existe»)
//   GET /rest/v1/<tabla>…              → <FIXTURES>/<tabla>.json, o <tabla>.mjs
//                                        (export default (url, cuerpo) => datos)
//   POST /rest/v1/rpc/<fn>             → <FIXTURES>/rpc__<fn>.json | .mjs
//   cualquier otra cosa                → [] (y se anota en la consola)
// Un PATCH/POST/DELETE a una tabla contesta [] y NO guarda nada.
// `Accept: …pgrst.object+json` (.single()) devuelve el primer elemento o 406.
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 54999);
const FIXTURES = process.env.FIXTURES || join(process.cwd(), "scripts/_capturas/fixtures");

async function datosDe(nombre, url, cuerpo) {
  const json = join(FIXTURES, `${nombre}.json`);
  const mjs = join(FIXTURES, `${nombre}.mjs`);
  if (existsSync(mjs)) return (await import(`${mjs}?t=${Date.now()}`)).default(url, cuerpo);
  if (existsSync(json)) return JSON.parse(readFileSync(json, "utf8"));
  return null;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let cuerpo = "";
    for await (const c of req) cuerpo += c;
    const m = /^\/rest\/v1\/(rpc\/)?([^/?]+)/.exec(url.pathname);
    const nombre = m ? (m[1] ? `rpc__${m[2]}` : m[2]) : null;

    let datos = [];
    if (nombre === "user_sessions") datos = [{ id: 1 }];
    else if (nombre) datos = (await datosDe(nombre, url, cuerpo)) ?? [];
    const hubo = nombre === "user_sessions" || (nombre && (await datosDe(nombre, url, cuerpo)) !== null);
    console.log(`${hubo ? "   " : "SIN"} ${req.method} ${url.pathname}${url.search.slice(0, 160)}`);

    const quiereUno = (req.headers.accept || "").includes("pgrst.object");
    const headers = { "Content-Type": "application/json" };
    if ((req.headers.prefer || "").includes("count=")) {
      const n = Array.isArray(datos) ? datos.length : 1;
      headers["Content-Range"] = `0-${Math.max(0, n - 1)}/${n}`;
    }
    if (quiereUno) {
      const uno = Array.isArray(datos) ? datos[0] : datos;
      if (uno === undefined) { res.writeHead(406, headers); return res.end(JSON.stringify({ message: "sin fila" })); }
      res.writeHead(200, headers); return res.end(JSON.stringify(uno));
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify(datos));
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Supabase falso en http://127.0.0.1:${PORT} · fixtures: ${FIXTURES}`));

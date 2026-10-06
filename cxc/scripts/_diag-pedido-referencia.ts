/**
 * SOLO LECTURA — ¿el detalle de un pedido trae «Referencia»?
 *
 * Daniel, 6-oct-2026: en el PDF de pedido de Switch la columna «Referencia»
 * SÍ existe (código `4RG822G200` → referencia `4RG822G200-HMT`), y el API
 * documentado (§5.37 `/apipedido/info`) no la nombra. Puede venir con otro
 * nombre: esto lo comprueba contra el API REAL, imprimiendo TODAS las claves
 * que devuelve una línea, no solo las documentadas.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/_diag-pedido-referencia.ts [empresa]
 *
 * No escribe nada: un login y dos GET.
 */
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
}

import { resolveSwitchEnvKey } from "../src/lib/switch-api/empresas";

const EMPRESA = process.argv[2] ?? "vistana";

function cfg(emp: string) {
  const up = resolveSwitchEnvKey(emp);
  return {
    url: (process.env[`SWITCH_${up}_API_URL`] ?? "").replace(/\/+$/, ""),
    user: process.env[`SWITCH_${up}_WEB_USER`] ?? "",
    password: process.env[`SWITCH_${up}_WEB_PASSWORD`] ?? "",
  };
}

async function main() {
  const c = cfg(EMPRESA);
  if (!c.url) throw new Error(`Sin SWITCH_*_API_URL para ${EMPRESA}`);

  const r = await fetch(`${c.url}/autenticacion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ usuario: c.user, password: c.password }),
  });
  const token = ((await r.json().catch(() => null)) as { data?: { token?: string } } | null)?.data?.token;
  if (!token) throw new Error("No se pudo entrar al API");
  const get = async (ep: string) => {
    const res = await fetch(`${c.url}${ep}`, { headers: { Accept: "application/json", Authorization: token } });
    return (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  };

  // Un pedido cualquiera de los ACTIVOS; con `id` se pide el detalle.
  const lista = await get(`/apipedido/lista?porPagina=5&paginaActual=1&estatus=Activo`);
  const pedidos = (lista?.data?.pedidos ?? []) as Array<Record<string, unknown>>;
  console.log(`\n── ${EMPRESA}: ${pedidos.length} pedidos activos leídos`);
  if (pedidos.length === 0) return console.log("Sin pedidos activos: no hay detalle que mirar.");

  console.log("\nCLAVES de una fila de /apipedido/lista:");
  console.log("  " + Object.keys(pedidos[0]).join(" · "));

  const id = pedidos[0].id;
  console.log(`\n── detalle del pedido ${String(pedidos[0].secuencial)} (id ${String(id)})`);
  const info = await get(`/apipedido/info?pedidoId=${String(id)}`);
  const detalle = (info?.data?.detalle ?? []) as Array<Record<string, unknown>>;
  if (detalle.length === 0) return console.log("El detalle vino vacío.");

  console.log("\n🔑 TODAS las claves de una LÍNEA del detalle:");
  console.log("  " + Object.keys(detalle[0]).join(" · "));

  console.log("\n¿Alguna clave huele a «referencia»?");
  const sospechosas = Object.keys(detalle[0]).filter((k) => /ref|model|estilo|style|sku|alterno/i.test(k));
  console.log("  " + (sospechosas.length ? sospechosas.join(" · ") : "NINGUNA"));

  console.log("\nLas 3 primeras líneas, enteras:");
  for (const l of detalle.slice(0, 3)) console.log("  " + JSON.stringify(l));

  console.log("\nCLAVES de la cabecera (data.pedido):");
  console.log("  " + Object.keys((info?.data?.pedido ?? {}) as object).join(" · "));

  // Si la referencia no está en la línea, ¿está en la FICHA del artículo?
  const artId = detalle[0].articuloId;
  console.log(`\n── ficha del artículo ${String(detalle[0].codigoArticulo)} (id ${String(artId)})`);
  const art = await get(`/apiarticulos/info?articuloId=${String(artId)}`);
  const ficha = (art?.data?.articulo ?? {}) as Record<string, unknown>;
  console.log("\n🔑 TODAS las claves de la ficha del artículo:");
  console.log("  " + (Object.keys(ficha).join(" · ") || "(vacía)"));
  const sosp2 = Object.keys(ficha).filter((k) => /ref|model|estilo|style|sku|alterno/i.test(k));
  console.log("¿Alguna huele a «referencia»? " + (sosp2.length ? sosp2.join(" · ") : "NINGUNA"));
  console.log("  ficha entera: " + JSON.stringify(ficha).slice(0, 700));

  // Y por talla-color, que es donde vive la variante (el sufijo -HMT del PDF).
  console.log(`\n── /apiarticulos/tallacolor del mismo artículo`);
  const tc = await get(`/apiarticulos/tallacolor?articuloId=${String(artId)}`);
  console.log("  " + JSON.stringify(tc?.data ?? {}).slice(0, 700));
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

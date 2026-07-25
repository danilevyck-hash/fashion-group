/**
 * Acoplamiento NO obvio entre next.config.js y el service worker.
 *
 * Con Skew Protection (Vercel Pro) `next.config.js` define
 * `deploymentId: process.env.VERCEL_DEPLOYMENT_ID`, y Next estampa `?dpl=<id>`
 * en TODAS las URLs de `/_next/static`. Ese query cambia en cada deploy.
 *
 * El SW cachea `/_next/static` con CacheFirst. Si la clave de caché incluye el
 * query, cada promoción invalida chunks cuyo contenido NO cambió (los vendors,
 * que son los pesados) y el equipo en Panamá los re-descarga en iPad/celular.
 * Por eso esa estrategia lleva `matchOptions: { ignoreSearch: true }` — es
 * seguro porque el nombre del archivo lleva el hash del contenido.
 *
 * Este test es un candado: mientras `deploymentId` siga en next.config.js, la
 * estrategia de `/_next/static` tiene que seguir ignorando el query.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..", "..");
const nextConfig = readFileSync(join(root, "next.config.js"), "utf8");
const swSrc = readFileSync(join(root, "src", "app", "sw.ts"), "utf8");

describe("sw.ts · caché de /_next/static vs ?dpl= de Skew Protection", () => {
  it("next.config.js sigue estampando deploymentId (premisa del candado)", () => {
    expect(nextConfig).toMatch(/deploymentId:\s*process\.env\.VERCEL_DEPLOYMENT_ID/);
  });

  it("la estrategia de /_next/static ignora el query al buscar en caché", () => {
    // Bloque de runtimeCaching que arranca en el matcher de /_next/static y
    // termina donde arranca la siguiente entrada (el matcher de imágenes).
    const desde = swSrc.indexOf("/\\/_next\\/static\\/.+/i");
    expect(desde, "no se encontró el matcher de /_next/static en sw.ts").toBeGreaterThan(-1);
    const hasta = swSrc.indexOf("matcher:", desde + 1);
    const bloque = swSrc.slice(desde, hasta === -1 ? undefined : hasta);

    expect(bloque).toMatch(/matchOptions:\s*\{[^}]*ignoreSearch:\s*true/);
    expect(bloque).toContain("CacheFirst");
  });

  it("el ExpirationPlugin de esa estrategia sigue vivo (tope de entradas)", () => {
    expect(swSrc).toMatch(/new ExpirationPlugin\(\{\s*maxEntries:\s*200/);
  });
});

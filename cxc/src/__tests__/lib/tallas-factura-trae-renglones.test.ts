// Candado (23-nov-2026, Daniel: «a»): en Plantilla Switch › Tallas por bulto,
// una factura sin renglones cargados (la de hoy: el cron los trae a las 03:30
// UTC) NO se corta en «todavía no tiene renglones»: los trae de Switch en ese
// momento con el MISMO lector del cron y sigue.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ruta = leer("src/app/api/productos/tallas-pedido/route.ts");
const sync = leer("src/lib/switch-api/sync-factura-lineas.ts");

describe("la factura sin renglones se trae de Switch", () => {
  it("ya no existe el mensaje que cortaba ahí", () => {
    expect(ruta).not.toMatch(/todavía no tiene renglones/);
  });

  it("antes de rendirse llama al lector del cron para ESA factura y cierra la sesión", () => {
    const fn = ruta.slice(ruta.indexOf("async function leerFacturaOTraerla"));
    expect(fn).toMatch(/sincronizarLineasEmpresa\([^)]*soloFactura:\s*id/);
    expect(fn).toMatch(/logoutSwitchSessions\(\[empresa\]\)/);
    expect(ruta).toMatch(/tipo === "factura" \? await leerFacturaOTraerla\(/);
  });

  it("el lector acota a esa factura y no reescribe el upsert ni la marca", () => {
    expect(sync).toMatch(/q\.eq\("tipo_comprobante", "Factura"\)\.eq\("switch_factura_id", soloFactura\)/);
    expect(sync).toMatch(/onConflict: "empresa_key,tipo_comprobante,switch_factura_id,linea_orden"/);
    expect(sync).toMatch(/lineas_synced_at: new Date\(\)\.toISOString\(\)/);
  });
});

// SOLO LECTURA — verifica que el camino de la FOTO hasta la nota de entrega
// funciona de verdad contra producción: firmar la ruta del bucket privado,
// bajar el archivo y comprobar que es una IMAGEN de verdad (>5 KB,
// content-type image/*), no un 404 disfrazado ni un HTML de error.
//
// Es la regla dura del proyecto ("verificar que los assets cargan"): asumir
// que "se subió bien" es exactamente lo que ya salió mal antes.
//
// NO ESCRIBE NADA. No sube, no borra, no modifica ninguna fila. Toca UNA sola
// foto para no saturar Supabase.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-foto-nota-entrega.ts

import { supabaseServer } from "@/lib/supabase-server";
import { firmarPath } from "@/lib/marketing/storage";

const RUTA = process.env.RUTA ?? "notas-proveedor/changalo/paneles.jpg";

async function main() {
  const url = await firmarPath(RUTA);
  const res = await fetch(url, { cache: "no-store" });
  const buf = Buffer.from(await res.arrayBuffer());
  const tipo = res.headers.get("content-type") ?? "";
  const kb = (buf.byteLength / 1024).toFixed(1);
  const esJpeg = buf[0] === 0xff && buf[1] === 0xd8; // firma real del archivo
  const dataUrl = `data:${tipo};base64,${buf.toString("base64")}`;

  console.log(`ruta            ${RUTA}`);
  console.log(`http            ${res.status}`);
  console.log(`content-type    ${tipo}`);
  console.log(`tamaño          ${kb} KB`);
  console.log(`magic JPEG      ${esJpeg ? "sí" : "NO"}`);
  console.log(`data URL        ${dataUrl.slice(0, 48)}… (${dataUrl.length} chars)`);

  const ok =
    res.ok && tipo.startsWith("image/") && buf.byteLength > 5 * 1024 && esJpeg;
  console.log(`\nVEREDICTO       ${ok ? "OK — la foto llega entera y es una imagen" : "FALLA"}`);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error("falló:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
void supabaseServer;

// ── Prueba 2 (opcional, FOTOS=1): la foto REAL dentro de la nota de entrega ──
// Toma una entrega REAL de producción, le pega la foto real del bucket a cada
// renglón y arma el PDF. Prueba la cadena completa —firmar → bajar → base64 →
// jsPDF— con un archivo de verdad, y mide cuánto pesa el papel que se va a
// compartir por WhatsApp. Sigue sin escribir nada: el PDF se arma en memoria.
//
//   FOTOS=1 ENTREGA=<uuid> DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-foto-nota-entrega.ts

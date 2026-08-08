// SOLO LECTURA — la nota de entrega CON FOTOS, con datos de producción.
//
// Toma una entrega real, le pega a cada renglón una foto real del bucket
// `marketing` y arma el PDF. Verifica la cadena completa (firmar → bajar →
// base64 → jsPDF dibuja la imagen) y —lo que importa para compartir por
// WhatsApp— cuánto pesa el papel resultante.
//
// NO ESCRIBE NADA: no sube, no borra, no modifica filas. El PDF vive en
// memoria y se guarda en /tmp para poder mirarlo.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-nota-entrega-con-fotos.ts

import { writeFileSync } from "fs";
import { cargarComprobante } from "@/lib/marketing/entrega-comprobante";
import { firmarPath } from "@/lib/marketing/storage";
import { buildComprobanteEntregaPdf } from "@/lib/marketing/pdf-entrega-mueble";

const ENTREGA = process.env.ENTREGA ?? "e8cc66dd-6d73-4ab6-b30e-c553f1bb3c96";
const FOTO = process.env.FOTO ?? "notas-proveedor/changalo/paneles.jpg";

async function main() {
  const datos = await cargarComprobante(ENTREGA);
  if (!datos) throw new Error("entrega no encontrada");

  const url = await firmarPath(FOTO);
  const res = await fetch(url, { cache: "no-store" });
  const buf = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:${res.headers.get("content-type")};base64,${buf.toString("base64")}`;

  const sinFotos = buildComprobanteEntregaPdf(datos);
  const conFotos = buildComprobanteEntregaPdf({
    ...datos,
    items: datos.items.map((i, n) => ({
      ...i,
      bultos: n + 1, // para ver la columna con datos
      fotoDataUrl: dataUrl,
    })),
  });

  // ⚠️ Contar XObjects NO sirve para saber cuántas fotos se DIBUJAN: jsPDF
  // deduplica imágenes idénticas (5 renglones con la misma foto = 1 solo
  // XObject reusado 5 veces, que además es lo que hace liviano el papel). Lo
  // que hay que contar son las COLOCACIONES: `/I<n> Do` en el contenido.
  const xobjects = (b: Buffer) =>
    (b.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length;
  const colocaciones = (b: Buffer) =>
    (b.toString("latin1").match(/\/I\d+\s+Do/g) || []).length;

  writeFileSync("/tmp/nota-con-fotos.pdf", conFotos);
  console.log(`entrega          ${ENTREGA}`);
  console.log(`cliente          ${datos.cliente}`);
  console.log(`renglones        ${datos.items.length}`);
  console.log(`foto usada       ${FOTO} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
  console.log(
    `PDF sin fotos    ${(sinFotos.byteLength / 1024).toFixed(1)} KB · ` +
      `${xobjects(sinFotos)} XObject · ${colocaciones(sinFotos)} dibujadas (solo el logo)`,
  );
  console.log(
    `PDF con fotos    ${(conFotos.byteLength / 1024).toFixed(1)} KB · ` +
      `${xobjects(conFotos)} XObject · ${colocaciones(conFotos)} dibujadas (logo + ${datos.items.length} renglones)`,
  );
  console.log(`archivo          /tmp/nota-con-fotos.pdf`);

  const esperadas = datos.items.length + 1; // una por renglón + el logo
  const ok =
    colocaciones(conFotos) === esperadas && conFotos.byteLength < 3_000_000;
  console.log(
    `\nVEREDICTO        ${ok ? "OK — las fotos entran en el papel y pesa poco" : "FALLA"}`,
  );
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error("falló:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

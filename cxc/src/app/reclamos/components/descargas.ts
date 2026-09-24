// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SALE DE RECLAMOS: el Excel, el PDF y el correo al proveedor.
//
// 🔑 Por qué existe (24-sep-2026): el celular estrena sus propias pantallas, y
// el riesgo de una pantalla nueva es mandar ALGO DISTINTO. Acá vive la llamada
// —la ruta y el cuerpo— una sola vez, y la leen la computadora y el teléfono.
//
// 🔴 NI LA RUTA NI EL PAYLOAD CAMBIARON: son los mismos de `EmpresaList` desde
// el rediseño del 10-sep-2026.
// ─────────────────────────────────────────────────────────────────────────────

export type Descarga = "excel" | "pdf";

/** La ruta del archivo de un proveedor. `excel` va por el ZIP, el papel por el PDF. */
export function rutaDelArchivo(empresa: string, tipo: Descarga): string {
  return `/api/reclamos/proveedor/${encodeURIComponent(empresa)}/${tipo === "excel" ? "export-zip" : "export-pdf"}`;
}

/** La ruta del correo al proveedor. */
export function rutaDelCorreo(empresa: string): string {
  return `/api/reclamos/proveedor/${encodeURIComponent(empresa)}/send-zip`;
}

/** Pide el archivo. Lanza con el mensaje del servidor si algo falla. */
export async function pedirLote(empresa: string, tipo: Descarga, ids: string[]): Promise<Blob> {
  const res = await fetch(rutaDelArchivo(empresa, tipo), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reclamo_ids: ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "No se pudo armar el archivo. Intenta de nuevo.");
  }
  return res.blob();
}

/** Baja el archivo al teléfono o a la computadora. */
export function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export interface EnvioAlProveedorBody {
  to: string;
  cc: string;
  subject: string;
  message: string;
}

export interface RespuestaDelEnvio {
  facturasAdjuntas?: number;
  fotosAdjuntas?: number;
  fotosOmitidas?: number;
}

/** Manda el correo. Mismo cuerpo desde el teléfono y desde la computadora. */
export async function mandarAlProveedor(
  empresa: string,
  ids: string[],
  envio: EnvioAlProveedorBody,
): Promise<RespuestaDelEnvio> {
  const res = await fetch(rutaDelCorreo(empresa), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reclamo_ids: ids,
      to: envio.to,
      cc: envio.cc,
      subject: envio.subject,
      message: envio.message,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "No se pudo enviar el correo.");
  }
  return (await res.json().catch(() => ({}))) as RespuestaDelEnvio;
}

/**
 * Lo que viajó, dicho con números — el mismo texto que ya salía del modal:
 * «Correo enviado a x (con copia) · con 1 factura y 3 fotos».
 */
export function textoDelEnvio(data: RespuestaDelEnvio, to: string, cc: string): string {
  const facturas = Number(data?.facturasAdjuntas || 0);
  const fotos = Number(data?.fotosAdjuntas || 0);
  const piezas: string[] = [];
  if (facturas > 0) piezas.push(`${facturas} factura${facturas === 1 ? "" : "s"}`);
  if (fotos > 0) piezas.push(`${fotos} foto${fotos === 1 ? "" : "s"}`);
  const adjuntos = piezas.length ? ` · con ${piezas.join(" y ")}` : "";
  const omitidas = Number(data?.fotosOmitidas || 0);
  const aviso = omitidas > 0 ? ` · ${omitidas} foto${omitidas === 1 ? "" : "s"} no se pudo incluir` : "";
  const ccAviso = cc ? " (con copia)" : "";
  return `Correo enviado a ${to}${ccAviso}${adjuntos}${aviso}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA CABEZA DEL ESTADO DE CUENTA: QUIÉN COBRA (9-sep-2026).
//
// El papel de Switch abre con la empresa acreedora escrita como en su registro:
// el nombre legal, la identificación, el teléfono y el correo. Ninguno de esos
// cuatro datos existe en la base del sistema — `EMPRESA_KEY_TO_NAME` guarda el
// nombre corto («Fashion Wear»), no el legal («FASHION WEAR, INC»).
//
// 🔴 ES UNA LISTA ESCRITA A MANO, como el amarre de proveedores y el alias de
// vendedores. No se DERIVA del número fiscal de las facturas: la identificación
// está adentro de `numero_fiscal` («FE01 2 000040254-103-278837-…») sin ningún
// separador que diga dónde termina, y sacarla a fuerza de recortar ceros es
// exactamente el «adivinar» que esta casa tiene prohibido.
//
// ⚠️ HOY SOLO SE CONOCE FASHION WEAR, medido del papel que bajó Daniel
// (`ESTADO DE CUENTA City Mall Paso Canoa.pdf`, 8-sep-2026). Las otras cinco
// empresas del grupo están declaradas con el nombre legal en blanco a propósito:
// **lo que no se sabe no se escribe**. Mientras falten, su papel sale con el
// nombre corto de siempre y sin las líneas de identificación, teléfono ni
// correo — nunca con los datos de otra empresa.
//
// Para completarlas hace falta que Daniel dicte, empresa por empresa, las cuatro
// líneas que Switch imprime. Se agregan acá y no hay que tocar nada más.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmpresaFiscal {
  /** El nombre legal tal cual lo imprime Switch. Vacío = todavía no se sabe. */
  legal: string;
  identificacion: string;
  telefono: string;
  correo: string;
}

export const EMPRESA_FISCAL: Readonly<Record<string, EmpresaFiscal>> = Object.freeze({
  // Medida del papel de Switch del 8-sep-2026, línea por línea.
  fashion_wear: {
    legal: "FASHION WEAR, INC",
    identificacion: "40254-103-278837",
    telefono: "",
    correo: "vistanaa@cwpanama.net",
  },
  vistana: { legal: "", identificacion: "", telefono: "", correo: "" },
  fashion_shoes: { legal: "", identificacion: "", telefono: "", correo: "" },
  active_shoes: { legal: "", identificacion: "", telefono: "", correo: "" },
  active_wear: { legal: "", identificacion: "", telefono: "", correo: "" },
  joystep: { legal: "", identificacion: "", telefono: "", correo: "" },
});

/**
 * La cabeza del papel de una empresa. Sin ficha —o con la ficha vacía— devuelve
 * el nombre que la pantalla ya usa y las tres líneas en blanco: el papel sale
 * igual, solo que sin datos que no tenemos.
 */
export function fichaFiscal(empresaKey: string, nombreDeLaPantalla: string): EmpresaFiscal {
  const f = EMPRESA_FISCAL[empresaKey];
  if (!f) return { legal: nombreDeLaPantalla, identificacion: "", telefono: "", correo: "" };
  return { ...f, legal: f.legal || nombreDeLaPantalla };
}

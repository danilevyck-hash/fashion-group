// 🔴 LAS DOS FIRMAS DEL DESPACHO SOBREVIVEN A UNA RECARGA (1-oct-2026).
// Daniel aprobó guardar SOLO las firmas: si el teléfono de bodega recarga (la
// PWA se actualiza sola, se cae el WiFi), firmar otra vez exige volver a buscar
// al transportista. Lo demás del formulario NO se guarda (Daniel, mismo día,
// sobre el borrador: *«son par de clics»*).
//
// · Clave por guía y rol: `guia_firma_<id>_transportista` / `_entregador`, la
//   misma que se usaba hasta el 1-oct-2026.
// · Se restaura sola y SIN aviso; se borra al completar el despacho o a las 24 h.
// · Lo que quedó de antes (la firma sin fecha) se descarta: no se sabe su edad.

export type RolFirma = "transportista" | "entregador";

export const PREFIJO_FIRMA = "guia_firma_";
export const VIDA_FIRMA_MS = 24 * 60 * 60 * 1000;

const clave = (id: string, rol: RolFirma) => `${PREFIJO_FIRMA}${id}_${rol}`;

/** La firma vigente, o null. Una vencida o ilegible se borra al leerla. */
export function leerFirma(id: string, rol: RolFirma, ahora = Date.now()): string | null {
  try {
    const crudo = localStorage.getItem(clave(id, rol));
    if (!crudo) return null;
    const vigente = firmaVigente(crudo, ahora);
    if (!vigente) localStorage.removeItem(clave(id, rol));
    return vigente;
  } catch {
    return null;
  }
}

/** Guarda la firma (o la quita si viene vacía). */
export function guardarFirma(id: string, rol: RolFirma, firma: string | null, ahora = Date.now()): void {
  try {
    if (firma) localStorage.setItem(clave(id, rol), JSON.stringify({ firma, t: ahora }));
    else localStorage.removeItem(clave(id, rol));
  } catch {
    /* sin espacio o sin localStorage: la firma sigue en pantalla */
  }
}

/** Al completar el despacho. */
export function borrarFirmas(id: string): void {
  guardarFirma(id, "transportista", null);
  guardarFirma(id, "entregador", null);
}

/** Barre las firmas de 24 h o más de TODAS las guías (las que nunca se despacharon). */
export function barrerFirmasVencidas(ahora = Date.now()): void {
  try {
    const vencidas: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIJO_FIRMA) && !firmaVigente(localStorage.getItem(k) || "", ahora)) vencidas.push(k);
    }
    for (const k of vencidas) localStorage.removeItem(k);
  } catch {
    /* sin localStorage */
  }
}

function firmaVigente(crudo: string, ahora: number): string | null {
  try {
    const { firma, t } = JSON.parse(crudo) as { firma?: unknown; t?: unknown };
    if (typeof firma !== "string" || !firma || typeof t !== "number") return null;
    return ahora - t < VIDA_FIRMA_MS ? firma : null;
  } catch {
    return null;
  }
}

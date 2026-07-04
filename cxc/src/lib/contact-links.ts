// Helpers para enlaces de contacto clickeables (tel: / mailto:) en mobile.
// Devuelven null cuando el dato no es utilizable, para no renderizar un <a> roto.

/**
 * Normaliza un teléfono panameño a un href `tel:`. Quita separadores; si el
 * número no trae código de país y parece local (7-8 dígitos), antepone +507.
 * Devuelve null si no hay suficientes dígitos.
 */
export function telHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (hasPlus) return `tel:+${digits}`;
  // Local PA (7-8 dígitos) → +507. Si ya trae 11+ dígitos asumimos país incluido.
  if (digits.length <= 8) return `tel:+507${digits}`;
  return `tel:+${digits}`;
}

/**
 * Link de WhatsApp (wa.me) con la misma normalización de teléfono que telHref
 * (+507 para números locales). `text` opcional = mensaje prellenado.
 * Devuelve null si el teléfono no es utilizable.
 */
export function waHref(raw: string | null | undefined, text?: string): string | null {
  const tel = telHref(raw);
  if (!tel) return null;
  const digits = tel.slice("tel:+".length);
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/**
 * Devuelve un href `mailto:` si el valor parece un email; null si no.
 */
export function mailtoHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return `mailto:${v}`;
}

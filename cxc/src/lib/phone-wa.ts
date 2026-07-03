// Normalización de teléfonos de Panamá a formato WhatsApp (wa.me/<digits>).
//
// Los teléfonos del maestro de Switch vienen sucios: "6212-0673,", "62266653",
// "6437-7065", "507 6533 1308", a veces dos números separados por / o ;.
// Regla: quedarnos con el PRIMER número normalizable.
//   - celular Panamá: 8 dígitos (empieza en 6) → prefijo 507
//   - fijo Panamá: 7 dígitos → prefijo 507
//   - ya viene con 507: se respeta
// Devuelve solo dígitos ("50762120673") o null si nada es normalizable.

export function telefonoWhatsApp(...raws: (string | null | undefined)[]): string | null {
  for (const raw of raws) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    // Un campo puede traer varios números ("6212-0673 / 6301-1122").
    for (const parte of s.split(/[\/;,]+/)) {
      const d = parte.replace(/\D/g, "");
      if (!d) continue;
      if (d.length === 11 && d.startsWith("507")) return d;
      if (d.length === 8 || d.length === 7) return "507" + d;
      // 00507... (prefijo internacional escrito a mano)
      if (d.length === 13 && d.startsWith("00507")) return d.slice(2);
    }
  }
  return null;
}

/** Link wa.me listo para <a href>. null si no hay teléfono normalizable. */
export function waLink(...raws: (string | null | undefined)[]): string | null {
  const tel = telefonoWhatsApp(...raws);
  return tel ? `https://wa.me/${tel}` : null;
}

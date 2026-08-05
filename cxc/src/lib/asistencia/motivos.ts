// Motivos de una falta justificada.
//
// ⚠️ Viven acá y NO en el route: Next.js solo permite exportar los handlers
// (GET/POST/…) y unas pocas constantes suyas desde un archivo de ruta —
// cualquier otro export rompe el build con "does not match the required types
// of a Next.js Route".
export const MOTIVOS_JUSTIFICACION = [
  "Vacaciones",
  "Incapacidad",
  "Permiso",
  "Luto",
  "Otro",
] as const;

// Quién puede leer el historial del cliente (`/api/cxc/historial`).
// 🔴 Admin y secretaria (Daniel, 19-nov-2026): el vendedor NO —403—, igual que
// en pantalla, donde no ve el ›. `gerente_boston` tampoco. Solo las 6 del grupo:
// la empresa la valida la ruta.

import { ROLES_HISTORIAL } from "@/lib/cxc/historial-cliente";

export const ROLES_HISTORIAL_GRUPO: string[] = [...ROLES_HISTORIAL];

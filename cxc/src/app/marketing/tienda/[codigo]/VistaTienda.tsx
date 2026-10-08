"use client";

// ============================================================================
// LA VISTA DE UNA TIENDA — quién entra.
//
// 🔴 Desde el 23-sep-2026 (Tiendas y Marcas) la ficha es UNA lista por fecha
// con facturas + muebles + pagos de impulsadora, y editar y anular viven acá
// (`FichaTienda`). La vista del 22-sep-2026 (una tabla por marca) se borró el
// 8-oct-2026.
//
// Este archivo es el ÚNICO que llama `useAuth` para esta pantalla: contabilidad
// entra a MIRAR (`ROLES_MARKETING`); quién escribe lo decide cada pantalla
// con `puedeEscribirMarketing(role)`.
// ============================================================================

import { useAuth } from "@/lib/hooks/useAuth";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import FichaTienda from "./FichaTienda";

export default function VistaTienda({ codigo }: { codigo: string }) {
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: [...ROLES_MARKETING],
  });
  if (!authChecked) return null;
  return <FichaTienda codigo={codigo} role={role} />;
}

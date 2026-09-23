"use client";

// ============================================================================
// LA VISTA DE UNA TIENDA — quién entra, y cuál de las dos pantallas.
//
// 🔴 Desde el 23-sep-2026 (Tiendas y Marcas) la ficha es UNA lista por fecha
// con facturas + muebles + pagos de impulsadora, y editar y anular viven acá
// (`FichaTienda`). Con `MARKETING_TIENDAS_Y_MARCAS` en `false`, la vista del
// 22-sep-2026 (`VistaTiendaAnterior`), una tabla por marca, intacta.
//
// Este archivo es el ÚNICO que llama `useAuth` para esta pantalla: contabilidad
// entra a MIRAR (`ROLES_MARKETING`); quién escribe lo decide cada pantalla
// con `puedeEscribirMarketing(role)`.
// ============================================================================

import { useAuth } from "@/lib/hooks/useAuth";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { MARKETING_TIENDAS_Y_MARCAS } from "@/lib/marketing/tiendas-y-marcas";
import FichaTienda from "./FichaTienda";
import VistaTiendaAnterior from "./VistaTiendaAnterior";

export default function VistaTienda({ codigo }: { codigo: string }) {
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: [...ROLES_MARKETING],
  });
  if (!authChecked) return null;
  if (!MARKETING_TIENDAS_Y_MARCAS) return <VistaTiendaAnterior codigo={codigo} />;
  return <FichaTienda codigo={codigo} role={role} />;
}

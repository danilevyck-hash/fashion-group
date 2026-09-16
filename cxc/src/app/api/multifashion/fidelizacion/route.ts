// Fidelización ACS — segmentos de clientes + estado del 5% + teléfono WhatsApp.
//
// 🔑 LA CUENTA NO VIVE ACÁ (16-sep-2026). Quién es cliente, cuántas veces vino,
// cuándo fue la última, cuánto compró y en qué segmento cae lo decide
// `src/lib/multifashion/clientes-universo.ts` (módulo PURO), y las dos lecturas
// paginadas viven en `clientes-lectura.ts`. Estaba todo escrito adentro de este
// handler; se sacó cuando la pestaña Clientes pasó a leer el MISMO universo,
// para que no naciera una segunda definición de «cliente identificado».
// **Medido antes y después contra producción: las cuatro tarjetas y las filas
// de `clientes[]` salen idénticas.**
//
// Fuentes (pobladas por el cron acs-fidelizacion):
//   - switch_clientes (american_classic): registro (raw_data.fechaCreacion),
//     teléfono/celular → wa.me normalizado (lib phone-wa).
//   - switch_facturas (american_classic, cliente identificado): visitas (días
//     distintos con compra), última compra, uso del 5% (descuento_global_pct=5;
//     regla: el 5% SIEMPRE va como descuento global) y el monto comprado.
//     ⚠️ Visitas y última compra cuentan SOLO los comprobantes «Factura», igual
//     que siempre; el monto mira todos porque la nota de crédito RESTA.
//
// Segmentos (hoy en zona América/Panamá):
//   frecuentes      2+ visitas en los últimos 90 días
//   nuevos_mes      registrados (fechaCreacion) en el mes en curso
//   dormidos        con compras pero la última hace 60+ días
//   cinco_pendiente registrados sin segunda visita (el incentivo del 5%)
//
// Estado 5% por cliente: "usado" (alguna factura con global=5) ·
// "disponible" (registrado sin usarlo) · null (no registrado / huérfano).
//
// VENTANA gerente_acs: esta ruta NO acepta NINGÚN parámetro de fecha — es un
// snapshot de "hoy" (segmentos calculados contra la fecha de Panamá del server).
// Por eso es la única de /api/multifashion/* sin clamp de ventana, y está en la
// lista de excepciones del candado src/__tests__/lib/multifashion-ventana-
// gerente.test.ts. Si algún día acepta `desde`/`hasta`, hay que acotarla.
//
// Mostrador (cliente_switch_id=1) y nombres genéricos excluidos de todo.
// Si la migración 20260704090000 aún no corrió (columna descuento_global_pct
// ausente), degrada: detalle_activo=false y nadie aparece como "usado".
//
// ORDEN DE PAGINACIÓN (12-ago-2026): las dos lecturas van con `.order("id")`,
// único y estable. Paginar SIN orden es el peor disfraz del bug de
// `db-max-rows`: con filas empatadas PostgREST puede repetir o saltear filas
// entre páginas y, como acá todo se AGREGA, un salteo se ve como un número más
// chico, sin error y sin señal. El detalle vive en `clientes-lectura.ts`.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerUniversoDeClientes } from "@/lib/multifashion/clientes-lectura";
import { armarUniverso } from "@/lib/multifashion/clientes-universo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  try {
    const hoy = hoyPanama();
    const { registrados, facturas, detalleActivo } = await leerUniversoDeClientes();
    const { clientes, cards } = armarUniverso(registrados, facturas, hoy);
    return NextResponse.json({ hoy, detalle_activo: detalleActivo, cards, clientes });
  } catch (err) {
    console.error("[fidelizacion]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

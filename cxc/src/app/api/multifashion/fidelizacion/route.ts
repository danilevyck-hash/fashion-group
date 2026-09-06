// Fidelización ACS — segmentos de clientes + estado del 5% + teléfono WhatsApp.
//
// Fuentes (pobladas por el cron acs-fidelizacion):
//   - switch_clientes (american_classic): registro (raw_data.fechaCreacion),
//     teléfono/celular → wa.me normalizado (lib phone-wa).
//   - switch_facturas (american_classic, tipo Factura, cliente identificado):
//     visitas (días distintos con compra), última compra, y uso del 5%
//     (descuento_global_pct = 5; regla: el 5% SIEMPRE va como descuento global).
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

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { waLink } from "@/lib/phone-wa";

export const dynamic = "force-dynamic";

const EMPRESA_KEY = "american_classic";
const MOSTRADOR_ID = 1;
const GENERICOS = new Set(["CONTADO", "CONSUMIDOR FINAL", "VENTAS", "VENTAS LOCALES"]);

/** Misma normalización de identidad que el RPC del ranking (TRIM + colapsa espacios). */
const normNombre = (s: unknown): string =>
  String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();

const addDays = (isoDay: string, days: number): string =>
  new Date(new Date(`${isoDay}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

/**
 * ORDEN DE PAGINACIÓN (12-ago-2026). Esta ruta paginaba SIN `.order()`, que es
 * el peor disfraz del bug de `db-max-rows`: con filas empatadas PostgREST puede
 * repetir o saltear filas entre páginas, y como acá todo se AGREGA, un salteo
 * se ve como un número más chico — sin error y sin señal. `switch_facturas` de
 * ACS ya está en 1.273 filas, o sea que la segunda página se pide de verdad.
 *
 * Se ordena por `id` (uuid PK, único y estable) en las dos lecturas. NO se pisa
 * ningún orden de negocio: esta ruta no tiene uno. `clientes[]` no se presenta
 * en el orden en que sale de acá — el único consumidor
 * (ClientesMultifashionSubtab) lo convierte en un Map por `nombre_norm` y el
 * orden de la lista lo pone el ranking de retail. Lo único que el orden decide
 * es el desempate de `nombreFactura` en los huérfanos (el primer
 * `cliente_nombre` no nulo gana); hoy eso ya era arbitrario y ahora es
 * determinista. Medido contra producción: cards y las 953 filas de `clientes`
 * dan IDÉNTICO antes y después.
 */

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  try {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
    const corte90 = addDays(hoy, -90);
    const corte60 = addDays(hoy, -60);
    const mesActual = hoy.slice(0, 7);

    // ── Directorio de clientes registrados ─────────────────────────────────
    const registrados = await leerTodoPaginado<{
      cliente_switch_id: number; nombre: string | null; telefono: string | null;
      celular: string | null; raw_data: { fechaCreacion?: string } | null;
    }>("switch_clientes (fidelización ACS)", (pedirCount, desde, hasta) =>
      supabaseServer.from("switch_clientes")
        .select(
          "cliente_switch_id, nombre, telefono, celular, raw_data",
          pedirCount ? { count: "exact" } : {},
        )
        .eq("empresa_key", EMPRESA_KEY)
        .neq("cliente_switch_id", MOSTRADOR_ID)
        .order("id", { ascending: true })
        .range(desde, hasta)
    );

    // ── Facturas de clientes identificados (visitas + uso del 5%) ──────────
    interface FacturaRow { cliente_switch_id: number; cliente_nombre: string | null; fecha: string; descuento_global_pct?: number | null }
    let detalleActivo = true;
    let facturas: FacturaRow[];
    try {
      facturas = await leerTodoPaginado<FacturaRow>(
        "switch_facturas (fidelización ACS)",
        (pedirCount, desde, hasta) =>
          supabaseServer.from("switch_facturas")
            .select(
              "cliente_switch_id, cliente_nombre, fecha, descuento_global_pct",
              pedirCount ? { count: "exact" } : {},
            )
            .eq("empresa_key", EMPRESA_KEY)
            .eq("tipo_comprobante", "Factura")
            .not("cliente_switch_id", "is", null)
            .neq("cliente_switch_id", MOSTRADOR_ID)
            .order("id", { ascending: true })
            .range(desde, hasta),
      );
    } catch (err) {
      // Migración pendiente (columna ausente) → degradar sin uso del 5%.
      // `leerTodoPaginado` prefija la etiqueta pero conserva el mensaje de
      // PostgREST, así que el nombre de la columna sigue estando en el texto.
      if (!(err instanceof Error && /descuento_global_pct/.test(err.message))) throw err;
      detalleActivo = false;
      facturas = await leerTodoPaginado<FacturaRow>(
        "switch_facturas (fidelización ACS, pre-DDL)",
        (pedirCount, desde, hasta) =>
          supabaseServer.from("switch_facturas")
            .select(
              "cliente_switch_id, cliente_nombre, fecha",
              pedirCount ? { count: "exact" } : {},
            )
            .eq("empresa_key", EMPRESA_KEY)
            .eq("tipo_comprobante", "Factura")
            .not("cliente_switch_id", "is", null)
            .neq("cliente_switch_id", MOSTRADOR_ID)
            .order("id", { ascending: true })
            .range(desde, hasta),
      );
    }

    // Agregación por cliente: días con compra, última compra, uso del 5%.
    interface Agg { dias: Set<string>; ultima: string; uso5: boolean; nombreFactura: string | null }
    const porCliente = new Map<number, Agg>();
    for (const f of facturas) {
      const dia = String(f.fecha).slice(0, 10);
      const a = porCliente.get(f.cliente_switch_id) ?? { dias: new Set(), ultima: "", uso5: false, nombreFactura: null };
      a.dias.add(dia);
      if (dia > a.ultima) a.ultima = dia;
      if (Number(f.descuento_global_pct) === 5) a.uso5 = true;
      if (!a.nombreFactura && f.cliente_nombre) a.nombreFactura = f.cliente_nombre;
      porCliente.set(f.cliente_switch_id, a);
    }

    // ── Clientes: registrados + huérfanos (con facturas pero sin registro) ──
    interface ClienteFidel {
      cliente_switch_id: number;
      nombre: string;
      nombre_norm: string;
      telefono_wa: string | null;
      registrado: boolean;
      fecha_registro: string | null;
      visitas: number;
      visitas_90d: number;
      ultima_compra: string | null;
      estado5: "disponible" | "usado" | null;
      frecuente: boolean;
      dormido: boolean;
      nuevo_mes: boolean;
      cinco_pendiente: boolean;
    }
    const clientes: ClienteFidel[] = [];
    const vistos = new Set<number>();

    for (const r of registrados) {
      const nombre = String(r.nombre ?? "").trim();
      if (!nombre || GENERICOS.has(normNombre(nombre))) continue;
      vistos.add(r.cliente_switch_id);
      const a = porCliente.get(r.cliente_switch_id);
      const visitas = a?.dias.size ?? 0;
      const visitas90 = a ? [...a.dias].filter((d) => d >= corte90).length : 0;
      const ultima = a?.ultima || null;
      const fechaRegistro = String(r.raw_data?.fechaCreacion ?? "").slice(0, 10) || null;
      const uso5 = a?.uso5 ?? false;
      clientes.push({
        cliente_switch_id: r.cliente_switch_id,
        nombre,
        nombre_norm: normNombre(nombre),
        telefono_wa: waLink(r.telefono, r.celular),
        registrado: true,
        fecha_registro: fechaRegistro,
        visitas,
        visitas_90d: visitas90,
        ultima_compra: ultima,
        estado5: uso5 ? "usado" : "disponible",
        frecuente: visitas90 >= 2,
        dormido: visitas > 0 && ultima !== null && ultima < corte60,
        nuevo_mes: fechaRegistro !== null && fechaRegistro.slice(0, 7) === mesActual,
        cinco_pendiente: visitas <= 1 && !uso5,
      });
    }
    // Huérfanos: facturados con id pero fuera del directorio (residual conocido).
    for (const [cid, a] of porCliente) {
      if (vistos.has(cid)) continue;
      const nombre = String(a.nombreFactura ?? "").trim();
      if (!nombre || GENERICOS.has(normNombre(nombre))) continue;
      const visitas90 = [...a.dias].filter((d) => d >= corte90).length;
      clientes.push({
        cliente_switch_id: cid,
        nombre,
        nombre_norm: normNombre(nombre),
        telefono_wa: null,
        registrado: false,
        fecha_registro: null,
        visitas: a.dias.size,
        visitas_90d: visitas90,
        ultima_compra: a.ultima || null,
        estado5: null,
        frecuente: visitas90 >= 2,
        dormido: a.dias.size > 0 && a.ultima < corte60,
        nuevo_mes: false,
        cinco_pendiente: false,
      });
    }

    const cards = {
      frecuentes: clientes.filter((c) => c.frecuente).length,
      nuevos_mes: clientes.filter((c) => c.nuevo_mes).length,
      dormidos: clientes.filter((c) => c.dormido).length,
      cinco_pendiente: clientes.filter((c) => c.registrado && c.cinco_pendiente).length,
    };

    return NextResponse.json({ hoy, detalle_activo: detalleActivo, cards, clientes });
  } catch (err) {
    console.error("[fidelizacion]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

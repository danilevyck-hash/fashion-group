import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const BASE_SYSTEM_PROMPT = `Eres el asistente de inteligencia de negocios de Fashion Group Panamá, un grupo de distribución de moda.

## Empresas del Grupo
1. Vistana — distribuye Calvin Klein
2. Fashion Wear — ropa de moda
3. Fashion Shoes — calzado de moda
4. Active Shoes — calzado deportivo
5. Active Wear — distribuye Reebok
6. Joystep — distribuye Joybees
7. Confecciones Boston — confección
8. Multifashion — multimarca

## Sistema
- ERP: Switch Soft
- Año fiscal: calendario (enero–diciembre)
- Módulos del sistema interno: CxC (cuentas por cobrar), Ventas, Guías de despacho, Reclamos, Cheques, Caja Menuda, Préstamos a empleados, Directorio de clientes

## Tu rol
- Ayudas a directores y administradores a entender datos de ventas, cuentas por cobrar, reclamos y operaciones.
- Respondes en español.
- Sé conciso y directo.
- Si no tienes datos específicos, dilo claramente en vez de inventar.
- Usa formato con bullets o tablas cuando ayude a la claridad.
- Cuando cites cifras, siempre indica que son datos del sistema actualizados a la fecha mostrada.`;

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchSystemData(baseUrl: string, cookie: string | null): Promise<string> {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;

  const [statsRes, cxcRes, reebokRes] = await Promise.all([
    fetch(`${baseUrl}/api/home-stats`, { headers }).catch(() => null),
    fetch(`${baseUrl}/api/cxc-summary`, { headers }).catch(() => null),
    fetch(`${baseUrl}/api/catalogo/reebok/stats`, { headers }).catch(() => null),
  ]);

  const stats = statsRes?.ok ? await statsRes.json() : null;
  const cxc = cxcRes?.ok ? await cxcRes.json() : null;
  const reebok = reebokRes?.ok ? await reebokRes.json() : null;

  if (!stats && !cxc && !reebok) return "";

  const fecha = new Date().toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });
  let block = `\n\n## Datos actuales del sistema (${fecha})`;

  if (stats) {
    block += `\n### KPIs
- Ventas mes actual: $${fmt(stats.ventasMes || 0)}${stats.ventasPrev ? ` (mes anterior: $${fmt(stats.ventasPrev)})` : ""}
- Reclamos abiertos: ${stats.reclamosPendientes ?? 0}${stats.reclamosViejos ? ` (${stats.reclamosViejos} con más de 30 días)` : ""}
- Reclamos resueltos este mes: ${stats.reclamosResueltosEsteMes ?? 0}
- CxC total: $${fmt(stats.cxcTotal || 0)} / vencida (>120 días): $${fmt(stats.cxcVencida || 0)}
- Cheques que vencen esta semana: ${stats.vencenEstaSemana ?? 0}${stats.vencenHoy ? ` (${stats.vencenHoy} vencen hoy)` : ""}
- Total pendiente en cheques: $${fmt(stats.chequesTotalPendiente || 0)}
- Guías de transporte este mes: ${stats.guiasEsteMes ?? 0}
- Total clientes en directorio: ${stats.totalClientes ?? 0}
- Préstamos pendientes: ${stats.prestamosPendientes ?? 0}`;
    if (stats.cxcStale) {
      block += `\n- ⚠ Datos de CxC podrían estar desactualizados (última carga: ${stats.lastUpload || "desconocida"})`;
    }
  }

  if (cxc) {
    block += `\n### CxC por composición
- Total cartera: $${fmt(cxc.totalCxc || 0)} (${cxc.empresasCount ?? 0} empresas)
- Corriente (0-90 días): ${cxc.corrientePct ?? 0}%
- Vigilancia (91-120 días): ${cxc.vigilanciaPct ?? 0}%
- Vencida (>120 días): ${cxc.vencidoPct ?? 0}% ($${fmt(cxc.vencidoMas121 || 0)})
- Clientes críticos (con saldo vencido >120d): ${cxc.clientesCriticos ?? 0}`;
  }

  if (reebok) {
    const p = reebok.products || {};
    const inv = reebok.inventory || {};
    const o = reebok.orders || {};

    block += `\n### Catálogo Reebok
- Productos activos: ${p.active ?? 0} de ${p.total ?? 0} total${p.onSale ? ` (${p.onSale} en oferta)` : ""}
- Productos sin stock: ${p.noStock ?? 0}
- Stock total (unidades): ${inv.totalStock ?? 0}`;

    // Categories
    if (p.categories && Object.keys(p.categories).length > 0) {
      block += `\n- Categorías: ${Object.entries(p.categories as Record<string, number>).map(([k, v]) => `${k} (${v})`).join(", ")}`;
    }

    block += `\n- Pedidos totales: ${o.total ?? 0}`;
    block += `\n- Pedidos este mes: ${o.thisMonth ?? 0} por $${fmt(o.thisMonthTotal || 0)}`;

    // Status breakdown
    if (o.byStatus && Object.keys(o.byStatus).length > 0) {
      block += `\n- Por estado: ${Object.entries(o.byStatus as Record<string, number>).map(([st, n]) => `${st}: ${n}`).join(", ")}`;
    }

    // Top clients
    if (o.topClients?.length > 0) {
      block += `\n- Top clientes Reebok:`;
      for (const c of o.topClients) {
        block += `\n  - ${c.name}: ${c.orders} pedido${c.orders !== 1 ? "s" : ""}, $${fmt(c.total)}`;
      }
    }
  }

  return block;
}

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "API key no configurada" }, { status: 500 });
    }

    // Fetch live system data server-side
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const baseUrl = `${proto}://${host}`;
    const cookie = req.headers.get("cookie");

    const systemData = await fetchSystemData(baseUrl, cookie);
    const systemPrompt = BASE_SYSTEM_PROMPT + systemData;

    const client = new Anthropic({ apiKey });

    const messages: Anthropic.MessageParam[] = [
      ...(Array.isArray(history) ? history : []),
      { role: "user" as const, content: message },
    ];

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Error en streaming" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

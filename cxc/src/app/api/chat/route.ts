import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const SYSTEM_PROMPT = `Eres el asistente de inteligencia de negocios de Fashion Group Panamá, un grupo de distribución de moda.

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
- Usa formato con bullets o tablas cuando ayude a la claridad.`;

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

    const client = new Anthropic({ apiKey });

    const messages: Anthropic.MessageParam[] = [
      ...(Array.isArray(history) ? history : []),
      { role: "user" as const, content: message },
    ];

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
        } catch (err) {
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

// "Duplicar y corregir" un pedido ya enviado a Switch: clon NUEVO en borrador
// con reemplaza_a → original. Lógica en el handler compartido; la marca se
// valida aquí contra la config.

import { NextRequest, NextResponse } from "next/server";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { handleDuplicarPedido } from "@/lib/catalogo/duplicar-pedido";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { marca: string; id: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });
  return handleDuplicarPedido(req, cfg.marca, params.id);
}

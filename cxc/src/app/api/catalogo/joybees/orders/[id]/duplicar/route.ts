// "Duplicar y corregir" un pedido Joybees ya enviado a Switch: clon NUEVO en
// borrador con reemplaza_a → original. Lógica en el handler compartido.

import { NextRequest } from "next/server";
import { handleDuplicarPedido } from "@/lib/catalogo/duplicar-pedido";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handleDuplicarPedido(req, "joybees", params.id);
}

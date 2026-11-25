"use client";

// El pedido abierto del flujo simplificado, con «Muestras» (24-nov-2026). El
// gancho vive aquí para que `PedidosView` no lo llame de forma condicional.
import type { ComponentProps } from "react";
import PedidoBultos from "./PedidoBultos";
import { useMuestrasDelPedido } from "./MuestrasDelPedido";
import { MUESTRAS_2026_11 } from "@/lib/guias/muestras";

type Props = Omit<ComponentProps<typeof PedidoBultos>, "muestras"> & {
  /** Bodega y admin piden y reclaman; el servidor decide igual. */
  puedePedirMuestras: boolean;
  estadoPedido: string | null;
};

export default function PedidoAbierto({ puedePedirMuestras, estadoPedido, ...resto }: Props) {
  const muestras = useMuestrasDelPedido(resto.pedido, MUESTRAS_2026_11, puedePedirMuestras, estadoPedido);
  return <PedidoBultos {...resto} muestras={MUESTRAS_2026_11 ? muestras : null} />;
}

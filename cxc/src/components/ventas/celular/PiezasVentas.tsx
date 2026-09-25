"use client";

// Las piezas de Ventas en el celular son las COMPARTIDAS: viven en
// `components/celular/Piezas.tsx` porque Comisiones dibuja con las mismas.
// Este archivo solo les pone el nombre con el que Ventas las llama.

export {
  PantallaCel as PantallaVentas,
  TituloCel as TituloVentas,
  RotuloCel as RotuloVentas,
  GrupoCel as GrupoVentas,
  TiraDeCuatro,
  Segmentado,
  BotonPuntos,
  HojaCel,
  PantallaQueSube,
  colorDelSigno,
  colorDelTono,
  ESTILO_COLCHON_DERECHA,
  type NumeroDeLaTiraVista,
  type OpcionDeHoja,
} from "@/components/celular/Piezas";

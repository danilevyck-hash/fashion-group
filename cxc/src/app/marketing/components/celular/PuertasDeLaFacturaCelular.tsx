"use client";

// ============================================================================
// 4c · «＋ Gasto» EN EL CELULAR: LAS TRES PUERTAS DE LA FACTURA (24-sep-2026).
//
//   Escanear con la cámara   tomas la foto y se llena solo          ›
//   Elegir el PDF            de Archivos o del correo               ›
//   Escribirlo a mano        sin papel                              ›
//
//   LO QUE SE LLENA SOLO
//   Proveedor · número · fecha · concepto · subtotal · ITBMS
//
// Daniel, textual: *«que se pueda meter un gasto por el teléfono así se
// escanea»*. Una puerta para cada caso: en la computadora Daniela elige el PDF
// que le llegó por correo (así entraron 95 de las 97 facturas); en el teléfono
// le toma la foto. Las dos terminan en la MISMA pantalla de revisar.
//
// 🔑 EL LECTOR YA EXISTÍA: `POST /api/marketing/ia/leer-factura` devuelve los
// seis campos. Escanear no fue construir un lector — fue abrirle la cámara al
// que ya existe (`capture="environment"`, la de atrás, la que mira al papel) y
// enseñarle a leer fotos, no solo PDF.
//
// 🔴 NADA DE LO QUE SE GUARDA CAMBIA: la foto se cuelga como `foto_factura`
// por el MISMO camino de siempre y el POST de la factura es el de siempre.
// ============================================================================

import { PUERTAS_DE_LA_FACTURA, type PuertaDeLaFactura } from "@/lib/marketing/celular";
import { FilaCelular, GrupoCelular, RotuloDeGrupo } from "./PiezasCelular";

interface Props {
  onElegir: (p: PuertaDeLaFactura) => void;
  /** Mientras el lector trabaja: la puerta no se toca dos veces. */
  leyendo: boolean;
  /** El nombre del archivo ya elegido, si lo hay. */
  archivo?: string | null;
  onQuitar?: () => void;
}

export default function PuertasDeLaFacturaCelular({ onElegir, leyendo, archivo, onQuitar }: Props) {
  if (leyendo) {
    return (
      <GrupoCelular sinMargen className="mt-4">
        <FilaCelular titulo="Leyendo la factura…" detalle="Los campos se llenan solos. Revísalos antes de guardar." />
      </GrupoCelular>
    );
  }

  if (archivo) {
    return (
      <GrupoCelular sinMargen className="mt-4">
        <FilaCelular
          data-fila="archivo-elegido"
          titulo={archivo}
          detalle="listo para guardarse con el gasto"
          monto={onQuitar ? "Quitar" : undefined}
          onClick={onQuitar}
          ariaLabel="Quitar el archivo"
        />
      </GrupoCelular>
    );
  }

  return (
    <>
      <GrupoCelular sinMargen className="mt-4">
        {PUERTAS_DE_LA_FACTURA.map((p) => (
          <FilaCelular
            key={p.clave}
            data-fila={`puerta-factura-${p.clave}`}
            titulo={p.titulo}
            detalle={p.detalle}
            monto="›"
            onClick={() => onElegir(p.clave)}
            ariaLabel={p.titulo}
          />
        ))}
      </GrupoCelular>
      <RotuloDeGrupo>Lo que se llena solo</RotuloDeGrupo>
      <p className="px-4 pb-1 text-[14px] text-gray-500">
        Proveedor · número · fecha · concepto · subtotal · ITBMS — los seis que el sistema ya lee del
        PDF.
      </p>
    </>
  );
}

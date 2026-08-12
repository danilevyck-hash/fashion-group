"use client";

// Lo que falta en el período ABIERTO de una marca, en UNA línea.
//
// 🔴 SON DOS PAPELES DISTINTOS y no se mezclan. El COMPROBANTE respalda la
// plata y lo lleva todo gasto, impulsadoras incluidas — Daniel, textual:
// *"pero impulsadora tambien necesita comprobante, pero no foto. aunq el
// comprobante sea una foto"*. La FOTO es la de instalación (el letrero puesto,
// el mueble armado) y solo tiene sentido en un gasto con cliente.
//
// El comprobante va en ámbar porque es lo serio; la foto, en gris. La
// jerarquía va por color, no por tamaño ni por orden.
//
// Con los dos en cero NO se dibuja nada: un aviso que dice "todo bien" es
// ruido. Vive en el NIVEL 3 (el detalle del período abierto) desde el
// rediseño de tres niveles — antes estaba en la tarjeta del inicio.

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export default function LoQueFalta({
  sinComprobante,
  sinFoto,
}: {
  sinComprobante: number;
  sinFoto: number;
}) {
  if (sinComprobante <= 0 && sinFoto <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {sinComprobante > 0 && (
        <span className="text-amber-800">
          {plural(sinComprobante, "gasto", "gastos")} sin comprobante
        </span>
      )}
      {sinFoto > 0 && (
        <span className="text-gray-500">
          {plural(sinFoto, "gasto", "gastos")} sin foto
        </span>
      )}
    </div>
  );
}

"use client";

// Pestaña «Configuración» de Comisiones — a pantalla completa, SOLO admin.
//
// 🩸 Daniel, 3-sep-2026, textual: «¿por qué en card y no como tab en toda la
// pantalla normal?». Era un modal («Configurar») que solo mostraba la tasa de
// venta; hoy es el tercer modo del shell, con tarjetas con borde (sin sombra,
// Design System). Desde el 6-sep-2026 son TRES, con el mismo molde:
//
//   1. «Tasas por vendedor»          → comisiones-config/TasasPorVendedor
//   2. «Clientes que no comisionan»  → comisiones-config/ClientesQueNoComisionan
//   3. «Descuentos»                  → comisiones-config/Descuentos
//
// La tercera nació porque `comision_descuentos_fijos` no tenía ninguna pantalla
// —ni alta, ni edición, ni baja— y era la palanca que más plata mueve del
// módulo ($14.157,72 en 2026). Daniel: «sí, minimalista».
//
// 🩸 El archivo se partió en cuatro el mismo día: con la tercera tarjeta adentro
// pasaba las 800 líneas de la casa. Cada tarjeta se lleva su propio post-mortem
// a su archivo; acá solo queda el orden y el aviso de «guardado».
//
// Los números de las comisiones no viven aquí: quien resta es la RPC.

import { useCallback, useState } from "react";
import { TasasPorVendedor } from "./comisiones-config/TasasPorVendedor";
import { ClientesQueNoComisionan } from "./comisiones-config/ClientesQueNoComisionan";
import { Descuentos } from "./comisiones-config/Descuentos";

export function ComisionesConfiguracionView() {
  const [msg, setMsg] = useState<string | null>(null);
  const avisar = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 3000);
  }, []);

  return (
    <div className="space-y-4">
      {msg && <p className="text-xs text-teal-700" role="status">{msg}</p>}
      <TasasPorVendedor onSaved={avisar} />
      <ClientesQueNoComisionan onSaved={avisar} />
      <Descuentos onSaved={avisar} />
    </div>
  );
}

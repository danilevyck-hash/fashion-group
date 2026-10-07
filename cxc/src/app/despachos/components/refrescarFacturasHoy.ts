// ─────────────────────────────────────────────────────────────────────────────
// Al ENTRAR al módulo Guías se dispara, en segundo plano, la lectura corta de
// las facturas de HOY (POST /api/guias/facturas-hoy). El sync programado va
// 6:50/10:00/14:00/18:00 Panamá: sin esto, una factura de las 11:00 no aparece
// en «Facturas del cliente» hasta las 14:00.
//
// Desde el 4-sep-2026 lo llama la LISTA /guias (Daniel: «¿por qué no se puede
// hacer al apretar guías? Prefiero eso.») además de /guias/nueva, que se queda
// para quien entra directo por URL; el acelerador de abajo evita el doble
// disparo. 🔴 Este POST no escribe sobre guías: la regla «la lista NO despacha
// ni edita» sigue intacta y el candado de guias-eliminar-en-la-fila la exige.
//
// FAIL-OPEN Y SIN BLOQUEAR: nadie espera esta llamada; si falla, la pantalla
// muestra lo que hay en la base («hasta las HH:MM») y hay «Buscar otra vez».
// El acelerador de sessionStorage evita hasta el HTTP en las entradas
// repetidas; el server además tiene su cooldown de 10 min por empresa y el
// lock del sync — navegar por el módulo no martilla a Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { GUIAS_ATAJOS_NUEVOS } from "@/lib/guias/atajos-facturas";

const CLAVE = "fg_guias_facturas_hoy_en";
const CADA_MS = 10 * 60 * 1000;

/** Dispara la lectura de las facturas de hoy, a lo sumo una vez cada 10 min. */
export function refrescarFacturasDelDia(): void {
  if (!GUIAS_ATAJOS_NUEVOS) return;
  try {
    const previa = Number(sessionStorage.getItem(CLAVE) || 0);
    if (Date.now() - previa < CADA_MS) return;
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    /* sin sessionStorage se dispara igual: el server tiene su propio cooldown */
  }
  void fetch("/api/guias/facturas-hoy", { method: "POST" }).catch(() => {});
}

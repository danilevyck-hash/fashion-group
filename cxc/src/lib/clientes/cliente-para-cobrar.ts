// ─────────────────────────────────────────────────────────────────────────────
// DE LA FICHA A LA HOJA «COBRAR» — sin dibujar una segunda hoja.
//
// 🔴 «COBRAR» EN LA FICHA ABRE LA MISMA HOJA DEL CXC (5-sep-2026), y «Ver los N
// documentos» abre el MISMO cajón de estado de cuenta. No se dibuja otro: dos
// hojas de cobro son dos que un día dicen cosas distintas sobre la misma plata,
// y la del CXC ya trae sus cuatro salidas (correo con deshacer de 5 s ·
// WhatsApp · copiar · PDF) y su regla de que **se mandan siempre las 6
// empresas**, que vive en el SERVIDOR (`empresasDelEnvio()`), no en la pantalla.
//
// Lo único que hace falta es traducir lo que la ficha ya tiene a la forma que
// esos dos componentes esperan (`ConsolidatedClient`). Eso es este módulo, y es
// PURO: sin base, sin React, testeable con fechas y montos fijos.
//
// 🔴 EL CÓDIGO VIAJA EN CADA EMPRESA. `HojaCobrar` y `EstadoCuentaDrawer` sacan
// el código con `Object.values(client.companies).find(c => c?.codigo)`: si una
// entrada quedara sin `codigo`, el cajón pediría el estado de cuenta de `null`
// y la hoja no podría mandar nada. Se arma con el código del cliente en TODAS.
//
// 🔴 BOSTON NO PUEDE ENTRAR. Las claves salen de `B2B_EMPRESA_KEYS` y se
// descarta cualquier fila de aging que no sea de las 6 — la ficha ya solo abre
// para clientes del grupo, pero esta función es la última puerta antes de que
// un saldo se convierta en un correo al cliente.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConsolidatedClient } from "@/lib/types";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/** Una fila de `switch_estadocuenta_aging` tal como la lee la ficha.
 *  ⚠️ La columna de empresa se llama `company_key` en las vistas de aging. */
export interface FilaAgingCliente {
  company_key: string;
  nombre?: string | null;
  total: number | string | null;
  d0_30?: number | string | null;
  d31_60?: number | string | null;
  d61_90?: number | string | null;
  d91_120?: number | string | null;
  d121_180?: number | string | null;
  d181_270?: number | string | null;
  d271_365?: number | string | null;
  mas_365?: number | string | null;
}

export interface DatosDeContacto {
  codigo: string;
  nombre: string;
  contacto?: string | null;
  email?: string | null;
  telefono?: string | null;
  celular?: string | null;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

const cent = (x: number): number => Math.round(x * 100) / 100;

/**
 * Arma el `ConsolidatedClient` que esperan `HojaCobrar` y `EstadoCuentaDrawer`.
 *
 * ⚠️ Los tramos son EXACTAMENTE los del CXC — `current` = 0-90 · `watch` =
 * 91-120 · `overdue` = 121+ — porque el cuerpo del mensaje que lee el CLIENTE
 * los imprime. Cambiarlos acá haría que la ficha y el CXC le digan al mismo
 * cliente dos antigüedades distintas para la misma deuda.
 */
export function clienteParaCobrar(
  datos: DatosDeContacto,
  filas: FilaAgingCliente[],
): ConsolidatedClient {
  const delGrupo = filas.filter((f) =>
    (B2B_EMPRESA_KEYS as readonly string[]).includes(f.company_key),
  );

  const companies: ConsolidatedClient["companies"] = {};
  let d0_30 = 0, d31_60 = 0, d61_90 = 0, d91_120 = 0, d121_plus = 0, total = 0;

  for (const f of delGrupo) {
    const c121 = n(f.d121_180) + n(f.d181_270) + n(f.d271_365) + n(f.mas_365);
    companies[f.company_key] = {
      // 🔴 El código SIEMPRE, en todas: es de donde lo sacan los dos componentes.
      codigo: datos.codigo,
      nombre: (f.nombre ?? "").trim() || datos.nombre,
      d0_30: n(f.d0_30),
      d31_60: n(f.d31_60),
      d61_90: n(f.d61_90),
      d91_120: n(f.d91_120),
      d121_180: n(f.d121_180),
      d181_270: n(f.d181_270),
      d271_365: n(f.d271_365),
      mas_365: n(f.mas_365),
      total: n(f.total),
    };
    d0_30 += n(f.d0_30);
    d31_60 += n(f.d31_60);
    d61_90 += n(f.d61_90);
    d91_120 += n(f.d91_120);
    d121_plus += c121;
    total += n(f.total);
  }

  // Sin una sola fila de aging el cliente no debe nada, pero la hoja igual
  // tiene que poder abrirse (para mandarle un estado de cuenta en cero, o para
  // que la hoja diga que no hay documentos). Se arma una entrada por empresa
  // con el código adentro y todo en cero.
  if (delGrupo.length === 0) {
    for (const empresa of B2B_EMPRESA_KEYS) {
      companies[empresa] = {
        codigo: datos.codigo,
        nombre: datos.nombre,
        d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0,
        d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0,
        total: 0,
      };
    }
  }

  return {
    nombre_normalized: datos.nombre,
    companies,
    correo: (datos.email ?? "").trim(),
    telefono: (datos.telefono ?? "").trim(),
    celular: (datos.celular ?? "").trim(),
    contacto: (datos.contacto ?? "").trim(),
    total: cent(total),
    current: cent(d0_30 + d31_60 + d61_90),
    watch: cent(d91_120),
    overdue: cent(d121_plus),
    d0_30: cent(d0_30),
    d31_60: cent(d31_60),
    d61_90: cent(d61_90),
    d91_120: cent(d91_120),
    d121_plus: cent(d121_plus),
    hasOverride: false,
  };
}

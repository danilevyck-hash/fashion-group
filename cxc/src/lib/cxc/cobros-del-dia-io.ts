// El +90 de Switch AL MOMENTO, solo para los clientes y empresas que pagaron hoy
// (24-nov-2026, Daniel). Un solo criterio: el número que Switch tiene cuando sale
// el mensaje, nunca la foto de las 4:10 p. m. con el pago restado por cuenta
// propia. Lee `/apicliente/estadocuenta` (la MISMA llamada del sync de la
// cartera) y suma los tramos de Switch de 91 días en adelante.
//
// Sesión de Switch: el cron corre a las 00:00 UTC, a 45 min de `sync-recibos`
// (23:15) y a 60 de las facturas (23:00) — registrado en `SWITCH_CRON_ENTRADAS`
// — y al terminar cierra SOLO sus sesiones (`logoutSwitchSessions`).

import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchClient, logoutSwitchSessions } from "@/lib/switch-api/client";
import { llaveMas90, mas90DeLaRespuesta } from "./cobros-del-dia";

/**
 * `empresa|codigo` → +90 de Switch ahora; `null` si no se pudo leer (sin
 * cliente en el directorio, Switch no contestó o vino sin aging).
 */
export async function leerMas90DeSwitch(
  pares: readonly { empresa: string; codigo: string }[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const porEmpresa = new Map<string, Set<string>>();
  for (const p of pares) {
    out.set(llaveMas90(p.empresa, p.codigo), null);
    porEmpresa.set(p.empresa, (porEmpresa.get(p.empresa) ?? new Set()).add(p.codigo.trim()));
  }
  const empresas = [...porEmpresa.keys()];
  try {
    await Promise.all(
      empresas.map(async (empresa) => {
        const codigos = [...porEmpresa.get(empresa)!];
        const { data, error } = await supabaseServer
          .from("switch_clientes")
          .select("cliente_switch_id, codigo")
          .eq("empresa_key", empresa)
          .in("codigo", codigos)
          .limit(1000);
        if (error) return; // queda «+90 sin actualizar»
        let client: ReturnType<typeof createSwitchClient>;
        try {
          client = createSwitchClient(empresa);
        } catch {
          return; // sin credenciales: queda «+90 sin actualizar»
        }
        // En serie dentro de la empresa: un solo token por usuario.
        for (const fila of data ?? []) {
          try {
            const r = await client.getEstadoCuenta(fila.cliente_switch_id);
            out.set(llaveMas90(empresa, fila.codigo), mas90DeLaRespuesta(r));
          } catch {
            /* queda «+90 sin actualizar» */
          }
        }
      }),
    );
  } finally {
    await logoutSwitchSessions(empresas);
  }
  return out;
}

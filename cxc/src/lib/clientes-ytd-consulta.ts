// ─────────────────────────────────────────────────────────────────────────────
// Lectura de "compras del año" para VARIOS clientes de una vez.
//
// Separado de `clientes-ytd.ts` a propósito: allá vive la DEFINICIÓN (pura, sin
// base, testeable sin credenciales) y acá el acceso a datos. Así el candado de
// la definición corre en el arnés sin levantar un cliente de Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { ventanaAnioPanama, montoFirmado, aCentavos } from "@/lib/clientes-ytd";

interface Par { codigo: string; empresa_key: string; cliente_switch_id: number | null }
interface FilaFactura { empresa_key: string; cliente_switch_id: number; fecha: string; tipo_comprobante: string; total: number | string }

/**
 * Compras del año de VARIOS clientes, en 2 consultas (no una por cliente).
 *
 * Pensada para el listado: se le pasan los ≤50 códigos de la página visible y
 * devuelve un mapa codigo → monto. Los clientes sin compras NO aparecen en el
 * mapa (el que llama decide si eso se muestra como $0 o como vacío).
 *
 * Por qué 2 consultas y no 50: con una por cliente el listado haría 50 viajes a
 * la base por página. Acá va una para el puente de ids y otra para las facturas
 * del año de todos esos ids, paginada con `leerTodoPaginado` — que es
 * obligatorio: PostgREST corta en 1.000 filas EN SILENCIO y una página de 50
 * clientes ya trae ~1.040 facturas (medido). Sin paginar, la columna mostraría
 * de menos sin avisar, que es exactamente el error que no se puede cometer con
 * un número que Daniel va a leer como plata.
 */
export async function comprasDelAnioPorCodigo(
  codigos: string[],
  ahora: Date = new Date(),
): Promise<Map<string, number>> {
  const resultado = new Map<string, number>();
  const codigosUnicos = [...new Set(codigos.filter(Boolean))];
  if (codigosUnicos.length === 0) return resultado;

  const { desde, hasta } = ventanaAnioPanama(ahora);

  // 1. Puente por ID: el par (empresa_key, cliente_switch_id) de cada código.
  const pares = await leerTodoPaginado<Par>(
    "switch_clientes (compras del año del listado)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("switch_clientes")
        .select("codigo, empresa_key, cliente_switch_id", pedirCount ? { count: "exact" } : {})
        .in("codigo", codigosUnicos)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const codigoDePar = new Map<string, string>();
  const ids = new Set<number>();
  for (const p of pares) {
    if (typeof p.cliente_switch_id !== "number") continue;
    codigoDePar.set(`${p.empresa_key}|${p.cliente_switch_id}`, p.codigo);
    ids.add(p.cliente_switch_id);
  }
  if (ids.size === 0) return resultado;

  // 2. Facturas del año de esos ids, sólo empresas B2B.
  const facturas = await leerTodoPaginado<FilaFactura>(
    "switch_facturas (compras del año del listado)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("switch_facturas")
        .select("empresa_key, cliente_switch_id, fecha, tipo_comprobante, total", pedirCount ? { count: "exact" } : {})
        .in("cliente_switch_id", [...ids])
        .in("empresa_key", [...B2B_EMPRESA_KEYS])
        .gte("fecha", desde)
        .lt("fecha", hasta)
        .order("id", { ascending: true })
        .range(from, to),
  );

  for (const f of facturas) {
    // El id de cliente es POR EMPRESA: sin exigir el par exacto, un id que en
    // otra empresa pertenece a otro cliente sumaría acá.
    const codigo = codigoDePar.get(`${f.empresa_key}|${f.cliente_switch_id}`);
    if (!codigo) continue;
    resultado.set(codigo, (resultado.get(codigo) ?? 0) + montoFirmado(f.tipo_comprobante, f.total));
  }

  for (const [codigo, monto] of resultado) resultado.set(codigo, aCentavos(monto));
  return resultado;
}

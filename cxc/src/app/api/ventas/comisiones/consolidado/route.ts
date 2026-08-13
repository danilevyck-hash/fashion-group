/**
 * Comisiones B2B de TODAS las empresas que comisionan, en UNA sola petición.
 *
 * 🩸 POR QUÉ EXISTE (12-ago-2026). La vista "Todas las empresas" —que es la que
 * abre por defecto— hacía `Promise.all` sobre las 5 empresas con un segundo
 * `fetch` anidado adentro. Medido contra el build de producción, una sola
 * apertura de /comisiones:
 *
 *     /api/ventas/comisiones            ×5   (las 5 en el mismo milisegundo)
 *     /api/ventas/comisiones/descuentos ×5
 *     ─────────────────────────────────────────────────────────────
 *     10 peticiones · 4.014 ms de red sumados · 15 consultas a la base
 *
 * Cada `/comisiones` corre su propio `comision_b2b_v5` (3 tablas grandes), y
 * cada `/descuentos` sus 2 consultas — pero el `empresa_key` de los descuentos
 * es solo un `.eq()` de filtro, así que 10 de esas 15 consultas eran
 * innecesarias por completo.
 *
 * Acá el navegador hace **1 llamada** y la base recibe **7 consultas** (5 RPC +
 * 2 de descuentos).
 *
 * ⚠️ NINGÚN NÚMERO CAMBIA, y por construcción: se llama al MISMO
 * `comision_b2b_v5`, una vez por empresa y con los mismos argumentos, y los
 * descuentos salen de la MISMA función que usa el endpoint por empresa
 * (`lib/comisiones/descuentos`). La respuesta trae, empresa por empresa,
 * exactamente la forma que el cliente ya armaba a mano.
 *
 * ⚠️ NO se reemplaza `comision_b2b_v5` por una RPC nueva que agrupe las 5 en
 * una: eso pide una migración (que corre Daniel a mano) y es la ruta del dinero.
 * Las 5 RPC siguen siendo 5 — lo que se elimina son los 5 viajes de red del
 * navegador y las 8 consultas de descuentos de más.
 *
 * GET ?year=&mes= → { empresas: [{ empresa_key, vendedores[], porVendedor }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { leerDescuentosEfectivos, totalPorVendedor } from "@/lib/comisiones/descuentos";

export const dynamic = "force-dynamic";

interface ApiVendedor {
  vendedor: string;
  base: number;
  base_cobro: number;
  comision_total: number;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const year = parseInt(sp.get("year") ?? "", 10);
  const mes = parseInt(sp.get("mes") ?? "", 10);

  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  // Las 5 RPC en paralelo (mismo trabajo de base que antes) + UNA lectura de
  // descuentos para las 5 empresas.
  //
  // Los descuentos fallan ABIERTO, igual que antes: si su lectura se cae, la
  // pantalla sale con descuentos en 0 en vez de quedar en blanco. Un total de
  // comisiones visible vale más que una pantalla vacía.
  const [porEmpresa, descuentos] = await Promise.all([
    Promise.all(
      EMPRESAS_COMISIONAN.map(async (empresa) => {
        const { data, error } = await supabaseServer.rpc("comision_b2b_v5", {
          p_empresa_key: empresa,
          p_year: year,
          p_mes: mes,
        });
        if (error) throw new Error(`${empresa}: ${error.message}`);
        const resp = (data ?? {}) as { empresa_key?: string; vendedores?: ApiVendedor[] };
        return {
          // La key PEDIDA, no la que devuelve la RPC: es con la que se filtran
          // los descuentos y con la que la tabla arma sus columnas. Que sean la
          // misma no debe depender de dos fuentes.
          empresa: empresa as string,
          empresa_key: resp.empresa_key ?? empresa,
          vendedores: resp.vendedores ?? [],
        };
      }),
    ).catch((e: unknown) => e instanceof Error ? e : new Error(String(e))),
    leerDescuentosEfectivos(EMPRESAS_COMISIONAN, year, mes).catch(() => []),
  ]);

  if (porEmpresa instanceof Error) {
    return NextResponse.json({ error: porEmpresa.message }, { status: 500 });
  }

  return NextResponse.json({
    empresas: porEmpresa.map(({ empresa, empresa_key, vendedores }) => ({
      empresa_key,
      vendedores,
      porVendedor: totalPorVendedor(descuentos, empresa),
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_BOSTON, rolesModuloBoston } from "@/lib/boston/rol";

// ─────────────────────────────────────────────────────────────────────────────
// LOS CLIENTES DE CONFECCIONES BOSTON.
//
// 🔴 POR QUÉ NO SE REUSA `/clientes` (el Directorio). No es que sea caro: es
// que ese módulo está construido para NO tener a Boston, en tres capas
// distintas y a propósito.
//
//   1. `mundos.ts` — la regla de Daniel del 30-jul-2026, textual: *"los
//      clientes de multifashion q vivan solo en el modulo de multifashion. en
//      cxc de boston que este como hoy en dia, solo viven ahi"*.
//      `soloClientesDelGrupo()` deja pasar SOLO las 6 del grupo.
//   2. `/api/clientes` y el SSR de `/clientes` leen por `leerClientesDelGrupo`,
//      que ya viene filtrado. No aceptan `?empresa=`.
//   3. La ficha `/clientes/[codigo]` arma su desglose con `B2B_EMPRESA_KEYS`
//      (las 6): Boston no aparece ni cuando el cliente existe en las dos.
//
// Meterle a Boston por ahí habría sido aflojar el filtro que separa las dos
// carteras — o sea romper la regla vieja para cumplir la nueva. La puerta va
// aparte, igual que `/api/cxc/boston`.
//
// ⚠️ `clientes_master` NO SIRVE ACÁ, y eso decide el diseño: no tiene columna de
// empresa (una fila por NOMBRE, no por empresa). La pertenencia solo existe en
// `switch_clientes`, que es el puente `(empresa_key, codigo)`. Así que la fuente
// es `switch_clientes` acotada a Boston: por construcción no puede devolver un
// cliente del grupo, ni siquiera uno que exista en las dos.
//
// ═══ QUÉ DEVUELVE, Y POR QUÉ NO LOS 4.911 ═══════════════════════════════════
//
// Boston tiene 4.911 clientes en el maestro de Switch. Mandarlos todos son
// ~600 KB por visita contra una base compute Micro que ya se cayó tres veces en
// una semana — y nadie lee una lista de 4.911.
//
//   · sin `?q=` → los que TIENEN SALDO ABIERTO (391), que son con los que se
//     trabaja, ordenados por lo que deben. La pantalla lo dice con todas las
//     letras: no simula ser el maestro entero.
//   · con `?q=` → búsqueda por nombre o código contra los 4.911, tope 100.
//
// La plata sale de `switch_estadocuenta_aging_boston` — la MISMA vista de la
// pestaña CXC, que es disjunta de la del grupo por construcción. No hay una
// segunda definición de "lo que debe un cliente de Boston".
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TOPE_BUSQUEDA = 100;
const PAGE = 1000;

interface FilaAging {
  codigo: string | null;
  cliente_switch_id: number | null;
  nombre: string | null;
  total: number | string | null;
  d121_plus: number | string | null;
}

interface FilaSwitch {
  codigo: string | null;
  nombre: string | null;
  razonsocial: string | null;
  email: string | null;
  telefono: string | null;
  celular: string | null;
  activo: boolean | null;
}

/** La cartera de Boston, entera y paginada. PostgREST corta en 1.000 EN SILENCIO. */
async function carteraBoston(): Promise<FilaAging[]> {
  const filas: FilaAging[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("switch_estadocuenta_aging_boston")
      .select("codigo, cliente_switch_id, nombre, total, d121_plus")
      .order("codigo", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`switch_estadocuenta_aging_boston: ${error.message}`);
    if (!data || data.length === 0) break;
    filas.push(...(data as FilaAging[]));
    if (data.length < PAGE) break;
  }
  return filas;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesModuloBoston());
  if (auth instanceof NextResponse) return auth;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  try {
    const cartera = await carteraBoston();
    const saldoPorCodigo = new Map<string, { total: number; vencido: number }>();
    for (const f of cartera) {
      const cod = (f.codigo ?? "").trim();
      if (!cod) continue;
      saldoPorCodigo.set(cod, {
        total: Number(f.total ?? 0),
        vencido: Number(f.d121_plus ?? 0),
      });
    }

    // ── Qué códigos se van a mostrar ─────────────────────────────────────────
    let base = supabaseServer
      .from("switch_clientes")
      .select("codigo, nombre, razonsocial, email, telefono, celular, activo")
      // 🔴 EL `.eq` NO ES NEGOCIABLE Y NO SALE DE UN PARÁMETRO. Sin él esta
      // consulta devuelve las 8 empresas: sería la fuga entera en una línea.
      .eq("empresa_key", EMPRESA_BOSTON);

    if (q) {
      // `%` y `,` rompen el `or()` de PostgREST; se escapan antes de armarlo.
      const patron = `%${q.replace(/[%,()]/g, " ")}%`;
      base = base.or(`nombre.ilike.${patron},codigo.ilike.${patron},razonsocial.ilike.${patron}`);
    } else {
      const conSaldo = [...saldoPorCodigo.keys()];
      // Sin cartera y sin búsqueda no hay nada que mostrar; devolver los 4.911
      // "porque la lista quedó vacía" sería justo lo que este tope evita.
      if (conSaldo.length === 0) {
        return NextResponse.json({ modo: "saldo", clientes: [], total: 0 });
      }
      base = base.in("codigo", conSaldo);
    }

    const { data, error } = await base.order("nombre", { ascending: true }).limit(TOPE_BUSQUEDA * 10);
    if (error) throw new Error(`switch_clientes: ${error.message}`);

    const filas = (data ?? []) as FilaSwitch[];
    const clientes = filas
      .map((c) => {
        const cod = (c.codigo ?? "").trim();
        const saldo = saldoPorCodigo.get(cod);
        return {
          codigo: cod,
          nombre: (c.nombre ?? c.razonsocial ?? cod) || cod,
          email: c.email ?? null,
          telefono: c.telefono ?? c.celular ?? null,
          activo: c.activo !== false,
          saldo: saldo?.total ?? 0,
          vencido: saldo?.vencido ?? 0,
        };
      })
      // Primero los que deben, y dentro de esos los que deben más. Es el orden
      // en que se usa la lista.
      .sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, q ? TOPE_BUSQUEDA : filas.length);

    return NextResponse.json({
      modo: q ? "busqueda" : "saldo",
      total: clientes.length,
      // Que la pantalla pueda decir "hay más" en vez de mentir por omisión.
      truncado: q ? filas.length > TOPE_BUSQUEDA : false,
      clientes,
    });
  } catch (e) {
    console.error(`[boston/clientes] ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json(
      { error: "No se pudieron leer los clientes de Confecciones Boston" },
      { status: 500 },
    );
  }
}

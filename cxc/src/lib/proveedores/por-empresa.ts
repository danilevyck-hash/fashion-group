// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA LISTA DE PROVEEDORES SON LAS EMPRESAS, Y CADA UNA SE DESPLIEGA
// (20-sep-2026).
//
// 🩸 Hasta hoy la lista eran los 31 proveedores del grupo y una columna decía
// «de qué empresas viene». Contestaba «¿a quién le debo más?», que nadie
// pregunta así: la contadora paga POR EMPRESA —cada una tiene su banco, su
// chequera y su caja—, y para saber qué le debe Fashion Wear tenía que leer 31
// filas buscando cuáles la nombraban. Daniel lo dio vuelta: **la lista son sus
// siete empresas, y cada una se despliega para ver a quién le debe**.
//
// Medido contra producción el 20-sep-2026 (67 filas de
// `switch_proveedor_estadocuenta`, $4.829.819,40 en total):
//
//     Fashion Wear           $1.978.200,62   11 proveedores
//     Fashion Shoes          $1.346.422,77    1
//     Vistana International    $924.852,62    5
//     Active Shoes             $344.052,42    3
//     Multifashion             $141.931,04    7
//     Active Wear               $73.170,74    4
//     Joystep                   $21.189,19    4
//     ─────────────────────────────────────
//     Total                  $4.829.819,40
//
// ⚠️ **BOSTON NO ESTÁ Y ES CORRECTO**: `cxp: false` en
// `EMPRESA_SYNC_CAPABILITIES` — su CxP no se trae, tiene 0 filas, y está
// excluida a propósito. Las empresas salen de `empresasConCxp()` y nunca de las
// filas que llegaron: una empresa cuyo sync se cayó tiene que salir en la lista
// diciendo que está en cero, no desaparecer.
//
// 🔴 **QUIÉN ES QUIÉN NO CAMBIA.** La identidad de una fila la sigue diciendo
// `aplicarAmarre` (`lib/proveedores/identidad.ts`) y nadie más: la lista escrita
// a mano en `proveedor_amarre`, nunca el nombre y NUNCA la cédula. Acá se usa
// para dos cosas: juntar las grafías del mismo proveedor DENTRO de una empresa,
// y saber en qué OTRAS empresas del grupo está —el «también en Fashion Shoes»
// que reemplazó a la columna «Empresas»—.
// ─────────────────────────────────────────────────────────────────────────────

import { empresasConCxp } from "@/lib/switch-api/empresas";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import {
  aplicarAmarre,
  indexarAmarres,
  nombreParaMostrar,
  type AmarreProveedor,
} from "@/lib/proveedores/identidad";
import {
  repartirEnTramos,
  sumarTramos,
  tramosCero,
  partirSaldo,
  sumarPartidos,
  partidoCero,
  type Tramos,
  type SaldoPartido,
  type BucketSwitch,
} from "@/lib/proveedores/tramos";

/** Lo mínimo de una fila del estado de cuenta que esta lista necesita. */
export interface FilaCxp {
  empresa_key: string;
  proveedor_switch_id: number;
  nombre: string;
  saldo_total: number;
  aging: BucketSwitch[] | null;
  ultimo_pago_fecha: string | null;
  ultimo_pago_dias: number | null;
  synced_at: string | null;
}

export interface ProveedorEnEmpresa {
  /** La clave de identidad (amarre). Es la que abre su ficha. */
  key: string;
  nombre: string;
  tramos: Tramos;
  saldo: SaldoPartido;
  /** Las OTRAS empresas del grupo donde este proveedor también tiene saldo. */
  tambien_en: string[];
  ultimo_pago_fecha: string | null;
  ultimo_pago_dias: number | null;
}

export interface EmpresaCxp {
  empresa_key: string;
  nombre: string;
  tramos: Tramos;
  saldo: SaldoPartido;
  /** Los que tienen saldo (a favor incluido), del más grande al más chico. */
  proveedores: ProveedorEnEmpresa[];
  /** Los que están en cero. Se pliegan; no se esconden. */
  sin_saldo: ProveedorEnEmpresa[];
}

export interface CarteraCxp {
  empresas: EmpresaCxp[];
  /** El pie: la suma de las empresas, nunca un total leído aparte. */
  total: { tramos: Tramos; saldo: SaldoPartido };
  /** Proveedores DISTINTOS con saldo en todo el grupo (no la suma de las filas). */
  proveedores_con_saldo: number;
  synced_at: string | null;
}

/** Un saldo es «cero» debajo de medio centavo. Mismo corte que la lista vieja. */
export function tieneSaldo(v: number): boolean {
  return Math.abs(v) >= 0.005;
}

/**
 * 🔴 LA LISTA, ARMADA EN EL SERVIDOR. Las siete empresas con sus proveedores
 * adentro, los cuatro tramos por fila y el total al pie.
 */
export function buildPorEmpresa(
  filas: readonly FilaCxp[],
  amarres: readonly AmarreProveedor[] = [],
): CarteraCxp {
  const indice = indexarAmarres(amarres);
  const claveDe = (f: FilaCxp) => aplicarAmarre(f, indice).clave;

  // ── En qué empresas está cada proveedor, para el «también en …» ───────────
  // Solo cuenta donde TIENE SALDO: decirle a la contadora «también en Joystep»
  // para mandarla a una fila en cero es ruido, no un dato.
  const empresasDe = new Map<string, Map<string, number>>();
  for (const f of filas) {
    if (!tieneSaldo(Number(f.saldo_total))) continue;
    const k = claveDe(f);
    const porEmpresa = empresasDe.get(k) ?? new Map<string, number>();
    porEmpresa.set(
      f.empresa_key,
      (porEmpresa.get(f.empresa_key) ?? 0) + Number(f.saldo_total),
    );
    empresasDe.set(k, porEmpresa);
  }

  const empresas: EmpresaCxp[] = empresasConCxp().map((empresaKey) => {
    const suyas = filas.filter((f) => f.empresa_key === empresaKey);

    // Las grafías del MISMO proveedor dentro de esta empresa caen en una fila.
    const porProveedor = new Map<string, FilaCxp[]>();
    const escritoDe = new Map<string, string | null>();
    for (const f of suyas) {
      const { clave, nombreMostrado } = aplicarAmarre(f, indice);
      porProveedor.set(clave, [...(porProveedor.get(clave) ?? []), f]);
      if (!escritoDe.get(clave)) escritoDe.set(clave, nombreMostrado);
    }

    const todos: ProveedorEnEmpresa[] = [...porProveedor.entries()].map(([key, rs]) => {
      const aging = rs.flatMap((r) => r.aging ?? []);
      const dias = rs.map((r) => r.ultimo_pago_dias).filter((d): d is number => d != null);
      const fechas = rs.map((r) => r.ultimo_pago_fecha).filter((d): d is string => !!d).sort();
      return {
        key,
        nombre: nombreParaMostrar(rs, escritoDe.get(key) ?? null),
        tramos: repartirEnTramos(aging),
        saldo: partirSaldo(aging),
        tambien_en: [...(empresasDe.get(key) ?? new Map())]
          .filter(([e]) => e !== empresaKey)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
          .map(([e]) => e),
        ultimo_pago_fecha: fechas.length ? fechas[fechas.length - 1] : null,
        ultimo_pago_dias: dias.length ? Math.min(...dias) : null,
      };
    });

    const conSaldo = todos
      .filter((p) => tieneSaldo(p.saldo.por_pagar))
      .sort((a, b) => b.saldo.por_pagar - a.saldo.por_pagar || a.nombre.localeCompare(b.nombre));
    const sinSaldo = todos
      .filter((p) => !tieneSaldo(p.saldo.por_pagar))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      empresa_key: empresaKey,
      nombre: EMPRESA_KEY_TO_NAME[empresaKey] ?? empresaKey,
      // 🔴 El total de la empresa es la SUMA DE SUS PROVEEDORES, nunca un número
      // leído aparte: derivarlo es lo único que impide que se separen.
      tramos: todos.reduce((acc, p) => sumarTramos(acc, p.tramos), tramosCero()),
      saldo: todos.reduce((acc, p) => sumarPartidos(acc, p.saldo), partidoCero()),
      proveedores: conSaldo,
      sin_saldo: sinSaldo,
    };
  });

  empresas.sort(
    (a, b) => b.saldo.por_pagar - a.saldo.por_pagar || a.nombre.localeCompare(b.nombre),
  );

  return {
    empresas,
    // 🔴 Y el pie es la suma de las empresas, por lo mismo.
    total: {
      tramos: empresas.reduce((acc, e) => sumarTramos(acc, e.tramos), tramosCero()),
      saldo: empresas.reduce((acc, e) => sumarPartidos(acc, e.saldo), partidoCero()),
    },
    // Proveedores DISTINTOS: American Fashion Wear en dos empresas es UNO.
    proveedores_con_saldo: empresasDe.size,
    synced_at: filas.map((f) => f.synced_at).filter(Boolean).sort().reverse()[0] ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «TAMBIÉN EN …» — lo que reemplazó a la columna «Empresas».
//
// La columna vieja vivía en la lista de proveedores y decía de qué empresas
// venía cada uno. Dada vuelta la lista, esa misma información va donde sirve:
// en la fila del proveedor, dentro de la empresa que se está mirando, para
// poder saltar a la otra.
// ─────────────────────────────────────────────────────────────────────────────

/** «también en Fashion Shoes» · «también en Fashion Shoes y Vistana». */
export function textoTambienEn(empresaKeys: readonly string[]): string | null {
  const nombres = empresaKeys.map((k) => EMPRESA_KEY_TO_NAME[k] ?? k);
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return `también en ${nombres[0]}`;
  const ultimo = nombres[nombres.length - 1];
  return `también en ${nombres.slice(0, -1).join(", ")} y ${ultimo}`;
}

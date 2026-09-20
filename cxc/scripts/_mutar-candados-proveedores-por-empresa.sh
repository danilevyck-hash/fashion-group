#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS NUEVOS DE PROVEEDORES CAZAN DE VERDAD? (20-sep-2026)
#
# Rompe a propósito, una por una, las reglas que se acaban de escribir y
# comprueba que el test correspondiente se pone ROJO. Al final, dos CONTROLES:
# cambios que NO deben romper nada (si rompen, el candado está atado a la letra
# y no a la regla).
#
#   bash scripts/_mutar-candados-proveedores-por-empresa.sh
#
# No escribe nada permanente: cada mutación se revierte con `git checkout --`.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TRAMOS=src/lib/proveedores/tramos.ts
POR_EMPRESA=src/lib/proveedores/por-empresa.ts
TONO=src/lib/proveedores/tono.ts
ACTUALIZADO=src/lib/proveedores/actualizado.ts
VISTA=src/app/proveedores/ProveedoresListClient.tsx
EXCEL=src/app/proveedores/excel-proveedores.ts

CAZADAS=0; ESCAPADAS=0; CONTROLES_OK=0; CONTROLES_MAL=0

restaurar() { git checkout -- "$@"; }

# mutar <archivo> <viejo> <nuevo> <test> <descripción>
mutar() {
  local f="$1" viejo="$2" nuevo="$3" test="$4" desc="$5"
  python3 - "$f" "$viejo" "$nuevo" <<'PY'
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
if viejo not in s:
    print(f"    ⚠️  no se encontró el texto a mutar en {f}")
    sys.exit(3)
open(f, "w").write(s.replace(viejo, nuevo, 1))
PY
  if [ $? -eq 3 ]; then restaurar "$f"; ESCAPADAS=$((ESCAPADAS+1)); return; fi
  if npx vitest run "$test" >/dev/null 2>&1; then
    echo "  ❌ ESCAPÓ — $desc"; ESCAPADAS=$((ESCAPADAS+1))
  else
    echo "  ✅ cazada  — $desc"; CAZADAS=$((CAZADAS+1))
  fi
  restaurar "$f"
}

# control <archivo> <viejo> <nuevo> <test> <descripción>
control() {
  local f="$1" viejo="$2" nuevo="$3" test="$4" desc="$5"
  python3 - "$f" "$viejo" "$nuevo" <<'PY'
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
if viejo not in s:
    print(f"    ⚠️  no se encontró el texto en {f}")
    sys.exit(3)
open(f, "w").write(s.replace(viejo, nuevo, 1))
PY
  if npx vitest run "$test" >/dev/null 2>&1; then
    echo "  ✅ CONTROL pasa — $desc"; CONTROLES_OK=$((CONTROLES_OK+1))
  else
    echo "  ❌ CONTROL rompe — $desc"; CONTROLES_MAL=$((CONTROLES_MAL+1))
  fi
  restaurar "$f"
}

T_TRAMOS=src/__tests__/lib/proveedores-cuatro-tramos.test.ts
T_ID=src/__tests__/lib/proveedores-identidad.test.ts
T_PANT=src/__tests__/components/proveedores-una-fila-por-proveedor.test.tsx
T_ROJO=src/__tests__/lib/proveedores-sin-rojo.test.ts
T_ARRIBA=src/__tests__/lib/proveedores-arriba-una-linea.test.ts
T_EXCEL=src/__tests__/excel-exports-operacion.test.ts
T_CUADRE=src/__tests__/lib/proveedores-cuadre.test.ts

echo "── PUNTO 3 · los cuatro tramos ──────────────────────────────────────────"
mutar "$TRAMOS" \
  '{ key: "t121_365", label: "121-365D", buckets: ["121-180", "181-270", "271-365"] },
  { key: "tMas365", label: "+1 año", buckets: ["Mas de 365"] },' \
  '{ key: "t121_365", label: "121-365D", buckets: ["121-180", "181-270"] },
  { key: "tMas365", label: "+1 año", buckets: ["271-365", "Mas de 365"] },' \
  "$T_TRAMOS" "271-365 se pasa al tramo de más de un año"

mutar "$TRAMOS" \
  '{ key: "t0_90", label: "0-90D", buckets: ["0-30", "31-60", "61-90"] },' \
  '{ key: "t0_90", label: "0-90D", buckets: ["0-30", "31-60"] },' \
  "$T_TRAMOS" "61-90 se cae del reparto y el total pierde plata"

mutar "$TRAMOS" \
  'label: "121-365D"' 'label: "Vencido crítico"' \
  "$T_TRAMOS" "un tramo vuelve a llamarse «vencido»"

mutar "$TRAMOS" \
  'return DE_BUCKET.get(title) ?? "tMas365";' 'return DE_BUCKET.get(title) ?? "t0_90";' \
  "$T_TRAMOS" "lo desconocido cae en el tramo nuevo en vez del más viejo"

echo "── PUNTO 4 · lo que está a favor ────────────────────────────────────────"
mutar "$TRAMOS" \
  '    if (v > 0) debes += v;
    else aFavor += -v;' \
  '    debes += v;' \
  "$T_TRAMOS" "«Le debes» vuelve a compensar el crédito en silencio"

mutar "$TRAMOS" \
  'return { debes, a_favor: aFavor, por_pagar: round2(debes - aFavor) };' \
  'return { debes, a_favor: aFavor, por_pagar: round2(debes + aFavor) };' \
  "$T_TRAMOS" "«Por pagar» deja de ser «Le debes» menos «a favor»"

mutar "$TRAMOS" \
  '  if (s.a_favor === 0) return null;' '  if (s.a_favor === -1) return null;' \
  "$T_PANT" "la frase sale con «Tienes a favor \$0.00»"

echo "── PUNTOS 1 y 2 · las empresas y el desplegado ──────────────────────────"
mutar "$POR_EMPRESA" \
  'const empresas: EmpresaCxp[] = empresasConCxp().map((empresaKey) => {' \
  'const empresas: EmpresaCxp[] = [...new Set(filas.map((f) => f.empresa_key))].map((empresaKey) => {' \
  "$T_ID" "las empresas salen de las filas: una sin datos desaparece"

mutar "$POR_EMPRESA" \
  '      tramos: todos.reduce((acc, p) => sumarTramos(acc, p.tramos), tramosCero()),
      saldo: todos.reduce((acc, p) => sumarPartidos(acc, p.saldo), partidoCero()),' \
  '      tramos: conSaldo.reduce((acc, p) => sumarTramos(acc, p.tramos), tramosCero()),
      saldo: conSaldo.reduce((acc, p) => sumarPartidos(acc, p.saldo), partidoCero()),' \
  "$T_ID" "el total de la empresa deja afuera a los plegados"

mutar "$POR_EMPRESA" \
  '          .filter(([e]) => e !== empresaKey)' \
  '          .filter(() => true)' \
  "$T_ID" "«también en» se nombra a sí misma"

mutar "$POR_EMPRESA" \
  '    if (!tieneSaldo(Number(f.saldo_total))) continue;' \
  '    if (false) continue;' \
  "$T_ID" "«también en» manda a una empresa donde el saldo es cero"

mutar "$POR_EMPRESA" \
  '      const { clave, nombreMostrado } = aplicarAmarre(f, indice);' \
  '      const clave = f.nombre.toUpperCase(); const nombreMostrado = null;' \
  "$T_ID" "la identidad vuelve a salir del nombre y no del amarre"

mutar "$POR_EMPRESA" \
  'proveedores_con_saldo: empresasDe.size,' \
  'proveedores_con_saldo: filas.length,' \
  "$T_ID" "se cuentan filas en vez de proveedores distintos"

mutar "$VISTA" \
  '      {abierta && frase && (' '      {false && frase && (' \
  "$T_PANT" "la empresa desplegada deja de decir de qué está hecho su total"

mutar "$VISTA" \
  '        <TambienEn empresas={p.tambien_en} onEmpresa={onEmpresa} />' '        <></>' \
  "$T_PANT" "se va el «también en» y no queda cómo saltar a la otra empresa"

mutar "$VISTA" \
  '            onClick={(ev) => { ev.stopPropagation(); onEmpresa(e); }}' \
  '            onClick={() => onEmpresa(e)}' \
  "$T_PANT" "el enlace de «también en» deja de frenar el clic de la fila"

echo "── EL CUADRE · nada se pierde al dar vuelta la lista ────────────────────"
mutar "$POR_EMPRESA" \
      'tramos: empresas.reduce((acc, e) => sumarTramos(acc, e.tramos), tramosCero()),' \
      'tramos: tramosCero(),' \
  "$T_CUADRE" "los tramos del pie dejan de ser la suma de las empresas"

mutar "$POR_EMPRESA" \
  '      saldo: empresas.reduce((acc, e) => sumarPartidos(acc, e.saldo), partidoCero()),' \
  '      saldo: empresas.length ? empresas[0].saldo : partidoCero(),' \
  "$T_CUADRE" "el total del pie se lee aparte en vez de sumarse"

mutar "$TRAMOS" \
  '  for (const b of aging ?? []) t[tramoDelBucket(b.title)] += num(b.saldo);' \
  '  for (const b of aging ?? []) if (num(b.saldo) > 0) t[tramoDelBucket(b.title)] += num(b.saldo);' \
  "$T_CUADRE" "los tramos se quedan solo con lo positivo y el total no cuadra"

echo "── PUNTO 5 · arriba, una sola línea ─────────────────────────────────────"
mutar "$ACTUALIZADO" \
  '  if (!iso) return null;' '  if (!iso) return `${PREFIJO_ACTUALIZADO} —`;' \
  "$T_ARRIBA" "sin fecha se inventa un «Actualizado: —»"

mutar "$ACTUALIZADO" \
  '  timeZone: "America/Panama",' '  timeZone: "UTC",' \
  "$T_ARRIBA" "la hora deja de ser la de Panamá"

mutar "$VISTA" \
  '<p className="text-xs text-gray-500 tabular-nums">{textoActualizado(cartera.synced_at)}</p>' \
  '<p className="text-xs text-gray-500 tabular-nums"></p>' \
  "$T_ARRIBA" "la pantalla vuelve a no decir de cuándo es el dato"

echo "── PUNTO 6 · el rojo ────────────────────────────────────────────────────"
mutar "$TONO" \
  '  return TONO_MONTO;' '  return valor > 120000 ? "text-red-700" : TONO_MONTO;' \
  "$T_ROJO" "vuelve el rojo para los montos grandes"

mutar "$TONO" \
  '  if (valor < 0) return TONO_A_FAVOR;' '  if (valor < 0) return TONO_MONTO;' \
  "$T_ROJO" "el saldo a favor deja de distinguirse"

echo "── EL EXCEL ─────────────────────────────────────────────────────────────"
mutar "$EXCEL" \
  '{ v: fmtFechaExcel(p.ultimo_pago_fecha), fg: "555555" },' \
  '{ v: p.ultimo_pago_dias != null ? `hace ${p.ultimo_pago_dias}d` : "—", fg: "555555" },' \
  "$T_EXCEL" "el Excel vuelve a decir «hace N d» en vez de la fecha"

mutar "$EXCEL" \
  '    for (const p of [...e.proveedores, ...e.sin_saldo]) {' \
  '    for (const p of e.proveedores) {' \
  "$T_EXCEL" "el archivo se recorta por lo que estaba plegado en pantalla"

echo "── CONTROLES (no deben romper nada) ─────────────────────────────────────"
control "$POR_EMPRESA" \
  '/** Un saldo es «cero» debajo de medio centavo. Mismo corte que la lista vieja. */' \
  '/** Un saldo es «cero» debajo de medio centavo. */' \
  "$T_ID" "reescribir un comentario"

control "$VISTA" \
  'className="text-xs text-gray-500 tabular-nums mb-2"' \
  'className="text-xs text-gray-500 tabular-nums mb-3"' \
  "$T_PANT" "cambiar un margen de la pantalla"

echo
echo "cazadas: $CAZADAS · escapadas: $ESCAPADAS · controles ok: $CONTROLES_OK · controles mal: $CONTROLES_MAL"
[ "$ESCAPADAS" -eq 0 ] && [ "$CONTROLES_MAL" -eq 0 ]

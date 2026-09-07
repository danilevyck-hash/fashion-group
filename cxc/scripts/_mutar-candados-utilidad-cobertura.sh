#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de LA COBERTURA DEL REPORTE DE UTILIDAD (6-sep-2026) CAZAN?
#
# El defecto: el guard del "cero silencioso" contaba comprobantes que el reporte
# no puede traer (las ventas de mostrador, `Transacción`), así que sonaba
# 🔧 SISTEMA sin que pasara nada. Lo que se fija acá va en LAS DOS DIRECCIONES:
#
#   A. deja de sonar por mostrador                (era la falsa alarma)
#   B. SIGUE sonando cuando falta una Factura,    (es para lo que se hizo)
#      una nota de crédito o una de débito
#   C. un tipo que Switch estrene CUENTA          (ante la duda, se dice)
#   D. la regla se dice UNA vez, en su módulo     (no se copia en el sync)
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
#   bash scripts/_mutar-candados-utilidad-cobertura.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/utilidad-cobertura-del-reporte.test.ts \
src/__tests__/lib/utilidad-cero-silencioso.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/switch-api/utilidad-cobertura.ts"
  "src/lib/switch-api/sync-utilidad.ts"
  "src/lib/ventas/tipos-comprobante.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() {
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"; sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() {
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"; controles_mal=$((controles_mal + 1))
  fi
}

aplicar() {
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { aplicar "$1" "$2" "$3"; [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes+1)); return; }; probar "$4"; }
control() { aplicar "$1" "$2" "$3"; [ $? -eq 3 ] && { controles_mal=$((controles_mal+1)); return; }; probar_control "$4"; }

COB="src/lib/switch-api/utilidad-cobertura.ts"
SYNC="src/lib/switch-api/sync-utilidad.ts"

echo "── mutando ──────────────────────────────────────────────────────────────"
echo
echo "  A · deja de sonar por el mostrador"

mutar "$COB" \
  '  "Transacción",' \
  '' \
  "se vacía la lista: el mostrador vuelve a contar y la alerta vuelve a sonar sola"

mutar "$COB" \
  '  "Transacción",' \
  '  "Transaccion",' \
  "la exclusión pierde el acento: no excluye nada y nadie se entera"

mutar "$COB" \
  '  "Transacción",' \
  '  "Factura",' \
  "se excluye la Factura en vez del mostrador (se calla justo con lo que importa)"

mutar "$SYNC" \
  '    .not("tipo_comprobante", "in", filtroTiposFueraDelReporteDeUtilidad())' \
  '' \
  "el COUNT deja de acotar por tipo de comprobante (el defecto original, tal cual)"

echo
echo "  B · sigue sonando cuando falta lo que el reporte SÍ trae"

mutar "$COB" \
  'export function elReporteDeUtilidadLoTrae(tipo: string | null | undefined): boolean {
  return !FUERA.has((tipo ?? "").trim());
}' \
  'export function elReporteDeUtilidadLoTrae(_tipo: string | null | undefined): boolean {
  return false;
}' \
  "nada cuenta nunca: el guard se calla para siempre"

mutar "$SYNC" \
  '      const facturasEnRango = await contarFacturasCubiertasEnRango(empresaKey, meses);
      if (facturasEnRango > 0) {' \
  '      const facturasEnRango = 0;
      if (facturasEnRango > 0) {' \
  "se desarma el guard entero: cero documentos siempre es success"

mutar "$SYNC" \
  '    if (uniqueRows.length === 0) {' \
  '    if (false) {' \
  "el guard deja de mirar el lote vacío"

echo
echo "  C · un tipo nuevo de Switch cuenta (ante la duda, se dice)"

mutar "$COB" \
  '  return !FUERA.has((tipo ?? "").trim());' \
  '  return FUERA.size === 0 ? true : (tipo ?? "") === "Factura";' \
  "se cambia a lista BLANCA: un tipo nuevo dejaría de contar en silencio"

mutar "$COB" \
  'export const TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD: readonly string[] = [
  "Transacción",
];' \
  'export const TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD: readonly string[] = [
  "Transacción",
  "Comprobante Nuevo De Switch",
];' \
  "se agrega a la lista un tipo sin medirlo (y sin que el sistema lo conozca)"

mutar "$COB" \
  'export const TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD: readonly string[] = [
  "Transacción",
];' \
  'export const TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD: readonly string[] = [
  "Transacción",
  "Tiquete",
];' \
  "entra Tiquete, que NO está medido (su historia no toca la del reporte)"

echo
echo "  D · la regla se dice UNA vez"

mutar "$SYNC" \
  'import { filtroTiposFueraDelReporteDeUtilidad } from "./utilidad-cobertura";' \
  'const filtroTiposFueraDelReporteDeUtilidad = () => `("Transacción")`;' \
  "el sync copia la lista en vez de importarla"

mutar "$COB" \
  '  return `(${TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD.map((t) => `"${t}"`).join(",")})`;' \
  '  return `()`;' \
  "el filtro sale vacío: la consulta deja de excluir nada"

echo
echo "  E · el texto y el idioma de la casa"

mutar "$SYNC" \
  'no se registra success con la tabla vacía`,' \
  'acá no podés anotar success con la tabla vacía`,' \
  "voseo en el mensaje que queda registrado de la corrida"

# ═══ CONTROLES ═══════════════════════════════════════════════════════════════
echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "$COB" \
  'const FUERA = new Set<string>(TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD);' \
  'const FUERA: ReadonlySet<string> = new Set<string>(TIPOS_FUERA_DEL_REPORTE_DE_UTILIDAD);' \
  "CONTROL: se anota el tipo del Set, misma conducta"

control "$COB" \
  '// `switch_factura_utilidad` existe desde el 3-ene-2026. En 2026, documento por' \
  '// `switch_factura_utilidad` existe desde el 3 de enero de 2026. En 2026, documento por' \
  "CONTROL: se escribe la fecha completa en un comentario"

control "$SYNC" \
  '      const facturasEnRango = await contarFacturasCubiertasEnRango(empresaKey, meses);' \
  '      const facturasEnRango: number = await contarFacturasCubiertasEnRango(empresaKey, meses);' \
  "CONTROL: se anota el tipo de una variable local"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

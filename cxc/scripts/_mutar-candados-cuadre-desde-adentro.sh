#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «EL CUADRE SE LEE DESDE ADENTRO» CAZAN DE VERDAD?
# (18-sep-2026)
#
# Se rompe a propósito cada regla, una por vez, y se exige que los tests se
# pongan ROJOS: leer del nivel de afuera (el defecto original) · perder una de
# las dos grafías · inventar un cero donde no vino nada · que el sync vuelva a
# leer el JSON a mano · que el tipo suba el cuadre otra vez. Los CONTROL
# (cambios que NO deben cazarse) tienen que quedar verdes.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-cuadre-desde-adentro.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/cxc-cuadre-desde-adentro.test.ts \
src/__tests__/lib/cxc-estado-cuenta-forma-switch.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/switch-api/estadocuenta-cuadre.ts"
  "src/lib/switch-api/sync-empresa.ts"
  "src/lib/switch-api/types.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

corrida() { # imprime el nº de fallos, o "muerta"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then echo "muerta"; return; fi
  grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0
}

probar() {
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "muerta" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"; sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() {
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "0" ]; then
    echo "  ✅ CONTROL OK (verde, como debe) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL MAL (se puso rojo sin motivo) — $1"; controles_mal=$((controles_mal + 1))
  fi
}

_aplicar() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta, encoding="utf-8").read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w", encoding="utf-8").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { restaurar; _aplicar "$1" "$2" "$3" || { sobrevivientes=$((sobrevivientes + 1)); return; }; probar "$4"; }
control() { restaurar; _aplicar "$1" "$2" "$3" || { controles_mal=$((controles_mal + 1)); return; }; probar_control "$4"; }

CUADRE="src/lib/switch-api/estadocuenta-cuadre.ts"
SYNC="src/lib/switch-api/sync-empresa.ts"
TIPOS="src/lib/switch-api/types.ts"

echo "── mutando ──────────────────────────────────────────────────────────────"

# ── A. Se vuelve a leer del nivel de AFUERA (el defecto original) ────────────

mutar "$CUADRE" \
  "  const ec = data.estadocuenta;" \
  "  const ec = data;" \
  "A1. el cuadre se lee de \`data\` y no de \`data.estadocuenta\` — el defecto de 835 filas"

# ── B. Se pierde una de las dos grafías ──────────────────────────────────────

mutar "$CUADRE" \
  "  const aging = ec.Saldos ?? ec.saldos;" \
  "  const aging = ec.Saldos;" \
  "B1. solo \`Saldos\` con mayúscula — proveedores manda minúscula"

mutar "$CUADRE" \
  "  const aging = ec.Saldos ?? ec.saldos;" \
  "  const aging = ec.saldos;" \
  "B2. solo \`saldos\` con minúscula — el PDF de clientes imprime mayúscula"

# ── C. Se inventa un cero donde no vino nada ─────────────────────────────────

mutar "$CUADRE" \
  "  if (bruto == null) return null;" \
  "  if (bruto == null) return 0;" \
  "C1. sin \`saldoTotal\` se guarda 0 en vez de NULL"

mutar "$CUADRE" \
  '  if (limpio === "") return null;' \
  '  if (limpio === "") return 0;' \
  "C2. un total vacío se guarda como 0"

mutar "$CUADRE" \
  "  return Number.isFinite(n) ? n : null;" \
  "  return Number.isFinite(n) ? n : 0;" \
  "C3. un total ilegible se guarda como 0"

mutar "$CUADRE" \
  "  if (!esObjeto(ec)) return fuera;" \
  "  if (!esObjeto(ec)) return { saldoTotal: 0, saldos: null };" \
  "C4. sin \`estadocuenta\` se afirma que debe \$0"

mutar "$CUADRE" \
  "    saldos: Array.isArray(aging) ? aging : null," \
  "    saldos: aging ?? null," \
  "C5. un aging que no es lista se guarda como si lo fuera"

mutar "$CUADRE" \
  '  const limpio = bruto.replace(/,/g, "").trim();' \
  '  const limpio = bruto.trim();' \
  "C6. la coma de miles deja el total en NULL"

# ── D. El sync o el tipo vuelven a la forma vieja ────────────────────────────

mutar "$SYNC" \
  "          saldosSwitch.push(
            filaDeCuadre({
              empresaKey,
              clienteId: cliente.id,
              clienteCodigo: cliente.codigo,
              respuesta: ec,
              runStamp,
            }),
          );" \
  "          saldosSwitch.push({
            empresa_key: empresaKey,
            cliente_switch_id: cliente.id,
            cliente_codigo: cliente.codigo ?? null,
            saldo_total: ec?.saldoTotal == null ? null : Number(ec?.saldoTotal),
            saldos: (ec?.Saldos ?? null) as SaldoSwitchRow[\"saldos\"],
            synced_at: runStamp,
            updated_at: new Date().toISOString(),
          });" \
  "D1. el sync vuelve a leer el JSON a mano, del nivel de afuera"

mutar "$SYNC" \
  "              respuesta: ec," \
  "              respuesta: ec?.estadocuenta," \
  "D2. el sync le pasa a la regla un pedazo y no la respuesta entera"

mutar "$TIPOS" \
  "    saldoTotal?: string | number | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}" \
  "    [key: string]: unknown;
  };
  saldoTotal?: string | number | null;
  [key: string]: unknown;
}" \
  "D3. el tipo vuelve a declarar \`saldoTotal\` como hermano de \`estadocuenta\`"

echo "── controles (NO deben cazarse) ─────────────────────────────────────────"

control "$CUADRE" \
  " * Reglas de este módulo (puro, sin red ni base):" \
  " * Reglas de este módulo (puro; ni red ni base):" \
  "K1. cambia un comentario"

control "$CUADRE" \
  "  if (bruto == null) return null;" \
  "  if (bruto === null || bruto === undefined) return null;" \
  "K2. la misma guarda escrita de otra forma"

restaurar
echo
echo "── resumen ──────────────────────────────────────────────────────────────"
echo "mutaciones cazadas: $cazadas · sobrevivientes: $sobrevivientes"
echo "controles ok: $controles_ok · controles mal: $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

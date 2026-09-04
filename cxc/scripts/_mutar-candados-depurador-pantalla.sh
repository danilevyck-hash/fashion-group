#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de la validación EN PANTALLA del Depurador (4-sep-2026) cazan
# de verdad? Se rompe el código a propósito, una cosa por vez, y se exige que
# los tests se pongan ROJOS. CONTROL (sin mutar) tiene que quedar verde.
#
# Lo que se muta: la validación del divisor en el input (global y por marca),
# el apagado de la descarga, el borrado de los precios a mano al re-procesar,
# la llave por REFERENCIA de los precios (el caso que de verdad importa:
# por índice, el precio caería en el artículo equivocado), la tasa como
# número, el select de dos opciones y la config recordada.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: la rama puede traer
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-depurador-pantalla.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/depurador-validacion-pantalla.test.tsx \
src/__tests__/depurador-plantilla-switch.test.ts \
src/__tests__/lib/divisor-rango.test.ts"

ARCHIVOS=(
  "src/app/productos/cargar/DepuradorClient.tsx"
  "src/lib/depurador/logic.ts"
  "src/lib/depurador/divisor.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
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
  if [ $? -eq 3 ]; then sobrevivientes=$((sobrevivientes + 1)); return 1; fi
  return 0
}

CLIENTE="src/app/productos/cargar/DepuradorClient.tsx"
LOGIC="src/lib/depurador/logic.ts"
DIVISOR="src/lib/depurador/divisor.ts"

echo "── CONTROL (sin mutar): tiene que quedar VERDE ──"
salida="$(npx vitest run $TESTS 2>&1)"
if grep -qE "^ *Tests .*[0-9]+ passed" <<<"$salida" && ! grep -qE "[0-9]+ failed" <<<"$salida"; then
  echo "  ✅ CONTROL verde"
else
  echo "  ⛔ CONTROL ROJO — no tiene sentido mutar sobre tests rotos"; exit 1
fi

echo "── Mutación 1: se quita la validación del input global (el 70 pasa callado) ──"
mutar "$CLIENTE" \
  "const draftDivisorMsg = mensajeDivisorEnPantalla(draftDivisor);" \
  "const draftDivisorMsg = null as string | null;" \
  "sin validación en el input global" && probar "sin validación en el input global"

echo "── Mutación 2: se valida pero la DESCARGA queda encendida ──"
mutar "$CLIENTE" \
  "disabled={downloading || descsNuevas.length > 0 || !catalogo || divisorBloqueaDescarga}" \
  "disabled={downloading || descsNuevas.length > 0 || !catalogo}" \
  "descarga encendida con divisor malo" && probar "descarga encendida con divisor malo"

echo "── Mutación 3: los divisores por marca dejan de validar ──"
mutar "$CLIENTE" \
  "      const msg = mensajeDivisorEnPantalla(String(f.divisor));
      if (msg) out[key] = msg;" \
  "      const msg = mensajeDivisorEnPantalla(String(f.divisor));
      if (msg && false) out[key] = msg;" \
  "por marca sin validar" && probar "por marca sin validar"

echo "── Mutación 4: vuelve el setPriceEdits({}) al re-procesar (borra el trabajo hecho) ──"
mutar "$CLIENTE" \
  "        setSelected(new Set());
        setDescFilter(\"\");" \
  "        setPriceEdits({});
        setSelected(new Set());
        setDescFilter(\"\");" \
  "re-procesar borra los precios a mano" && probar "re-procesar borra los precios a mano"

echo "── Mutación 5: los precios a mano se guardan por ÍNDICE de fila (el precio cae en el artículo equivocado) ──"
mutar "$CLIENTE" \
  "const refDe = (row: ProcessedRow): string => String(row.cols[\"Código *\"] ?? \"\");" \
  "const refDe = (row: ProcessedRow): string => String(processed ? processed.indexOf(row) : -1);" \
  "precios por índice de fila" && probar "precios por índice de fila"

echo "── Mutación 6: la tasa viaja como NÚMERO (el 07 pierde el cero) ──"
mutar "$LOGIC" \
  "  const tasa = tasaSwitch(config.tasa);" \
  "  const tasa = Number(tasaSwitch(config.tasa)) as unknown as string;" \
  "tasa como número" && probar "tasa como número"

echo "── Mutación 7: el select de tasa ofrece una TERCERA opción ──"
mutar "$CLIENTE" \
  "<option value=\"0\">Exento (0%)</option>" \
  "<option value=\"0\">Exento (0%)</option><option value=\"7.00\">7.00</option>" \
  "tercera opción de tasa" && probar "tercera opción de tasa"

echo "── Mutación 8: el botón «Borrarlos todos» no borra nada ──"
mutar "$CLIENTE" \
  "  const borrarPreciosAMano = () => {
    setPriceEdits({});
    setEditsConservados(0);
  };" \
  "  const borrarPreciosAMano = () => {
    setEditsConservados(0);
  };" \
  "borrar no borra" && probar "borrar no borra"

echo "── Mutación 9: la sugerencia divide entre 10 en vez de 100 (mentiría el número) ──"
mutar "$DIVISOR" \
  "  const corregido = Number.isFinite(n) ? n / 100 : NaN;" \
  "  const corregido = Number.isFinite(n) ? n / 10 : NaN;" \
  "sugerencia ÷10" && probar "sugerencia ÷10"

echo "── Mutación 10: la tasa deja de recordarse entre corridas ──"
mutar "$CLIENTE" \
  "const [tasaCruda, setTasaCruda] = useLastUsed(\"depurador_tasa\", \"07\");" \
  "const [tasaCruda, setTasaCruda] = useState(\"07\");" \
  "tasa sin recordar" && probar "tasa sin recordar"

restaurar
echo ""
echo "══════════════════════════════════════════"
echo "  Cazadas: $cazadas · Sobrevivientes: $sobrevivientes (de 10)"
echo "══════════════════════════════════════════"
[ "$sobrevivientes" -eq 0 ] || exit 1

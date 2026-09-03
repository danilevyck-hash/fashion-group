#!/usr/bin/env bash
# Verificador de mutaciones de la plantilla única de Switch (Depurador,
# Facturas Tienda y Reebok): 25 columnas iguales al fixture real, CIF = FOB × 1,1
# en Fashion Shoes, FOB = CIF en Multifashion, Composición vacía y Tasa «07».
#
# 🩸 Restaura por COPIA y no con `git checkout` (hay archivos nuevos en la rama).
# 🩸 El reemplazo es LITERAL con python (`_mutar-aplicar.py`), sin regex ni
#    delimitadores que se coman el archivo.
# 🩸 `mutar()` EXIGE que el archivo cambie, y `probar()` exige que vitest haya
#    COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/depurador-plantilla-switch.test.ts
  src/__tests__/depurador-validate.test.ts
  src/__tests__/reebok-depurador.test.ts
)
ARCHIVOS=(
  src/lib/depurador/logic.ts
  src/lib/depurador/tienda.ts
  src/lib/depurador/reebok.ts
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

# 1) quitar una columna (Composición otra vez afuera = el error del 27-jun)
mutar src/lib/depurador/logic.ts \
  '"Stock Ideal", "Temporada", "Composición", "Codigo CPBS",' \
  '"Stock Ideal", "Temporada", "Codigo CPBS",' \
  'quitar la columna Composición (24 columnas)'

# 2) cambiar un encabezado (una tilde de más)
mutar src/lib/depurador/logic.ts \
  '"Composición", "Codigo CPBS", "Codigo CPBS Abrev",' \
  '"Composición", "Código CPBS", "Codigo CPBS Abrev",' \
  'cambiar el encabezado «Codigo CPBS» → «Código CPBS»'

# 3) cambiar otro encabezado (perder el asterisco de una obligatoria)
mutar src/lib/depurador/logic.ts \
  '"Tasa de Impuesto *", "Costo FOB *", "Costo CIF *", "rubro *",' \
  '"Tasa de Impuesto *", "Costo FOB *", "Costo CIF", "rubro *",' \
  'quitar el asterisco de «Costo CIF *»'

# 4) volver a la columna única de Fashion Shoes
mutar src/lib/depurador/logic.ts \
  '"Tasa de Impuesto *", "Costo FOB *", "Costo CIF *", "rubro *",' \
  '"Tasa de Impuesto *", "Costo *", "rubro *",' \
  'fusionar FOB y CIF en una sola «Costo *»'

# 5) CIF = FOB en el Depurador (Fashion Shoes sin flete)
mutar src/lib/depurador/logic.ts \
  'let cif = fob !== null ? Math.round(fob * factor * 100) / 100 : null;' \
  'let cif = fob;' \
  'CIF = FOB en Fashion Shoes / Vistana'

# 6) Multifashion con flete (FOB ≠ CIF)
mutar src/lib/depurador/tienda.ts \
  '"Costo CIF *": costoOut,' \
  '"Costo CIF *": costoOut === null ? null : Math.round(costoOut * 1.1 * 100) / 100,' \
  'Multifashion: CIF = precio × 1,1 en vez del mismo número'

# 7) Multifashion sin CIF
mutar src/lib/depurador/tienda.ts \
  '"Costo CIF *": costoOut,' \
  '"Costo CIF *": null,' \
  'Multifashion: CIF vacío'

# 8) Composición con contenido en el Depurador
mutar src/lib/depurador/logic.ts \
  '"Composición": "",' \
  '"Composición": "100% algodón",' \
  'Composición con texto en el Depurador'

# 9) Tasa sin el cero adelante
mutar src/lib/depurador/logic.ts \
  'return texto.padStart(2, "0");' \
  'return texto;' \
  'Tasa «7» en vez de «07»'

# 10) Tasa como número
mutar src/lib/depurador/logic.ts \
  'const tasa = tasaSwitch(config.tasa);' \
  'const tasa = Number(config.tasa);' \
  'Tasa numérica 7 (pierde el cero)'

# 11) Facturas Tienda con la tasa vieja «7.00»
mutar src/lib/depurador/tienda.ts \
  'const tasa = tasaSwitch(tasaNum ?? 7);' \
  'const tasa = (tasaNum ?? 7).toFixed(2);' \
  'Facturas Tienda: tasa «7.00»'

# 12) Reebok con la tasa cruda
mutar src/lib/depurador/reebok.ts \
  '"Tasa de Impuesto *": tasaSwitch(cfg.tasa),' \
  '"Tasa de Impuesto *": cfg.tasa,' \
  'Reebok: tasa cruda «7»'

# 13) Reebok sin CIF calculado
mutar src/lib/depurador/reebok.ts \
  'const cif = fob === null ? null : round2(fob * 1.1);' \
  'const cif = fob;' \
  'Reebok: CIF = FOB'

echo
echo "== resumen: cazadas $CAZ · sobrevivieron $SOB · no mutaron/muertas $NOOP =="
[ "$SOB" -eq 0 ] && [ "$NOOP" -eq 0 ]

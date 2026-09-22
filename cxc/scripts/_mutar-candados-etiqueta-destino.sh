#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del DESTINO LARGO de la etiqueta
# (22-sep-2026): Guías › Etiquetas.
#
# Daniel: «los destino largos que se hagan en dos filas o achicar la letra».
# 🔴 EN ESE ORDEN. Acá se rompe el producto a propósito, de a una mutación, y se
# exige que los candados se pongan ROJOS. Dos CONTROLES cambian cosas que NO son
# la regla (un comentario, el nombre de una variable interna) y tienen que
# quedarse en VERDE: si un control se pone rojo, el candado está atado a la
# letra del código y no a la conducta del papel.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

DEST=src/lib/guias/etiqueta-destino.ts
PDF=src/lib/guias/pdf-etiquetas.ts

TESTS=(
  src/__tests__/components/guias-etiqueta-destino-entero.test.tsx
  src/__tests__/components/guias-etiqueta-agrande.test.tsx
  src/__tests__/components/guias-etiqueta-rediseno.test.tsx
)

ARCHIVOS=("$DEST" "$PDF")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }
correr() { npx vitest run "${TESTS[@]}" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | grep -qE "Test Files" && ! echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. el destino vuelve a cortarse con «…» (se le quita el achique) =="
mutar "$PDF" '    achicarHasta: MAY_DESTINO_MINIMO,
' '' \
&& probar 'el destino sin achique: vuelve el truncado'

echo "== 2. SE INVIERTE EL ORDEN: achicar antes que partir en más filas =="
mutar "$DEST" '  for (let mm = maxMayuscula; mm >= minMayuscula - 1e-9; mm -= PASO_DEL_ACHIQUE) {' \
              '  for (let mm = minMayuscula; mm <= maxMayuscula + 1e-9; mm += PASO_DEL_ACHIQUE) {' \
&& probar 'del más chico al más grande: achica aunque entre en dos filas'

echo "== 3. se parte a MITAD DE PALABRA =="
mutar "$DEST" '  const palabras = texto.trim().split(/\s+/).filter(Boolean);' \
              '  const palabras = texto.trim().split("").filter(Boolean);' \
&& probar 'partirPorEspacio corta letra por letra'

echo "== 4. una palabra que no cabe se deja desbordar en vez de achicar =="
mutar "$DEST" '    if (anchoDeTexto(palabra, mayuscula) > ancho) return null;' \
              '    if (false) return null;' \
&& probar 'partirPorEspacio ya no denuncia la palabra que no cabe'

echo "== 5. el piso de la raya del bulto se ignora =="
mutar "$DEST" '  return Math.max(1, 1 + Math.floor((m.hastaY - primera) / salto));' \
              '  return 99;' \
&& probar 'lineasQueCaben deja bajar todo lo que quiera'

echo "== 6. lineasQueCaben con una línea de más (el clásico off-by-one) =="
mutar "$DEST" '  return Math.max(1, 1 + Math.floor((m.hastaY - primera) / salto));' \
              '  return Math.max(1, 2 + Math.floor((m.hastaY - primera) / salto));' \
&& probar 'lineasQueCaben cuenta una línea de más'

echo "== 7. se devuelve el tamaño grande sin comprobar que entra =="
mutar "$DEST" '    if (lineas.length <= lineasQueCaben(mayuscula, m)) return { mayuscula, lineas, cortado: false };' \
              '    return { mayuscula, lineas, cortado: false };' \
&& probar 'acomodarDestino no comprueba si entra'

echo "== 8. el piso de 3,4 mm se desfonda =="
mutar "$DEST" 'export const MAY_DESTINO_MINIMO = 3.4;' 'export const MAY_DESTINO_MINIMO = 0.4;' \
&& probar 'el destino puede achicarse hasta ser ilegible'

echo "== 9. se achica de golpe (un milímetro por paso, no un décimo) =="
mutar "$DEST" 'export const PASO_DEL_ACHIQUE = 0.1;' 'export const PASO_DEL_ACHIQUE = 1.0;' \
&& probar 'el achique salta de a un milímetro y se pasa de chico'

echo "== 10. el «…» del último recurso deja de medirse (se sale del cuarto) =="
mutar "$DEST" '  while (ultima.length > 1 && m.anchoDeTexto(`${ultima}…`, mayuscula) > m.ancho) {
    ultima = ultima.slice(0, -1);
  }' '  // (mutación) el corte ya no se mide' \
&& probar 'el corte con «…» ya no se achica para caber'

echo "== 11. al achicar, la primera línea se dibuja con el salto del tamaño GRANDE =="
mutar "$PDF" '    y += bajoElRotulo(acomodo.mayuscula);' '    y += bajoElRotulo(mayuscula);' \
&& probar 'el salto bajo el rótulo no sigue al tamaño achicado'

echo "== 12. al achicar, la interlínea se queda en la del tamaño GRANDE =="
mutar "$PDF" '      if (i > 0) y += interlinea(tamanoAcomodado);' \
              '      if (i > 0) y += interlinea(PT_PARA_MAYUSCULA(mayuscula));' \
&& probar 'la interlínea no sigue al tamaño achicado'

echo "== 13. el achique se le pega TAMBIÉN al cliente (Daniel pidió el destino) =="
mutar "$PDF" '    mayuscula: MAY_CLIENTE,
    maxLineas: 2,
  });' '    mayuscula: MAY_CLIENTE,
    maxLineas: 2,
    hastaY: yRaya - AIRE_SOBRE_LA_RAYA,
    achicarHasta: MAY_DESTINO_MINIMO,
  });' \
&& probar 'el cliente también se achica'

echo "== 14. el destino se achica SIEMPRE al mínimo (no al más grande que cabe) =="
mutar "$DEST" '    if (lineas.length <= lineasQueCaben(mayuscula, m)) return { mayuscula, lineas, cortado: false };' \
              '    if (lineas.length <= lineasQueCaben(mayuscula, m) && mayuscula <= minMayuscula + 1e-9) return { mayuscula, lineas, cortado: false };' \
&& probar 'se queda con el más chico en vez del más grande'

echo "== CONTROLES (tienen que quedarse en VERDE) =="
mutar "$DEST" '// 🔴 SE PARTE POR ESPACIO, NUNCA A MITAD DE PALABRA. Una palabra cortada en dos' \
              '// 🔴 Se parte por espacio. Una palabra cortada en dos' \
&& controlar 'cambiar un comentario de etiqueta-destino.ts'

mutar "$DEST" '  const limpio = String(texto ?? "").trim();' '  const textoLimpio = String(texto ?? "").trim();' \
&& mutar "$DEST" 'if (!limpio) return { mayuscula: maxMayuscula, lineas: [], cortado: false };' \
                 'if (!textoLimpio) return { mayuscula: maxMayuscula, lineas: [], cortado: false };' \
&& mutar "$DEST" '    const lineas = partirPorEspacio(limpio, m.ancho, mayuscula, m.anchoDeTexto);' \
                 '    const lineas = partirPorEspacio(textoLimpio, m.ancho, mayuscula, m.anchoDeTexto);' \
&& mutar "$DEST" '  const lineas = partirPorEspacio(limpio, m.ancho, mayuscula, m.anchoDeTexto) ?? [limpio];' \
                 '  const lineas = partirPorEspacio(textoLimpio, m.ancho, mayuscula, m.anchoDeTexto) ?? [textoLimpio];' \
&& mutar "$DEST" '  if (visibles.length === 0) visibles.push(limpio);' \
                 '  if (visibles.length === 0) visibles.push(textoLimpio);' \
&& controlar 'renombrar una variable interna del acomodo'

echo
echo "─────────────────────────────────────────────"
echo "Mutaciones: $cazadas cazadas de $total (muertas: $muertas)"
echo "Controles:  $controles_ok en verde de $controles"
[ "$cazadas" -eq "$total" ] && [ "$muertas" -eq 0 ] && [ "$controles_ok" -eq "$controles" ]

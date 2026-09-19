#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «el descuento del proveedor se escribe,
# no se inventa» (18-sep-2026): `src/__tests__/lib/reebok-descuento-proveedor.test.ts`,
# más los dos candados de Reebok que NO se pueden romper con este cambio
# (`reebok-costo-unico` y `reebok-despacho`).
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/depurador/descuento-proveedor.ts
COSTO=src/lib/depurador/reebok.ts
TSX=src/app/productos/cargar/ReebokClient.tsx

TESTS=(
  src/__tests__/lib/reebok-descuento-proveedor.test.ts
  src/__tests__/lib/reebok-costo-unico.test.ts
  src/__tests__/lib/reebok-despacho.test.ts
  src/__tests__/lib/reebok-flete.test.ts
)

ARCHIVOS=("$REGLA" "$COSTO" "$TSX")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

# 🩸 NADA DE `echo "$salida" | grep -q`. Con `pipefail`, el `grep -q` corta el
# caño apenas encuentra lo que busca, el `echo` se muere de SIGPIPE y la tubería
# entera devuelve error: una corrida perfectamente viva se contaba como MUERTA,
# al azar. Acá se compara con el propio bash, sin tubería.
corrio()   { [[ "$1" == *"Test Files"* ]]; }
fallaron() { [[ "$1" =~ Tests[[:space:]]+.*failed ]]; }
cuantas()  { local n; n=$(printf '%s' "$1" | grep -oE "[0-9]+ failed" | head -1); echo "${n:-?}"; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! corrio "$salida"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if fallaron "$salida"; then
    echo "  ✅ CAZADA ($(cuantas "$salida")) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if corrio "$salida" && ! fallaron "$salida"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. el % escrito deja de aplicarse (vuelve el defecto original) =="
mutar "$REGLA" '  const p = pct ?? (esCalzado ? DESCUENTO_ESTIMADO_CALZADO : DESCUENTO_ESTIMADO_RESTO);' \
               '  const p = esCalzado ? DESCUENTO_ESTIMADO_CALZADO : DESCUENTO_ESTIMADO_RESTO;' \
&& probar 'el porcentaje escrito se ignora y se estima siempre'

echo "== 2. el «WholesalePrice OFF» del archivo deja de ganar =="
mutar "$COSTO" '  if (off !== null && off > 0) return off;' \
               '  if (off !== null && off > 0 && descuento === undefined) return off;' \
&& probar 'el % escrito le pisa el costo real del archivo (rompe el despacho)'

echo "== 3. el despacho empieza a usar el % (el costo real se pierde) =="
mutar "$COSTO" '  return wholesale * factorDeDescuento(normalizarDescuento(descuento), esFootwear(dept));' \
               '  return wholesale * factorDeDescuento(normalizarDescuento(descuento ?? 25), esFootwear(dept));' \
&& probar 'un 25 % por defecto se cuela en el cálculo'

echo "== 4. el tecleo imposible se aplica en vez de caer al estimado =="
mutar "$REGLA" '  if (n < 0 || n > DESCUENTO_MAX) return null;' \
               '  if (n < 0) return null;' \
&& probar 'un 150 % tecleado pasa y deja el costo negativo'

echo "== 5. el vacío deja de significar «estimar» =="
mutar "$REGLA" '  if (crudo === "") return null;' \
               '  if (crudo === "") return 0;' \
&& probar 'el campo vacío se lee como 0 % y el costo sube al precio de lista'

echo "== 6. el aviso ámbar se apaga (vuelve el silencio) =="
mutar "$REGLA" '  if (r.estimado > 0) {' \
               '  if (false) {' \
&& probar 'estimar vuelve a pasar sin decirlo'

echo "== 7. el aviso deja de decir qué hacer =="
mutar "$REGLA" '        `escríbelo arriba en «Descuento del proveedor %» y el costo se recalcula solo.` +' \
               '        `` +' \
&& probar 'el ámbar no dice dónde escribir el descuento'

echo "== 8. el aviso deja de decir que el dato del archivo manda =="
mutar "$REGLA" '    r.archivo > 0 ? ` ${cuantos(r.archivo)} traen el descuento en el archivo y ese manda.` : "";' \
               '    "";' \
&& probar 'no se dice que el descuento del archivo le gana al escrito'

echo "== 9. el resumen cuenta filas en vez de artículos =="
mutar "$REGLA" '    if (vistos.has(a.clave)) continue;' \
               '    /* sin dedup */' \
&& probar 'una preforma de 229 tallas dice 229 costos estimados'

echo "== 10. el % viaja también en el despacho (la pantalla deja de apagarlo) =="
mutar "$TSX" '  const descuento = formato === "confirmacion" ? normalizarDescuento(descuentoTexto) : null;' \
             '  const descuento = normalizarDescuento(descuentoTexto);' \
&& probar 'el campo del despacho vuelve a poder pisar el costo real'

echo "== 11. el campo se ofrece en el despacho =="
mutar "$TSX" '            {formato === "confirmacion" && (
              <Field
                label="Descuento del proveedor %"' \
             '            {true && (
              <Field
                label="Descuento del proveedor %"' \
&& probar 'el campo aparece donde el costo ya viene del archivo'

echo "== 12. vaciar el campo deja de borrar lo recordado =="
mutar "$TSX" '      if (v.trim() === "") localStorage.removeItem(CLAVE_DESCUENTO_RECORDADO);
      else localStorage.setItem(CLAVE_DESCUENTO_RECORDADO, v);' \
             '      localStorage.setItem(CLAVE_DESCUENTO_RECORDADO, v);' \
&& probar 'el descuento viejo revive al recargar la pantalla'

echo "== 13. el pedido para cliente se vuelve a calcular su propio costo =="
mutar "$COSTO" '    const { fob, cif: costo } = costoReebok(first.department, w, first.wholesaleOff, cfg.flete, cfg.descuento);' \
               '    const { fob, cif: costo } = costoReebok(first.department, w, first.wholesaleOff, cfg.flete);' \
&& probar 'la plantilla y el pedido vuelven a decir dos costos distintos'

echo "== 14. la ropa y el calzado usan porcentajes distintos aunque se escriba uno =="
mutar "$REGLA" '  return 1 - p / 100;' \
               '  return 1 - (esCalzado ? p : p + 10) / 100;' \
&& probar 'el descuento deja de ser GLOBAL'

echo "== 15. el «no se entiende» deja de distinguirse del vacío =="
mutar "$REGLA" '  if (typeof v !== "number" && String(v).trim() === "") return false;' \
               '  return false;' \
&& probar 'un 150 tecleado cae al estimado sin avisar'

echo
echo "== CONTROLES (tienen que quedar VERDES) =="

controlar 'sin mutación: todo el conjunto en verde'

mutar "$REGLA" '/** true solo cuando lo escrito es un porcentaje que se va a aplicar. */' \
               '/** true solo cuando lo escrito es un porcentaje que sí se va a aplicar. */' \
&& controlar 'cambiar un comentario no mueve nada'

echo
echo "── RESUMEN ──"
echo "mutaciones: $total · cazadas: $cazadas · corridas muertas: $muertas"
echo "controles: $controles · en verde: $controles_ok"
[ "$cazadas" -eq "$total" ] && [ "$controles_ok" -eq "$controles" ] && echo "✅ TODAS CAZADAS" || echo "❌ FALTA ALGUNA"

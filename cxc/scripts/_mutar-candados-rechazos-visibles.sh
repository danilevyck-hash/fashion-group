#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «lo que el guard dejó afuera se DICE en pantalla»
#
# Cada mutación rompe UNA de las reglas y el script exige que algún test se
# ponga rojo. Lo que se vigila:
#   · el guard SIGUE rechazando (la cifra imposible NO entra a la base)
#   · el rechazo queda REGISTRADO con documento y monto
#   · la línea se dibuja, y NO se dibuja cuando no hay nada
#   · la línea nunca pierde el documento ni el monto
#   · Boston sigue SIN Telegram
#   · Boston no se mezcla con el grupo
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada — las mutaciones
# se apilarían y ninguna se probaría por separado.
#
# 🩸 Y UNA MUTACIÓN QUE NO MATCHEA NADA se denuncia (`NO-OP`) en vez de darse
# por cazada o por sobreviviente: acusar al candado de un agujero que no existe
# es peor que no correr el verificador.
#
#   bash scripts/_mutar-candados-rechazos-visibles.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/rechazos-de-switch.ts"
  "src/components/AvisoRechazosSwitch.tsx"
  "src/components/cxc/BostonTab.tsx"
  "src/app/api/cxc/boston/route.ts"
  "src/app/api/cxc/aging/route.ts"
  "src/lib/switch-api/monto-guard.ts"
  "src/lib/switch-api/monto-guard-io.ts"
  "src/lib/switch-api/sync-estadocuenta-web.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

TESTS="src/__tests__/lib/rechazos-de-switch.test.ts \
src/__tests__/components/rechazos-visibles-en-pantalla.test.tsx \
src/__tests__/lib/monto-guard.test.ts \
src/__tests__/lib/monto-guard-candado.test.ts \
src/__tests__/lib/rechazo-queda-registrado.test.ts \
src/__tests__/lib/cxc-montos-escritos-a-mano.test.ts"

CAZADAS=0; TOTAL=0; NOOP=0

mutar() {
  local archivo="$1"; shift
  local antes despues
  antes="$(md5 -q "$archivo")"
  perl -0pi -e "$1" "$archivo"
  despues="$(md5 -q "$archivo")"
  if [ "$antes" = "$despues" ]; then
    echo "  ⚠️  MUTACIÓN NO-OP: el patrón no matcheó nada en $archivo"
    NOOP=$((NOOP + 1)); restaurar; return 1
  fi
  return 0
}

probar() {
  local nombre="$1"
  TOTAL=$((TOTAL + 1))
  local salida resumen fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  # 🩸 Si la corrida MUERE, "0 fallos" se leería como "sobrevivió".
  resumen="$(printf '%s' "$salida" | grep -E '^\s+Tests\s+' | tail -1)"
  if [ -z "$resumen" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — $nombre"
    restaurar; return
  fi
  fallos="$(printf '%s' "$resumen" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1)"
  fallos="${fallos:-0}"
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos rojos) — $nombre"; CAZADAS=$((CAZADAS + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── 1 · EL GUARD SIGUE RECHAZANDO ────────────────────────────────────────────
# Lo que NO cambia de todo esto: la cifra imposible no entra a la base. Si el
# guard deja de rechazar, la cartera de Boston pasa a $266.739.648,55.

mutar src/lib/switch-api/monto-guard.ts \
  's|return Math\.abs\(n\) > umbral;|return false;|' \
  && probar "el guard deja de rechazar: la cifra imposible ENTRA a la base"

mutar src/lib/switch-api/monto-guard.ts \
  's|if \(malas\.length === 0\) \{\n      buenas\.push\(fila\);\n      continue;\n    \}|buenas.push(fila);\n    if (malas.length === 0) continue;|' \
  && probar "la fila rechazada se escribe IGUAL (particionar deja de separar)"

# ── 2 · EL RECHAZO QUEDA REGISTRADO ──────────────────────────────────────────
# 🩸 El bug medido el 25-ago-2026: `records_skipped: 1` con `skip_details: null`
# en 6 de 6 corridas de confecciones_boston/estadocuenta. Sin el detalle, la
# pantalla no tiene qué decir.

mutar src/lib/switch-api/sync-estadocuenta-web.ts \
  's|      skipDetails: skips\.length > 0 \? skips : undefined,\n||' \
  && probar "el sync de Boston vuelve a NO guardar el detalle del rechazo"

mutar src/lib/switch-api/monto-guard-io.ts \
  's|    secuencial: r\.clave,|    secuencial: null,|' \
  && probar "el detalle pierde el número del documento"

mutar src/lib/switch-api/monto-guard-io.ts \
  's|    valorCrudo: \{ umbral, columnas: r\.columnas \},|    valorCrudo: { umbral },|' \
  && probar "el detalle pierde el monto"

# ── 3 · LA LÍNEA SE DIBUJA ───────────────────────────────────────────────────

mutar src/components/AvisoRechazosSwitch.tsx \
  's|  if \(!texto\) return null;|  return null;\n  if (!texto) return null;|' \
  && probar "la línea NUNCA se dibuja"

mutar src/components/cxc/BostonTab.tsx \
  's|<AvisoRechazosSwitch texto=\{data\?\.avisoMontos\} className="mb-3" />||' \
  && probar "la pestaña de Boston deja de montar la línea"

mutar src/components/cxc/BostonTab.tsx \
  's|<AvisoRechazosSwitch texto=\{data\?\.avisoMontos\} className="mb-3" />|<AvisoRechazosSwitch texto={data?.avisoMontos} className="mb-3 hidden" />|' \
  && probar "la línea se esconde con una clase"

mutar src/app/api/cxc/boston/route.ts \
  's|    clientes,\n    avisoMontos,|    clientes,|' \
  && probar "el servidor deja de mandarle la línea a la pestaña"

# ── 4 · SIN RECHAZOS NO SE DIBUJA NADA ───────────────────────────────────────

mutar src/lib/rechazos-de-switch.ts \
  's|  if \(rechazos\.length === 0\) return null;|  if (rechazos.length === 0) return "Está mal en Switch.";|' \
  && probar "se dibuja una línea SIN haber rechazos"

mutar src/components/AvisoRechazosSwitch.tsx \
  's|  if \(!texto\) return null;||' \
  && probar "la pieza dibuja su caja aunque no haya texto"

# ── 5 · LA LÍNEA NO PIERDE EL DOCUMENTO NI EL MONTO ──────────────────────────

mutar src/lib/rechazos-de-switch.ts \
  's|\$\{cuantos\} \$\{p\.donde\}: \$\{p\.el\} \$\{primero\.documento\} llega con \` \+|\${cuantos} \${p.donde}: un documento llega con \` +|' \
  && probar "la línea pierde el NÚMERO del documento"

mutar src/lib/rechazos-de-switch.ts \
  's|\`\$\{fmtMonto\(primero\.monto\)\}\$\{yMas\}\. Está mal en Switch\.\`|\`una cifra imposible\${yMas}. Está mal en Switch.\`|' \
  && probar "la línea pierde el MONTO"

mutar src/lib/rechazos-de-switch.ts \
  's|\. Está mal en Switch\.\`|.\`|' \
  && probar "la línea deja de decir que el problema está EN SWITCH"

mutar src/lib/rechazos-de-switch.ts \
  's|const doc = secuencial\.split\("·"\)\[0\]\.trim\(\);|const doc = "";|' \
  && probar "el documento se pierde al leerlo del log"

mutar src/lib/rechazos-de-switch.ts \
  's|    if \(mayor === null \|\| Math\.abs\(v\) > Math\.abs\(mayor\)\) mayor = v;|    if (mayor === null) mayor = v;|' \
  && probar "se muestra el monto MÁS CHICO de la fila, no el imposible"

# ── 6 · BOSTON SIGUE SIN TELEGRAM ────────────────────────────────────────────
# Decisión de Daniel del 5-ago-2026. Lo que gana es la línea EN PANTALLA; el
# aviso de Telegram sigue apagado, y las demás empresas lo conservan.

mutar src/lib/switch-api/monto-guard-io.ts \
  's|const SIN_AVISO_DE_MONTOS = new Set\(\["confecciones_boston"\]\);|const SIN_AVISO_DE_MONTOS = new Set<string>([]);|' \
  && probar "Boston recupera el aviso de Telegram"

mutar src/lib/switch-api/monto-guard-io.ts \
  's|const SIN_AVISO_DE_MONTOS = new Set\(\["confecciones_boston"\]\);|const SIN_AVISO_DE_MONTOS = new Set(["confecciones_boston", "vistana", "fashion_wear"]);|' \
  && probar "se le apaga el Telegram también a las demás empresas"

# ── 7 · BOSTON NO SE MEZCLA CON EL GRUPO ─────────────────────────────────────
# La regla que no se toca ni de refilón.

mutar src/app/api/cxc/aging/route.ts \
  's|    empresas: CXC_GRUPO_EMPRESA_KEYS,\n||' \
  && probar "el aviso del GRUPO deja de acotar por empresa (entra Boston)"

mutar src/app/api/cxc/boston/route.ts \
  's|    empresas: empresasCarteraAparte\(\),\n||' \
  && probar "el aviso de la PESTAÑA de Boston deja de acotar por empresa"

mutar src/lib/rechazos-de-switch.ts \
  's|    if \(empresas && empresas\.length > 0\) q = q\.in\("empresa_key", empresas\);||' \
  && probar "el módulo ignora la lista de empresas que le pasan"

# ── 8 · LA LECTURA NO PUEDE ROMPER LA PANTALLA NI INVENTAR ───────────────────

mutar src/lib/rechazos-de-switch.ts \
  's|  \} catch \{\n    return \[\];\n  \}|  } catch (e) {\n    throw e;\n  }|' \
  && probar "una base caída tumba la pantalla en vez de callarse"

mutar src/lib/rechazos-de-switch.ts \
  's#      if \(documento === null \|\| monto === null\) continue;##' \
  && probar "una fila sin monto legible se dibuja igual (media línea)"

mutar src/lib/rechazos-de-switch.ts \
  's|      if \(vistos\.has\(llave\)\) continue;||' \
  && probar "el mismo documento se cuenta una vez por corrida"

# ── 9 · ÁMBAR, NO ROJO ───────────────────────────────────────────────────────

mutar src/components/AvisoRechazosSwitch.tsx \
  's|text-amber-700|text-red-600|' \
  && probar "la línea pasa a rojo (se lee como 'algo se rompió acá')"

echo
echo "═══ RESULTADO: $CAZADAS de $TOTAL cazadas · $NOOP no-op ═══"
[ "$NOOP" -gt 0 ] && echo "⚠️  Hay mutaciones que NO MUTARON NADA: el informe está incompleto."
[ "$CAZADAS" -eq "$TOTAL" ] && [ "$NOOP" -eq 0 ] && echo "✅ todas cazadas"

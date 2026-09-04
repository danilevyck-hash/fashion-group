#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías › Configuración: la tabla
# `guias_destino_cliente`, el orden de precedencia y la pantalla (4-sep-2026).
#
# Lo que se ataca: que la TABLA gane sobre la constante y la constante sobre el
# histórico (una sola función, `destinosDefinidosPara`), que quitar sea SOFT
# DELETE firmado y nunca DELETE, que escriban admin Y secretaria («configuraciones
# también deja a secretaria») y NUNCA bodega, que un histórico jamás se promueva
# solo, que el campo Dirección siga siendo texto libre, y que la ruta de
# frecuencias de verdad mande los definidos.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS
# en la rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó en este repo.
#
# 🩸 EL PATRÓN QUE NO MUTA NADA SE DENUNCIA (⛔), no se canta como cazado. El
# reemplazo es LITERAL (scripts/_mutar-guias-aplicar.py) y exige que el texto
# viejo aparezca las veces que se le dicen. Hay una mutación de CONTROL que a
# propósito no matchea: si no sale ⛔, el denunciador está roto.
#
#   bash scripts/_mutar-candados-guias-destinos-config.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

PURO="src/lib/guias/destinos-clientes.ts"
CONF="src/lib/guias/destinos-config.ts"
SERVER="src/lib/guias/destinos-config-server.ts"
RUTA="src/app/api/guias/destinos-config/route.ts"
FREC="src/app/api/guias/frecuencias/route.ts"
VISTA="src/app/guias/components/GuiasConfiguracionView.tsx"
PAGINA="src/app/guias/page.tsx"
FORM="src/app/guias/components/GuiaForm.tsx"

ARCHIVOS=("$PURO" "$CONF" "$SERVER" "$RUTA" "$FREC" "$VISTA" "$PAGINA" "$FORM")
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

# La lista va como ARRAY: en zsh un string sin comillas NO se parte por
# espacios, le llegaría a vitest como UN argumento y correría 0 archivos.
TESTS=(
  "src/__tests__/lib/guias-destinos-precedencia.test.ts"
  "src/__tests__/api/guias-destinos-config-route.test.ts"
  "src/__tests__/components/guias-configuracion-pantalla.test.tsx"
  "src/__tests__/components/guia-form-destinos.test.tsx"
)

cazadas=0; sueltas=0; muertos=0; n=0

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_err_dcfg; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_err_dcfg))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run "${TESTS[@]}" --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE, "0 fallos" se leería como "sobrevivió".
  if ! grep -qE "Tests +[0-9]" <<< "$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — $nombre"
    sueltas=$((sueltas+1)); restaurar; return
  fi
  local fallos
  fallos=$(grep -oE "Tests +[0-9]+ failed" <<< "$salida" | grep -oE "[0-9]+" | sed -n 1p)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos rojos) — $nombre"; cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"; sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ MUTACIONES — Guías › Configuración · destinos en la tabla ═══"

# ── el orden de precedencia (una sola función) ───────────────────────────────

mutacion "la TABLA deja de ganar: la constante pisa lo corregido en la pantalla" "$PURO" \
  'if (filas && filas.length > 0) return filas;' \
  'if (false && filas && filas.length > 0) return filas;'

mutacion "la CONSTANTE deja de ser la red: el histórico pisa la definición" "$PURO" \
  'if (constante) return constante.map((d) => ({ destino: d, tiendas: TIENDAS_POR_CLIENTE[c]?.[d] }));' \
  'if (false && constante) return constante.map((d) => ({ destino: d, tiendas: TIENDAS_POR_CLIENTE[c]?.[d] }));'

# ── el soft delete ───────────────────────────────────────────────────────────

mutacion "quitar BORRA la fila: DELETE en vez de soft delete firmado" "$SERVER" \
  '.update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })' \
  '.delete()'

# ── quién escribe ────────────────────────────────────────────────────────────

mutacion "bodega gana permiso de escribir en la configuración" "$RUTA" \
  'const ROLES = [...CONFIG_GUIAS_ROLES];' \
  'const ROLES = [...CONFIG_GUIAS_ROLES, "bodega"];'

mutacion "la SECRETARIA pierde el permiso — Daniel dijo que se queda" "$CONF" \
  'export const CONFIG_GUIAS_ROLES = ["admin", "secretaria"] as const;' \
  'export const CONFIG_GUIAS_ROLES = ["admin"] as const;'

mutacion "la pestaña se dibuja para CUALQUIER rol (bodega y vendedor incluidos)" "$PAGINA" \
  'GUIAS_ATAJOS_NUEVOS && !!role && (CONFIG_GUIAS_ROLES as readonly string[]).includes(role);' \
  'GUIAS_ATAJOS_NUEVOS && !!role;'

# ── nada se escribe solo ─────────────────────────────────────────────────────

mutacion "un histórico se promueve SOLO al dibujarse (sin toque)" "$VISTA" \
  'onClick={() => onPromover(g.codigo, h)}' \
  'ref={() => onPromover(g.codigo, h)}'

# ── el campo sigue siendo texto libre ────────────────────────────────────────

mutacion "el campo Dirección deja de ser editable" "$FORM" \
  'onChange={(e) => { onUpdateItem(idx, "direccion", e.target.value); marcarTocado(clave); }}' \
  'readOnly onChange={() => {}}'

# ── la ruta de frecuencias ───────────────────────────────────────────────────

mutacion "la ruta de frecuencias calcula los definidos y los TIRA" "$FREC" \
  'const definidos = GUIAS_ATAJOS_NUEVOS ? await leerDefinidosOVacio() : {};' \
  'const definidos = {};'

# ── control: un patrón que NO existe tiene que denunciarse ───────────────────

mutacion "CONTROL (a propósito no matchea): el denunciador está vivo" "$PURO" \
  'este texto no existe en el archivo' \
  'da igual'

echo ""
echo "═══ RESULTADO: $cazadas cazadas · $sueltas sueltas · $muertos patrones muertos (el CONTROL debe ser 1) · $n corridas ═══"
if [ "$sueltas" -gt 0 ] || [ "$muertos" -ne 1 ]; then exit 1; fi

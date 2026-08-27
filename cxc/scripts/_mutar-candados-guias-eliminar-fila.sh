#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías: el «···» sube a la FILA para que borrar no
# obligue a abrir la guía (27-ago-2026).
#
# Daniel: *"y darle acceso a secretaria de poder eliminar guias"*. El permiso ya
# lo tenía (el DELETE de la ruta acepta admin+secretaria desde siempre); lo que
# faltaba era encontrar el botón.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 Y EL SCRIPT DENUNCIA EL PATRÓN QUE NO MUTA NADA en vez de cantarlo como
# "SOBREVIVIÓ" — un rojo inventado sobre un candado que nunca se puso a prueba.
# El reemplazo es LITERAL (`scripts/_mutar-guias-aplicar.py`) y exige que el
# texto viejo aparezca las veces que se le dicen.
#
#   bash scripts/_mutar-candados-guias-eliminar-fila.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/guias/components/GuiasList.tsx"
  "src/app/guias/page.tsx"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

# Se corren TAMBIÉN los candados vecinos del módulo: el «···» se movió de sitio
# y lo que no puede pasar es que se lleve puesto algo de la fila o del acordeón.
TESTS="src/__tests__/components/guias-eliminar-en-la-fila.test.tsx \
src/__tests__/components/guias-sin-rechazo.test.tsx \
src/__tests__/components/guias-entrega-directa.test.tsx"

cazadas=0; sueltas=0; muertos=0; n=0

LISTA="src/app/guias/components/GuiasList.tsx"
PAGE="src/app/guias/page.tsx"

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_err_elim; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_err_elim))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
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

echo "═══ MUTACIONES ═══"

# ── 1 · el menú tiene que estar EN LA FILA ───────────────────────────────────

mutacion "el «···» se va de la fila (vuelve a costar 3 toques)" "$LISTA" \
  '{canDelete && !selectionMode && (' \
  '{false && canDelete && !selectionMode && ('

# 🩸 La mutación mueve el `</button>` al FINAL del bloque en vez de borrarlo: si
# solo se borrara, el JSX queda desbalanceado, el módulo no compila y lo que se
# probaría es que un archivo roto rompe — no el candado.
mutacion "el «···» vuelve a quedar ANIDADO dentro del botón de la fila" "$LISTA" \
'                          </button>
                          {canDelete && !selectionMode && (
                            <div className="shrink-0 flex items-center pr-1">
                              {/* El rótulo lleva el N° de la guía: hay un «···»
                                  por fila y "Más opciones" a secas no diría de
                                  cuál. */}
                              <OverflowMenu
                                ariaLabel={`Más opciones de la guía ${fmtGuia(g.numero)}`}
                                items={[
                                  { label: "Eliminar guía", onClick: () => onDelete(g.id), destructive: true },
                                ]}
                              />
                            </div>
                          )}
' \
'                          {canDelete && !selectionMode && (
                            <div className="shrink-0 flex items-center pr-1">
                              <OverflowMenu
                                ariaLabel={`Más opciones de la guía ${fmtGuia(g.numero)}`}
                                items={[
                                  { label: "Eliminar guía", onClick: () => onDelete(g.id), destructive: true },
                                ]}
                              />
                            </div>
                          )}
                          </button>
'

# ── 2 · quién lo ve ──────────────────────────────────────────────────────────

mutacion "el «···» se le dibuja a CUALQUIER rol (bodega y vendedor incluidos)" "$LISTA" \
  '{canDelete && !selectionMode && (' \
  '{!selectionMode && ('

mutacion "DELETE_ROLES se abre a bodega" "$LISTA" \
  'const DELETE_ROLES = ["admin", "secretaria"];' \
  'const DELETE_ROLES = ["admin", "secretaria", "bodega"];'

mutacion "🔴 la SECRETARIA pierde el permiso (lo que Daniel pidió cuidar)" "$LISTA" \
  'const DELETE_ROLES = ["admin", "secretaria"];' \
  'const DELETE_ROLES = ["admin"];'

mutacion "el menú deja de mirar readOnly" "$LISTA" \
  'const canDelete = !readOnly && role && DELETE_ROLES.includes(role);' \
  'const canDelete = role && DELETE_ROLES.includes(role);'

mutacion "el «···» se queda puesto en modo selección" "$LISTA" \
  '{canDelete && !selectionMode && (' \
  '{canDelete && ('

# ── 3 · a QUÉ guía apunta ────────────────────────────────────────────────────

mutacion "el ítem apunta siempre a la PRIMERA guía de la lista" "$LISTA" \
  '{ label: "Eliminar guía", onClick: () => onDelete(g.id), destructive: true },' \
  '{ label: "Eliminar guía", onClick: () => onDelete(guias[0].id), destructive: true },'

mutacion "el rótulo del «···» deja de decir de qué guía es" "$LISTA" \
  'ariaLabel={`Más opciones de la guía ${fmtGuia(g.numero)}`}' \
  'ariaLabel="Más opciones"'

# ── 4 · la confirmación ──────────────────────────────────────────────────────

mutacion "🔴 el menú BORRA DE UNA, sin la ventana que exige escribir ELIMINAR" "$PAGE" \
  'onDelete={s.requestDeleteGuia}' \
  'onDelete={(id) => { void fetch(`/api/guias/${id}`, { method: "DELETE" }); }}'

mutacion "la ventana acepta confirmar sin escribir la palabra" "$PAGE" \
  'const matches = input.trim().toUpperCase() === "ELIMINAR";' \
  'const matches = true;'

# ── 5 · lo que NO se podía llevar puesto ─────────────────────────────────────

mutacion "«Compartir» se cae de la guía abierta" "$LISTA" \
'                                      Compartir
                                    </button>' \
'                                      Enviar
                                    </button>'

mutacion "la fila abierta pierde «Editar» (la reestructuración se llevó algo)" "$LISTA" \
  '{canEdit && (' '{false && canEdit && ('

# 🩸 EL CONTROL DEL PROPIO SCRIPT: una mutación que a propósito no matchea nada.
# Si esto no sale ⛔, el denunciador está roto y todos los ✅ de arriba valen lo
# mismo que un barrido con el comentario adentro.
mutacion "(control) un patrón que no existe tiene que salir DENUNCIADO" "$LISTA" \
  'esto-no-existe-en-el-archivo' 'tampoco-esto'

echo
echo "═══ RESUMEN ═══"
echo "  intentadas: $n · cazadas: $cazadas · sobrevivieron: $sueltas · patrones muertos: $muertos"
# El control aporta EL único ⛔ esperado.
[ "$sueltas" -eq 0 ] && [ "$muertos" -eq 1 ]

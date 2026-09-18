#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados de las ETIQUETAS PARA BULTOS
# (18-sep-2026): Guías › Etiquetas.
#
# Se rompe el producto a propósito, de a una mutación, y se exige que los
# candados se pongan ROJOS. Dos CONTROLES cambian cosas que NO son la regla
# (un comentario, un texto de toast) y tienen que quedarse en VERDE: si un
# control se pone rojo, el candado está atado a la letra y no a la conducta.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

PURO=src/lib/guias/etiquetas.ts
SRV=src/lib/guias/etiquetas-server.ts
PDF=src/lib/guias/pdf-etiquetas.ts
RUTA=src/app/api/guias/etiquetas/route.ts
RUTA1="src/app/api/guias/etiquetas/[id]/route.ts"
VISTA=src/app/guias/components/EtiquetasView.tsx
PAGINA=src/app/guias/page.tsx
TABLAS=src/lib/backup/tablas.ts
SQL=supabase/migrations/20261207120000_guias_etiquetas.sql

TESTS=(
  src/__tests__/lib/guias-etiquetas.test.ts
  src/__tests__/api/guias-etiquetas-route.test.ts
  src/__tests__/components/guias-etiquetas-pantalla.test.tsx
  src/__tests__/lib/backup-nada-sin-copia.test.ts
)

ARCHIVOS=("$PURO" "$SRV" "$PDF" "$RUTA" "$RUTA1" "$VISTA" "$PAGINA" "$TABLAS" "$SQL")

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

echo "== 1. el renglón borrado sigue atando (el estado deja de derivarse) =="
mutar "$PURO" '  if (renglon.deleted) return null;' '  if (false) return null;' \
&& probar 'guiaQueSeLlevo ignora el deleted del renglón'

echo "== 2. la guía borrada sigue atando =="
mutar "$PURO" '  if (!g || g.deleted) return null;' '  if (!g) return null;' \
&& probar 'guiaQueSeLlevo ignora el deleted de la guía'

echo "== 3. una etiqueta importada se puede corregir y borrar =="
mutar "$PURO" '  return !estaImportada(e);' '  return true;' \
&& probar 'puedeCorregirse siempre true'

echo "== 4. el SERVIDOR deja corregir una que ya salió en una guía =="
mutar "$SRV" '  if (actual.guia_numero !== null) {
    return {
      ok: false,
      status: 409,
      error: `Ya salió en ${rotuloGuia(actual.guia_numero)}: los bultos no se corrigen`,
    };
  }' '  // (mutación) el servidor ya no mira si salió en una guía' \
&& probar 'corregirCajas sin el 409'

echo "== 5. el SERVIDOR deja borrar una que ya salió en una guía =="
mutar "$SRV" '  if (actual.guia_numero !== null) {
    return {
      ok: false,
      status: 409,
      error: `Ya salió en ${rotuloGuia(actual.guia_numero)}: no se puede borrar`,
    };
  }' '  // (mutación) el servidor ya no mira si salió en una guía' \
&& probar 'borrarEtiqueta sin el 409'

echo "== 6. borrar deja de firmarse (soft delete sin quién ni cuándo) =="
mutar "$SRV" '    .update({ deleted: true, borrado_por: borradoPor, borrado_en: new Date().toISOString() })' '    .update({ deleted: true })' \
&& probar 'soft delete sin firma'

echo "== 7. el anti-duplicado del servidor se apaga =="
mutar "$SRV" '  if (yaEsta) {' '  if (false && yaEsta) {' \
&& probar 'crearEtiqueta sin preguntar si ya existe'

echo "== 8. el anti-duplicado mira también las BORRADAS (no se puede reetiquetar) =="
mutar "$SRV" '    .eq("switch_factura_id", switchFacturaId)
    .eq("deleted", false)' '    .eq("switch_factura_id", switchFacturaId)' \
&& probar 'buscarViva sin el filtro de vivas'

echo "== 9. importar muda una etiqueta que YA salió en otra guía =="
mutar "$SRV" '    if (e.guia_numero !== null) continue;' '    if (false) continue;' \
&& probar 'importarEtiquetas sin el freno de lo ya importado'

echo "== 10. sin la tabla, el GET contesta error en vez de fallar abierto =="
mutar "$RUTA" '    if ((e as ErrorConTabla).tablaAusente) {
      return NextResponse.json({ etiquetas: [], sinTabla: true, aviso: AVISO_MIGRACION });
    }' '    // (mutación) sin la tabla, la pantalla se rompe' \
&& probar 'GET sin fail-open'

echo "== 11. Boston y Multifashion entran a las etiquetas =="
mutar "$PURO" '  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa_key)) {' '  if (!empresa_key) {' \
&& probar 'la empresa deja de validarse contra las 6 del grupo'

echo "== 12. los roles se escriben a mano en vez de derivarse =="
mutar "$PURO" 'export const ETIQUETAS_ROLES: readonly string[] = GUIAS_WRITE_ROLES;' 'export const ETIQUETAS_ROLES: readonly string[] = ["admin", "secretaria", "bodega"];' \
&& probar 'ETIQUETAS_ROLES copiada a mano'

echo "== 13. el vendedor entra a etiquetar =="
mutar "$PURO" 'export const ETIQUETAS_ROLES: readonly string[] = GUIAS_WRITE_ROLES;' 'export const ETIQUETAS_ROLES: readonly string[] = [...GUIAS_WRITE_ROLES, "vendedor"];' \
&& probar 'el vendedor en ETIQUETAS_ROLES'

echo "== 14. tres etiquetas por hoja en vez de cuatro =="
mutar "$PURO" 'export const ETIQUETAS_POR_HOJA = 4;' 'export const ETIQUETAS_POR_HOJA = 3;' \
&& probar 'ETIQUETAS_POR_HOJA = 3'

echo "== 15. la reimpresión de una caja NO va en la posición 1 =="
mutar "$PURO" '    for (let j = 0; j < ETIQUETAS_POR_HOJA; j++) {
      hoja.push(i + j < cajas.length ? cajas[i + j] : null);
    }' '    for (let j = ETIQUETAS_POR_HOJA - 1; j >= 0; j--) {
      hoja.push(i + j < cajas.length ? cajas[i + j] : null);
    }' \
&& probar 'los cuartos se llenan al revés'

echo "== 16. se juntan solo por CLIENTE, sin mirar la empresa =="
mutar "$PURO" '    const clave = `${codigo}|${(e.empresa_key ?? "").trim()}`;' '    const clave = codigo;' \
&& probar 'agrupar sin la empresa'

echo "== 17. la etiqueta empieza a llevar el transportista =="
mutar "$PDF" '  doc.text(`Destino: ${d.destino}`, izq, y);' '  doc.text(`Destino: ${d.destino} · transportista`, izq, y);' \
&& probar 'el transportista en el papel'

echo "== 18. la pestaña cuelga del interruptor de reversión de Nueva guía =="
mutar "$PAGINA" '  const hayEtiquetas = puedeEtiquetar(role);' '  const hayEtiquetas = GUIAS_ATAJOS_NUEVOS && puedeEtiquetar(role);' \
&& probar 'la pestaña atada a GUIAS_ATAJOS_NUEVOS'

echo "== 19. la tabla nueva se cae del respaldo =="
mutar "$TABLAS" '  "guias_etiquetas",' '  // "guias_etiquetas",' \
&& probar 'guias_etiquetas fuera de la clasificación'

echo "== 20. el índice único deja de ser PARCIAL (no se puede reetiquetar nunca) =="
mutar "$SQL" '  ON guias_etiquetas (empresa_key, switch_factura_id)
  WHERE NOT deleted;' '  ON guias_etiquetas (empresa_key, switch_factura_id);' \
&& probar 'el único sin WHERE NOT deleted'

echo '== 21. deleted vuelve a ser NULLABLE (el índice parcial dejaría pasar repetidos) =='
mutar "$SQL" '  deleted           boolean NOT NULL DEFAULT false,' '  deleted           boolean DEFAULT false,' \
&& probar 'deleted nullable'

echo "== 22. la base recibe permiso de DELETE =="
mutar "$SQL" 'GRANT SELECT, INSERT, UPDATE ON guias_etiquetas TO service_role;' 'GRANT SELECT, INSERT, UPDATE, DELETE ON guias_etiquetas TO service_role;' \
&& probar 'GRANT con DELETE'

echo "== 23. la baja deja de exigir firma en la base =="
mutar "$SQL" '  CONSTRAINT guias_etiquetas_baja_firmada
    CHECK (NOT deleted OR (borrado_por IS NOT NULL AND borrado_en IS NOT NULL))' '  CONSTRAINT guias_etiquetas_baja_sin_firmar
    CHECK (true)' \
&& probar 'CHECK de firma retirado'

echo "== 24. la pantalla decide el bloqueo por su cuenta, no con la regla pura =="
mutar "$VISTA" '                              disabled: !puedeCorregirse(e),
                            },
                            {
                              label: bloqueo ? "Borrar — bloqueado" : "Borrar",
                              onClick: () => setBorrando(e),
                              destructive: true,
                              disabled: !puedeCorregirse(e),' '                              disabled: e.guia_numero !== null,
                            },
                            {
                              label: bloqueo ? "Borrar — bloqueado" : "Borrar",
                              onClick: () => setBorrando(e),
                              destructive: true,
                              disabled: e.guia_numero !== null,' \
&& probar 'la pantalla reimplementa la regla'

echo "== CONTROL A. solo cambia un comentario del módulo puro =="
mutar "$PURO" '/** Hoja carta partida en cuartos: cuatro etiquetas por hoja. */' '/** La hoja carta se parte en cuartos: cuatro etiquetas por hoja. */' \
&& controlar 'comentario de ETIQUETAS_POR_HOJA'

echo "== CONTROL B. el toast de borrado cambia de palabras =="
mutar "$VISTA" '    setToast("Etiquetas borradas");' '    setToast("Listo, se quitaron las etiquetas");' \
&& controlar 'texto del toast'

echo
echo "RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde"

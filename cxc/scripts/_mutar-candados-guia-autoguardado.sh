#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Verificación por MUTACIÓN del candado "abrir editar no escribe".
#
# 🩸 La restauración va por COPIA, no por `git checkout`: en la rama hay
#    archivos NUEVOS y git aborta el comando entero sin restaurar nada, así que
#    las mutaciones se apilan y ninguna se prueba por separado. Ya pasó acá.
#
#   bash scripts/_mutar-candados-guia-autoguardado.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")/.."

TESTS="src/__tests__/components/guias-editar-no-guarda-sola.test.tsx src/__tests__/lib/guias-cambios-form.test.ts"
ARCHIVOS=(
  "src/lib/guias/cambios-form.ts"
  "src/app/guias/components/GuiaForm.tsx"
  "src/app/guias/components/useGuiaFormState.ts"
)
RESP="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESP/$(dirname "$f")"; cp "$f" "$RESP/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESP/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; total=0
probar() {
  local nombre="$1"
  total=$((total+1))
  if npx vitest run $TESTS >/tmp/mut-guia.log 2>&1; then
    echo "🔴 SOBREVIVIÓ: $nombre"
  else
    echo "✅ cazada:     $nombre  ($(grep -cE '^\s+×' /tmp/mut-guia.log) casos en rojo)"
    cazadas=$((cazadas+1))
  fi
  restaurar
}

# 1. El formulario vuelve a decir que SIEMPRE hay cambios (= el contador viejo,
#    que daba "sucio" apenas terminaban de cargar los datos).
perl -0pi -e 's/  if \(!guardado\) return false;\n  return guardado\.todo !== actual\.todo;/  return true;/' src/lib/guias/cambios-form.ts
probar "hayCambios siempre true (el formulario nace sucio)"

# 2. Sin referencia de lo guardado se afirma un cambio → abrir escribe.
perl -0pi -e 's/  if \(!guardado\) return false;/  if (!guardado) return true;/' src/lib/guias/cambios-form.ts
probar "sin instantánea de referencia se declara sucio"

# 3. Los renglones vuelven a viajar SIEMPRE (cambiar una nota le rota el id a
#    cada línea).
perl -0pi -e 's/  if \(!guardado\) return true;\n  return guardado\.renglones !== actual\.renglones;/  return true;/' src/lib/guias/cambios-form.ts
probar "los renglones viajan siempre (un cambio de cabecera rota los ids)"

# 4. Los renglones no viajan NUNCA → un cambio de línea se perdería.
perl -0pi -e 's/  if \(!guardado\) return true;\n  return guardado\.renglones !== actual\.renglones;/  return false;/' src/lib/guias/cambios-form.ts
probar "los renglones no viajan nunca (se pierde el cambio de una línea)"

# 5. El formulario ignora lo que le dicen y autoguarda igual.
perl -0pi -e 's/    if \(!editingId \|\| !hayCambios \|\| saving\) return;/    if (!editingId || saving) return;/' src/app/guias/components/GuiaForm.tsx
probar "el autoguardado deja de mirar si hubo cambios"

# 6. Se cae el freno anti-bucle.
perl -0pi -e 's/    if \(instantanea === ultimoIntento\.current\) return;\n//' src/app/guias/components/GuiaForm.tsx
probar "se cae el freno que impide reintentar el mismo guardado"

# 7. La referencia se toma DESPUÉS de cargar, en un render posterior (o sea:
#    nunca, porque el formulario ya arrancó sucio).
perl -0pi -e 's/        setGuardado\(\n          instantaneaGuia\(/        void 0 \&\& setGuardado(\n          instantaneaGuia(/' src/app/guias/components/useGuiaFormState.ts
probar "al cargar la guía no se guarda la referencia"

# 8. El aviso "Listo, guardado" vuelve a ponerse antes de que el servidor conteste.
perl -0pi -e 's/  function handleSave\(opts\?: \{ silent\?: boolean \}\) \{\n    return onSave\(opts\);\n  \}/  function handleSave(opts?: { silent?: boolean }) {\n    return onSave(opts);\n  }\n  const _mut = true;/' src/app/guias/components/GuiaForm.tsx
perl -0pi -e 's/const saveStatus = saving \? "saving" : hayCambios \? "dirty" : guardadoEn \? "saved" : null;/const saveStatus = saving ? "saving" : "saved";/' src/app/guias/components/GuiaForm.tsx
probar "la pantalla dice \"Listo, guardado\" apenas abre"

echo
echo "Verificado por mutación: $cazadas de $total cazadas."
[ "$cazadas" = "$total" ]

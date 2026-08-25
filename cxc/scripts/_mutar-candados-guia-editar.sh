#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de «Editar abre el mismo formulario».
#
# Se rompe el producto a propósito, una cosa por vez, y se exige que algún test
# se ponga ROJO. Una mutación que sobrevive es un candado que no protege nada.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
#   bash scripts/_mutar-candados-guia-editar.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/guias/[id]/page.tsx"
  "src/app/guias/[id]/editar/page.tsx"
  "src/app/guias/components/EdicionGuia.tsx"
  "src/app/guias/components/GuiaForm.tsx"
  "src/app/guias/components/useGuiaFormState.ts"
  "src/app/guias/components/guia-form-logic.ts"
  "src/lib/guias/falta-para-despachar.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/components/guias-editar-en-la-misma-pantalla.test.tsx \
src/__tests__/components/guias-editar-no-guarda-sola.test.tsx \
src/__tests__/lib/guias-falta-para-guardar.test.ts"

cazadas=0; sueltas=0; n=0

probar() {
  n=$((n+1))
  local nombre="$1"
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE, "0 fallos" se leería como "sobrevivió". Se exige
  # encontrar el resumen de vitest antes de creerle a un cero.
  if ! grep -qE "Tests +[0-9]" <<< "$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — $nombre"
    sueltas=$((sueltas+1))
    restaurar
    return
  fi
  local fallos
  fallos=$(grep -oE "Tests +[0-9]+ failed" <<< "$salida" | grep -oE "[0-9]+" | sed -n 1p)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos tests rojos) — $nombre"
    cazadas=$((cazadas+1))
  else
    echo "  🔴 SOBREVIVIÓ — $nombre"
    sueltas=$((sueltas+1))
  fi
  restaurar
}

echo "═══ MUTACIONES ═══"

# ── El botón «Editar» y el formulario dentro de la guía ──────────────────────

# 1. La guía pendiente deja de ofrecer «Editar».
perl -0pi -e 's|\{puedeEditar && \(\n                  <div className="mt-3">|{false \&\& (\n                  <div className="mt-3">|' "src/app/guias/[id]/page.tsx"
probar "la guía pendiente deja de ofrecer «Editar»"

# 2. Una guía YA DESPACHADA vuelve a ser editable.
perl -0pi -e 's|const puedeEditar = EDICION_ROLES\.includes\(role \|\| ""\) && !s\.despachada;|const puedeEditar = EDICION_ROLES.includes(role \|\| "");|' "src/app/guias/[id]/page.tsx"
probar "se puede editar una guía YA DESPACHADA"

# 3. La guía despachada deja de decir que está bloqueada.
perl -0pi -e 's|Esta guía ya se despachó: no se puede editar\.|Guía cerrada.|' "src/app/guias/[id]/page.tsx"
probar "la pantalla deja de decir que la guía despachada está bloqueada"

# 4. Editando, vuelve la SEGUNDA copia de la lista de envíos.
perl -0pi -e 's|\{enEdicion \? \(|{false ? (|' "src/app/guias/[id]/page.tsx"
probar "la lista de solo lectura se dibuja además del formulario"

# 5. «Despachar» sale de la pantalla mientras se edita.
perl -0pi -e 's|<div className="max-w-4xl mx-auto px-4 sm:px-6 pb-6">\{bloqueDespacho\}</div>|<div className="max-w-4xl mx-auto px-4 sm:px-6 pb-6" />|' "src/app/guias/[id]/page.tsx"
probar "«Despachar» desaparece mientras se edita"

# 6. Guardar te saca de la guía (se pierde `alGuardar`).
perl -0pi -e 's|useGuiaFormState\(\{ editingId: id, alGuardar: onGuardado \}\)|useGuiaFormState({ editingId: id })|' src/app/guias/components/EdicionGuia.tsx
probar "guardar vuelve a sacarte de la guía al listado"

# 7. El hook ignora `alGuardar` y navega igual.
perl -0pi -e 's|if \(alGuardar\) alGuardar\(\);\n          else router\.push\("/guias"\);|router.push("/guias");|' src/app/guias/components/useGuiaFormState.ts
probar "el hook ignora «alGuardar» y navega igual"

# 8. El camino viejo deja de redirigir (404 donde había trabajo).
perl -0pi -e 's|if \(id\) router\.replace\(`/guias/\$\{id\}\?editar=1`\);||' "src/app/guias/[id]/editar/page.tsx"
probar "«/guias/[id]/editar» deja de redirigir"

# ── A · la red de seguridad del guardado ─────────────────────────────────────

# 9. Se cae el `finally`: el botón se queda en "Guardando…" para siempre.
perl -0pi -e 's|\n    \} catch \{\n(?:[^\n]*\n)*?    \} finally \{\n      setSaving\(false\);\n    \}|\n      setSaving(false);\n    } catch {\n      /* mutación: sin red de seguridad */\n    }|' src/app/guias/components/useGuiaFormState.ts
probar "vuelve el botón atascado en «Guardando…» al caerse la red"

# 10. Se cae el aviso: no se guardó y nadie se entera.
perl -0pi -e 's|setError\("Sin conexión\. No se guardó nada — revisa el internet y vuelve a intentar\."\);||' src/app/guias/components/useGuiaFormState.ts
probar "la caída de red no avisa nada"

# ── B · el rojo prematuro del autoguardado ───────────────────────────────────

# 11. El autoguardado vuelve a pintar errores.
perl -0pi -e 's|if \(!validate\(\{ pintar: !silent \}\)\) return;|if (!validate()) return;|' src/app/guias/components/useGuiaFormState.ts
probar "el autoguardado vuelve a pintar el formulario en rojo"

# 12. `validate` ignora el pedido de callarse.
perl -0pi -e 's|const pintar = opts\?\.pintar !== false;|const pintar = true;|' src/app/guias/components/useGuiaFormState.ts
probar "«validate» ignora «pintar» y grita igual"

# ── C · el botón apagado que dice por qué ────────────────────────────────────

# 13. Vuelve la regla vieja, más floja y muda.
perl -0pi -e 's|disabled=\{saving \|\| !puedeGuardar\}|disabled={saving \|\| !items.some(i => i.cliente)}|' src/app/guias/components/GuiaForm.tsx
probar "el botón vuelve a la regla vieja (más floja que la que decide)"

# 14. El aviso no se dibuja: apagado y sin explicación.
perl -0pi -e 's|if \(puedeGuardar \|\| saving\) return null;|return null;|' src/app/guias/components/GuiaForm.tsx
probar "el botón queda apagado y NO dice por qué"

# 15. Nunca falta nada: el botón se enciende siempre.
perl -0pi -e 's|(export function faltaParaGuardar\(estado: EstadoGuia\): string\[\] \{)|$1\n  return [];|' src/app/guias/components/guia-form-logic.ts
probar "«faltaParaGuardar» no encuentra nunca nada"

# 16. Segunda lista de reglas: deja de llamar a `validarGuia`.
perl -0pi -e 's|const errores = validarGuia\(estado\);|const errores = new Set<string>(estado.fecha ? [] : ["fecha"]);|' src/app/guias/components/guia-form-logic.ts
probar "la lista de faltantes se separa de «validarGuia»"

# 17. El unidor se rompe: dos idiomas para la misma frase.
perl -0pi -e 's|return `\$\{previos\} y \$\{partes\[partes\.length - 1\]\}`;|return partes.join(", ");|' src/lib/guias/falta-para-despachar.ts
probar "el unidor deja de decir «y» antes del último"

echo
echo "═══ RESULTADO: $cazadas de $n cazadas · $sueltas sueltas ═══"
[ "$sueltas" -eq 0 ]

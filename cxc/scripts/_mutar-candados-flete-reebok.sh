#!/usr/bin/env bash
# Verificación por mutación del candado del FLETE de Reebok.
#
# Rompe cada regla a propósito y exige que `reebok-flete.test.ts` se ponga ROJO.
# Al final, DOS CONTROLES que NO deben cazarse (si se cazan, el candado está
# mirando el texto y no la regla).
#
# 🩸 RESTAURA POR COPIA, NUNCA con `git checkout` (9-sep-2026): un trap con
# `git checkout` disparó al morir el proceso y le borró a un agente su propia
# implementación sin commitear. Acá se copia lo que HAY al empezar y se
# restaura de ahí, esté commiteado o no.

set -uo pipefail
cd "$(dirname "$0")/.."

TEST="src/__tests__/lib/reebok-flete.test.ts"
ARCHIVOS=(
  "src/lib/depurador/flete.ts"
  "src/lib/depurador/reebok.ts"
  "src/lib/depurador/logic.ts"
  "src/app/productos/cargar/ReebokClient.tsx"
  "src/app/api/productos/cargar/flete/route.ts"
  "supabase/migrations/20261126120000_reebok_flete_default.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

CAZADAS=0; TOTAL=0; ESCAPADAS=()

# mutar <archivo> <viejo> <nuevo> <descripción>
mutar() {
  local f="$1" viejo="$2" nuevo="$3" desc="$4"
  TOTAL=$((TOTAL + 1))
  python3 - "$f" "$viejo" "$nuevo" <<'PY' || { echo "  ⚠️  no se pudo aplicar: $desc"; ESCAPADAS+=("$desc (no aplicó)"); restaurar; return; }
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
if s.count(viejo) != 1:
    sys.exit(1)
open(f, "w").write(s.replace(viejo, nuevo))
PY
  if npx vitest run "$TEST" >/dev/null 2>&1; then
    echo "  ❌ ESCAPÓ: $desc"; ESCAPADAS+=("$desc")
  else
    echo "  ✅ cazada: $desc"; CAZADAS=$((CAZADAS + 1))
  fi
  restaurar
}

# control <archivo> <viejo> <nuevo> <descripción> — NO debe cazarse
control() {
  local f="$1" viejo="$2" nuevo="$3" desc="$4"
  python3 - "$f" "$viejo" "$nuevo" <<'PY'
import sys
f, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
assert s.count(viejo) == 1, f"el control no aplicó: {viejo!r}"
open(f, "w").write(s.replace(viejo, nuevo))
PY
  if npx vitest run "$TEST" >/dev/null 2>&1; then
    echo "  ✅ CONTROL sano (no se cazó): $desc"
  else
    echo "  ❌ CONTROL CAZADO — el candado mira el texto, no la regla: $desc"
    ESCAPADAS+=("CONTROL cazado: $desc")
  fi
  restaurar
}

echo "── Mutaciones ──────────────────────────────────────────────"
mutar src/lib/depurador/flete.ts \
  'export const FLETE_DEFAULT: Flete = 1.1;' \
  'export const FLETE_DEFAULT: Flete = 1.15;' \
  "el default deja de ser 1.10"
mutar src/lib/depurador/flete.ts \
  'export const FLETE_OPCIONES = [1.1, 1.15] as const;' \
  'export const FLETE_OPCIONES = [1.1, 1.15, 1.2] as const;' \
  "nace una tercera opción (1.2)"
mutar src/lib/depurador/flete.ts \
  'export const FLETE_OPCIONES = [1.1, 1.15] as const;' \
  'export const FLETE_OPCIONES = [1.1] as const;' \
  "desaparece el 1.15"
mutar src/lib/depurador/flete.ts \
  'return (FLETE_OPCIONES.find((o) => o === n) ?? FLETE_DEFAULT) as Flete;' \
  'return (isNaN(n) ? FLETE_DEFAULT : n) as Flete;' \
  "normalizar deja pasar un 11 tecleado"
mutar src/lib/depurador/flete.ts \
  'return FLETE_OPCIONES.some((o) => o === n);' \
  'return !isNaN(n) && n > 0;' \
  "validar acepta cualquier número positivo"
mutar src/lib/depurador/flete.ts \
  'return normalizarFlete(v).toFixed(2);' \
  'return String(normalizarFlete(v));' \
  "la etiqueta pierde los dos decimales"
mutar src/lib/depurador/reebok.ts \
  'const cif = fob === null ? null : round2(fob * flete);' \
  'const cif = fob === null ? null : round2(fob * 1.1);' \
  "el Costo CIF vuelve a estar escrito a mano"
mutar src/lib/depurador/reebok.ts \
  'const costo = w === null ? null : round2(w * 0.8 * flete);' \
  'const costo = w === null ? null : round2(w * 0.8 * 1.1);' \
  "el pedido para cliente deja de seguir al flete"
mutar src/lib/depurador/reebok.ts \
  '  const flete = normalizarFlete(cfg.flete);
  const groups = new Map<string, ReebokItem[]>();
  for (const it of items) {
    if (!it.newArticle) continue;' \
  '  const flete = (cfg.flete ?? 1.1) as number;
  const groups = new Map<string, ReebokItem[]>();
  for (const it of items) {
    if (!it.newArticle) continue;' \
  "la plantilla Switch deja de normalizar (un 11 pasaría)"
mutar src/lib/depurador/logic.ts \
  'const factor = num(config.factor) || 1.1;' \
  'const factor = num(config.factor) || 1.15;' \
  "⚠️ Tommy pierde su flete fijo de 1.10"
mutar src/lib/depurador/logic.ts \
  'import { NORMALIZACION } from "./marca-descripciones";' \
  'import { normalizarFlete } from "./flete";
import { NORMALIZACION } from "./marca-descripciones";' \
  "⚠️ el flete de Reebok se le cuela a Tommy"
mutar src/app/api/productos/cargar/flete/route.ts \
  '  if (!esFleteValido(body.flete)) {' \
  '  if (false) {' \
  "la ruta deja de validar el flete que llega"
mutar src/app/productos/cargar/ReebokClient.tsx \
  'import { FLETE_OPCIONES, FLETE_DEFAULT, etiquetaFlete, normalizarFlete } from "@/lib/depurador/flete";' \
  'const FLETE_OPCIONES = [1.1, 1.15] as const; const FLETE_DEFAULT = 1.1; const etiquetaFlete = (v: number) => v.toFixed(2); const normalizarFlete = (v: unknown) => Number(v) || 1.1;' \
  "la pantalla se hace su propia copia del flete"
mutar supabase/migrations/20261126120000_reebok_flete_default.sql \
  'ON CONFLICT (key) DO NOTHING' \
  'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value' \
  "la migración pisa el valor que ya estaba"
mutar supabase/migrations/20261126120000_reebok_flete_default.sql \
  "    OR value::text IN ('1.1', '1.15')" \
  "    OR value::text IS NOT NULL" \
  "el CHECK deja de acotar a los dos valores"

echo
echo "── Controles (NO deben cazarse) ────────────────────────────"
control src/lib/depurador/flete.ts \
  ' * Módulo PURO: sin base, sin red, sin DOM.' \
  ' * Módulo PURO (comentario cambiado a propósito por el control).' \
  "cambiar un comentario de flete.ts"
control src/app/productos/cargar/ReebokClient.tsx \
  'note={flete === fleteDefault ? "Costo FOB × flete = Costo CIF." :' \
  'note={flete === fleteDefault ? "El flete que se paga por el embarque." :' \
  "reescribir la nota de la pantalla"

echo
echo "════════════════════════════════════════════════════════════"
echo "  $CAZADAS de $TOTAL mutaciones cazadas."
if [ ${#ESCAPADAS[@]} -gt 0 ]; then
  echo "  ❌ Problemas:"; printf '     · %s\n' "${ESCAPADAS[@]}"; exit 1
fi
echo "  ✅ Todo cazado y los 2 controles sanos."

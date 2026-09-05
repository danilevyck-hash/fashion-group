#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — los cuatro arreglos de la auditoría del 5-sep-2026
#
# Un candado que nunca se puso rojo no protege nada: lo único que demuestra es
# que hoy pasa. Este script rompe cada regla A PROPÓSITO, una por una, y exige
# que el test correspondiente la cace. Y trae CONTROLES: cambios que NO deben
# cazarse, para probar que los candados no están simplemente diciendo «rojo» a
# cualquier cosa que toque el archivo.
#
#   1 · voseo             → src/__tests__/lib/nada-de-voseo.test.ts
#   2 · packing lists     → src/__tests__/lib/packing-lists-retencion.test.ts
#   3 · requireAdmin      → src/__tests__/lib/require-admin-no-miente.test.ts
#   4 · ganchos sin uso   → src/__tests__/lib/ganchos-sin-uso.test.ts
#
# Uso:  bash scripts/_mutar-candados-arreglos-auditoria.sh
# El árbol queda EXACTAMENTE como estaba (cada mutación se revierte enseguida).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

VERDES=0; ROJOS=0; FALLAS=()

# Corre un test y devuelve 0 si pasó.
corre() { npx vitest run "$1" >/dev/null 2>&1; }

# muta <descripcion> <archivo> <python-de-mutacion> <test> <espera: CAZA|CONTROL>
muta() {
  local desc="$1" file="$2" pysrc="$3" test="$4" espera="$5"
  local backup; backup="$(mktemp)"
  cp "$file" "$backup"
  python3 - "$file" <<PY
import io,sys
p=sys.argv[1]
s=io.open(p,encoding="utf-8").read()
$pysrc
io.open(p,"w",encoding="utf-8").write(s)
PY
  if [ $? -ne 0 ]; then
    echo "  ⚠️  la mutación no se pudo aplicar: $desc"
    cp "$backup" "$file"; rm -f "$backup"
    FALLAS+=("NO APLICÓ · $desc"); return
  fi

  if corre "$test"; then paso="verde"; else paso="rojo"; fi
  cp "$backup" "$file"; rm -f "$backup"

  if [ "$espera" = "CAZA" ]; then
    if [ "$paso" = "rojo" ]; then echo "  ✅ cazada    · $desc"; ROJOS=$((ROJOS+1));
    else echo "  ❌ SE ESCAPÓ · $desc"; FALLAS+=("SE ESCAPÓ · $desc"); fi
  else
    if [ "$paso" = "verde" ]; then echo "  ✅ control   · $desc (no se cazó, correcto)"; VERDES=$((VERDES+1));
    else echo "  ❌ FALSO POSITIVO · $desc"; FALLAS+=("FALSO POSITIVO · $desc"); fi
  fi
}

VOSEO=src/__tests__/lib/nada-de-voseo.test.ts
PACK=src/__tests__/lib/packing-lists-retencion.test.ts
AUTH=src/__tests__/lib/require-admin-no-miente.test.ts
HOOKS=src/__tests__/lib/ganchos-sin-uso.test.ts

echo
echo "══ 1 · VOSEO — la familia imperativo + «me» ═════════════════════════════"

muta "vuelve «avisame» al texto de las alertas de cron" \
  src/lib/cron-telemetry.ts \
  's=s.replace("Qué hacer: avísame para revisarlo.","Qué hacer: avisame para revisarlo.")' \
  "$VOSEO" CAZA

muta "vuelve «avisame» al mensaje del backup" \
  src/app/api/cron/backup/route.ts \
  's=s.replace("avísame para revisarlo","avisame para revisarlo",1)' \
  "$VOSEO" CAZA

muta "vuelve «avisame» al mensaje de la reconciliación" \
  src/app/api/cron/switch-reconciliacion/route.ts \
  's=s.replace("avísame para revisarlo","avisame para revisarlo",1)' \
  "$VOSEO" CAZA

muta "un «contame» nuevo en una pantalla" \
  src/lib/cron-telemetry.ts \
  's=s.replace("Qué hacer: avísame para revisarlo.","Contame qué pasó.")' \
  "$VOSEO" CAZA

muta "un «mandame» nuevo en una alerta" \
  src/lib/switch-api/alert-policy.ts \
  's=s.replace("avísame para revisarlo","mandame el detalle",1)' \
  "$VOSEO" CAZA

muta "alguien saca «avisame» de la lista de prohibidas" \
  "$VOSEO" \
  's=s.replace(chr(34)+"avisame"+chr(34)+", ","",1)' \
  "$VOSEO" CAZA

muta "CONTROL: «dime» (tuteo correcto) en un texto de pantalla" \
  src/lib/cron-telemetry.ts \
  's=s.replace("Qué hacer: avísame para revisarlo.","Qué hacer: dime si lo revisas tú.")' \
  "$VOSEO" CONTROL

muta "CONTROL: «dejame» dentro de una CITA de Daniel en un comentario" \
  src/lib/cron-telemetry.ts \
  's=s.replace(" * programa; es la acci", " * Daniel: <<solo dejame las 4 primeras>>. Contame despues.\n * programa; es la acci")' \
  "$VOSEO" CONTROL

echo
echo "══ 2 · PACKING LISTS — el texto no puede mentir ═════════════════════════"

muta "vuelve la frase vieja de los «7 días» a la pantalla" \
  src/app/packing-lists/PackingListsClient.tsx \
  's=s.replace("{textoRetencionPackingLists()}","Los PLs se eliminan automáticamente después de 7 días.")' \
  "$PACK" CAZA

muta "el cron se re-teclea su propio número (90 a mano)" \
  src/lib/cleanup-packing-lists.ts \
  's=s.replace("const RETENCION_DIAS = RETENCION_PACKING_LISTS_DIAS;","const RETENCION_DIAS = 90;")' \
  "$PACK" CAZA

muta "cambian la retención a 7 días en la definición única" \
  src/lib/packing-lists/retencion.ts \
  's=s.replace("RETENCION_PACKING_LISTS_DIAS = 90","RETENCION_PACKING_LISTS_DIAS = 7")' \
  "$PACK" CAZA

muta "el texto deja de decir que el PL activo no se borra" \
  src/lib/packing-lists/retencion.ts \
  's=s.replace("Un PL activo no se borra nunca. Los que borras se","Los PL borrados se")' \
  "$PACK" CAZA

muta "el número se teclea adentro de la frase (vuelve la divergencia)" \
  src/lib/packing-lists/retencion.ts \
  's=s.replace("se guardan ${dias} días","se guardan 90 días")' \
  "$PACK" CAZA

muta "CONTROL: se reescribe la frase sin perder ninguna de las dos verdades" \
  src/lib/packing-lists/retencion.ts \
  's=s.replace("Un PL activo no se borra nunca. Los que borras se guardan ${dias} días por si hay que recuperarlos, y después se eliminan solos.","Un PL activo no se borra nunca. Si borras uno, se guarda ${dias} días por si lo necesitas.")' \
  "$PACK" CONTROL

echo
echo "══ 3 · requireAdmin — el nombre y el permiso ════════════════════════════"

muta "vuelve el nombre mentiroso: requireAdmin con la secretaria adentro" \
  src/lib/api-auth.ts \
  's=s.replace("export function requireAdminOSecretaria(","export function requireAdmin(")' \
  "$AUTH" CAZA

muta "le sacan la secretaria a la lista (se le apagan Catálogos y Reclamos)" \
  src/lib/api-auth.ts \
  "s=s.replace(\"['admin', 'secretaria']\",\"['admin']\")" \
  "$AUTH" CAZA

muta "le agregan el vendedor a la lista sin decirlo" \
  src/lib/api-auth.ts \
  "s=s.replace(\"['admin', 'secretaria']\",\"['admin', 'secretaria', 'vendedor']\")" \
  "$AUTH" CAZA

muta "una ruta de Catálogos se queda sin guard" \
  src/app/api/catalogo/joybees/seed/route.ts \
  's=s.replace("const denied = requireAdminOSecretaria(req);","const denied = null;")' \
  "$AUTH" CAZA

muta "Marketing migra al guard que incluye a la secretaria" \
  src/app/api/marketing/mobiliario/notas-proveedor/route.ts \
  "s=s.replace('requireRole(req, [\"admin\"])','requireRole(req, [\"admin\",\"secretaria\"])')" \
  "$AUTH" CAZA

muta "el guard deja de contestar 403 (contesta 401)" \
  src/lib/api-auth.ts \
  's=s.replace("{ status: 403 }","{ status: 401 }")' \
  "$AUTH" CAZA

muta "CONTROL: se reordena la lista (mismos dos roles, otro orden)" \
  src/lib/api-auth.ts \
  "s=s.replace(\"['admin', 'secretaria']\",\"['secretaria', 'admin']\")" \
  "$AUTH" CONTROL

echo
echo "══ 4 · GANCHOS SIN USO — que nadie los encienda ni los edite a ciegas ═══"

muta "alguien enchufa useKeyboardShortcuts en el header" \
  src/components/AppHeader.tsx \
  "s = 'import { useKeyboardShortcuts } from \"@/lib/hooks/useKeyboardShortcuts\";' + chr(10) + s" \
  "$HOOKS" CAZA

muta "alguien enchufa useBadges en el header" \
  src/components/AppHeader.tsx \
  "s = 'import { useBadges } from \"@/lib/hooks/useBadges\";' + chr(10) + s" \
  "$HOOKS" CAZA

muta "alguien enchufa useSessionCheck en el header" \
  src/components/AppHeader.tsx \
  "s = 'import { useSessionCheck } from \"@/lib/hooks/useSessionCheck\";' + chr(10) + s" \
  "$HOOKS" CAZA

muta "le borran el rótulo «SIN USO» a useKeyboardShortcuts" \
  src/lib/hooks/useKeyboardShortcuts.ts \
  's=s.replace("SIN USO desde","Atajos de teclado del sistema, desde")' \
  "$HOOKS" CAZA

muta "el rótulo pierde el caso del 5-sep-2026 que explica por qué no editarlo" \
  src/lib/hooks/useBadges.ts \
  's=s.replace("5-sep-2026","hace un tiempo")' \
  "$HOOKS" CAZA

muta "vuelve el componente KeyboardShortcutsProvider que nunca se montó" \
  src/components/AppHeader.tsx \
  'import io as _io; _io.open("src/components/KeyboardShortcutsProvider.tsx","w",encoding="utf-8").write("export default function X(){return null}\n")' \
  "$HOOKS" CAZA
rm -f src/components/KeyboardShortcutsProvider.tsx

muta "CONTROL: se edita el atajo muerto (el candado NO opina del contenido)" \
  src/lib/hooks/useKeyboardShortcuts.ts \
  's=s.replace(chr(34)+"/recordatorios"+chr(34),chr(34)+"/cheques"+chr(34))' \
  "$HOOKS" CONTROL

muta "CONTROL: un test que solo CITA la ruta del gancho no cuenta como importador" \
  src/__tests__/lib/cxc-ruta-y-error.test.ts \
  's=s+"\n// menciona src/lib/hooks/useBadges.ts sin importarlo\n"' \
  "$HOOKS" CONTROL

echo
echo "═════════════════════════════════════════════════════════════════════════"
TOTAL=$((ROJOS+VERDES))
echo "  ${TOTAL} mutaciones · ${ROJOS} cazadas · ${VERDES} controles que NO se cazaron"
if [ ${#FALLAS[@]} -gt 0 ]; then
  echo
  echo "  ❌ ${#FALLAS[@]} problema(s):"
  for f in "${FALLAS[@]}"; do echo "     · $f"; done
  exit 1
fi
echo "  ✅ todas las reglas se defienden solas."

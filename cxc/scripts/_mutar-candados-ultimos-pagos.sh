#!/usr/bin/env bash
# Verificador de mutaciones de «Últimos pagos» (CXC del grupo + cartera de Boston).
#
# Cada mutación rompe A PROPÓSITO una regla y espera que un test se ponga rojo.
# La que importa es la primera: quitar el filtro de empresa de la lectura de
# switch_recibos tiene que dejar entrar a Boston al CXC del grupo — y el
# candado tiene que verlo. Si «sobrevive», el candado no protege nada.
#
# 🩸 Restaura por COPIA y no con `git checkout`: hay archivos NUEVOS en la rama.
# 🩸 El reemplazo es LITERAL con python (ver _mutar-aplicar.py).
# 🩸 `mutar()` EXIGE que el archivo cambie, y `probar()` exige que vitest haya
# COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/api/cxc-ultimos-pagos-route.test.ts
  src/__tests__/api/cxc-boston-ultimos-pagos-route.test.ts
  src/__tests__/components/cxc-ultimos-pagos-bloque.test.tsx
)
ARCHIVOS=(
  src/app/api/cxc/ultimos-pagos/route.ts
  src/app/api/cxc/boston/ultimos-pagos/route.ts
  src/lib/cxc/ultimos-pagos.ts
  src/components/cxc/UltimosPagos.tsx
  src/app/admin/components/ContactPanel.tsx
  src/app/admin/components/ClientTable.tsx
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

G=src/app/api/cxc/ultimos-pagos/route.ts
B=src/app/api/cxc/boston/ultimos-pagos/route.ts

echo "== grupo: Boston no entra =="
mutar "$G" '    .eq("empresa_key", empresa)
' '' \
  'la lectura del grupo pierde el filtro de empresa (Boston entra)'

mutar "$G" 'let empresas: readonly string[] = CXC_GRUPO_EMPRESA_KEYS;' \
  'let empresas: readonly string[] = [...CXC_GRUPO_EMPRESA_KEYS, "confecciones_boston"];' \
  'alguien agrega confecciones_boston a la lista de empresas'

mutar "$G" 'empresas = (CXC_GRUPO_EMPRESA_KEYS as readonly string[]).includes(asociada) ? [asociada] : [];' \
  'empresas = [asociada];' \
  'el vendedor lee la empresa asociada sin validarla contra el grupo'

echo "== grupo: 3 por empresa, pagos de verdad =="
mutar "$G" '    .limit(PAGOS_POR_EMPRESA);' '    .limit(50);' \
  'trae 50 en vez de 3'
mutar "$G" '    .eq("es_retencion", false)
' '' \
  'cuenta las retenciones como pagos'
mutar "$G" '    .neq("total", 0)
' '' \
  'cuenta el recibo de $0,00 como pago'
mutar "$G" '    .order("fecha_creacion", { ascending: false, nullsFirst: false })' \
  '    .order("fecha_creacion", { ascending: true, nullsFirst: false })' \
  'devuelve los 3 más VIEJOS'

echo "== boston: el grupo no entra =="
mutar "$B" '    .eq("empresa_key", EMPRESA_BOSTON)
' '' \
  'la lectura de Boston pierde el filtro de empresa (el grupo entra)'
mutar "$B" 'const EMPRESA_BOSTON = "confecciones_boston";' 'const EMPRESA_BOSTON = "vistana";' \
  'la ruta de Boston apunta a una empresa del grupo'
mutar "$B" '    .limit(PAGOS_POR_EMPRESA);' '    .limit(10);' \
  'Boston trae 10 en vez de 3'
mutar "$B" 'const auth = requireRole(req, rolesBoston());' 'const auth = requireRole(req, [...rolesBoston(), "vendedor"]);' \
  'el vendedor del grupo puede leer los pagos de Boston'

echo "== el texto y las superficies =="
mutar src/lib/cxc/ultimos-pagos.ts 'export const PAGOS_POR_EMPRESA = 3;' 'export const PAGOS_POR_EMPRESA = 5;' \
  'cinco pagos en vez de tres'
mutar src/lib/cxc/ultimos-pagos.ts 'return `${fmtDate(p.fecha)} · $${fmt(p.monto)}`;' 'return `${p.fecha} · $${fmt(p.monto)}`;' \
  'la fecha sale cruda (2026-08-12) en vez de con fmtDate'
mutar src/lib/cxc/ultimos-pagos.ts 'export const SIN_PAGOS = "Sin pagos registrados";' 'export const SIN_PAGOS = "$0.00";' \
  'sin pagos se muestra $0.00'
mutar src/app/admin/components/ClientTable.tsx '            activo={isExpanded}
' '' \
  'escritorio pide los pagos de los 211 clientes al cargar la lista'
mutar src/app/admin/components/ContactPanel.tsx 'pagos={ultimosPagos.de(co.key)}' 'pagos={ultimosPagos.de("fashion_wear")}' \
  'todos los bloques muestran la misma empresa'

echo
echo "== resultado: cazadas=$CAZ sobrevivieron=$SOB sin-efecto=$NOOP =="
[ "$SOB" -eq 0 ] && [ "$NOOP" -eq 0 ]

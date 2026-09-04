#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías: el cliente se elige UNA vez y se MARCAN
# sus facturas (4-sep-2026, Daniel: «va»).
#
# Lo que se ataca: el puente por CÓDIGO (nunca por nombre), la INCLUSIÓN de las
# 6 del grupo (Boston afuera), solo tipo «Factura», el agrupado por EMPRESA, el
# «ya salió» que AVISA y nunca bloquea, que elegir cliente NO sea obligatorio,
# el interruptor GUIAS_ATAJOS_NUEVOS (los dos sentidos) y que los dos caminos
# (marcar vs a mano) produzcan el MISMO payload.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS
# en la rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 EL PATRÓN QUE NO MUTA NADA SE DENUNCIA (⛔), no se canta como cazado. El
# reemplazo es LITERAL (scripts/_mutar-guias-aplicar.py) y exige que el texto
# viejo aparezca las veces que se le dicen. Hay una mutación de CONTROL que a
# propósito no matchea: si no sale ⛔, el denunciador está roto.
#
#   bash scripts/_mutar-candados-guias-facturas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

RUTA="src/app/api/guias/facturas-cliente/route.ts"
PURO="src/lib/guias/atajos-facturas.ts"
PANEL="src/app/guias/components/FacturasDelCliente.tsx"
FORM="src/app/guias/components/GuiaForm.tsx"
LOGICA="src/app/guias/components/guia-form-logic.ts"

ARCHIVOS=("$RUTA" "$PURO" "$PANEL" "$FORM" "$LOGICA")
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
  "src/__tests__/api/guias-facturas-del-cliente.test.ts"
  "src/__tests__/components/guia-form-marcar-facturas.test.tsx"
  "src/__tests__/lib/guias-atajos-facturas.test.ts"
)

cazadas=0; sueltas=0; muertos=0; n=0

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_err_fact; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_err_fact))"
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

echo "═══ MUTACIONES — Guías · facturas del cliente ═══"

# ── el puente ────────────────────────────────────────────────────────────────

mutacion "el puente une por NOMBRE en vez de por código" "$RUTA" \
  '.eq("codigo", codigo)' \
  '.eq("nombre", codigo)'

# El mismo `.in(...)` aparece también en la frescura: se mutan LOS DOS (veces=2).
mutacion "Boston entra al puente (la inclusión se abre)" "$RUTA" \
  '.in("empresa_key", [...B2B_EMPRESA_KEYS])' \
  '.in("empresa_key", [...B2B_EMPRESA_KEYS, "confecciones_boston"])' 2

mutacion "se ofrecen TODOS los comprobantes, no solo Factura" "$RUTA" \
  '    .eq("tipo_comprobante", TIPO_FACTURA)
' \
  ''

mutacion "el OR deja de ser de TUPLAS (entra otro cliente de la misma empresa)" "$RUTA" \
  '.map((p) => `and(empresa_key.eq.${p.empresa_key},cliente_switch_id.eq.${p.cliente_switch_id})`)' \
  '.map((p) => `empresa_key.eq.${p.empresa_key}`)'

# ── el «ya salió» ────────────────────────────────────────────────────────────

mutacion "el server ESCONDE la factura que ya salió (aviso → bloqueo)" "$RUTA" \
  '.filter((f) => f.secuencial && f.fecha)' \
  '.filter((f) => f.secuencial && f.fecha && yaSalioEn(indice, mapEmpresaName(f.empresa_key), String(f.secuencial)) == null)'

mutacion "el «ya salió» pierde la EMPRESA (el mismo número en otra empresa hereda el aviso)" "$PURO" \
  'return `${normalizarEmpresaGuia(empresaNombre)}|${numeroNormalizado}`;' \
  'return `${numeroNormalizado}`;'

mutacion "la casilla de una factura que ya salió deja de marcar (bloqueo en pantalla)" "$PANEL" \
  'onChange={() => toggle(f)}' \
  'onChange={() => { if (f.yaSalioEn != null) return; toggle(f); }}'

# ── el agrupado por empresa y el payload ─────────────────────────────────────

mutacion "las facturas se agrupan SIN mirar la empresa (un solo renglón)" "$PURO" \
  'normalizarEmpresaGuia(r.empresa) === normalizarEmpresaGuia(empresaNombre) &&' \
  'true &&'

mutacion "el separador deja de ser el formato de hoy («2535; 2536»)" "$PURO" \
  'return { ...r, facturas: previas ? `${previas}, ${sec}` : sec };' \
  'return { ...r, facturas: previas ? `${previas}; ${sec}` : sec };'

# ── la agrupación por día y el Traslado (mockup final, 4-sep-2026) ───────────

mutacion "se agrupan por días de CALENDARIO en vez de días con factura" "$PURO" \
  '  const visibles = dias.slice(0, Math.max(0, diasVisibles));' \
  '  const corte = new Date(new Date(`${dias[0] ?? "1970-01-01"}T00:00:00Z`).getTime() - diasVisibles * 86400000).toISOString().slice(0, 10);
  const visibles = dias.filter((d) => d > corte);'

mutacion "se abren 2 días en vez de 3" "$PURO" \
  'export const DIAS_CON_FACTURA_VISIBLES = 3;' \
  'export const DIAS_CON_FACTURA_VISIBLES = 2;'

mutacion "«Ver más días» trae 2 en vez de 3" "$PURO" \
  'export const DIAS_POR_VER_MAS = 3;' \
  'export const DIAS_POR_VER_MAS = 2;'

mutacion "«Traslado» vuelve a escribir el «0000» viejo" "$PURO" \
  'export const TEXTO_TRASLADO = "Traslado";' \
  'export const TEXTO_TRASLADO = "0000";'

# ── el atajo nunca es candado ────────────────────────────────────────────────

mutacion "elegir cliente se vuelve OBLIGATORIO (el atajo se hace candado)" "$LOGICA" \
  'if (!item.cliente) errores.add(claveCampo(item, "cliente"));' \
  'if (!item.cliente || !(item.cliente_codigo ?? "").trim()) errores.add(claveCampo(item, "cliente"));'

# ── el interruptor, en los dos sentidos ──────────────────────────────────────

mutacion "el panel ignora GUIAS_ATAJOS_NUEVOS (apagarlo no apaga nada)" "$FORM" \
  '{GUIAS_ATAJOS_NUEVOS && !editingId && !soloCorregible && onReemplazarItems && (' \
  '{!editingId && !soloCorregible && onReemplazarItems && ('

mutacion "el panel aparece también al EDITAR (y en una Completada)" "$FORM" \
  '{GUIAS_ATAJOS_NUEVOS && !editingId && !soloCorregible && onReemplazarItems && (' \
  '{GUIAS_ATAJOS_NUEVOS && onReemplazarItems && ('

# ── control del denunciador ──────────────────────────────────────────────────

mutacion "CONTROL (a propósito no matchea — tiene que salir ⛔)" "$PURO" \
  'este texto no existe en el archivo' \
  'nada'

echo ""
echo "═══ RESULTADO: $cazadas cazadas · $sueltas sueltas · $muertos patrones muertos (control incluido) · $n corridas ═══"

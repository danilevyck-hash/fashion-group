#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías y canal: los AJUSTES de Daniel al probarlo
# (4-sep-2026).
#
# Lo que se ataca:
#   · el disparo del refresco de facturas al TOCAR Guías (rol, solo lectura,
#     interruptor, y que la lista siga sin escribir una guía);
#   · el AUTOLLENADO del destino único (definido o único en la historia
#     agrupada; con varios nada; lo escrito no se pisa; interruptor);
#   · que la definición de Daniel gane (D-87 = Guabito, «hazme caso»);
#   · City Moda sin tiendas (cada «tienda» es OTRO cliente);
#   · el resumen mensual del grupo: canal PRIVADO en el route Y en la
#     recuperación, cron el día 1, y la guardia del cierre de las 8.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS
# en la rama y git aborta el comando entero sin restaurar nada. Ya pasó acá.
# 🩸 EL PATRÓN QUE NO MUTA NADA SE DENUNCIA (⛔). Reemplazo LITERAL
# (scripts/_mutar-guias-aplicar.py) con conteo exacto, y una mutación de
# CONTROL que a propósito no matchea: si no sale ⛔, el denunciador está roto.
#
#   bash scripts/_mutar-candados-guias-ajustes-4sep.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

PAGINA="src/app/guias/page.tsx"
REFRESCO="src/app/guias/components/refrescarFacturasHoy.ts"
PURO="src/lib/guias/destinos-clientes.ts"
FORM="src/app/guias/components/GuiaForm.tsx"
ATAJOS="src/lib/guias/atajos-facturas.ts"
ROUTE_MENSUAL="src/app/api/cron/grupo-resumen-mensual/route.ts"
RECON="src/app/api/cron/switch-reconciliacion/route.ts"
LIB_MENSUAL="src/lib/grupo-resumen-mensual.ts"
VERCEL="vercel.json"

ARCHIVOS=("$PAGINA" "$REFRESCO" "$PURO" "$FORM" "$ATAJOS" "$ROUTE_MENSUAL" "$RECON" "$LIB_MENSUAL" "$VERCEL")
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

T_LISTA="src/__tests__/components/guias-eliminar-en-la-fila.test.tsx"
T_DEST_COMP="src/__tests__/components/guia-form-destinos.test.tsx"
T_DEST_LIB="src/__tests__/lib/guias-destinos-cliente.test.ts"
T_ATAJOS="src/__tests__/lib/guias-atajos-facturas.test.ts"
T_CANAL="src/__tests__/lib/acs-resumen-canal-privado.test.ts"
T_DIA1="src/__tests__/lib/grupo-resumen-mensual-dia-1.test.ts"

cazadas=0; sueltas=0; muertos=0; n=0

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces] [tests…]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  shift 5 || true
  local tests=("$@")
  if [ ${#tests[@]} -eq 0 ]; then tests=("$T_LISTA"); fi
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_err_aj; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_err_aj))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run "${tests[@]}" --reporter=dot 2>&1)
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

echo "═══ MUTACIONES — Guías y canal · ajustes del 4-sep ═══"

# ── el disparo al tocar Guías ────────────────────────────────────────────────

mutacion "la lista deja de disparar el refresco (el cambio se deshace en silencio)" "$PAGINA" \
  '    if (!readonly) refrescarFacturasDelDia();' \
  '    if (!readonly) void 0;' \
  1 "$T_LISTA"

mutacion "dispara para CUALQUIER rol (vendedor incluido)" "$PAGINA" \
  '    if (!authChecked || !role || !CREATE_ROLES.includes(role)) return;' \
  '    if (!authChecked) return;' \
  1 "$T_LISTA"

mutacion "ignora el modo solo lectura" "$PAGINA" \
  '    if (!readonly) refrescarFacturasDelDia();' \
  '    refrescarFacturasDelDia();' \
  1 "$T_LISTA"

mutacion "el refresco ignora GUIAS_ATAJOS_NUEVOS" "$REFRESCO" \
  '  if (!GUIAS_ATAJOS_NUEVOS) return;' \
  '' \
  1 "$T_LISTA"

mutacion "alguien cuela una SEGUNDA salida que no es lectura al abrir la lista" "$PAGINA" \
  '    if (!readonly) refrescarFacturasDelDia();' \
  '    if (!readonly) { refrescarFacturasDelDia(); void fetch("/api/guias/marcar-visto", { method: "POST" }).catch(() => {}); }' \
  1 "$T_LISTA"

# ── el autollenado del destino único ─────────────────────────────────────────

mutacion "se autollena TAMBIÉN con varios destinos (elige por la persona)" "$PURO" \
  '  return botones.length === 1 ? botones[0] : null;' \
  '  return botones.length >= 1 ? botones[0] : null;' \
  1 "$T_DEST_COMP" "$T_DEST_LIB"

mutacion "el autollenado PISA lo que ya estaba escrito" "$FORM" \
  'if (GUIAS_ATAJOS_NUEVOS && !soloCorregible && !item.direccion.trim()) {' \
  'if (GUIAS_ATAJOS_NUEVOS && !soloCorregible) {' \
  1 "$T_DEST_COMP"

mutacion "el autollenado ignora el interruptor" "$FORM" \
  'if (GUIAS_ATAJOS_NUEVOS && !soloCorregible && !item.direccion.trim()) {' \
  'if (!soloCorregible && !item.direccion.trim()) {' \
  1 "$T_DEST_COMP"

mutacion "el renglón del panel deja de nacer con su destino" "$ATAJOS" \
  '    direccion: r.direccion || (direccionAutollenada ?? ""),
    empresa: f.empresa,' \
  '    empresa: f.empresa,' \
  1 "$T_ATAJOS"

mutacion "desmarcar trata la dirección autollenada como trabajo de la persona (la fila zombi se queda)" "$ATAJOS" \
  '    (!(r.direccion ?? "").trim() || direccionEsLaPrellenada) &&' \
  '    !(r.direccion ?? "").trim() &&' \
  1 "$T_ATAJOS"

# ── la tabla de Daniel ───────────────────────────────────────────────────────

mutacion "D-87 vuelve al histórico (Changuinola) — «hazme caso»" "$PURO" \
  '  "D-87": [{ destino: "Guabito", elDeSiempre: true }],' \
  '  "D-87": [{ destino: "Changuinola", elDeSiempre: true }],' \
  1 "$T_DEST_LIB"

mutacion "City Moda recupera el campo tienda" "$PURO" \
  '  "D-27": [{ destino: "Sport Corner Calidonia", elDeSiempre: true }],' \
  '  "D-27": [{ destino: "Sport Corner Calidonia", elDeSiempre: true, tiendas: ["Albrook 2"] }],' \
  1 "$T_DEST_LIB"

# ── el canal privado y el día 1 ──────────────────────────────────────────────

# (El candado lee el archivo, no lo ejecuta: la mutación fiel es cambiar la
#  LLAMADA — con el import viejo el build también moriría, pero acá basta.)
mutacion "el route mensual vuelve a enviarNegocio (el grupo de tres)" "$ROUTE_MENSUAL" \
  'const sent = await enviarNegocioPrivado(mensaje);' \
  'const sent = await enviarNegocio(mensaje);' \
  1 "$T_CANAL"

mutacion "la RECUPERACIÓN del mensual vuelve a enviarNegocio" "$RECON" \
  'const sent = await enviarNegocioPrivado(`(recuperado) ${buildMensajeMensual(resumen)}`);' \
  'const sent = await enviarNegocio(`(recuperado) ${buildMensajeMensual(resumen)}`);' \
  1 "$T_CANAL"

mutacion "el cron vuelve al día 3" "$VERCEL" \
  '"schedule": "0 13 1 * *"' \
  '"schedule": "0 13 3 * *"' \
  1 "$T_DIA1"

mutacion "la recuperación vuelve a los días 3-4" "$RECON" \
  '      return dia === 1 || dia === 2;' \
  '      return dia === 3 || dia === 4;' \
  1 "$T_DIA1"

mutacion "la guardia del cierre se quita (el resumen sale con un mes a medias)" "$LIB_MENSUAL" \
  '  const sinCierre = await empresasSinSyncDeCierre(anio, mes);
  if (sinCierre.length > 0) {' \
  '  const sinCierre = await empresasSinSyncDeCierre(anio, mes);
  if (false && sinCierre.length > 0) {' \
  1 "$T_DIA1"

# ── control del denunciador ──────────────────────────────────────────────────

mutacion "CONTROL (a propósito no matchea — tiene que salir ⛔)" "$PURO" \
  'este texto no existe en el archivo' \
  'nada' \
  1 "$T_DEST_LIB"

echo ""
echo "═══ RESULTADO: $cazadas cazadas · $sueltas sueltas · $muertos patrones muertos (control incluido) · $n corridas ═══"

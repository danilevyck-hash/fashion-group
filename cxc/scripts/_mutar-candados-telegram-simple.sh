#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — el aviso de Telegram en DOS LÍNEAS y la barra de
# instalar que se fue de iOS (25-ago-2026).
#
# Daniel: *"lo quiero más simple… solo quiero lo útil"*, y eligió el formato
# exacto:
#     📝 Cotización TOM-027 · A-Amani, S.A.
#     Tommy Hilfiger · $648 · 12 piezas · Switch 15-000000123
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 EL SCRIPT DENUNCIA EL PATRÓN QUE NO MUTA NADA, en vez de cantarlo como
# "SOBREVIVIÓ" — un rojo inventado sobre un candado que nunca se puso a prueba.
#
# 🩸 Y EL REEMPLAZO NO USA `perl -0pi -e 's|…|…|'`: con el delimitador `|`, un
# `\|\|` del código real se DES-escapa a `||`, la expresión se vuelve una
# alternación con rama vacía, matchea la cadena vacía en el byte 0 y SE COME EL
# ARCHIVO ENTERO. Con el módulo roto vitest no colecta, escribe "no tests" y el
# informe lee cero fallos como "SOBREVIVIÓ". Acá el reemplazo es LITERAL
# (`scripts/_mutar-guias-aplicar.py`) y exige que el texto viejo aparezca
# exactamente las veces que se le dicen.
#
#   bash scripts/_mutar-candados-telegram-simple.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/lib/catalogo/telegram-pedido.ts"
  "src/lib/catalogo/switch-envio.ts"
  "src/lib/catalogo/documento-switch.ts"
  "src/components/InstallPrompt.tsx"
  "src/app/api/catalogo/[marca]/orders/route.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/lib/telegram-pedido-origen.test.ts \
src/__tests__/lib/documento-switch.test.ts \
src/__tests__/lib/switch-envio-paralelo.test.ts \
src/__tests__/components/install-prompt-solo-donde-se-instala.test.tsx"

cazadas=0; sueltas=0; muertos=0; n=0

TG="src/lib/catalogo/telegram-pedido.ts"
ENVIO="src/lib/catalogo/switch-envio.ts"
DOC="src/lib/catalogo/documento-switch.ts"
INSTALL="src/components/InstallPrompt.tsx"
ORDERS="src/app/api/catalogo/[marca]/orders/route.ts"

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_tg_err; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_tg_err))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE (módulo roto, error de sintaxis), "0 fallos" se
  # leería como "sobrevivió".
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

# ── 1 · lo que Daniel podó no puede volver ───────────────────────────────────

mutacion "vuelve el «No aparta mercancía» al aviso" "$TG" \
  'switchSegmento: `Switch ${a.numeroSwitch}${a.verificado ? "" : " ⚠️ sin verificar"}`,' \
  'switchSegmento: `Switch ${a.numeroSwitch}${a.verificado ? "" : " ⚠️ sin verificar"}`,
    extras: cotizacion ? ["No aparta mercancía — sigue disponible para los demás."] : [],'

mutacion "vuelve el VENDEDOR al mensaje" "$TG" \
  '`${a.emoji} ${a.queEs} ${a.numero} · ${nombreODefecto(a.cliente, "Sin nombre")}`,' \
  '`${a.emoji} ${a.queEs} ${a.numero} · ${nombreODefecto(a.cliente, "Sin nombre")} · Vendedor: rey`,'

mutacion "vuelve el «✓ verificado», que salía en casi todos" "$TG" \
  '${a.verificado ? "" : " ⚠️ sin verificar"}' \
  '${a.verificado ? " ✓ verificado" : " ⚠️ sin verificar"}'

mutacion "vuelve la etapa deletreada («— COTIZACIÓN enviada a Switch»)" "$TG" \
  '`${a.emoji} ${a.queEs} ${a.numero} · ${nombreODefecto(a.cliente, "Sin nombre")}`,' \
  '`${a.emoji} ${a.queEs} ${a.numero} — COTIZACIÓN enviada a Switch · ${nombreODefecto(a.cliente, "Sin nombre")}`,'

mutacion "vuelven los rótulos «Cliente:»" "$TG" \
  '· ${nombreODefecto(a.cliente, "Sin nombre")}`,' \
  '· Cliente: ${nombreODefecto(a.cliente, "Sin nombre")}`,'

mutacion "vuelven las referencias y los bultos a la línea de cifras" "$TG" \
  'if (typeof a.piezas === "number" && a.piezas > 0) segunda.push(enPiezas(a.piezas));' \
  'if (typeof a.piezas === "number" && a.piezas > 0) segunda.push("8 referencias", "94 bultos", enPiezas(a.piezas));'

# ── 2 · el emoji, que es lo primero que se ve en el canal ────────────────────

mutacion "el PEDIDO y la COTIZACIÓN usan el MISMO emoji" "$TG" \
  'emoji: cotizacion ? "📝" : "📦",' 'emoji: "📦",'

mutacion "la palabra tampoco distingue: todo se rotula «Pedido»" "$TG" \
  'queEs: etiquetaDocumento(documento),' 'queEs: "Pedido",'

# ── 3 · el formato de dos líneas ─────────────────────────────────────────────

mutacion "la marca desaparece de la segunda línea" "$TG" \
  'const segunda = [a.label, money(a.total)];' \
  'const segunda = [money(a.total)];'

mutacion "el monto se va a la PRIMERA línea (Daniel lo puso en la segunda)" "$TG" \
  'const segunda = [a.label, money(a.total)];' \
  'const segunda = [a.label];'

mutacion "el N° de Switch deja de decirse" "$TG" \
  'if (a.switchSegmento) segunda.push(a.switchSegmento);' \
  'if (false) segunda.push(a.switchSegmento!);'

mutacion "sin piezas se inventa un «0 piezas»" "$TG" \
  'if (typeof a.piezas === "number" && a.piezas > 0) segunda.push(enPiezas(a.piezas));' \
  'segunda.push(enPiezas(a.piezas ?? 0));'

mutacion "el pedido del LINK pierde la acción pendiente" "$TG" \
  'extras: ["Falta ponerle el cliente y mandarlo a Switch — está en Borradores."],' \
  'extras: [],'

# ── 4 · los emisores siguen entrando por el armador único ────────────────────

mutacion "el motor deja de mandarle las PIEZAS al aviso" "$ENVIO" \
  'piezas: resumen.piezas,' 'piezas: undefined,'

mutacion "la creación del vendedor deja de mandar las piezas" "$ORDERS" \
  'piezas: resumenPed.piezas,' 'piezas: undefined,'

# ── 5 · 🔴 EL AVISO DE ERROR NO SE PODA ──────────────────────────────────────

mutacion "el envío FALLIDO pierde su detalle y qué hacer" "$ENVIO" \
  ': ${shortError(e.message)} (se puede reintentar desde la confirmación)`' \
  '`'

mutacion "el envío AMBIGUO pierde el «REVISAR EL PANEL»" "$ENVIO" \
  'REVISAR EL PANEL antes de reintentar.' 'listo.'

mutacion "el error se queda sin su 🚨 y sin decir qué pasó" "$ENVIO" \
  '🚨 Envío a Switch FALLÓ' 'Envío procesado'

# ── 6 · la advertencia sigue viva DONDE SE DECIDE ────────────────────────────

mutacion "la etiqueta pegada al botón deja de decir que no aparta" "$DOC" \
  'export const NOTA_COTIZACION = "no aparta mercancía";' \
  'export const NOTA_COTIZACION = "cotización";'

# ── 7 · la barra de instalar ─────────────────────────────────────────────────

mutacion "la barra VUELVE en iOS con su instructivo manual" "$INSTALL" \
  '  const installable = !standalone && !!deferred;
  if (!installable) return null;' \
  '  const esIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installable = !standalone && (!!deferred || esIos);
  if (!installable) return null;'

mutacion "🔴 la barra desaparece TAMBIÉN de Android y escritorio" "$INSTALL" \
  '  const installable = !standalone && !!deferred;' \
  '  const installable = false && !standalone && !!deferred;'

mutacion "el botón «Instalar app» queda decorativo (no llama al navegador)" "$INSTALL" \
  '    await deferred.prompt();' '    void deferred;'

mutacion "el botón de instalar baja del piso táctil de 44 px" "$INSTALL" \
  'className="mt-3 w-full bg-black text-white text-sm font-medium rounded-lg min-h-[44px] active:scale-[0.98] transition"' \
  'className="mt-3 w-full bg-black text-white text-sm font-medium rounded-lg h-8 active:scale-[0.98] transition"'

# 🩸 EL CONTROL DEL PROPIO SCRIPT: una mutación que a propósito no matchea
# nada. Si esto no sale ⛔, el denunciador está roto y todos los ✅ de arriba
# valen lo mismo que un barrido que se cumple con su propio comentario.
mutacion "(control) un patrón que no existe tiene que salir DENUNCIADO" "$TG" \
  'esto-no-existe-en-el-archivo' 'tampoco-esto'

echo
echo "═══ RESUMEN ═══"
echo "  intentadas: $n · cazadas: $cazadas · sobrevivieron: $sueltas · patrones muertos: $muertos"
# El control aporta EL único ⛔ esperado.
[ "$sueltas" -eq 0 ] && [ "$muertos" -eq 1 ]

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías: la despachada se ve como al crear, lo
# bloqueado se ve bloqueado, y los frecuentes pasan a autocompletado
# (25-ago-2026).
#
# Daniel, textual: *"Editar guía despachada, debe de verse igual que al crear
# una guía para mantener consistencia y uso fácil"* · *"que se vea desbloqueado
# solo las editables así el usuario no adivina"* · *"lo de poner transporte
# frecuente no le gusta, quita espacio, que sea solo al escribir primeras 2 o 3
# letras que aparezca las opciones"* · *"Sobre dirección. Muévelo"*.
#
# ── LAS TRES TRAMPAS QUE ESTE SCRIPT YA TIENE TAPADAS ────────────────────────
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
#    esta rama y git aborta el comando entero sin restaurar nada, así que las
#    mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 SE DENUNCIA EL PATRÓN QUE NO MUTA NADA (⛔), en vez de cantarlo como
#    "SOBREVIVIÓ". Un patrón que no matchea deja el archivo INTACTO: los tests
#    pasan y eso se lee como un candado flojo — un rojo inventado sobre algo que
#    nunca se puso a prueba. Ya pasó tres veces en este repo (un em-dash, un
#    espacio fino, y un `||` con `perl -0pi -e 's|…|…|'`, donde el delimitador
#    `|` des-escapa la alternación y la mutación se come el archivo entero).
#    Por eso el reemplazo es LITERAL y lo aplica `_mutar-guias-aplicar.py`:
#    **acá no hay perl, y por lo tanto no hay delimitador que se pueda romper.**
#
# 🩸 SI VITEST NO CORRIÓ NINGÚN ARCHIVO, "0 fallos" se leería como "sobrevivió".
#    Se exige el resumen de vitest **y** que `Test Files` sea ≥ 1.
#    ⚠️ De ahí sale la lista como ARRAY (`"${TESTS[@]}"`) y no como un string:
#    en **zsh** una variable sin comillas NO se parte por espacios, así que
#    `$TESTS` le llegaría a vitest como UN solo argumento, correría 0 archivos y
#    todo saldría verde sin haber probado nada. (En zsh el arreglo equivalente
#    sería `${=TESTS}`; el array funciona igual en los dos shells.)
#
#   bash scripts/_mutar-candados-guias-consistencia.sh
#   zsh  scripts/_mutar-candados-guias-consistencia.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/guias/components/GuiaForm.tsx"
  "src/app/guias/components/DespachoForm.tsx"
  "src/app/guias/components/AddNewInline.tsx"
  "src/lib/guias/juegos-despacho.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
# INT/TERM/PIPE además de EXIT: pipear el script a `head` lo mata con SIGPIPE y
# dejaría un archivo MUTADO en el árbol (los tests empiezan a fallar "solos").
trap restaurar EXIT INT TERM PIPE

TESTS=(
  "src/__tests__/components/guias-consistencia-despachada.test.tsx"
  "src/__tests__/components/guias-direccion-y-juegos.test.tsx"
  "src/__tests__/components/guias-anotar-numero-tarde.test.tsx"
  "src/__tests__/lib/guias-juegos-autocompletado.test.ts"
  "src/__tests__/lib/guias-juegos-despacho.test.ts"
  "src/__tests__/desplegables-flotan.test.ts"
  "src/__tests__/iphone-targets-guias.test.ts"
)

cazadas=0; sueltas=0; muertos=0; n=0

FORM="src/app/guias/components/GuiaForm.tsx"
DESPACHO="src/app/guias/components/DespachoForm.tsx"
ADDNEW="src/app/guias/components/AddNewInline.tsx"
JUEGOS="src/lib/guias/juegos-despacho.ts"

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_cons_err; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_cons_err))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run "${TESTS[@]}" --reporter=dot 2>&1)
  # 🩸 Si la corrida MUERE (o no colecta), "0 fallos" se leería como "sobrevivió".
  if ! grep -qE "Tests +[0-9]" <<< "$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ (no hay resumen de vitest) — $nombre"
    sueltas=$((sueltas+1)); restaurar; return
  fi
  local archivos_corridos
  archivos_corridos=$(grep -oE "Test Files +[0-9]+ (failed|passed)" <<< "$salida" | grep -oE "[0-9]+" | head -1)
  archivos_corridos=${archivos_corridos:-0}
  if [ "$archivos_corridos" -lt 1 ]; then
    echo "  ⚠️  VITEST CORRIÓ 0 ARCHIVOS — $nombre (el verde no vale nada)"
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

# ── 1 · un campo BLOQUEADO se vuelve editable ────────────────────────────────

mutacion "los BULTOS de una guía firmada vuelven a ser un campo escribible" "$FORM" \
  'if (soloCorregible) return valorBloqueado(item.bultos ?? 0, alineado);' \
  'if (false) return valorBloqueado(item.bultos ?? 0, alineado);'

mutacion "la DIRECCIÓN de una guía firmada se vuelve editable" "$FORM" \
  'if (soloCorregible) return valorBloqueado(item.direccion);' \
  'if (false) return valorBloqueado(item.direccion);'

mutacion "la EMPRESA de una guía firmada se vuelve editable" "$FORM" \
  'if (soloCorregible) return valorBloqueado(item.empresa);' \
  'if (false) return valorBloqueado(item.empresa);'

# 🩸 La mutación tiene que dejar JSX VÁLIDO: cambiar solo la etiqueta de
# apertura deja un `</span>` huérfano, el módulo no compila y vitest no colecta
# — o sea que no prueba el candado, prueba que un archivo roto rompe.
mutacion "la caja apagada vuelve a ser un input (se puede escribir ahí)" "$FORM" \
  '    <span
      data-bloqueado="1"
      aria-disabled="true"
      className={`${CAMPO_BLOQUEADO} px-2 ${alineado ? "text-right tabular-nums" : ""} ${
        t ? "text-gray-500" : "text-gray-300"
      }`}
    >
      {t || "—"}
    </span>' \
  '    <input
      readOnly
      data-bloqueado="1"
      aria-disabled="true"
      value={t || "—"}
      onChange={() => {}}
      className={`${CAMPO_BLOQUEADO} px-2 ${alineado ? "text-right" : ""}`}
    />'

# ── 2 · lo bloqueado deja de VERSE bloqueado ─────────────────────────────────

mutacion "vuelve el asterisco de obligatorio en la guía firmada" "$FORM" \
  'requerido={!soloCorregible}' 'requerido={true}' 5

mutacion "el asterisco desaparece TAMBIÉN al crear (se rompe el otro lado)" "$FORM" \
  'requerido={!soloCorregible}' 'requerido={false}' 5

mutacion "el candado de la fila desaparece" "$FORM" \
  'bloqueado={soloCorregible}' 'bloqueado={false}' 3

mutacion "el candado se pone SIEMPRE, también al crear" "$FORM" \
  'bloqueado={soloCorregible}' 'bloqueado={true}' 3

mutacion "la cabecera pierde su candado (Fecha)" "$FORM" \
  '<Campo label="Fecha" bloqueado>' '<Campo label="Fecha">'

mutacion "el candado deja de decirse para quien no ve la pantalla" "$FORM" \
  '<span className="sr-only">bloqueado, no se puede cambiar</span>
          </>' \
  '</>'

mutacion "las observaciones vuelven a esconderse cuando están vacías" "$FORM" \
  '<Campo label="Observaciones" bloqueado>{valorBloqueado(observaciones)}</Campo>' \
  '<>{String(observaciones ?? "").trim() ? <Campo label="Observaciones" bloqueado>{valorBloqueado(observaciones)}</Campo> : null}</>'

# ── 3 · el autocompletado aparece con 0 letras ───────────────────────────────

mutacion "el autocompletado se abre con 0 letras (vuelve a tapar la pantalla)" "$JUEGOS" \
  'export const MIN_LETRAS_JUEGO = 2;' \
  'export const MIN_LETRAS_JUEGO = 0;'

mutacion "…y con 1 letra también" "$JUEGOS" \
  'export const MIN_LETRAS_JUEGO = 2;' \
  'export const MIN_LETRAS_JUEGO = 1;'

mutacion "el filtro deja pasar TODO (pega por el medio)" "$JUEGOS" \
  'return nombre.startsWith(q) || nombre.split(" ").some((p) => p.startsWith(q));' \
  'return nombre.includes(q);'

mutacion "el filtro no ofrece nunca nada" "$JUEGOS" \
  'return nombre.startsWith(q) || nombre.split(" ").some((p) => p.startsWith(q));' \
  'return false;'

# ── 4 · deja de llenar los TRES campos ───────────────────────────────────────

mutacion "tocar una opción ya no llena los tres campos" "$DESPACHO" \
  'onClick={() => { onUsarJuego(j); setBuscandoJuego(false); }}' \
  'onClick={() => { setBuscandoJuego(false); }}'

mutacion "elegir un juego deja la lista ABIERTA, tapando los campos de abajo" "$DESPACHO" \
  'onClick={() => { onUsarJuego(j); setBuscandoJuego(false); }}' \
  'onClick={() => { onUsarJuego(j); }}'

mutacion "la opción baja de 44 px (no se puede tocar con el dedo)" "$DESPACHO" \
  'className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-gray-50' \
  'className="w-full text-left px-3 py-2 hover:bg-gray-50'

# ⚠️ "EL DESPLEGABLE VUELVE A SER UN `absolute`" NO SE PUEDE MUTAR DESDE ACÁ, Y
# SE DICE DE FRENTE. El barrido de `desplegables-flotan.test.ts` exime a todo
# archivo que MENCIONE `DesplegableFlotante` (`yaFlota`), así que la mutación
# fiel tiene que borrar el import Y el uso — dos ediciones NO contiguas, y este
# aplicador hace UNA literal por corrida a propósito. Envolverlo en un `<div
# absolute>` no reproduce nada: el panel se portalea a <body> igual. Lo que sí
# se muta es que el desplegable no llegue a abrirse nunca.
mutacion "el desplegable no se abre jamás" "$DESPACHO" \
  'abierto={mostrarJuegos}' 'abierto={false}'

# ── 5 · se ordena por FECHA en vez de por FRECUENCIA ─────────────────────────

mutacion "el filtro REORDENA y pierde el orden por frecuencia" "$JUEGOS" \
  '  return juegos.filter((j) => {' \
  '  return [...juegos].sort((a, b) => a.veces - b.veces).filter((j) => {'

mutacion "el filtro se ordena alfabéticamente por el nombre" "$JUEGOS" \
  '  return juegos.filter((j) => {' \
  '  return [...juegos].sort((a, b) => b.receptor.localeCompare(a.receptor)).filter((j) => {'

# ── 6 · vuelve el aviso DUPLICADO ────────────────────────────────────────────

mutacion "vuelve el «Falta: …» repetido en la barra pegajosa" "$FORM" \
  '          <SaveButton size="small" />
        </div>' \
  '          <SaveButton size="small" />
        </div>
        <AvisoFalta className="mt-1.5 text-xs" />'

mutacion "el «Falta: …» de abajo desaparece (el botón queda apagado sin decir por qué)" "$FORM" \
  '<AvisoFalta className="mt-2 text-sm" />' '<></>'

mutacion "el botón de la barra pegajosa pierde su explicación al pasar por encima" "$FORM" \
  'title={puedeGuardar ? undefined : avisoFalta}' 'title={undefined}'

# ── 7 · «Agregar destino» vuelve al título de la sección ─────────────────────

mutacion "«Agregar destino» desaparece del formulario" "$FORM" \
  '            <AddNewInline
              placeholder="Ciudad"
              onAdd={onAddDireccion}' \
  '            <AddNewInline
              placeholder="Ciudad"
              onAdd={() => {}}'

mutacion "«Agregar destino» vuelve a pegarse al TÍTULO de la sección" "$FORM" \
  '            Detalle de Envío
          </div>' \
  '            Detalle de Envío
            <AddNewInline placeholder="Ciudad" onAdd={onAddDireccion} etiqueta="Agregar destino" />
          </div>'

mutacion "el «＋» vuelve a quedarse sin rótulo visible" "$ADDNEW" \
  '        {textoBoton && <span className="text-sm">{textoBoton}</span>}' \
  '        {false && <span className="text-sm">{textoBoton}</span>}'

mutacion "el «＋» con rótulo baja de 44 px" "$ADDNEW" \
  'inline-flex items-center justify-center min-w-[44px] min-h-[44px] -my-3' \
  'inline-flex items-center justify-center -my-3'

# 🩸 EL CONTROL DEL PROPIO SCRIPT: una mutación que a propósito no matchea
# nada. Si esto no sale ⛔, el denunciador está roto y todos los ✅ de arriba
# valen lo mismo que un barrido con el comentario adentro.
mutacion "(control) un patrón que no existe tiene que salir DENUNCIADO" "$FORM" \
  'esto-no-existe-en-el-archivo' 'tampoco-esto'

echo
echo "═══ RESUMEN ═══"
echo "  intentadas: $n · cazadas: $cazadas · sobrevivieron: $sueltas · patrones muertos: $muertos"
# El control aporta EL único ⛔ esperado.
[ "$sueltas" -eq 0 ] && [ "$muertos" -eq 1 ]

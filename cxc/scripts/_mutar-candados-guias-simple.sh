#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — Guías: «se debe sentir como un papel» (25-ago-2026)
#
# Daniel, textual: ***"la guía se que sentir como un papel al entrar… debe de
# ser un formulario al crearlo, al editarlo, etc."*** · ***"se debe de poder
# crear una guía, todos los usuarios pueden abrirla, editarla etc, y cuando se
# complete marcarla como despachada y ya listo."***
#
# Cada mutación de acá abajo rompe UNA de las 15 cosas que Daniel aprobó punto
# por punto, o UNO de los candados que NO se pueden tocar. Si alguna
# SOBREVIVE, ese candado no está protegiendo lo que dice proteger.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó acá.
#
# 🩸 Y EL SCRIPT DENUNCIA EL PATRÓN QUE NO MUTA NADA, en vez de cantarlo como
# "SOBREVIVIÓ". Un patrón que no matchea deja el archivo intacto: los tests
# pasan y eso se lee como un candado flojo — un rojo inventado sobre algo que
# nunca se puso a prueba. Ya pasó tres veces en este repo (un em-dash, un
# espacio fino, y con `perl -0pi -e 's|A|B|'` el `||` del código real, que se
# des-escapa y PEGA la mutación al principio del archivo). Por eso el reemplazo
# es LITERAL — `scripts/_mutar-guias-aplicar.py` — y exige que el texto viejo
# aparezca exactamente las veces que se le dicen.
#
# 🩸 Y SE EXIGE VER EL RESUMEN DE VITEST antes de creerle a un cero: con
# `pipefail`, una corrida que muere se lee como "0 fallos" = "sobrevivió".
#
#   bash scripts/_mutar-candados-guias-simple.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

ARCHIVOS=(
  "src/app/guias/[id]/page.tsx"
  "src/app/guias/components/GuiaForm.tsx"
  "src/app/guias/components/GuiasList.tsx"
  "src/app/guias/components/EdicionGuia.tsx"
  "src/app/guias/components/ListaEnvios.tsx"
  "src/app/guias/components/useGuiaFormState.ts"
  "src/app/guias/components/excel-guias.ts"
  "src/app/api/guias/[id]/item/route.ts"
  "src/lib/guias/campos-editables.ts"
  "src/lib/guias/faltantes-despacho.ts"
  "src/lib/guias/abrir-en-edicion.ts"
)
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

TESTS="src/__tests__/components/guias-anotar-numero-tarde.test.tsx \
src/__tests__/components/guias-editar-en-la-misma-pantalla.test.tsx \
src/__tests__/components/guias-lista-unica-envios.test.tsx \
src/__tests__/components/guias-sin-rechazo.test.tsx \
src/__tests__/components/guias-entrega-directa.test.tsx \
src/__tests__/components/guias-numero-transp-no-se-copia.test.tsx \
src/__tests__/components/guias-editar-no-guarda-sola.test.tsx \
src/__tests__/components/guias-form.test.tsx \
src/__tests__/components/guias-papel-y-marcas.test.tsx \
src/__tests__/api/guias-corregir-item-route.test.ts \
src/__tests__/api/guias-numero-transp-tarde-route.test.ts \
src/__tests__/lib/guias-chip-nombre-y-candado.test.ts \
src/__tests__/lib/guias-numero-transp-no-bloquea.test.ts \
src/__tests__/lib/guias-numero-por-linea-y-papel.test.ts \
src/__tests__/lib/guias-campos-editables.test.ts \
src/__tests__/lib/guias-abrir-en-edicion.test.ts \
src/__tests__/lib/guias-faltantes-despacho.test.ts \
src/__tests__/excel-exports-operacion.test.ts \
src/__tests__/iphone-targets-guias.test.ts"

cazadas=0; sueltas=0; muertos=0; n=0

GUIA="src/app/guias/[id]/page.tsx"
FORM="src/app/guias/components/GuiaForm.tsx"
LISTA="src/app/guias/components/GuiasList.tsx"
EDICION="src/app/guias/components/EdicionGuia.tsx"
ENVIOS="src/app/guias/components/ListaEnvios.tsx"
HOOK="src/app/guias/components/useGuiaFormState.ts"
EXCEL="src/app/guias/components/excel-guias.ts"
RUTA="src/app/api/guias/[id]/item/route.ts"
CAMPOS="src/lib/guias/campos-editables.ts"
FALTAN="src/lib/guias/faltantes-despacho.ts"
ABRIR="src/lib/guias/abrir-en-edicion.ts"

# mutacion "<nombre>" <archivo> "<viejo>" "<nuevo>" [veces]
mutacion() {
  n=$((n+1))
  local nombre="$1" archivo="$2" viejo="$3" nuevo="$4" veces="${5:-1}"
  if ! python3 scripts/_mutar-guias-aplicar.py "$archivo" "$viejo" "$nuevo" "$veces" 2>/tmp/_mut_err; then
    echo "  ⛔ PATRÓN MUERTO — $nombre  ($(cat /tmp/_mut_err))"
    muertos=$((muertos+1)); restaurar; return
  fi
  local salida
  salida=$(npx vitest run $TESTS --reporter=dot 2>&1)
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

echo "═══ MUTACIONES ═══"

# ── 1 · UNA SOLA FORMA DE EDITAR (punto 1) ───────────────────────────────────
echo "· 1 · una sola forma de editar"

mutacion "vuelve el «Corregir» por renglón, al lado del formulario" "$ENVIOS" \
  '{editable && externo ? (' \
  '{editable ? (' 

mutacion "«Editar» de la guía no abre nada" "$GUIA" \
  'onClick={() => cambiarModo(true)}' \
  'onClick={() => {}}'

# ── 2 y 3 · quién edita y el flujo ───────────────────────────────────────────
echo "· 2-3 · quién edita y el flujo"

mutacion "bodega pierde «Editar» (nadie gana ni pierde permisos)" "$GUIA" \
  'const EDICION_ROLES = DESPACHO_ROLES;' \
  'const EDICION_ROLES = ["admin"];'

mutacion "la lista EMPIEZA a despachar (una sola puerta)" "$LISTA" \
  'onClick={() => onDespachar(expandedGuia.id)}' \
  'onClick={() => onEditar(expandedGuia.id)}'

# ── 4 y 5 · qué se corrige de una guía DESPACHADA, y qué no ──────────────────
echo "· 4-5 · la guía despachada: tres cosas, y los bultos NO"

mutacion "una guía firmada vuelve a abrirse ENTERA" "$CAMPOS" \
  'return guiaYaDespachada(estado) ? CAMPOS_DESPACHADA : CAMPOS_DE_RENGLON;' \
  'return CAMPOS_DE_RENGLON;'

mutacion "🔴 los BULTOS de una guía firmada se pueden tocar" "$CAMPOS" \
  'export const CAMPOS_DESPACHADA: readonly CampoDeRenglon[] = [
  "cliente",
  "cliente_codigo",
  "facturas",
  "numero_guia_transp",
];' \
  'export const CAMPOS_DESPACHADA: readonly CampoDeRenglon[] = [
  "cliente",
  "cliente_codigo",
  "facturas",
  "numero_guia_transp",
  "bultos",
];'

mutacion "las FACTURAS dejan de poder corregirse" "$CAMPOS" \
  '  "cliente_codigo",
  "facturas",
  "numero_guia_transp",
];' \
  '  "cliente_codigo",
  "numero_guia_transp",
];'

mutacion "el servidor deja de filtrar por campo" "$RUTA" \
  'if (prohibidos.length > 0) {' \
  'if (false && prohibidos.length > 0) {'

mutacion "el formulario dibuja los bultos como campo en una guía firmada" "$FORM" \
  'if (soloCorregible) return soloTexto(item.bultos ?? 0, alineado);' \
  '{ /* sin candado */ }'

mutacion "la cabecera de una guía firmada vuelve a ser editable" "$FORM" \
  '{soloCorregible ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">' \
  '{false ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">'

mutacion "🔴 se le pueden AGREGAR envíos a una guía que ya viajó" "$FORM" \
  '    if (soloCorregible) return null;
    if (items.length <= 1) return null;' \
  '    if (items.length <= 1) return null;'

mutacion "🔴 corregir una guía firmada vuelve a pasar por el PUT" "$HOOK" \
  'if (editingId && despachada) {
      if (silent) return;
      return guardarCorrecciones();
    }' \
  'if (false) { return; }'

mutacion "la corrección manda la fila ENTERA, no lo que cambió" "$CAMPOS" \
  'if (!(campo in actual)) continue;' \
  'if (false) continue;'

# 🩸 ESTA MUTACIÓN SOBREVIVIÓ EN LA PRIMERA CORRIDA, y enseñó algo. Apuntaba a
# un `if (soloCorregible) return;` del FORMULARIO que era **redundante** —quien
# de verdad impide la escritura es el hook— así que sacarlo no cambiaba nada, y
# el candado quedaba acusado de flojo cuando el flojo era el guard. Se borró la
# redundancia y ahora la mutación ataca el guard que manda.
mutacion "una guía firmada vuelve a AUTOGUARDARSE sola" "$HOOK" \
  'if (editingId && despachada) {
      if (silent) return;
      return guardarCorrecciones();
    }' \
  'if (editingId && despachada) {
      return guardarCorrecciones();
    }'

mutacion "abrir y cerrar una guía firmada vuelve a escribir sin cambios" "$FORM" \
  'const puedeGuardar = soloCorregible ? hayCambios : faltantes.length === 0;' \
  'const puedeGuardar = soloCorregible ? true : faltantes.length === 0;'

# ── 7 · el N° del transportista, POR LÍNEA ───────────────────────────────────
echo "· 7 · el N° del transportista por línea"

mutacion "las líneas dejan de pedir el N° del transportista" "$FORM" \
  'const pideNumeroTransp = modoEntrega === "transportista";' \
  'const pideNumeroTransp = false;'

mutacion "se pregunta en ENTREGA DIRECTA, donde no hay a quién pedírselo" "$FORM" \
  'const pideNumeroTransp = modoEntrega === "transportista";' \
  'const pideNumeroTransp = true;'

mutacion "🔴 guardar BORRA el N° de la cabecera de una guía vieja" "$HOOK" \
  '() => numeroCabeceraAlDespachar(items.map((i) => i.numero_guia_transp ?? ""), numeroGuiaTransp),' \
  '() => items.map((i) => i.numero_guia_transp ?? "").find(Boolean) ?? "",'

mutacion "🩸 el formulario NACE SUCIO con el N° anotado tarde" "$HOOK" \
  'numeroGuiaTransp: numeroCabeceraAlDespachar(
        c.items.map((i) => i.numero_guia_transp ?? ""),
        c.numeroGuiaTransp,
      ),' \
  'numeroGuiaTransp: c.numeroGuiaTransp,'

mutacion "el Excel vuelve a UNA FILA POR GUÍA" "$EXCEL" \
  '    items.forEach((item, i) => {
      envios++;
      rows.push(filaDeEnvio(g, item, i + 1, items.length));
    });' \
  '    envios += items.length;
    rows.push(filaDeEnvio(g, items[0], 1, items.length));'

mutacion "el Excel vuelve a leer el N° de la CABECERA" "$EXCEL" \
  'v: numeroTranspImpreso(item?.numero_guia_transp, g.numero_guia_transp) || "—",' \
  'v: String(g.numero_guia_transp ?? "") || "—",'

# ── 9 · entrar a una despachada ──────────────────────────────────────────────
echo "· 9 · entrar a una despachada"

mutacion "la fila de una guía DESPACHADA se queda sin «Editar»" "$LISTA" \
  '{canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => onEditar(expandedGuia.id)}' \
  '{canEdit && !isDispatched && (
                                      <button
                                        type="button"
                                        onClick={() => onEditar(expandedGuia.id)}'

mutacion "la guía DESPACHADA se queda sin «Editar» en su pantalla" "$GUIA" \
  'const puedeEditar = EDICION_ROLES.includes(role || "");' \
  'const puedeEditar = EDICION_ROLES.includes(role || "") && !s.despachada;'

# ── 10 y 11 · imprimir y compartir ───────────────────────────────────────────
echo "· 10-11 · imprimir directo y compartir"

mutacion "«Compartir» desaparece de la fila" "$LISTA" \
  'onClick={() => { void compartirEsta(expandedGuia); }}' \
  'onClick={() => {}}'

mutacion "«Imprimir» vuelve a abrir una pestaña con la vista previa" "$LISTA" \
  'onClick={() => { void imprimirEsta(expandedGuia); }}' \
  "onClick={() => window.open(\`/guias/\${expandedGuia.id}/imprimir\`, '_blank')}"

mutacion "«Compartir» desaparece de la guía" "$GUIA" \
  '                    Compartir
                  </button>' \
  '                    Imprimir
                  </button>'

# ── 13 · las despachadas incompletas, marcadas ───────────────────────────────
echo "· 13 · lo que faltó, marcado"

mutacion "la guía que salió sin placa deja de marcarse" "$FALTAN" \
  'if (!esEntregaDirecta(g) && vacio(sinCeroPelado(g.placa))) falta.push("la placa");' \
  'void 0;'

mutacion "la que salió sin «Recibido por» deja de marcarse" "$FALTAN" \
  'if (vacio(g.receptor_nombre)) falta.push("quién recibió");' \
  'void 0;'

mutacion "se marca también una guía PENDIENTE (ruido en el trabajo del día)" "$FALTAN" \
  'if (!guiaYaDespachada(g.estado)) return [];' \
  'void 0;'

mutacion "se le reclama placa a una ENTREGA DIRECTA" "$FALTAN" \
  'if (!esEntregaDirecta(g) && vacio(sinCeroPelado(g.placa)))' \
  'if (vacio(sinCeroPelado(g.placa)))'

# 🩸 LA FILA SE DIBUJA DOS VECES —tarjeta de celular y renglón de escritorio— y
# el CSS esconde una. Con un candado que pedía "al menos un chip", borrarlo de
# UNO de los dos layouts SOBREVIVÍA: el otro lo tapaba. Ahora se muta cada
# layout por separado y el candado exige los dos.
mutacion "el chip «Salió incompleta» desaparece de la tarjeta (celular)" "$LISTA" \
  '{despachadaIncompleta(g) && <SalioIncompleta />}' \
  '{false && <SalioIncompleta />}'

mutacion "el chip «Salió incompleta» desaparece del renglón (escritorio)" "$LISTA" \
  '{despachadaIncompleta(g) && (
                                <span className="shrink-0"><SalioIncompleta /></span>
                              )}' \
  '{false && (
                                <span className="shrink-0"><SalioIncompleta /></span>
                              )}'

# ── 14 · los tres textos que se contradecían ─────────────────────────────────
echo "· 14 · los tres textos"

mutacion "vuelve «Solo se puede cambiar el cliente»" "$LISTA" \
  '{textoFaltantesDespachada(expandedGuia) && (
                                    <p className="text-xs text-amber-800 pt-3">
                                      {textoFaltantesDespachada(expandedGuia)}.
                                    </p>
                                  )}' \
  '<p className="text-xs text-gray-500 pt-3">Solo se puede cambiar el cliente</p>'

mutacion "vuelve «no se puede editar» a la guía despachada" "$GUIA" \
  '      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-3">
        Ya despachada
      </span>' \
  '      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-3">
        Ya despachada
      </span>
      <p className="text-sm text-gray-600 mb-3">Esta guía ya se despachó: no se puede editar.</p>'

# ── 15 · el parpadeo ─────────────────────────────────────────────────────────
echo "· 15 · el parpadeo"

# 🩸 ACÁ HABÍA DOS MECANISMOS PARA LO MISMO —un inicializador perezoso de
# `useState` **y** este efecto— y por eso la mutación que sacaba cualquiera de
# los dos SOBREVIVÍA: el otro tapaba el agujero. Quedó uno solo.
mutacion "🔴 la guía deja de mirar la URL: nunca abre el formulario sola" "$GUIA" \
  'if (abrirEnEdicion(window.location.search)) setEditando(true);' \
  'void 0;'

# ⚠️ QUE EL EFECTO SEA `useLayoutEffect` Y NO `useEffect` es la diferencia entre
# corregir el modo ANTES o DESPUÉS de pintar — o sea, entre no parpadear y
# parpadear. **jsdom no puede ver esa diferencia** (no pinta), así que acá no se
# muta: quien lo caza es el medidor del navegador, que muere con `exit≠0` si al
# llegar con `?editar=1` el formulario no está. Se deja dicho en vez de fingir
# un ✅ que ningún test podría sostener.

mutacion "🔴 el formulario vuelve a esperar a que la guía cargue" "$GUIA" \
  'const enEdicion = editando && puedeEditar;' \
  'const enEdicion = editando && puedeEditar && !!g;'

mutacion "🔴 el formulario vuelve a pedir la guía POR SEGUNDA VEZ" "$EDICION" \
  'const s = useGuiaFormState({ editingId: id, alGuardar: onGuardado, guiaInicial: guia });' \
  'const s = useGuiaFormState({ editingId: id, alGuardar: onGuardado });'

mutacion "la URL se queda diciendo «?editar=1» al cerrar" "$ABRIR" \
  '  if (editando) p.set(QUERY_EDITAR, "1");
  else p.delete(QUERY_EDITAR);' \
  '  p.set(QUERY_EDITAR, "1");'

mutacion "la guía ignora «?editar=1» y abre siempre en lectura" "$ABRIR" \
  'return new URLSearchParams(String(search ?? "")).get(QUERY_EDITAR) === "1";' \
  'return false;'

# ── 12 · guardar una guía nueva te deja EN la guía ───────────────────────────
echo "· 12 · al guardar, te quedás en la guía"

mutacion "🔴 guardar una guía nueva vuelve a sacarte al listado" "$HOOK" \
  'router.push(nuevoId ? `/guias/${nuevoId}` : "/guias");' \
  'router.push("/guias");'

# 🩸 EL CONTROL DEL PROPIO SCRIPT: una mutación que a propósito no matchea
# nada. Si esto no sale ⛔, el denunciador está roto y todos los ✅ de arriba
# valen lo mismo que un barrido con el comentario adentro.
mutacion "(control) un patrón que no existe tiene que salir DENUNCIADO" "$GUIA" \
  'esto-no-existe-en-el-archivo' 'tampoco-esto'

echo
echo "═══ RESUMEN ═══"
echo "  intentadas: $n · cazadas: $cazadas · sobrevivieron: $sueltas · patrones muertos: $muertos"
# El control aporta EL único ⛔ esperado.
[ "$sueltas" -eq 0 ] && [ "$muertos" -eq 1 ]

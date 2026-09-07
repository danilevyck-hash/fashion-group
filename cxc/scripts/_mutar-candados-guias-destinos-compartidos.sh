#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE LOS CINCO CAMBIOS DE GUÍAS CAZAN DE VERDAD? (7-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar, y una mutación inocua) tienen que
# quedar VERDES: un ✅ ahí significa que los candados fallan por otra razón y
# toda la corrida no dice nada.
#
# Lo que Daniel aprobó y no se puede volver a romper:
#   1. La lista de destinos es del EQUIPO, no de un navegador — y se puede
#      QUITAR (soft delete firmado, nunca DELETE). La semilla sale de lo que de
#      verdad se usa, jamás del localStorage de nadie: «hola» no entra.
#   2. El destino REPETIDO no se dibuja.
#   3. UN solo botón de imprimir, y es el PDF (no la pantalla escalada).
#   4. Compartir: PNG en el celular, PDF en la computadora.
#   5. El «＋» del campo lleva rótulo VISIBLE (en el iPad no hay mouse).
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-guias-destinos-compartidos.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/guias-destinos-compartidos.test.ts \
src/__tests__/lib/guias-papel-uno-solo.test.ts \
src/__tests__/components/guias-destinos-compartidos-pantalla.test.tsx \
src/__tests__/components/guias-consistencia-despachada.test.tsx \
src/__tests__/lib/guia-pdf-compartir.test.ts \
src/__tests__/lib/guias-compartir-png.test.ts \
src/__tests__/lib/backup-nada-sin-copia.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/guias/destinos-lista.ts"
  "src/lib/guias/destinos-lista-server.ts"
  "src/lib/guias/destinos-clientes.ts"
  "src/lib/guias/compartir-formato.ts"
  "src/lib/guias/papel-de-la-guia.ts"
  "src/lib/aparato.ts"
  "src/lib/backup/tablas.ts"
  "src/app/api/guias/destinos-lista/route.ts"
  "src/app/api/cron/backup/route.ts"
  "src/app/guias/components/useGuiaFormState.ts"
  "src/app/guias/components/constants.ts"
  "src/app/guias/components/DestinosDelCliente.tsx"
  "src/app/guias/components/DestinosListaConfig.tsx"
  "src/app/guias/components/AddNewInline.tsx"
  "src/app/guias/components/GuiaForm.tsx"
  "src/app/guias/components/GuiaDetail.tsx"
  "supabase/migrations/20261014120000_guias_destino_lista.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── CONTROLES ────────────────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En un
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos); un ✅ es el problema"
mutar "src/lib/guias/destinos-lista.ts" \
  "// último transportista elegido, un filtro, un borrador— y para nada que otro" \
  "// último transportista elegido, un filtro o un borrador— y para nada que otro" \
  "CONTROL 2 — cambiar una palabra de un COMENTARIO. Lo bueno es el 🔴"
control_fallos=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. LA LISTA ES DEL EQUIPO, NO DE UN NAVEGADOR ────────────────────────"

mutar "src/app/guias/components/useGuiaFormState.ts" \
  'fetch("/api/guias/destinos-lista", { cache: "no-store" })' \
  'fetch("/api/guias/frecuencias", { cache: "no-store" })' \
  "1.1 el formulario deja de pedir la lista compartida"

mutar "src/app/guias/components/useGuiaFormState.ts" \
  '    fetch("/api/guias/destinos-lista", {
      method: "POST",' \
  '    fetch("/api/guias/nada", {
      method: "PUT",' \
  "1.2 agregar un destino ya no lo guarda para nadie"

mutar "src/app/guias/components/useGuiaFormState.ts" \
  '    const destino = String(name ?? "").trim();' \
  '    const destino = String(name ?? "").trim();
    localStorage.setItem("fg_direcciones", destino);' \
  "1.3 vuelve a guardarse en el navegador (fg_direcciones)"

mutar "src/app/guias/components/constants.ts" \
  '// 🩸 ACÁ VIVÍAN `loadList` y `saveList` — RETIRADAS el 7-sep-2026.' \
  'export function loadList(key: string, defaults: string[]): string[] {
  return JSON.parse(localStorage.getItem(key) || "[]") as string[] ?? defaults;
}
// 🩸 ACÁ VIVÍAN `loadList` y `saveList` — RETIRADAS el 7-sep-2026.' \
  "1.4 vuelve loadList: la lista se parte en dos otra vez"

mutar "src/lib/guias/destinos-lista.ts" \
  'export const DESTINOS_LISTA_ROLES_ESCRITURA = ["admin", "secretaria", "bodega"] as const;' \
  'export const DESTINOS_LISTA_ROLES_ESCRITURA = ["admin", "secretaria"] as const;' \
  "1.5 bodega pierde el ＋ del campo (y arma guías todo el día)"

echo "── 2. LA SEMILLA SALE DE LO MEDIDO — «hola» NO ENTRA ────────────────────"

mutar "supabase/migrations/20261014120000_guias_destino_lista.sql" \
  "  ('Metromall',              'sistema', '2026-09-07 12:00:00-05')   --   3" \
  "  ('Metromall',              'sistema', '2026-09-07 12:00:00-05'),  --   3
  ('hola',                   'sistema', '2026-09-07 12:00:00-05')" \
  "2.1 se siembra «hola», el destino de prueba de un navegador"

mutar "supabase/migrations/20261014120000_guias_destino_lista.sql" \
  "  ('Bugaba',                 'sistema', '2026-09-07 12:00:00-05'),  --   4
" "" \
  "2.2 la semilla pierde un destino sin remedirla"

mutar "supabase/migrations/20261014120000_guias_destino_lista.sql" \
  "('Penonomé'" "('Penonome'" \
  "2.3 se siembra el typo del histórico en vez de la grafía de Daniel"

mutar "supabase/migrations/20261014120000_guias_destino_lista.sql" \
  "('Changuinola'" "('Changinola'" \
  "2.4 vuelve «Changinola» sin «u» — el pueblo contaría como DOS destinos"

mutar "src/lib/guias/destinos-lista.ts" \
  '  "Changuinola",' '  "Changinola",' \
  "2.5 la red del código también pierde la «u»"

echo "── 3. SI SE AGREGA, SE QUITA — Y NADA SE BORRA ──────────────────────────"

mutar "src/lib/guias/destinos-lista-server.ts" \
  '    .update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })' \
  '    .delete()' \
  "3.1 quitar pasa a ser un DELETE de verdad"

mutar "src/lib/guias/destinos-lista-server.ts" \
  '    .update({ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date().toISOString() })' \
  '    .update({ activo: false })' \
  "3.2 la baja deja de firmarse (quién y cuándo)"

mutar "supabase/migrations/20261014120000_guias_destino_lista.sql" \
  '  CONSTRAINT guias_destino_lista_baja_firmada
    CHECK (activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))' \
  '  CONSTRAINT guias_destino_lista_baja_firmada
    CHECK (true)' \
  "3.3 la tabla deja de exigir la firma de la baja"

mutar "supabase/migrations/20261014120000_guias_destino_lista.sql" \
  'GRANT SELECT, INSERT, UPDATE ON guias_destino_lista TO service_role;' \
  'GRANT SELECT, INSERT, UPDATE, DELETE ON guias_destino_lista TO service_role;' \
  "3.4 la tabla vuelve a dar permiso de borrar"

mutar "src/app/api/guias/destinos-lista/route.ts" \
  'export async function DELETE(req: NextRequest) {' \
  'async function DELETE_RETIRADO(req: NextRequest) {' \
  "3.5 se puede agregar pero NO quitar (el defecto original)"

echo "── 4. EL REPETIDO, POR CLAVE EXACTA Y JAMÁS POR PARECIDO ────────────────"

mutar "src/lib/guias/destinos-lista.ts" \
  '  const k = claveDestino(destino);
  return lista.some((d) => claveDestino(d) === k);' \
  '  return lista.includes(destino);' \
  "4.1 «DAVID» y «David» conviven: la lista se ensucia sola"

mutar "src/lib/guias/destinos-lista.ts" \
  '  return lista.some((d) => claveDestino(d) === k);' \
  '  return lista.some((d) => claveDestino(d).slice(0, 4) === k.slice(0, 4));' \
  "4.2 el repetido se decide POR PARECIDO (prohibido en esta casa)"

mutar "src/lib/guias/destinos-lista-server.ts" \
  '  if (yaEstaEnLaLista(destino, activos.map((f) => f.destino))) {
    return { ok: false, status: 409, error: "Ese destino ya está en la lista" };
  }' \
  '' \
  "4.3 el servidor deja de comprobar el repetido"

echo "── 5. SIN LA MIGRACIÓN, LA PANTALLA SIGUE FUNCIONANDO ───────────────────"

mutar "src/lib/guias/destinos-lista.ts" \
  '  const fuente = filas.length > 0 ? filas : DESTINOS_BASE;' \
  '  const fuente = filas;' \
  "5.1 sin la tabla, el campo se queda SIN sugerencias"

mutar "src/lib/guias/destinos-lista-server.ts" \
  '  } catch {
    return [...DESTINOS_BASE];
  }' \
  '  } catch (e) {
    throw e;
  }' \
  "5.2 la lectura del formulario deja de fallar abierta"

mutar "src/app/api/guias/destinos-lista/route.ts" \
  '      return NextResponse.json({ lista: [], sinTabla: true });' \
  '      return NextResponse.json({ error: "sin tabla" }, { status: 503 });' \
  "5.3 Configuración se pone roja por una migración pendiente"

mutar "src/app/guias/components/useGuiaFormState.ts" \
  'useState<string[]>([...DESTINOS_BASE])' \
  'useState<string[]>([])' \
  "5.4 el campo nace sin sugerencias mientras carga"

echo "── 6. EL DESTINO REPETIDO NO SE DIBUJA ──────────────────────────────────"

mutar "src/lib/guias/destinos-clientes.ts" \
  '  if (lista.length !== 1) return lista;' \
  '  return lista;
  // eslint-disable-next-line no-unreachable
  if (lista.length !== 1) return lista;' \
  "6.1 el botón repetido vuelve a dibujarse (el dato dos veces)"

mutar "src/lib/guias/destinos-clientes.ts" \
  '  if (lista.length !== 1) return lista;' \
  '  if (lista.length === 0) return lista;' \
  "6.2 con VARIOS destinos se esconde el que coincide"

mutar "src/lib/guias/destinos-clientes.ts" \
  '  const base = baseDeDestino(direccion);
  if (!base) return lista;
  return claveDestino(lista[0]) === claveDestino(base) ? [] : lista;' \
  '  return direccion ? [] : lista;' \
  "6.3 se esconde el botón aunque el campo diga OTRA cosa"

mutar "src/app/guias/components/DestinosDelCliente.tsx" \
  '  const botones = botonesQueSeDibujan(botonesDeDestino(codigo, historicos, definidos), direccion);' \
  '  const botones = botonesDeDestino(codigo, historicos, definidos);' \
  "6.4 la pantalla deja de aplicar la regla"

mutar "src/app/guias/components/DestinosDelCliente.tsx" \
  '  if (botones.length === 0 && tiendas.length === 0) return null;' \
  '  if (botones.length === 0) return null;' \
  "6.5 al esconder el botón se pierde la fila de TIENDAS"

echo "── 7. UN SOLO PAPEL: IMPRIMIR ES EL PDF ─────────────────────────────────"

mutar "src/app/guias/components/GuiaDetail.tsx" \
  '          onClick={imprimir}' \
  '          onClick={() => window.print()}' \
  "7.1 vuelve a imprimirse la PANTALLA escalada («una foto de la guía»)"

mutar "src/app/guias/components/GuiaDetail.tsx" \
  '    if (imprimirGuia(guia) === "bloqueado") {' \
  '    if (String(guia.id) === "") {' \
  "7.2 el botón deja de mandar el PDF"

echo "── 8. COMPARTIR: PNG EN EL CELULAR, PDF EN LA COMPUTADORA ───────────────"

mutar "src/lib/guias/compartir-formato.ts" \
  '  if (aparato !== "celular") return "pdf";' \
  '' \
  "8.1 la computadora vuelve a recibir una imagen"

mutar "src/lib/guias/papel-de-la-guia.ts" \
  'formatoParaCompartir((g.guia_items ?? []).length, aparatoDeQuienMira())' \
  'formatoParaCompartir((g.guia_items ?? []).length)' \
  "8.2 el que comparte deja de preguntar por el aparato"

mutar "src/lib/aparato.ts" \
  '    if (window.matchMedia?.("(pointer: coarse)").matches) return "celular";' \
  '    if (window.matchMedia?.("(pointer: fine)").matches) return "celular";' \
  "8.3 se invierte el reconocimiento: el mouse pasa por dedo"

mutar "src/lib/aparato.ts" \
  '  return esIOS() ? "celular" : "computadora";' \
  '  return "computadora";' \
  "8.4 el iPad («Macintosh» en Safari) pasa por computadora"

echo "── 9. EL ＋ DICE QUÉ HACE, SIN MOUSE ────────────────────────────────────"

mutar "src/app/guias/components/AddNewInline.tsx" \
  '        {textoBoton && <span className="text-xs whitespace-nowrap">{textoBoton}</span>}' \
  '' \
  "9.1 el ＋ vuelve a ser un símbolo gris sin nombre (en el iPad no hay mouse)"

mutar "src/app/guias/components/GuiaForm.tsx" \
  '            textoBoton="Agregar destino"' \
  '' \
  "9.2 el campo Dirección deja de pasarle el rótulo"

mutar "src/app/guias/components/GuiaForm.tsx" \
  '            etiqueta="Agregar destino a la lista que ve todo el equipo"' \
  '            etiqueta="Agregar destino a la lista de este navegador"' \
  "9.3 la pantalla vuelve a decir que la lista es de este navegador"

echo "── 10. NADA SIN COPIA, Y NADA DE VOSEO ──────────────────────────────────"

mutar "src/lib/backup/tablas.ts" \
  '  "guias_destino_lista",' '' \
  "10.1 la tabla nueva queda sin clasificar en el respaldo"

mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "guias_destino_lista" },' '' \
  "10.2 la tabla nueva se queda SIN COPIA"

mutar "src/app/guias/components/DestinosListaConfig.tsx" \
  'Es la lista que se despliega al escribir la dirección de un envío' \
  'Acá tenés la lista que se despliega al escribir la dirección de un envío' \
  "10.3 se cuela voseo en una pantalla"

echo ""
echo "═════════════════════════════════════════════════════════════════════════"
echo "  CONTROL: $control_fallos fallo(s) — tiene que ser 0"
echo "  MUTACIONES: $cazadas cazadas · $sobrevivientes sobrevivientes"
echo "═════════════════════════════════════════════════════════════════════════"

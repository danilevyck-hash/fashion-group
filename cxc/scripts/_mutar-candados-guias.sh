#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados de Guías (entrega directa, dirección
# sugerida, juegos MÁS FRECUENTES y el botón "Despachar").
#
# Rompe UNA cosa por vez, corre los tests de guías y exige que se pongan ROJOS.
# Un candado que pasa estando mutado no protege nada — en este repo ya pasó
# cuatro veces con barridos que leían sus propios comentarios.
#
#   bash scripts/_mutar-candados-guias.sh
#
# No toca la base ni la red. Restaura los archivos al terminar (y también si se
# interrumpe).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/guias-modo-despacho.test.ts
  src/__tests__/lib/guias-direccion-sugerida.test.ts
  src/__tests__/lib/guias-juegos-despacho.test.ts
  src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts
  src/__tests__/lib/guias-placa-entrega-directa.test.ts
  src/__tests__/lib/guia-pdf-compartir.test.ts
  src/__tests__/lib/guias-frecuencias-ruta.test.ts
  src/__tests__/components/guias-entrega-directa.test.tsx
  src/__tests__/components/guias-direccion-y-juegos.test.tsx
)

ARCHIVOS=(
  src/app/api/guias/frecuencias/route.ts
  src/app/api/guias/despachos-frecuentes/route.ts
  src/lib/guias/modo-despacho.ts
  src/lib/guias/direccion-sugerida.ts
  src/lib/guias/juegos-despacho.ts
  src/lib/guias/pdf-guia.ts
  src/app/guias/components/PrintDocument.tsx
  src/app/guias/components/DespachoForm.tsx
  src/app/guias/components/GuiaForm.tsx
  src/app/guias/components/GuiasList.tsx
  src/app/guias/components/useDespachoGuia.ts
)

TMP="$(mktemp -d)"
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr '/' '_')" "$f"; done; }
trap 'restaurar; rm -rf "$TMP"' EXIT INT TERM
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr '/' '_')"; done

CAZADAS=0; ESCAPADAS=0

mutar() { # $1 descripción · $2 archivo · $3 viejo · $4 nuevo
  python3 - "$2" "$3" "$4" <<'PY' || { echo "  ⚠️  el texto a mutar no está: $1"; return 1; }
import io, sys
p, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(p, encoding="utf-8").read()
if viejo not in s:
    sys.exit(1)
io.open(p, "w", encoding="utf-8").write(s.replace(viejo, nuevo, 1))
PY
}

probar() { # $1 descripción
  if npx vitest run "${TESTS[@]}" >/dev/null 2>&1; then
    echo "  🔴 ESCAPÓ — $1"
    ESCAPADAS=$((ESCAPADAS + 1))
  else
    echo "  ✅ cazada — $1"
    CAZADAS=$((CAZADAS + 1))
  fi
  restaurar
}

caso() { # $1 desc · $2 archivo · $3 viejo · $4 nuevo
  if mutar "$1" "$2" "$3" "$4"; then probar "$1"; else ESCAPADAS=$((ESCAPADAS + 1)); fi
}

echo "── 1. El modo de despacho ──────────────────────────────────────────────"
caso "el modo vuelve a salir de tipo_despacho, ignorando modo_entrega" \
  src/lib/guias/modo-despacho.ts \
  '  return tipoDespachoDeModo(g.modo_entrega);
}' \
  '  return tipoValido(g.tipo_despacho) ?? "externo";
}'

caso "modo_entrega gana SIEMPRE (le pisa la historia a una guía despachada)" \
  src/lib/guias/modo-despacho.ts \
  '  if (guiaYaDespachada(g.estado)) {
    return tipoValido(g.tipo_despacho) ?? tipoDespachoDeModo(g.modo_entrega);
  }' \
  '  if (false) {
    return tipoValido(g.tipo_despacho) ?? tipoDespachoDeModo(g.modo_entrega);
  }'

caso "sin modo_entrega inventa una entrega directa" \
  src/lib/guias/modo-despacho.ts \
  'return modo === "entrega_directa" ? "directo" : "externo";' \
  'return modo === "transportista" ? "externo" : "directo";'

echo "── 2. El '0' que se tecleó para pasar la validación ────────────────────"
caso "el '0' vuelve a imprimirse como si fuera una placa" \
  src/lib/guias/modo-despacho.ts \
  '  return t === "0" ? "" : t;' \
  '  return t;'

caso "sinCeroPelado se come cualquier cosa con un 0 (dato bueno perdido)" \
  src/lib/guias/modo-despacho.ts \
  '  return t === "0" ? "" : t;' \
  '  return t.includes("0") ? "" : t;'

echo "── 3. El papel ────────────────────────────────────────────────────────"
caso "la hoja vuelve a imprimir PLACA en entrega directa" \
  src/app/guias/components/PrintDocument.tsx \
  '          {!isDirect && (
            <div className="flex gap-2">
              <span className="font-medium">PLACA / VEHICULO:</span>' \
  '          {true && (
            <div className="flex gap-2">
              <span className="font-medium">PLACA / VEHICULO:</span>'

caso "la hoja vuelve a decidir el TIPO con tipo_despacho a secas" \
  src/app/guias/components/PrintDocument.tsx \
  '  const isDirect = esEntregaDirecta(g);' \
  '  const isDirect = g.tipo_despacho === "directo";'

caso "el PDF se separa del papel y vuelve a mirar tipo_despacho" \
  src/lib/guias/pdf-guia.ts \
  '  const esDirecta = esEntregaDirecta(g);' \
  '  const esDirecta = g.tipo_despacho === "directo";'

caso "el PDF vuelve a poner la placa en entrega directa" \
  src/lib/guias/pdf-guia.ts \
  '  if (!esDirecta) campos.push(["PLACA / VEHICULO:", sinCeroPelado(g.placa)]);' \
  '  campos.push(["PLACA / VEHICULO:", g.placa ?? ""]);'

echo "── 4. La pantalla de despacho ─────────────────────────────────────────"
caso "vuelve a pedir la placa en entrega directa" \
  src/app/guias/components/DespachoForm.tsx \
  '          {externo && (
            <div>
              <label htmlFor="despacho-placa"' \
  '          {true && (
            <div>
              <label htmlFor="despacho-placa"'

caso "vuelve a pedir el N° de guía del transportista en entrega directa" \
  src/app/guias/components/DespachoForm.tsx \
  '      {externo && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-400 block">
            N° de guía del transportista' \
  '      {true && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-400 block">
            N° de guía del transportista'

caso "vuelve a PREGUNTAR el modo en vez de mostrarlo" \
  src/app/guias/components/DespachoForm.tsx \
  '        {cambiandoModo ? (' \
  '        {true ? ('

caso "el despacho vuelve a mandar la placa aunque sea entrega directa" \
  src/app/guias/components/useDespachoGuia.ts \
  '      payload.placa = "";' \
  '      payload.placa = bPlaca;'

echo "── 5. Las mismas palabras y el botón ──────────────────────────────────"
caso "el alta vuelve a decir 'Transportista' y el despacho 'Transportista externo'" \
  src/app/guias/components/GuiaForm.tsx \
  '                {ETIQUETA_TIPO_DESPACHO.externo}' \
  '                Transportista'

caso "el botón de la fila vuelve a decir 'Editar' con la guía pendiente" \
  src/app/guias/components/GuiasList.tsx \
  '                                        {expandedGuia.estado === "Pendiente Bodega" ? (' \
  '                                        {false ? ('

echo "── 6. La dirección sugerida ───────────────────────────────────────────"
caso "la dirección del cliente deja de ir primera" \
  src/lib/guias/direccion-sugerida.ts \
  '  return dedupe([primera, ...base]);' \
  '  return dedupe([...base, primera]);'

caso "la sugerencia se ESCRIBE SOLA en el campo (lo que Daniel NO pidió)" \
  src/app/guias/components/GuiaForm.tsx \
  '          value={item.direccion}
          placeholder="Ciudad o destino"' \
  '          value={item.direccion || direccionPorCliente[(item.cliente_codigo || "").trim()] || ""}
          placeholder="Ciudad o destino"'

caso "la última dirección se toma de la guía más VIEJA" \
  src/lib/guias/direccion-sugerida.ts \
  '    if (!actual || f > actual.f || (f === actual.f && n >= actual.n)) {' \
  '    if (!actual || f < actual.f || (f === actual.f && n <= actual.n)) {'

caso "la ruta deja de mandar las direcciones" \
  src/app/api/guias/frecuencias/route.ts \
  '    return NextResponse.json({ clientes, empresas, direcciones });' \
  '    return NextResponse.json({ clientes, empresas });'

echo "── 7. Los juegos MÁS FRECUENTES por transportista ─────────────────────"
caso "la identidad del juego vuelve a ser el NOMBRE (Jocsan murillo != Jocnsa)" \
  src/lib/guias/juegos-despacho.ts \
  '  return ced ? `C:${ced}|P:${placa}` : `R:${normalizarNombre(j.receptor)}|P:${placa}`;' \
  '  return `R:${normalizarNombre(j.receptor)}|C:${ced}|P:${placa}`;'

caso "los juegos dejan de normalizar guiones y mayúsculas" \
  src/lib/guias/juegos-despacho.ts \
  '  return sinTildes(String(s ?? "")).toUpperCase().replace(/[^A-Z0-9]/g, "");' \
  '  return String(s ?? "");'

caso "se ordenan por FECHA en vez de por frecuencia" \
  src/lib/guias/juegos-despacho.ts \
  '    .sort((a, b) => b.veces - a.veces || masReciente(a.masNueva, b.masNueva))' \
  '    .sort((a, b) => masReciente(a.masNueva, b.masNueva))'

caso "se ofrece la forma MENOS usada del juego (Erick en vez de Eric)" \
  src/lib/guias/juegos-despacho.ts \
  '        (a, b) => b.veces - a.veces || masReciente(a.guia, b.guia),' \
  '        (a, b) => a.veces - b.veces || masReciente(a.guia, b.guia),'

caso "entran juegos de guías que TODAVÍA NO SALIERON" \
  src/lib/guias/juegos-despacho.ts \
  '      (g.estado === "Completada" || g.estado === "Rechazada") &&' \
  '      true &&'

caso "entran juegos INCOMPLETOS (no llenan los tres campos)" \
  src/lib/guias/juegos-despacho.ts \
  '      lleno(g.receptor_nombre) &&
      lleno(g.cedula) &&
      lleno(g.placa),' \
  '      true,'

caso "se guarda el valor NORMALIZADO en vez del original" \
  src/lib/guias/juegos-despacho.ts \
  '      receptor: String(g.receptor_nombre ?? "").trim(),' \
  '      receptor: normalizarNombre(g.receptor_nombre),'

caso "los juegos aparecen también en entrega directa" \
  src/app/guias/components/DespachoForm.tsx \
  '        {externo && juegos.length > 0 && onUsarJuego && (' \
  '        {juegos.length > 0 && onUsarJuego && ('

caso "la ruta deja de acotar por transportista (juegos de cualquiera)" \
  src/app/api/guias/despachos-frecuentes/route.ts \
  '      .eq("transportista_id", transportista)' \
  '      .not("transportista_id", "is", null)'

caso "la ruta cuenta sobre una VENTANA de las 60 más recientes" \
  src/app/api/guias/despachos-frecuentes/route.ts \
  '      .limit(1000);' \
  '      .limit(60);'

echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "  cazadas: $CAZADAS · escaparon: $ESCAPADAS"
[ "$ESCAPADAS" -eq 0 ] || exit 1

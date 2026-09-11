#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del REDISEÑO DE RECLAMOS (10/11-sep-2026) CAZAN de verdad?
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-reclamos-rediseno.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/reclamos-rediseno.test.ts \
src/__tests__/components/reclamos-rediseno.test.tsx \
src/__tests__/reclamos-itbms-rotulo-y-pendientes.test.tsx \
src/__tests__/lib/reclamos-estado-pagado-unico.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/reclamos/portada.ts"
  "src/lib/reclamos/empresas-con-reclamos.ts"
  "src/lib/reclamos/orden.ts"
  "src/lib/reclamos/reclamado.ts"
  "src/lib/reclamos/facturas.ts"
  "src/lib/reclamos/lineas-factura.ts"
  "src/lib/reclamos/lector-factura.ts"
  "src/lib/reclamos/texto.ts"
  "src/lib/reclamos/validate.ts"
  "src/lib/reclamos/galeria.ts"
  "src/lib/reclamos/marcar-reclamado.ts"
  "src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts"
  "src/app/api/reclamos/[id]/excel/route.ts"
  "src/app/reclamos/ReclamosClient.tsx"
  "src/app/reclamos/components/EmpresaList.tsx"
  "src/app/reclamos/components/EmpresaSelector.tsx"
  "src/app/reclamos/components/ReclamoDetail.tsx"
  "src/app/reclamos/components/ReclamoForm.tsx"
  "supabase/migrations/20261111120000_reclamos_rediseno.sql"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() { # $1 = nombre
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"; sobrevivientes=$((sobrevivientes + 1))
  fi
}
control() { # $1 = nombre
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if grep -qE "^ *Tests " <<<"$salida" && [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL sobrevivió — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL cazado (mal) — $1"; controles_mal=$((controles_mal + 1))
  fi
}
# mutar ARCHIVO 'perl-expr' NOMBRE — exige que la expresión CAMBIE el archivo.
mutar() {
  local f="$1" expr="$2" nombre="$3"
  perl -0pi -e "$expr" "$f"
  if cmp -s "$f" "$RESPALDO/$f"; then echo "  ⚠️  LA MUTACIÓN NO TOCÓ NADA — $nombre"; sobrevivientes=$((sobrevivientes + 1)); restaurar; return; fi
  probar "$nombre"; restaurar
}

echo "── mutaciones ──"
mutar src/lib/reclamos/portada.ts 's/c\?\.nombre_contacto \|\| c\?\.nombre/c?.nombre/' "el contacto vuelve a leer \`nombre\` (el bug de Sin contacto)"
mutar src/lib/reclamos/empresas-con-reclamos.ts 's/"Joystep", \/\//"Nadie", \/\//' "Joystep vuelve a la portada"
mutar src/lib/reclamos/portada.ts 's/b\.monto - a\.monto/a.monto - b.monto/' "las tarjetas se ordenan de menos a más plata"
mutar src/lib/reclamos/portada.ts 's/masViejoDias: dias\.length \? Math\.max\(\.\.\.dias\) : null/masViejoDias: null/' "«el más viejo lleva N días» deja de calcularse"
mutar src/lib/reclamos/portada.ts 's/pend\.filter\(\(r\) => !estaReclamado\(r\)\)\.length/0/' "el chip «sin reclamar N» siempre en cero"
mutar src/lib/reclamos/orden.ts 's/FILTRO_DEFAULT: FiltroEstado = "por-cobrar"/FILTRO_DEFAULT: FiltroEstado = "cobrados"/' "la empresa abre en Cobrados"
mutar src/lib/reclamos/orden.ts 's/return fa\.localeCompare\(fb\)/return fb.localeCompare(fa)/' "la factura más NUEVA primero"
mutar src/lib/reclamos/orden.ts 's/if \(fa\) return -1;\n    if \(fb\) return 1;/if (fa) return 1;\n    if (fb) return -1;/' "los sin fecha van primero"
mutar src/lib/reclamos/reclamado.ts 's/return !!r\.reclamado_en;/return false;/' "todo dice Sin reclamar"
mutar src/lib/reclamos/facturas.ts 's/SEPARADOR_EN_PANTALLA = " · "/SEPARADOR_EN_PANTALLA = " - "/' "las facturas se muestran con guion"
mutar src/lib/reclamos/facturas.ts 's/if \(vistas\.has\(f\)\) continue;//' "las facturas repetidas entran dos veces"
mutar src/lib/reclamos/lineas-factura.ts 's/\[l\.referencia, l\.descripcion\]\.some/[l.referencia, l.descripcion, l.talla].some/' "el buscador busca por talla"
mutar src/lib/reclamos/lineas-factura.ts 's/motivo: anterior\.motivo,/motivo: "",/' "Repetir el anterior no copia el motivo"
mutar src/lib/reclamos/lineas-factura.ts 's/"Estilo", "Descripción"/"Referencia", "Descripción"/' "el rótulo vuelve a decir Referencia"
mutar src/lib/reclamos/lineas-factura.ts 's/const escritos = manuales\.filter\(\(i\) => i\.referencia\.trim\(\) \|\| i\.descripcion\.trim\(\)\);/const escritos = [...manuales];/' "los renglones vacíos se guardan"
mutar src/lib/reclamos/validate.ts 's/if \(!s\(h\.factura_pdf_path\)\) return FALTA_PDF;//' "el PDF deja de ser obligatorio"
mutar src/lib/reclamos/lector-factura.ts 's/devuelve UN renglón por talla con esa cantidad/devuelve el renglón junto/' "el lector deja de desglosar la talla"
mutar src/lib/reclamos/texto.ts 's/return cuerpo\.charAt\(0\)\.toUpperCase\(\) \+ cuerpo\.slice\(1\);/return m;/' "el motivo sale como se tecleó"
mutar src/lib/reclamos/texto.ts 's/if \(m\) return \{ texto: `Correo enviado a/if (false) return { texto: `Correo enviado a/' "la nota vieja del correo se lee entera"
mutar src/lib/reclamos/marcar-reclamado.ts 's/\.is\("reclamado_en", null\)//g' "reclamado_en se pisa en cada descarga"
mutar 'src/app/api/reclamos/proveedor/[empresa]/send-zip/route.ts' 's/await marcarReclamados\(ids\);//' "el correo no marca reclamado"
mutar 'src/app/api/reclamos/[id]/excel/route.ts' 's/await marcarReclamados\(\[id\]\);//' "el Excel de uno no marca reclamado"
mutar src/app/reclamos/ReclamosClient.tsx 's/Tendrás 5 segundos para deshacerlo\./Esta acción no se puede deshacer./g' "el modal vuelve a decir que no se puede deshacer"
mutar src/app/reclamos/ReclamosClient.tsx 's/scheduleUndoReclamo\(\{/void scheduleUndoReclamo; ({/' "el deshacer de 5 s deja de dispararse"
mutar src/app/reclamos/components/EmpresaList.tsx 's/const filtro: FiltroEstado = filtroDesdeUrl\(filtroUrl\);/const filtro: FiltroEstado = "cobrados";/' "la lista ignora la URL y abre en Cobrados"
mutar src/app/reclamos/components/EmpresaList.tsx 's/const idsObjetivo = hasSelection \? selectedIds : visibles\.map\(\(r\) => r\.id\);/const idsObjetivo = hasSelection ? selectedIds : allEmpresaRecs.map((r) => r.id);/' "el archivo arrastra los pagados"
mutar src/app/reclamos/components/EmpresaSelector.tsx 's/<p className="text-sm text-gray-400 mt-1">\{t\.tieneHistoria \? "Nada por cobrar" : TODAVIA_SIN_RECLAMOS\}<\/p>/<p className="text-sm text-gray-400 mt-1">\$0.00<\/p>/' "la tarjeta vacía vuelve a decir \$0.00"
mutar src/app/reclamos/components/ReclamoDetail.tsx 's/\{!pendiente \? "Pagado" : textoReclamado\(current\)\}/{current.estado}/' "el chip del detalle vuelve a decir Creado"
mutar src/app/reclamos/components/ReclamoDetail.tsx 's/onClick=\{\(\) => setQuitarNc\(\{ id: s\.id, monto: Number\(s\.monto\) \|\| 0 \}\)\}/onClick={() => onRemoveSettlement(s.id)}/' "quitar la nota de crédito sin preguntar"
mutar src/app/reclamos/components/ReclamoDetail.tsx 's/\{conGenero && <th className="text-left pb-2 font-medium">Género<\/th>\}/<th className="text-left pb-2 font-medium">Género<\/th>/' "la columna Género se dibuja vacía"
mutar src/app/reclamos/components/ReclamoForm.tsx 's/disabled=\{saving \|\| faltaPdf\}/disabled={saving}/' "Guardar se prende sin PDF"
mutar src/lib/reclamos/galeria.ts 's/const firmadas = await firmarFotos\(rows\);/const firmadas = rows.map((f) => ({ ...f, url: `https:\/\/x.supabase.co\/storage\/v1\/object\/public\/reclamo-fotos\/${f.storage_path}` }));/' "la galería vuelve a la URL pública"
mutar supabase/migrations/20261111120000_reclamos_rediseno.sql 's/WHERE id = .54cabad2-cea2-418d-8759-3b4bf64eaa36./WHERE nro_factura LIKE '"'"'%30000132323000011913%'"'"'/' "la migración corrige por LIKE"
mutar supabase/migrations/20261111120000_reclamos_rediseno.sql 's/UPDATE storage\.buckets SET public = false WHERE id = .reclamo-fotos.;//' "el bucket sigue público"

echo "── controles (NO deben cazarse) ──"
perl -0pi -e 's/const tarjetas = EMPRESAS_CON_RECLAMOS\.map/const lasTarjetas = EMPRESAS_CON_RECLAMOS.map/; s/return tarjetas\.sort/return lasTarjetas.sort/' src/lib/reclamos/portada.ts
control "renombrar una variable local en portada.ts"; restaurar
perl -0pi -e 's/Fecha de factura más vieja primero;/Fecha de factura mas vieja primero;/' src/lib/reclamos/orden.ts
control "cambiar un comentario en orden.ts"; restaurar

echo
echo "RESUMEN: $cazadas cazadas · $sobrevivientes sobrevivieron · controles: $controles_ok bien, $controles_mal mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]

#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado de las categorías administrables de
# Reebok. Cada mutación rompe UNA de las reglas que el candado dice proteger:
# la falla abierta, las tres categorías cerradas, la marca mandando primero, la
# fuente única, el soft delete firmado y quién puede escribir.
#
# Si alguna pasa en VERDE, ese candado no protege nada.
#
#   bash scripts/_mutar-candados-reebok-rubros.sh
set -u
cd "$(dirname "$0")/.." || exit 1

TEST="src/__tests__/lib/catalogo-reebok-rubros.test.ts src/__tests__/lib/depurador-reebok-clasificacion.test.ts"
PURO=src/lib/catalogos/reebok-rubros.ts
MAPA=src/lib/reebok-clasificacion.ts
SRV=src/lib/catalogos/reebok-rubros-server.ts
DEP=src/lib/depurador/reebok.ts
SQL=supabase/migrations/20261205120000_reebok_rubro_categoria.sql
RUTA=src/app/api/catalogo/reebok/rubros/route.ts
PAG="src/app/catalogos/admin/[marca]/categorias/page.tsx"
CLI=src/app/productos/cargar/ReebokClient.tsx
SYNC=src/lib/switch-api/sync-catalogo-reebok.ts
TAB=src/lib/backup/tablas.ts

for f in "$PURO" "$MAPA" "$SRV" "$DEP" "$SQL" "$RUTA" "$PAG" "$CLI" "$SYNC" "$TAB"; do
  cp "$f" "/tmp/_mrr.$(echo "$f" | tr '/[]' '___')"
done
restaurar() {
  for f in "$PURO" "$MAPA" "$SRV" "$DEP" "$SQL" "$RUTA" "$PAG" "$CLI" "$SYNC" "$TAB"; do
    cp "/tmp/_mrr.$(echo "$f" | tr '/[]' '___')" "$f"
  done
}
trap restaurar EXIT

CAZADAS=0; TOTAL=0
probar() { # nombre esperado(rojo|verde)
  TOTAL=$((TOTAL+1))
  if npx vitest run $TEST >/dev/null 2>&1; then R=verde; else R=rojo; fi
  if [ "$R" = "$2" ]; then CAZADAS=$((CAZADAS+1)); echo "  ✓ $1 → $R"; else echo "  ✗ $1 → $R (se esperaba $2)"; fi
  restaurar
}

echo "── Mutaciones ──"

# 1. FALLA ABIERTA — sin filas, un mapa vacío en vez de la red del código.
perl -0pi -e 's/if \(limpias\.length === 0\) return CATEGORIA_POR_RUBRO_BASE;//' "$PURO"
probar "una lista vacía deja de caer a la red del código (mapa vacío)" rojo

# 2. FALLA ABIERTA — el servidor deja de fallar abierto y propaga el error.
perl -0pi -e 's/return CATEGORIA_POR_RUBRO_BASE;\n  \}\n\}/throw e;\n  }\n}/' "$SRV"
probar "leerMapaDeRubros deja de fallar abierto y lanza" rojo

# 3. FALLA ABIERTA — el GET contesta error en vez de los seis del código.
perl -0pi -e 's/rubros: rubrosParaElAviso\(null\), sinTabla: true/sinTabla: true/' "$RUTA"
probar "el GET sin la migración deja de devolver los seis del código" rojo

# 4. LA SEMILLA — la migración cambia una regla y estrena clasificación.
perl -0pi -e "s/\('SOCKS',    'apparel'/('SOCKS',    'accessories'/" "$SQL"
probar "la semilla manda SOCKS a accesorios (cambiaría los 1.763)" rojo

# 5. LA SEMILLA — se olvida un rubro y la tabla no reproduce el mapa.
perl -0pi -e "s/  \('HEADWEAR', 'accessories', 'sistema', '2026-09-17 12:00:00-05'\)\n//" "$SQL"
probar "la semilla se olvida HEADWEAR" rojo

# 6. LAS TRES CATEGORÍAS — el CHECK de la base deja de cerrarlas.
perl -0pi -e "s/CHECK \(categoria IN \('footwear', 'apparel', 'accessories'\)\)/CHECK (categoria <> '')/" "$SQL"
probar "el CHECK de la tabla deja de cerrar las tres categorías" rojo

# 7. LAS TRES CATEGORÍAS — el servidor acepta una inventada.
perl -0pi -e 's/if \(!esCategoriaReebok\(b\.categoria\)\) \{/if (typeof b.categoria !== "string") {/' "$PURO"
probar "el validador acepta una categoría inventada" rojo

# 8. LA MARCA MANDA PRIMERO — el rubro le gana al Department.
perl -0pi -e 's/  const porMarca = CATEGORIA_POR_MARCA\[U\(marca\)\];\n  if \(porMarca\) return porMarca;\n  return porRubro\[U\(rubro\)\] \?\? null;/  const porElRubro = porRubro[U(rubro)];\n  if (porElRubro) return porElRubro;\n  return CATEGORIA_POR_MARCA[U(marca)] ?? null;/' "$MAPA"
probar "el rubro pasa a ganarle a la marca" rojo

# 9. UNA SOLA FUENTE — vuelve el espejo escrito a mano.
perl -0pi -e 's/export const REEBOK_CATEGORY_ESPERADAS: readonly string\[\] = rubrosQueElCatalogoConoce\(\);/export const REEBOK_CATEGORY_ESPERADAS: readonly string[] = ["SHOES", "APPAREL", "SHORTS", "SOCKS", "BAGS", "HEADWEAR"];/' "$DEP"
probar "alguien vuelve a teclear la lista del Depurador a mano" rojo

# 10. UNA SOLA FUENTE — el aviso ignora los rubros de la tabla.
perl -0pi -e 's/const esperadas = new Set<string>\(rubrosConocidos\.map\(\(r\) => normH\(r\)\)\);/const esperadas = new Set<string>(REEBOK_CATEGORY_ESPERADAS);/' "$DEP"
probar "valoresInesperados ignora la lista que se le pasa" rojo

# 11. IGUALDAD EXACTA — el repetido se caza por parecido.
perl -0pi -e 's/return lista\.some\(\(r\) => U\(r\) === k\);/return lista.some((r) => U(r).startsWith(k) || k.startsWith(U(r)));/' "$PURO"
probar "el repetido se caza por parecido en vez de por igualdad exacta" rojo

# 12. EL RUBRO SE NORMALIZA — se guarda como lo teclearon.
perl -0pi -e 's/const rubro = U\(typeof b\.rubro === "string" \? b\.rubro : ""\);/const rubro = typeof b.rubro === "string" ? b.rubro.trim() : "";/' "$PURO"
probar "el rubro se guarda sin normalizar (nunca haría match)" rojo

# 13. SOFT DELETE — se borra de verdad.
perl -0pi -e 's/\.update\(\{ activo: false, desactivado_por: desactivadoPor, desactivado_en: new Date\(\)\.toISOString\(\) \}\)/.delete()/' "$SRV"
probar "quitar un rubro pasa a ser un DELETE" rojo

# 14. SOFT DELETE — la baja deja de firmarse en la base.
perl -0pi -e 's/CHECK \(activo OR \(desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL\)\)/CHECK (true)/' "$SQL"
probar "la migración deja de exigir la firma de la baja" rojo

# 15. ESCRIBIR ES SOLO ADMIN — entra la secretaria.
perl -0pi -e 's/export const RUBROS_ROLES_ESCRITURA: readonly string\[\] = \["admin"\] as const;/export const RUBROS_ROLES_ESCRITURA: readonly string[] = ["admin", "secretaria"] as const;/' "$PURO"
probar "escribir el mapa se le abre a la secretaria" rojo

# 16. LA PANTALLA — el guard del servidor se cae.
perl -0pi -e 's/  if \(!puedeEditarRubros\(role\)\) redirect\("\/home"\);//' "$PAG"
probar "la pantalla deja de rebotar a quien no edita" rojo

# 17. EL BOTÓN — vuelve a no llevar a ninguna parte.
perl -0pi -e 's/href=\{enlaceParaAgregar\(categorias\)\}/href="#"/' "$CLI"
probar "«Agregarlas al catálogo» deja de llevar a la pantalla" rojo

# 18. EL SYNC — clasifica con la red aunque la tabla diga otra cosa.
perl -0pi -e 's/      porRubro,\n    \);/    );/' "$SYNC"
probar "el sync deja de pasarle el mapa de la tabla a la clasificación" rojo

# 19. EL RESPALDO — la tabla se queda sin copia.
perl -0pi -e 's/  "reebok_rubro_categoria",\n//' "$TAB"
probar "la tabla sale del respaldo" rojo

echo "── CONTROLES (tienen que quedar VERDES) ──"
perl -0pi -e 's/el cajón neutro es lo que\n\/\/ cambia el bulto de 12 a 6, y eso es plata\./el cajon neutro cambia el bulto. Plata./' "$SRV"
probar "CONTROL: cambiar un comentario del servidor no rompe nada" verde
perl -0pi -e "s/-- ─── 2\) La semilla/-- ─── 2) LA SEMILLA/" "$SQL"
probar "CONTROL: cambiar un comentario del SQL no rompe nada" verde

echo ""
echo "  $CAZADAS de $TOTAL como se esperaba."
[ "$CAZADAS" = "$TOTAL" ] || exit 1

#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado de los contadores del hub.
# Cada mutación rompe una de las uniones entre la regla de TypeScript y su
# espejo en SQL. Si alguna pasa en VERDE, ese candado no protege nada.
#
#   bash scripts/_mutar-candados-contadores-hub.sh
set -u
cd "$(dirname "$0")/.." || exit 1
TEST=src/__tests__/lib/catalogo-contadores-una-regla.test.ts
MOD=src/lib/catalogo/contadores.ts
ALV=src/lib/catalogo/a-la-venta.ts
SQL=supabase/migrations/20261123120000_contadores_hub_catalogos.sql
RUTA=src/app/api/catalogo/contadores/route.ts
HUB=src/app/catalogos/marcas/page.tsx
cp "$MOD" /tmp/_m.mod; cp "$ALV" /tmp/_m.alv; cp "$SQL" /tmp/_m.sql; cp "$RUTA" /tmp/_m.ruta; cp "$HUB" /tmp/_m.hub
restaurar() { cp /tmp/_m.mod "$MOD"; cp /tmp/_m.alv "$ALV"; cp /tmp/_m.sql "$SQL"; cp /tmp/_m.ruta "$RUTA"; cp /tmp/_m.hub "$HUB"; }
trap restaurar EXIT

CAZADAS=0; TOTAL=0
probar() { # nombre esperado(rojo|verde)
  TOTAL=$((TOTAL+1))
  if npx vitest run "$TEST" >/dev/null 2>&1; then R=verde; else R=rojo; fi
  if [ "$R" = "$2" ]; then CAZADAS=$((CAZADAS+1)); echo "  ✓ $1 → $R"; else echo "  ✗ $1 → $R (se esperaba $2)"; fi
  restaurar
}

echo "── Mutaciones ──"
perl -0pi -e "s/clausulas\.push\(\"p\.badge = 'proximamente'\"\)/clausulas.push(\"true\")/" "$MOD"
probar "el SQL deja de mirar la pre-orden 'proximamente'" rojo

perl -0pi -e 's/"disponibilidad", "existencia", "stock"/"existencia", "disponibilidad", "stock"/g' "$MOD"
probar "se invierte el orden del coalesce (existencia antes que disponibilidad)" rojo

perl -0pi -e 's/if \(f\.tieneRegalia\) clausulas\.push\("p\.is_regalia is true"\);//' "$MOD"
probar "Joybees pierde su cláusula de regalía" rojo

perl -0pi -e "s/greatest\(0, coalesce/least(0, coalesce/" "$MOD"
probar "greatest(0,…) se vuelve least(0,…)" rojo

perl -0pi -e "s/coalesce\(btrim\(p\.image_url\), ''\) = ''/p.image_url is null/" "$MOD"
probar "«sin foto» deja de mirar los espacios en blanco" rojo

perl -0pi -e 's/if \(p\.badge === "proximamente"\) return true;/if (p.badge === "proximamente") return true;\n  if (p.badge === "nuevo") return true;/' "$ALV"
probar "estaALaVenta gana una cuarta cláusula y el SQL no se entera" rojo

perl -0pi -e "s/count\(\*\)::int as a_la_venta/count(1)::int as a_la_venta/" "$SQL"
probar "alguien edita el .sql a mano" rojo

perl -0pi -e 's/const visibles = productosALaVenta\(filas, stockPorProducto\);/const visibles = filas.filter((f) => (f.disponibilidad ?? 0) > 0);/' "$MOD"
probar "contarDeFilas se escribe su propia condición" rojo

perl -0pi -e 's/if \(error \|\| !Array\.isArray\(data\)\) return null;/if (error) throw error;/' "$RUTA"
probar "la ruta deja de fallar abierta sin la migración" rojo

perl -0pi -e 's/if \(f\.tieneRegalia\) cols\.push\("is_regalia"\);//' "$MOD"
probar "columnasParaContar deja de pedir is_regalia (lectura silenciosa a medias)" rojo

perl -0pi -e 's/fetch\("\/api\/catalogo\/contadores"/fetch("\/api\/catalogo\/reebok\/products?active=true"/' "$HUB"
probar "el hub vuelve a bajarse el catálogo" rojo

echo "── CONTROLES (tienen que quedar VERDES) ──"
perl -0pi -e 's/name: "REEBOK"/name: "REEBOK "/' "$HUB"
probar "CONTROL: un cambio cosmético del hub no rompe nada" verde
perl -0pi -e 's/es la salida del módulo/es la salida del modulo/' "$MOD"
probar "CONTROL: cambiar un comentario del módulo no rompe nada" verde

echo ""
echo "  $CAZADAS de $TOTAL como se esperaba."
[ "$CAZADAS" = "$TOTAL" ] || exit 1

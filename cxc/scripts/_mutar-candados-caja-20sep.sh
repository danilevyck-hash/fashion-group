#!/bin/bash
# Mutaciones de los candados de Caja Menuda (20-sep-2026).
# Cada mutación rompe UNA regla; el candado que la cuida tiene que ponerse ROJO.
cd /Users/daniellevy/Code/fashion-group/cxc || exit 1
CONTEO=src/lib/caja/conteo-cierre.ts
RUTA='src/app/api/caja/periodos/[id]/route.ts'
MODAL=src/app/caja/components/CerrarPeriodoModal.tsx
FECHA=src/lib/caja/fecha-en-periodo.ts
DRAWER=src/app/caja/components/NuevoGastoDrawer.tsx
CATS=src/lib/caja/categorias.ts
RCAT=src/app/api/caja/categorias/route.ts
FORM=src/app/caja/components/GastoForm.tsx
PAPEL=src/lib/caja/papel-caja.ts

T1="src/__tests__/api/caja-contar-la-plata.test.ts src/__tests__/components/caja-cerrar-contando.test.tsx"
T2="src/__tests__/components/caja-fecha-sin-ventana.test.tsx"
T3="src/__tests__/api/caja-categorias-del-equipo.test.ts src/__tests__/components/caja-nota-y-categorias.test.tsx"
T4="src/__tests__/components/caja-papel-cinco-columnas.test.tsx"

probar() { # $1 = nombre, $2 = tests, $3 = espera (ROJO|VERDE)
  if npx vitest run $2 >/dev/null 2>&1; then R=VERDE; else R=ROJO; fi
  if [ "$R" = "$3" ]; then echo "  ok   $1 → $R"; else echo "  FALLA $1 → $R (se esperaba $3)"; fi
}
mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre, $5 tests
  cp "$1" "$1.bak"
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p,v,n=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(p).read()
if v not in s:
    print("  !! no se encontro el texto en",p); sys.exit(9)
open(p,'w').write(s.replace(v,n,1))
PY
  probar "$4" "$5" ROJO
  mv "$1.bak" "$1"
}

echo "── Punto 1 · contar la plata al cerrar ──"
mutar $CONTEO "return centavos(centavos(contado) - centavos(esperado));" "return centavos(centavos(esperado) - centavos(contado));" "1. la diferencia al reves" "$T1"
mutar $CONTEO 'if (!isFinite(n) || n < 0) return null;' 'if (!isFinite(n) || n <= 0) return null;' "2. contar \$0.00 deja de valer" "$T1"
mutar $RUTA 'efectivo_contado: contado, diferencia_cierre: diferencia' 'diferencia_cierre: diferencia' "3. no se guarda lo contado" "$T1"
mutar $MODAL 'disabled={contado === null}' 'disabled={false}' "4. se puede cerrar sin contar" "$T1"
mutar $MODAL 'disabled={contado === null}' 'disabled={contado === null || descuadra}' "5. el descuadre frena el cierre" "$T1"

echo "── Punto 2 · el aviso de fecha sin clic ──"
mutar $FECHA 'return fechaFueraDelPeriodo(fecha, periodo) === "despues";' 'return fechaFueraDelPeriodo(fecha, periodo) !== null;' "6. el recibo viejo vuelve a abrir ventana" "$T2"
mutar $DRAWER 'notaFecha={notaFecha}' 'notaFecha={null}' "7. la linea gris no se dibuja" "$T2"

echo "── Punto 3 · Nota y categorias ──"
mutar $RCAT 'const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { nombre } = await req.json()' 'const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!auth.isOwner) return NextResponse.json({ error: "Solo el dueno." }, { status: 403 });

  const { nombre } = await req.json()' "8. crear vuelve a ser solo del dueno" "$T3"
mutar $CATS '.replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");' '.replace(/\s+/g, " ");' "9. la clave deja de ignorar acentos" "$T3"
mutar $RCAT 'const suave = await supabaseServer
    .from("caja_categorias")
    .update({ deleted: true' 'const suave = await supabaseServer
    .from("caja_categorias")
    .update({ deleted_flojo: true' "10. quitar vuelve a ser DELETE" "$T3"
mutar $FORM '<Field label="Nota">' '<Field label="Nota" required>' "11. la nota vuelve a ser obligatoria (rotulo)" "$T3"
mutar $DRAWER 'const canSave =
    subtotalNum > 0 &&' 'const canSave =
    !!gDescripcion.trim() &&
    subtotalNum > 0 &&' "12. sin nota no se puede guardar" "$T3"

echo "── Punto 4 · el papel de cinco columnas ──"
mutar $PAPEL 'if (hayNotas(gastos)) columnas.push("nota");' 'columnas.push("nota");' "13. la columna Nota se dibuja siempre" "$T4"
mutar $PAPEL 'return gastos.some((g) => centavos(g.itbms) !== 0);' 'return true;' "14. Sub-total e ITBMS se dibujan siempre" "$T4"
mutar $PAPEL 'if (!rango) return `Sin recibos · ${cual}`;' 'if (true) return `Sin recibos · ${cual}`;' "15. el encabezado deja de decir el rango" "$T4"

echo "── CONTROLES (tienen que quedar VERDES) ──"
mutar_verde() { cp "$1" "$1.bak"; python3 - "$1" "$2" "$3" <<'PY'
import sys
p,v,n=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(p).read()
if v not in s: print("  !! no se encontro"); sys.exit(9)
open(p,'w').write(s.replace(v,n,1))
PY
probar "$4" "$5" VERDE; mv "$1.bak" "$1"; }
mutar_verde $CONTEO "Módulo PURO: sin I/O" "Modulo puro, sin entrada ni salida" "C1. un comentario cambiado no rompe nada" "$T1"
mutar_verde $PAPEL 'ROTULO_COLUMNA: Record<ColumnaPapel, string>' 'ROTULO_COLUMNA: Readonly<Record<ColumnaPapel, string>>' "C2. un tipo mas estricto no rompe nada" "$T4"

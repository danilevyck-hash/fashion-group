#!/usr/bin/env python3
"""
VERIFICACIÓN POR MUTACIÓN de las cuatro limpiezas del 4-sep-2026:

  1. la píldora «Sincronizado» fuera de Ventas › Resumen,
  2. los favoritos ⭐ fuera del Cuentas por Cobrar,
  3. el botón «Actualizar datos de Switch» de vuelta en Referencia, para TODOS,
  4. la migración que borra los pedidos de prueba + la ventana de 90 días de
     la lista de Comprobantes.

Rompe el producto de UNA forma concreta y exige que los tests se pongan ROJOS.
Un candado que no caza su mutación no protege nada.

🩸 Las tres lecciones de la casa, aplicadas:
  · Restaura por COPIA, nunca con `git checkout` (hay archivos NUEVOS y git
    aborta el comando entero sin restaurar nada).
  · El reemplazo es LITERAL (`str.replace`), no un `perl -0pi -e`.
  · DENUNCIA el patrón que no muta (⛔) en vez de cantarlo como cazado, y exige
    que vitest haya COLECTADO tests antes de creerle a un cero.

Y trae una mutación de CONTROL que a propósito no matchea: si no sale ⛔, el
denunciador está roto y todos los ✅ valen lo mismo que un barrido vacío.
"""
import hashlib
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TESTS = [
    "src/__tests__/lib/textos-pendientes-284.test.ts",
    "src/__tests__/lib/cxc-favoritos-retirados.test.ts",
    "src/__tests__/lib/cxc-anotaciones-cartera.test.ts",
    "src/__tests__/lib/cxc-orden.test.ts",
    "src/__tests__/lib/referencia-boton-actualizar.test.ts",
    "src/__tests__/lib/ventas-tab-referencia-fuera.test.ts",
    "src/__tests__/lib/borrar-pedidos-de-prueba.test.ts",
    "src/__tests__/lib/comprobantes-ventana-90-dias.test.ts",
    "src/__tests__/components/pedidos-chips-y-verdad-de-la-fila.test.tsx",
    "src/__tests__/iphone-ancho-nombres.test.ts",
    "src/__tests__/iphone-targets-ventas-clientes.test.ts",
]

MIGRACION = "supabase/migrations/20260924120000_borrar_pedidos_de_prueba.sql"

# (nombre, archivo, texto viejo, texto nuevo)
MUTACIONES = [
    # ── 1. La píldora «Sincronizado» ────────────────────────────────────────
    (
        "🔴 VUELVE la píldora al Resumen (escritorio)",
        "src/components/ventas/ResumenView.tsx",
        '        <div className="flex flex-wrap items-center gap-2">\n',
        '        <div className="flex flex-wrap items-center gap-2">\n'
        '          <SyncStatus tabla="facturas" variant="pill" prefix="Sincronizado" />\n',
    ),
    (
        "🔴 VUELVE la píldora al Resumen (celular)",
        "src/components/ventas/ResumenViewMobile.tsx",
        '      <div className="flex flex-wrap items-center gap-2">\n',
        '      <div className="flex flex-wrap items-center gap-2">\n'
        '        <SyncStatus tabla="facturas" variant="pill" prefix="Sincronizado" />\n',
    ),
    (
        "🔴 vuelve la lista de 3-de-8 empresas a empresa-mapping",
        "src/lib/empresa-mapping.ts",
        "export const CXC_GRUPO_EMPRESA_KEYS = B2B_EMPRESA_KEYS;",
        'export const SWITCH_FACTURAS_EMPRESA_KEYS = ["active_shoes", "active_wear", "american_classic"] as const;\n'
        "export const CXC_GRUPO_EMPRESA_KEYS = B2B_EMPRESA_KEYS;",
    ),
    (
        "quien SÍ vigila las ventas deja de mirar las 8 empresas",
        "src/lib/datos-frescos.ts",
        'if (dato === "ventas") return empresasConFacturas();',
        'if (dato === "ventas") return ["active_shoes"];',
    ),
    (
        "el Resumen deja de pintarse (borrar la píldora no puede pasar por borrar la vista)",
        "src/components/ventas/ResumenView.tsx",
        "<SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={() => onReloadData?.()} />",
        "",
    ),
    # ── 2. Los favoritos ⭐ del CXC ──────────────────────────────────────────
    (
        "🔴 VUELVE la estrella a la fila del escritorio",
        "src/app/admin/components/ClientRow.tsx",
        '            <div className="col-span-4 font-medium truncate flex items-center gap-1.5">\n',
        '            <div className="col-span-4 font-medium truncate flex items-center gap-1.5">\n'
        "              {isFavorite ? <span>★</span> : <span>☆</span>}\n",
    ),
    (
        "🔴 VUELVE la estrella a la card de celular",
        "src/app/admin/components/PanelCxcMobile.tsx",
        '            <div className="flex items-center gap-0">\n',
        '            <div className="flex items-center gap-0">\n'
        '              <span aria-label="Quitar favorito" className="-my-3 -ml-3 flex h-11 w-11">★</span>\n',
    ),
    (
        "🔴 vuelve la regla «los favoritos arriba» al orden del CXC",
        "src/lib/cxc-orden.ts",
        "  const aNeg = a.total < 0 ? 1 : 0;",
        "  const esFavorito = (n: string) => n.startsWith(\"A\");\n"
        "  const aFav = esFavorito(a.nombre_normalized) ? 0 : 1;\n"
        "  const bFav = esFavorito(b.nombre_normalized) ? 0 : 1;\n"
        "  if (aFav !== bFav) return aFav - bFav;\n"
        "  const aNeg = a.total < 0 ? 1 : 0;",
    ),
    (
        "🔴 vuelve una consulta a `cxc_favorites` por la puerta de atrás",
        "src/lib/cxc/anotaciones.ts",
        'export async function leerOverrides(cartera: Cartera): Promise<Record<string, unknown>[]> {',
        'export async function leerFavoritos(cartera: Cartera, userId: string) {\n'
        '  return supabaseServer.from("cxc_favorites").select("nombre_normalized").eq("cartera", cartera);\n'
        '}\n\n'
        'export async function leerOverrides(cartera: Cartera): Promise<Record<string, unknown>[]> {',
    ),
    (
        "una migración DROPEA `cxc_favorites` (la tabla se queda, siempre)",
        MIGRACION,
        "BEGIN;",
        "BEGIN;\nDROP TABLE IF EXISTS cxc_favorites;",
    ),
    # ── 3. El botón de Referencia ───────────────────────────────────────────
    (
        "🔴 el botón de Referencia queda SOLO-ADMIN",
        "src/app/api/ventas/referencia/actualizar/route.ts",
        "const auth = requireRole(req, [...REFERENCIA_ROLES]);",
        'const auth = requireRole(req, ["admin"]);',
    ),
    (
        "🔴 la lista de roles se vuelve a escribir a mano en la página",
        "src/app/referencia/page.tsx",
        "if (!REFERENCIA_ROLES.includes(role)) redirect(\"/home\");",
        'if (!["admin", "vendedor", "bodega"].includes(role)) redirect("/home");',
    ),
    (
        "🔴 desaparece el botón de la pantalla",
        "src/components/ventas/ReferenciaView.tsx",
        '            {actualizando ? "Actualizando…" : "Actualizar datos de Switch"}',
        "            {null}",
    ),
    (
        "🔴 se cae el acelerador: dos toques seguidos abren dos sesiones",
        "src/app/api/ventas/referencia/actualizar/route.ts",
        "    if (await catalogoFresco(empresa)) {",
        "    if (false) {",
    ),
    (
        "el botón estrena un aviso («esto te saca del panel de Switch»)",
        "src/components/ventas/ReferenciaView.tsx",
        "            <Download className=\"mr-1.5 h-4 w-4\" /> Bajar a Excel",
        "            <Download className=\"mr-1.5 h-4 w-4\" /> Bajar a Excel — ojo que esto te saca del panel de Switch",
    ),
    (
        "la ruta deja de cerrar la sesión de Switch en el finally",
        "src/app/api/ventas/referencia/actualizar/route.ts",
        "    await logoutAllSwitchSessions();",
        "    void 0;",
    ),
    # ── 4a. La migración de los pedidos de prueba ───────────────────────────
    (
        "🔴 la migración borra un pedido CON envío vivo a Switch (Calvin)",
        MIGRACION,
        "DELETE FROM _calvin_prueba p\n WHERE EXISTS (\n   SELECT 1 FROM calvin_switch_envios e\n    WHERE e.order_id = p.id AND e.estado <> 'error'\n );",
        "-- (guard retirado)",
    ),
    (
        "🔴 la migración borra un pedido CON envío vivo a Switch (Joybees)",
        MIGRACION,
        "DELETE FROM _joybees_prueba p\n WHERE EXISTS (\n   SELECT 1 FROM joybees_switch_envios e\n    WHERE e.order_id = p.id AND e.estado <> 'error'\n );",
        "-- (guard retirado)",
    ),
    (
        "la migración cambia la lista explícita por un LIKE '%PRUEBA%'",
        MIGRACION,
        "DELETE FROM calvin_orders o\n WHERE o.id IN (SELECT id FROM _calvin_prueba)\n   AND o.deleted IS TRUE;",
        "DELETE FROM calvin_orders o\n WHERE o.client_name LIKE '%PRUEBA%';",
    ),
    (
        "la migración pierde el segundo freno (`deleted IS TRUE`)",
        MIGRACION,
        "DELETE FROM joybees_orders o\n WHERE o.id IN (SELECT id FROM _joybees_prueba)\n   AND o.deleted IS TRUE;",
        "DELETE FROM joybees_orders o\n WHERE o.id IN (SELECT id FROM _joybees_prueba);",
    ),
    (
        "la migración se lleva por delante los pedidos del link",
        MIGRACION,
        "COMMIT;",
        "DELETE FROM joybees_pedidos_publicos WHERE deleted IS TRUE;\nCOMMIT;",
    ),
    # ── 4b. La ventana de 90 días ───────────────────────────────────────────
    (
        "🔴 la lista vuelve a mostrarlo TODO, sin corte",
        "src/components/catalogo/ComprobantesPanel.tsx",
        "  const visibles = verTodo ? filtered : recientes;",
        "  const visibles = filtered;",
    ),
    (
        "🔴 los grupos se arman sobre la lista entera y el corte queda de adorno",
        "src/components/catalogo/ComprobantesPanel.tsx",
        "  for (const p of visibles) {",
        "  for (const p of filtered) {",
    ),
    (
        "🔴 «Ver más» no aparece: lo viejo queda inalcanzable",
        "src/components/catalogo/ComprobantesPanel.tsx",
        "  const hayMas = !verTodo && viejos.length > 0;",
        "  const hayMas = false;",
    ),
    (
        "el corte pasa a ser por CANTIDAD en vez de por fecha",
        "src/lib/catalogo/comprobantes-ventana.ts",
        "    if (Number.isNaN(t) || t >= corte) recientes.push(f);\n    else viejos.push(f);",
        "    if (recientes.length < 20) recientes.push(f);\n    else viejos.push(f);",
    ),
    (
        "la ventana se achica a 30 días sin que nadie lo decida",
        "src/lib/catalogo/comprobantes-ventana.ts",
        "export const DIAS_VENTANA_COMPROBANTES = 90;",
        "export const DIAS_VENTANA_COMPROBANTES = 30;",
    ),
    (
        "una fecha ilegible ESCONDE el comprobante en vez de mostrarlo",
        "src/lib/catalogo/comprobantes-ventana.ts",
        "    if (Number.isNaN(t) || t >= corte) recientes.push(f);",
        "    if (t >= corte) recientes.push(f);",
    ),
    (
        "el botón de «Ver más» estrena un párrafo explicativo",
        "src/components/catalogo/ComprobantesPanel.tsx",
        "              Ver más ({viejos.length})",
        "              Ver más ({viejos.length}) — hay comprobantes de más de 90 días guardados",
    ),
    (
        "el módulo de la ventana lee el reloj por su cuenta (deja de ser puro)",
        "src/lib/catalogo/comprobantes-ventana.ts",
        "  const corte = ahora.getTime() - dias * MS_POR_DIA;",
        "  const corte = new Date().getTime() - dias * MS_POR_DIA;",
    ),
    (
        "CONTROL — este patrón NO existe (tiene que salir ⛔)",
        "src/lib/cxc-orden.ts",
        "export const ESTA_CONSTANTE_NO_EXISTE = 42;",
        "export const ESTA_CONSTANTE_NO_EXISTE = 43;",
    ),
]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def correr_tests() -> tuple[bool, str]:
    """Devuelve (hubo_fallos, resumen). Exige que vitest haya colectado tests."""
    r = subprocess.run(
        ["./node_modules/.bin/vitest", "run", *TESTS],
        cwd=RAIZ, capture_output=True, text=True, timeout=1800,
    )
    salida = r.stdout + r.stderr
    m = re.search(r"Tests\s+(?:(\d+) failed \|)?\s*(\d+) passed", salida)
    if not m:
        if "Failed to load" in salida or "Error:" in salida:
            return True, "la corrida no compila (también es rojo)"
        return False, "⚠️ vitest no colectó tests — un cero acá no significa nada"
    fallos = int(m.group(1) or 0)
    return fallos > 0, f"{fallos} fallo(s)"


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="mutar-limpieza-"))
    cazadas: list[str] = []
    sobrevivieron: list[str] = []
    no_op: list[str] = []

    for nombre, rel, viejo, nuevo in MUTACIONES:
        print(f"\n── {nombre}")
        p = RAIZ / rel
        if not p.exists() or viejo not in p.read_text():
            no_op.append(nombre)
            print("   ⛔ EL PATRÓN NO MATCHEA — la mutación no se aplicó, este resultado NO vale")
            continue

        respaldo = tmp / rel.replace("/", "__")
        shutil.copy2(p, respaldo)
        antes = md5(p)
        p.write_text(p.read_text().replace(viejo, nuevo, 1))
        if md5(p) == antes:
            shutil.copy2(respaldo, p)
            no_op.append(nombre)
            print("   ⛔ EL ARCHIVO NO CAMBIÓ — este resultado NO vale")
            continue

        try:
            rojo, det = correr_tests()
        finally:
            shutil.copy2(respaldo, p)

        (cazadas if rojo else sobrevivieron).append(nombre)
        print(f"   {'✅ CAZADA' if rojo else '🔴 SOBREVIVIÓ'} — {det}")

    shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "═" * 70)
    print(f"CAZADAS       {len(cazadas)}")
    print(f"SOBREVIVIERON {len(sobrevivieron)}")
    for n in sobrevivieron:
        print(f"   🔴 {n}")
    print(f"NO-OP         {len(no_op)}")
    for n in no_op:
        print(f"   ⛔ {n}")

    control = "CONTROL — este patrón NO existe (tiene que salir ⛔)"
    if control not in no_op:
        print("\n🔴 EL DENUNCIADOR ESTÁ ROTO: la mutación de control no salió ⛔.")
        return 1
    if len(no_op) > 1:
        print("\n🔴 Hay mutaciones que no se aplicaron: sus resultados no valen.")
        return 1
    return 1 if sobrevivieron else 0


if __name__ == "__main__":
    sys.exit(main())

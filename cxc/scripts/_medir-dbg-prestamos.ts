import { quincenaDesdeClave } from "@/lib/asistencia/planilla";
import { leerPrestamosDeQuincena } from "@/lib/asistencia/prestamos-planilla-server";
import { sugerirPrestamos } from "@/lib/asistencia/prestamos-planilla";
(async () => {
  const q = quincenaDesdeClave("2026-09-1");
  console.log("q:", JSON.stringify(q));
  const r = await leerPrestamosDeQuincena("2026-09-01", "2026-09-15");
  console.log("fichas:", r.fichas.length, "conCodigo:", r.fichas.filter((f) => f.codigo).length);
  const s = sugerirPrestamos({
    fichas: r.fichas,
    personas: r.fichas.map((f) => ({ codigo: f.codigo ?? "", etiqueta: f.nombre ?? "", empresa: null, empresaEtiqueta: null, enCasilla: 0, enCasillaTerceros: 0, enCasillaDano: 0 })),
  });
  console.log("sugerencias con TODOS en el cuadro:", s.length, JSON.stringify(s).slice(0, 1200));
})();

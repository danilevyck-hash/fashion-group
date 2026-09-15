// ─────────────────────────────────────────────────────────────────────────────
// CUÁNTO MIDE UNA SELFIE — un solo número para los dos lados (14-sep-2026).
//
// La foto se achica DOS veces: en el teléfono (canvas) antes de mandarla o de
// guardarla sin señal, y en el servidor (`sharp`) antes de guardarla. Los dos
// usan ESTE archivo, que no importa nada: si el teléfono achicara a 600 y el
// servidor a 1.000, la foto que ve la contadora saldría de 600 y nadie sabría
// por qué. Módulo aparte y no adentro de `selfie-servidor.ts` porque ése
// arrastra `sharp` y Supabase, que no pueden viajar al navegador.
//
// 1.000 px, y no los 1.600 de las fotos de Reclamos: acá la foto solo tiene
// que dejar reconocer una cara.
// ─────────────────────────────────────────────────────────────────────────────

export const LADO_MAYOR_SELFIE = 1000;
export const CALIDAD_SELFIE = 80;

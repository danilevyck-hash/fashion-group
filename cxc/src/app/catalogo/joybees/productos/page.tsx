import { redirect } from "next/navigation";

// Homogeneidad de rutas con Reebok: /catalogo/reebok redirige a /productos;
// en Joybees el catálogo vive en la raíz (/catalogo/joybees), así que aquí el
// redirect va en sentido inverso. Ambas marcas aceptan ambas formas de URL
// sin romper ningún link existente.
export default function JoybeesProductosPage() {
  redirect("/catalogo/joybees");
}

// Convierte lo que escribe la persona en la dirección interna que usa Supabase para identificarla.
// Los vecinos entran con su DNI. Los operadores pueden seguir usando su correo.
// Con el envío de correos de Supabase apagado, a estas direcciones nunca se les envía nada.
// Si Supabase rechaza este dominio al registrar, cámbialo por otro dominio real.
const DOMINIO_INTERNO = "sicaya.pe";

export function esDNI(valor) {
  return /^[0-9]{8}$/.test(valor.trim());
}

export function aCorreoInterno(valor) {
  const v = valor.trim().toLowerCase();
  if (v.includes("@")) return v; // operadores con correo
  if (!esDNI(v)) throw new Error("Escribe tu DNI de 8 números.");
  return `${v}@${DOMINIO_INTERNO}`;
}
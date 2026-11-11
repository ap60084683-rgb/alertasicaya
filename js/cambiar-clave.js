import { usuarioActual, cambiarClave } from "./backend.js";

const $ = (id) => document.getElementById(id);
const yo = await usuarioActual();

function aviso(texto) {
  $("aviso").textContent = texto;
  $("aviso").hidden = !texto;
}

if (!yo) {
  location.replace("ingresar.html");
} else {
  $("saludo").textContent = `Hola, ${yo.nombre}.`;
}

$("mostrar").onchange = (e) => {
  const tipo = e.target.checked ? "text" : "password";
  $("nueva").type = tipo;
  $("repetir").type = tipo;
};

$("form").onsubmit = async (e) => {
  e.preventDefault();
  const nueva = $("nueva").value;
  if (nueva.length < 8) return aviso("La contraseña debe tener al menos 8 letras o números.");
  if (nueva !== $("repetir").value) return aviso("Las dos contraseñas no son iguales.");
  aviso("");
  $("guardar").disabled = true;
  try {
    await cambiarClave(nueva);
    location.replace(yo.rol === "admin" ? "panel.html" : yo.rol === "respondedor" ? "comunidad.html" : "reporte.html");
  } catch (err) {
    aviso(err.message);
  } finally {
    $("guardar").disabled = false;
  }
};
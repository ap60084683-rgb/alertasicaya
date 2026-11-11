// Modo día / modo noche: lo elige cada persona y se recuerda en su celular.
// Solo las pantallas marcadas con data-temable="si" muestran el botón y cambian de aspecto.
const CLAVE = "as_tema";

function guardado() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function aplicar(tema) {
  document.documentElement.dataset.tema = tema;
}

aplicar(guardado() === "noche" ? "noche" : "dia");

if (document.body.dataset.temable === "si") {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "boton-tema";

  const pintar = () => {
    const noche = document.documentElement.dataset.tema === "noche";
    boton.textContent = noche ? "☀️ Modo día" : "🌙 Modo noche";
    boton.setAttribute("aria-label", noche ? "Cambiar a modo día" : "Cambiar a modo noche");
  };

  boton.onclick = () => {
    const nuevo = document.documentElement.dataset.tema === "noche" ? "dia" : "noche";
    aplicar(nuevo);
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch { /* sin almacenamiento */ }
    pintar();
  };

  pintar();
  document.body.append(boton);
}
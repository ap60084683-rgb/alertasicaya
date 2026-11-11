// Convierte la página en app instalable: registra el service worker y ofrece instalarla.
// Además carga el modo día / modo noche.
import "./tema.js";

if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker:", e));
  });
}

const yaInstalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const agente = navigator.userAgent;
const esIPhone = /iphone|ipad|ipod/i.test(agente);
const esAndroid = /android/i.test(agente);
const CLAVE_VISTO = "as_pwa_visto";
let eventoInstalar = null;
let banner = null;
let chip = null;

function yaVisto() {
  try {
    return localStorage.getItem(CLAVE_VISTO) === "1";
  } catch {
    return false;
  }
}

function marcarVisto() {
  try {
    localStorage.setItem(CLAVE_VISTO, "1");
  } catch { /* sin almacenamiento */ }
}

function boton(texto, clase, alHacerClic) {
  const b = document.createElement("button");
  b.className = clase;
  b.textContent = texto;
  b.onclick = alHacerClic;
  return b;
}

function cerrarBanner() {
  banner?.remove();
  banner = null;
}

function mostrarBanner(texto, botones) {
  if (banner || yaInstalada) return;
  banner = document.createElement("div");
  banner.className = "banner-instalar";
  banner.setAttribute("role", "dialog");
  const p = document.createElement("p");
  p.textContent = texto;
  banner.append(p, ...botones);
  document.body.append(banner);
}

// Cuando el navegador no ofrece el botón automático, se enseña cómo instalar a mano
function ayudaInstalar() {
  const texto = esIPhone
    ? 'Para instalar en tu iPhone: toca el botón Compartir y luego "Agregar a inicio".'
    : 'Para instalar: toca los tres puntos ⋮ de tu navegador y elige "Instalar app" o "Agregar a la pantalla de inicio".';
  cerrarBanner();
  mostrarBanner(texto, [boton("Entendido", "principal", cerrarBanner)]);
}

async function instalar() {
  if (!eventoInstalar) return ayudaInstalar();
  cerrarBanner();
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar = null;
}

// Botón pequeño en la esquina: siempre disponible mientras la app no esté instalada
function mostrarChip() {
  if (chip || yaInstalada) return;
  chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip-instalar";
  chip.textContent = "Instalar app";
  chip.onclick = instalar;
  document.body.append(chip);
  document.body.classList.add("con-chip-instalar");
}

function quitarTodo() {
  cerrarBanner();
  chip?.remove();
  chip = null;
  document.body.classList.remove("con-chip-instalar");
}

addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e;
  mostrarChip();
  // El aviso grande aparece una sola vez; después queda el botón de la esquina
  if (!yaVisto()) {
    marcarVisto();
    mostrarBanner("Instala Alerta Sicaya en tu celular: se abre más rápido y sin barra del navegador.", [
      boton("Instalar", "principal", instalar),
      boton("Ahora no", "secundario", cerrarBanner),
    ]);
  }
});

addEventListener("appinstalled", quitarTodo);

// Celulares: el botón de la esquina aparece de inmediato y, si el navegador no ofrece
// la instalación automática, enseña cómo hacerla.
if (!yaInstalada && (esIPhone || esAndroid)) {
  mostrarChip();
  if (esIPhone && !yaVisto()) {
    setTimeout(() => {
      marcarVisto();
      ayudaInstalar();
    }, 2500);
  }
}
import {
  usuarioActual, cerrarSesion, enviarReporte, agregarDetalle, tiposIncidente, actualizarUbicacionViva,
} from "./backend.js";
import { gravedadDe } from "./gravedad.js";

const $ = (id) => document.getElementById(id);
const yo = await usuarioActual();

// Todo el estado se declara antes de usarse
const GRUPOS = {
  "Seguridad": "🛡️",
  "Colegio": "🏫",
  "Salud y emergencias": "🚑",
  "Accidentes y desastres": "🔥",
  "Comunidad y campo": "🌽",
};
let paso = 1;
let catalogo = [];
let tipo = null;        // incidente elegido
let enPeligro = null;   // true, false o null (sin responder)
let foto = null;        // foto comprimida (data URL), se envía después del reporte
let reporteId = null;   // reporte ya enviado, al que se agregan la foto y la descripción
let resumenEnvio = "";
let pos = null;         // { lat, lng, precision, manual }
let mapa = null;
let pin = null;
let circulo = null;
let vigilante = null;
let seguimiento = null; // ubicación en vivo: { id, vigilante, ultimo, bloqueo }

if (!yo) {
  location.replace("ingresar.html");
} else if (yo.debeCambiarClave) {
  location.replace("cambiar-clave.html");
} else if (yo.rol === "admin") {
  location.replace("panel.html");
} else {
  $("vecino").textContent = yo.nombre;
  if (yo.rol === "respondedor") $("ir-comunidad").hidden = false;
  $("salir").onclick = async () => {
    if (!confirm("¿Cerrar sesión? La próxima vez tendrás que escribir tu contraseña otra vez.")) return;
    await cerrarSesion();
    location.replace("ingresar.html");
  };
  iniciarMapa();
  ubicar();
  cargarCatalogo();
  marcarPeligro(null);
  mostrarPaso(1);
}

function aviso(texto) {
  $("aviso").textContent = texto;
  $("aviso").hidden = !texto;
}

// Pequeño deslizamiento al cambiar de pantalla (se apaga solo para quien desactiva las animaciones)
function animar(elemento) {
  elemento.classList.remove("pantalla");
  void elemento.offsetWidth;
  elemento.classList.add("pantalla");
}

/* ---------- Pasos para enviar ---------- */

function mostrarPaso(n) {
  paso = n;
  [1, 2, 3].forEach((i) => { $(`paso-${i}`).hidden = i !== n; });
  animar($(`paso-${n}`));
  $("paso-texto").textContent = `Paso ${n} de 3`;
  $("barra").style.width = `${Math.round((n * 100) / 3)}%`;
  $("atras").hidden = n === 1;
  $("siguiente").hidden = n !== 2;
  $("enviar").hidden = n !== 3;
  aviso("");
  if (n === 2) {
    // El mapa estaba oculto: se reajusta al mostrarlo
    setTimeout(() => {
      mapa?.invalidateSize();
      if (pos) mapa?.setView([pos.lat, pos.lng], 18);
    }, 60);
  }
  if (n === 3) pintarResumen();
  if (typeof scrollTo === "function") scrollTo(0, 0);
}

$("atras").onclick = () => mostrarPaso(paso === 3 ? 2 : 1);

$("siguiente").onclick = () => {
  if (!pos && !confirm("No marcaste el lugar del incidente. ¿Continuar sin ubicación?")) return;
  mostrarPaso(3);
};

/* ---------- Paso 1: qué está pasando ---------- */

async function cargarCatalogo() {
  try {
    catalogo = await tiposIncidente();
    const grupos = [...new Set(catalogo.map((t) => t.grupo))];
    $("grupos").replaceChildren(...grupos.map(tarjetaGrupo));
  } catch (err) {
    $("catalogo-error").textContent = `No se pudo cargar la lista de incidentes: ${err.message}`;
    $("catalogo-error").hidden = false;
  }
}

function tarjetaGrupo(nombre) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "flex flex-col items-center gap-2 rounded-2xl border-2 border-[#cbd5c8] bg-white px-3 py-5 text-center shadow-sm";
  const icono = document.createElement("span");
  icono.className = "text-4xl";
  icono.textContent = GRUPOS[nombre] || "📋";
  const texto = document.createElement("span");
  texto.className = "text-base font-bold leading-tight";
  texto.textContent = nombre;
  b.append(icono, texto);
  b.onclick = () => abrirGrupo(nombre);
  return b;
}

function abrirGrupo(nombre) {
  $("grupos").hidden = true;
  $("tipos").hidden = false;
  $("grupo-titulo").textContent = nombre;
  $("lista-tipos").replaceChildren(...catalogo.filter((t) => t.grupo === nombre).map(tarjetaTipo));
}

function tarjetaTipo(t) {
  const g = gravedadDe(t.gravedad);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left shadow-sm";
  b.style.background = g.color;
  b.style.color = g.texto;
  const icono = document.createElement("span");
  icono.className = "text-3xl";
  icono.textContent = t.icono || "";
  const textos = document.createElement("span");
  textos.className = "flex flex-col";
  const nombre = document.createElement("span");
  nombre.className = "text-lg font-bold leading-tight";
  nombre.textContent = t.nombre;
  const nivel = document.createElement("span");
  nivel.className = "text-sm font-semibold";
  nivel.textContent = g.sencillo;
  textos.append(nombre, nivel);
  b.append(icono, textos);
  b.onclick = () => {
    tipo = t;
    mostrarPaso(2);
  };
  return b;
}

$("volver-grupos").onclick = () => {
  $("tipos").hidden = true;
  $("grupos").hidden = false;
};

/* ---------- Paso 2: dónde ocurre ---------- */

function iniciarMapa() {
  if (typeof L === "undefined") return; // sin mapa se usa solo el GPS
  mapa = L.map("mapa-reporte").setView([-12.0152, -75.2802], 15); // plaza de Sicaya
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(mapa);
  // Tocar el mapa marca el punto exacto del incidente
  mapa.on("click", (e) => colocarPin(e.latlng.lat, e.latlng.lng, true, null));
}

function limpiarPin() {
  pin?.remove();
  circulo?.remove();
  pin = null;
  circulo = null;
}

function colocarPin(lat, lng, manual, precision) {
  pos = { lat, lng, manual, precision };
  if (mapa) {
    if (!pin) {
      pin = L.marker([lat, lng], {
        draggable: true,
        icon: L.divIcon({ className: "", html: '<div class="pin-reporte"></div>', iconSize: [28, 28], iconAnchor: [14, 28] }),
      }).addTo(mapa);
      pin.on("dragend", () => {
        const p = pin.getLatLng();
        colocarPin(p.lat, p.lng, true, null);
      });
    } else {
      pin.setLatLng([lat, lng]);
    }
    circulo?.remove();
    circulo = null;
    if (!manual && precision) {
      circulo = L.circle([lat, lng], { radius: precision, color: "#14532d", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
    }
  }
  $("ubicacion").textContent = manual
    ? "Marcaste el punto en el mapa. Puedes arrastrar el pin para ajustarlo."
    : `Ubicación por GPS, precisión de unos ${precision} metros. Si no es exacta, toca el mapa o arrastra el pin.`;
}

function ubicar() {
  $("ubicacion").textContent = "Buscando tu ubicación...";
  if (!navigator.geolocation) {
    $("ubicacion").textContent = "Este navegador no permite obtener la ubicación. Toca el mapa para marcar el lugar.";
    return;
  }
  if (vigilante !== null) navigator.geolocation.clearWatch(vigilante);
  let mejor = Infinity;
  const detener = () => {
    if (vigilante !== null) navigator.geolocation.clearWatch(vigilante);
    vigilante = null;
  };
  // Se escucha el GPS unos segundos y se queda con la lectura más precisa
  vigilante = navigator.geolocation.watchPosition(
    (p) => {
      if (pos?.manual) return; // si el vecino ya marcó el punto, no se lo cambiamos
      const precision = Math.round(p.coords.accuracy);
      if (precision < mejor) {
        mejor = precision;
        colocarPin(p.coords.latitude, p.coords.longitude, false, precision);
        mapa?.setView([p.coords.latitude, p.coords.longitude], 18);
      }
      if (precision <= 15) detener();
    },
    (e) => {
      detener();
      if (pos) return; // ya hay un punto marcado
      $("ubicacion").textContent = e.code === 1
        ? 'No diste permiso de ubicación. Actívalo en el navegador y pulsa "Estoy aquí", o toca el mapa para marcar el lugar.'
        : 'No se pudo obtener la ubicación. Pulsa "Estoy aquí" para reintentar, o toca el mapa para marcar el lugar.';
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
  setTimeout(detener, 15000);
}

$("reubicar").onclick = () => {
  pos = null;
  limpiarPin();
  ubicar();
};

/* ---------- Paso 3: lo único que falta para enviar ---------- */

function estiloOpcion(boton, activo, color) {
  boton.style.background = activo ? color : "var(--tarjeta-boton)";
  boton.style.color = activo ? "#ffffff" : "var(--texto-boton)";
  boton.style.borderColor = color;
}

function marcarPeligro(valor) {
  enPeligro = valor;
  estiloOpcion($("peligro-si"), valor === true, "#dc2626");
  estiloOpcion($("peligro-no"), valor === false, "#14532d");
  pintarResumen();
}

function pintarResumen() {
  if (!tipo) return;
  const g = gravedadDe(enPeligro ? "critico" : tipo.gravedad);
  const caja = $("resumen");
  caja.style.background = g.color;
  caja.style.color = g.texto;
  caja.textContent = `${tipo.icono || ""} ${tipo.nombre}: ${g.sencillo}`;
}

$("peligro-si").onclick = () => marcarPeligro(true);
$("peligro-no").onclick = () => marcarPeligro(false);

$("form").onsubmit = async (e) => {
  e.preventDefault();
  if (paso !== 3) return; // evita enviar por error con la tecla Enter en los pasos anteriores
  if (!tipo) return aviso("Elige qué está pasando.");
  if (enPeligro === null) return aviso("Responde si hay alguien herido o en peligro ahora.");
  aviso("");
  $("enviar").disabled = true;
  try {
    reporteId = await enviarReporte({
      tipo: tipo.nombre,
      texto: "",
      foto: null,
      lat: pos ? pos.lat : null,
      lng: pos ? pos.lng : null,
      precision: pos ? pos.precision : null,
      manual: pos ? pos.manual : false,
      enPeligro,
    });
    resumenEnvio = `Tu reporte de "${tipo.nombre}" llegó al serenazgo el ${new Date().toLocaleString("es-PE")}.` +
      (pos ? "" : " Se envió sin ubicación.");
    navigator.vibrate?.(200);
    $("form").hidden = true;
    $("progreso").hidden = true;
    irAExtra("foto");
    if ($("en-vivo").checked && reporteId && navigator.geolocation) iniciarSeguimiento(reporteId);
  } catch (err) {
    aviso(err.message);
  } finally {
    $("enviar").disabled = false;
  }
};

/* ---------- Después de enviar: foto, descripción y final (todo opcional) ---------- */

function irAExtra(nombre) {
  ["extra-foto", "extra-texto", "exito"].forEach((id) => { $(id).hidden = true; });
  const destino = { foto: "extra-foto", texto: "extra-texto", fin: "exito" }[nombre];
  if (nombre === "fin") $("exito-detalle").textContent = resumenEnvio;
  $(destino).hidden = false;
  animar($(destino));
  if (typeof scrollTo === "function") scrollTo(0, 0);
}

function avisoFoto(texto) {
  $("foto-aviso").textContent = texto;
  $("foto-aviso").hidden = !texto;
}

/* Reduce la foto para que pese poco (importante con datos móviles). */
function comprimir(archivo, max = 900, calidad = 0.6) {
  return new Promise((ok, fallo) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => fallo(new Error("No se pudo leer la foto."));
    img.src = url;
  });
}

$("foto").onchange = async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    foto = await comprimir(archivo);
    $("vista").src = foto;
    $("vista").hidden = false;
    $("foto-enviar").hidden = false;
    $("tomar-foto").textContent = "Tomar otra foto";
    avisoFoto("");
  } catch (err) {
    foto = null;
    avisoFoto(err.message);
  }
};

$("foto-enviar").onclick = async () => {
  if (!foto) return;
  $("foto-enviar").disabled = true;
  try {
    await agregarDetalle(reporteId, { foto });
    irAExtra("texto");
  } catch (err) {
    avisoFoto(err.message);
  } finally {
    $("foto-enviar").disabled = false;
  }
};

$("foto-omitir").onclick = () => irAExtra("texto");

$("texto-enviar").onclick = async () => {
  const texto = $("texto").value.trim();
  if (!texto) return irAExtra("fin");
  $("texto-enviar").disabled = true;
  try {
    await agregarDetalle(reporteId, { texto });
    irAExtra("fin");
  } catch (err) {
    $("texto-aviso").textContent = err.message;
    $("texto-aviso").hidden = false;
  } finally {
    $("texto-enviar").disabled = false;
  }
};

$("texto-omitir").onclick = () => irAExtra("fin");

/* ---------- Ubicación en vivo (se apaga sola al cerrar la alerta) ---------- */

function iniciarSeguimiento(id) {
  detenerSeguimiento(false);
  seguimiento = { id, vigilante: null, ultimo: 0, bloqueo: null };
  $("vivo-panel").hidden = false;
  $("vivo-parar").hidden = false;
  $("vivo-estado").textContent = "Compartiendo tu ubicación en vivo. Mantén esta pantalla abierta.";
  // Evita que la pantalla se apague mientras se comparte la ubicación
  navigator.wakeLock?.request("screen")
    .then((b) => { if (seguimiento) seguimiento.bloqueo = b; else b.release(); })
    .catch(() => {});
  seguimiento.vigilante = navigator.geolocation.watchPosition(
    enviarPosicion,
    () => { $("vivo-estado").textContent = "No se pudo leer tu ubicación para compartirla en vivo."; },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}

async function enviarPosicion(p) {
  const s = seguimiento;
  if (!s || Date.now() - s.ultimo < 10000) return; // como máximo una vez cada 10 segundos
  s.ultimo = Date.now();
  try {
    await actualizarUbicacionViva(s.id, p.coords.latitude, p.coords.longitude, Math.round(p.coords.accuracy));
    if (seguimiento === s) {
      $("vivo-estado").textContent = `Compartiendo tu ubicación en vivo (última vez: ${new Date().toLocaleTimeString("es-PE")}). Mantén esta pantalla abierta.`;
    }
  } catch (err) {
    if (/cerrada|permiso/i.test(err.message)) detenerSeguimiento(true); // la alerta ya se cerró
  }
}

function detenerSeguimiento(porCierre) {
  if (!seguimiento) return;
  if (seguimiento.vigilante !== null) navigator.geolocation.clearWatch(seguimiento.vigilante);
  seguimiento.bloqueo?.release?.();
  seguimiento = null;
  $("vivo-estado").textContent = porCierre
    ? "La alerta se cerró. Dejamos de compartir tu ubicación. Gracias."
    : "Dejaste de compartir tu ubicación.";
  $("vivo-parar").hidden = true;
}

$("vivo-parar").onclick = () => detenerSeguimiento(false);

/* ---------- Enviar otro reporte ---------- */

$("otro").onclick = () => {
  if (seguimiento && !confirm("Si envías otro reporte dejarás de compartir tu ubicación del anterior. ¿Continuar?")) return;
  detenerSeguimiento(false);
  $("form").reset();
  tipo = null;
  foto = null;
  reporteId = null;
  $("texto").value = "";
  $("vista").hidden = true;
  $("foto-enviar").hidden = true;
  $("tomar-foto").textContent = "Tomar foto";
  avisoFoto("");
  $("texto-aviso").hidden = true;
  $("vivo-panel").hidden = true;
  ["extra-foto", "extra-texto", "exito"].forEach((id) => { $(id).hidden = true; });
  $("form").hidden = false;
  $("progreso").hidden = false;
  $("grupos").hidden = false;
  $("tipos").hidden = true;
  limpiarPin();
  pos = null;
  marcarPeligro(null);
  mostrarPaso(1);
  ubicar();
};
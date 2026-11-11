const $ = (id) => document.getElementById(id);

// Mostrar u ocultar la contraseña
document.querySelectorAll("[data-ver]").forEach((boton) => {
  boton.onclick = () => {
    const campo = $(boton.dataset.ver);
    const oculta = campo.type === "password";
    campo.type = oculta ? "text" : "password";
    boton.textContent = oculta ? "Ocultar" : "Ver";
  };
});

// Enlaces que cambian entre "Ingresar" y "Crear cuenta"
document.querySelectorAll("[data-ir]").forEach((enlace) => {
  enlace.onclick = () => $(`tab-${enlace.dataset.ir}`).click();
});
$("ir-registro").onclick = (e) => {
  e.preventDefault();
  $("tab-registro").click();
};
if (location.hash === "#registro") $("tab-registro").click();

// Por ahora la contraseña la restablece el serenazgo
$("olvide").onclick = () => {
  const aviso = $("aviso");
  aviso.hidden = false;
  aviso.className = "mt-4 rounded-lg px-4 py-3 text-sm font-medium bg-yellow-100 text-yellow-900";
  aviso.textContent = "Llama o escribe al serenazgo: ellos te darán una contraseña temporal para entrar.";
};

// Entrada suave de la tarjeta
requestAnimationFrame(() => document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible")));

// Menores de edad: piden los datos de un adulto responsable
function edad(fecha) {
  const hoy = new Date();
  const nac = new Date(fecha);
  let años = hoy.getFullYear() - nac.getFullYear();
  const mes = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) años--;
  return años;
}

const nacimiento = $("rg-nacimiento");

function revisarEdad() {
  const menor = Boolean(nacimiento.value) && edad(nacimiento.value) < 18;
  $("bloque-tutor").hidden = !menor;
  ["rg-tutor-nombre", "rg-tutor-celular"].forEach((id) => { $(id).required = menor; });
}

// Fecha de nacimiento: se escribe como día/mes/año (las diagonales se ponen solas) o se elige en el calendario
const textoNac = $("rg-nac-texto");

function fechaValida(d, m, a) {
  const f = new Date(a, m - 1, d);
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d && a >= 1900 && f <= new Date();
}

function leerFecha() {
  const m = textoNac.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  nacimiento.value = "";
  textoNac.setCustomValidity("");
  if (m && fechaValida(Number(m[1]), Number(m[2]), Number(m[3]))) {
    nacimiento.value = `${m[3]}-${m[2]}-${m[1]}`;
  } else {
    textoNac.setCustomValidity(m ? "Revisa la fecha. Ejemplo: 15/06/1985" : "Escribe día, mes y año. Ejemplo: 15/06/1985");
  }
  revisarEdad();
}

textoNac.oninput = () => {
  const numeros = textoNac.value.replace(/\D/g, "").slice(0, 8);
  textoNac.value = [numeros.slice(0, 2), numeros.slice(2, 4), numeros.slice(4, 8)].filter(Boolean).join("/");
  leerFecha();
};

// Calendario auxiliar: arranca en 1990 (o en la fecha escrita) y permite cambiar el año fácilmente.
// Solo sirve para elegir: si se cierra sin elegir, no cambia nada.
let calendario = null;
$("rg-nac-calendario").onclick = () => {
  if (!calendario) {
    calendario = document.createElement("input");
    calendario.type = "date";
    calendario.min = "1900-01-01";
    calendario.max = new Date().toISOString().slice(0, 10);
    calendario.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    calendario.onchange = () => {
      if (!calendario.value) return;
      const [a, m, d] = calendario.value.split("-");
      textoNac.value = `${d}/${m}/${a}`;
      leerFecha();
    };
    document.body.append(calendario);
  }
  calendario.value = nacimiento.value || "1990-01-01";
  try {
    calendario.showPicker();
  } catch {
    calendario.focus();
    calendario.click();
  }
};

$("form-registro").addEventListener("reset", () => setTimeout(() => {
  nacimiento.value = "";
  textoNac.setCustomValidity("");
  revisarEdad();
}, 0));

// Si alguien cerró sesión, se recuerda su usuario en este celular para que solo escriba la contraseña
try {
  const recordado = localStorage.getItem("as_ultimo_usuario");
  if (recordado) {
    $("in-correo").value = recordado;
    $("recordado-valor").textContent = recordado.includes("@") ? recordado : `DNI ${recordado}`;
    $("recordado").hidden = false;
    $("in-clave").focus();
  }
} catch { /* sin almacenamiento */ }

$("no-soy-yo").onclick = () => {
  try {
    localStorage.removeItem("as_ultimo_usuario");
  } catch { /* sin almacenamiento */ }
  $("in-correo").value = "";
  $("in-clave").value = "";
  $("recordado").hidden = true;
  $("in-correo").focus();
};

// Mascota: se inclina siguiendo el mouse (solo en equipos con mouse y sin "reducir movimiento")
const mascota = $("mascota-img");
if (mascota && matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  addEventListener("pointermove", (e) => {
    const x = (e.clientX / innerWidth - 0.5) * 2;
    const y = (e.clientY / innerHeight - 0.5) * 2;
    mascota.style.transform = `perspective(900px) rotateY(${x * 12}deg) rotateX(${-y * 8}deg)`;
  }, { passive: true });
}
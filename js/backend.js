/* backend.js - versión SUPABASE.
   Mismas funciones que backend.demo.js (la versión de respaldo con datos locales).
   La clave publicable es pública por diseño: la seguridad la dan las reglas de esquema.sql. */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.81.1/+esm";
import { aCorreoInterno } from "./acceso.js";

const SUPABASE_URL = "https://kxihtlcrdofsljhtpmxb.supabase.co";
const SUPABASE_KEY = "sb_publishable_cnlup8qfynRB3LcmEX6Mlg_kIlQf7tk";
const BUCKET = "evidencias";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function traducir(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("already registered")) return "Ya existe una cuenta con ese DNI.";
  if (m.includes("different from the old password")) return "La contraseña nueva debe ser distinta de la anterior.";
  if (m.includes("password should")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera unos minutos.";
  if (m.includes("limite_reportes")) return "Enviaste muchos reportes en poco tiempo. Espera un momento o llama directamente al serenazgo.";
  if (m.includes("database error saving new user")) return "Ya existe una cuenta con ese DNI.";
  if (m.includes("sin_permiso")) return "No tienes permiso para esta acción.";
  if (m.includes("alerta_cerrada")) return "Esta alerta ya fue cerrada.";
  if (m.includes("failed to fetch")) return "No hay conexión con el servidor. Revisa tu internet.";
  return error?.message || "Ocurrió un error inesperado.";
}

function fallar(error) {
  throw new Error(traducir(error));
}

/* ---------- Cuentas ---------- */

async function leerPerfil(id) {
  let { data, error } = await supabase
    .from("perfiles").select("nombre, rol, estado, debe_cambiar_clave").eq("id", id).maybeSingle();
  if (error) {
    // Si aún no se ejecutó mejoras_7.sql, se lee sin la columna nueva
    ({ data } = await supabase.from("perfiles").select("nombre, rol, estado").eq("id", id).maybeSingle());
  }
  return data;
}

export async function registrarVecino({ nombre, dni, celular, sector, nacimiento, tutorNombre, tutorCelular, clave }) {
  const { error } = await supabase.auth.signUp({
    email: aCorreoInterno(dni), // el vecino ingresa con su DNI
    password: clave,
    options: {
      data: {
        nombre, dni, celular, acepto: true, sector, nacimiento,
        tutor_nombre: tutorNombre || null,
        tutor_celular: tutorCelular || null,
      },
    },
  });
  if (error) fallar(error);
  // La cuenta queda "pendiente": no debe quedar con la sesión abierta.
  await supabase.auth.signOut();
}

export async function iniciarSesion(usuario, clave) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: aCorreoInterno(usuario), // DNI del vecino, o correo del operador
    password: clave,
  });
  if (error) fallar(error);
  const perfil = await leerPerfil(data.user.id);
  if (!perfil || perfil.estado !== "aprobado") {
    await supabase.auth.signOut();
    const mensajes = {
      rechazado: "Tu solicitud no fue aprobada. Consulta con el serenazgo.",
      suspendido: "Tu acceso está suspendido. Consulta con el serenazgo.",
    };
    throw new Error(mensajes[perfil?.estado] || "Tu cuenta espera la aprobación del serenazgo.");
  }
  return { id: data.user.id, nombre: perfil.nombre, rol: perfil.rol, debeCambiarClave: Boolean(perfil.debe_cambiar_clave) };
}

export async function cerrarSesion() {
  // Se recuerda el último usuario en este equipo: al volver solo tendrá que escribir su contraseña
  try {
    const { data } = await supabase.auth.getSession();
    const correo = data.session?.user?.email || "";
    const dni = correo.match(/^(\d{8})@/)?.[1];
    if (correo) localStorage.setItem("as_ultimo_usuario", dni || correo);
  } catch { /* sin almacenamiento */ }
  await supabase.auth.signOut();
}

export async function usuarioActual() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const perfil = await leerPerfil(user.id);
  if (!perfil || perfil.estado !== "aprobado") return null;
  return { id: user.id, nombre: perfil.nombre, rol: perfil.rol, debeCambiarClave: Boolean(perfil.debe_cambiar_clave) };
}

/* ---------- Gestión de vecinos (solo administrador, lo exige la base de datos) ---------- */

export async function listarPendientes() {
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, dni, celular, correo, sector, nacimiento, tutor_nombre, tutor_celular")
    .eq("rol", "vecino")
    .eq("estado", "pendiente")
    .order("creado_en");
  if (error) fallar(error);
  return data;
}

export async function contarVecinos() {
  const { data, error } = await supabase.from("perfiles").select("estado").in("rol", ["vecino", "respondedor"]);
  if (error) fallar(error);
  return {
    pendientes: data.filter((v) => v.estado === "pendiente").length,
    aprobados: data.filter((v) => v.estado === "aprobado").length,
  };
}

async function cambiarEstadoVecino(id, estado) {
  const { data, error } = await supabase.from("perfiles").update({ estado }).eq("id", id).select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No tienes permiso para cambiar a este vecino.");
}

export const aprobarVecino = (id) => cambiarEstadoVecino(id, "aprobado");
export const rechazarVecino = (id) => cambiarEstadoVecino(id, "rechazado");

export async function listarVecinos() {
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, dni, celular, estado, rol")
    .in("rol", ["vecino", "respondedor"])
    .in("estado", ["aprobado", "suspendido"])
    .order("nombre");
  if (error) fallar(error);
  return data;
}

export const suspenderVecino = (id) => cambiarEstadoVecino(id, "suspendido");
export const reactivarVecino = (id) => cambiarEstadoVecino(id, "aprobado");

/* ---------- Reportes ---------- */

export async function enviarReporte({ tipo, texto, foto, lat, lng, precision, manual, enPeligro }) {
  const u = await usuarioActual();
  if (!u) throw new Error("Tu sesión terminó. Vuelve a ingresar.");

  let foto_path = null;
  if (foto) {
    const blob = await (await fetch(foto)).blob(); // la foto llega comprimida como data URL
    foto_path = `${u.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(foto_path, blob, { contentType: "image/jpeg" });
    if (error) fallar(error);
  }

  const fila = {
    tipo, texto, foto_path, lat, lng,
    precision_m: precision ?? null,
    ubicacion_manual: Boolean(manual),
    en_peligro: Boolean(enPeligro),
  };
  let { data, error } = await supabase.from("reportes").insert(fila).select("id").single();
  // Si la base de datos aún no tiene las columnas nuevas, se reintenta sin ellas
  if (error && /precision_m|ubicacion_manual|en_peligro/.test(error.message)) {
    console.warn("Falta ejecutar un script de mejoras en Supabase: el reporte se envía sin los datos nuevos.");
    const { precision_m, ubicacion_manual, en_peligro, ...basica } = fila;
    ({ data, error } = await supabase.from("reportes").insert(basica).select("id").single());
  }
  if (error) fallar(error);
  return data.id; // se usa para compartir la ubicación en vivo
}

/* ---------- Alertas en vivo (panel del serenazgo) ---------- */

const oyentes = new Set();
const urlsFotos = new Map(); // ruta -> { url, hasta }
let canal = null;
let reloj = null;

async function firmar(rutas) {
  const ahora = Date.now();
  const faltan = rutas.filter((r) => !(urlsFotos.get(r)?.hasta > ahora));
  if (!faltan.length) return;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(faltan, 3600);
  (data || []).forEach((d) => {
    if (d.signedUrl) urlsFotos.set(d.path, { url: d.signedUrl, hasta: ahora + 50 * 60 * 1000 });
  });
}

async function recargar() {
  const { data, error } = await supabase
    .from("reportes")
    .select("*, perfiles(celular, sector), respuestas(estado, usuario_nombre, usuario_celular), ubicaciones_vivas(lat, lng, precision_m, actualizado_en)")
    .order("creado_en", { ascending: false })
    .or(`estado.in.(nuevo,en_proceso),creado_en.gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`)
    .limit(100);
  if (error) {
    console.error(error);
    return;
  }
  await firmar(data.filter((r) => r.foto_path).map((r) => r.foto_path));
  const lista = data.map((r) => ({
    id: r.id,
    usuarioNombre: r.usuario_nombre,
    tipo: r.tipo,
    texto: r.texto,
    foto: r.foto_path ? urlsFotos.get(r.foto_path)?.url ?? null : null,
    lat: r.lat,
    lng: r.lng,
    creadoEn: r.creado_en,
    estado: r.estado,
    usuarioCelular: r.perfiles?.celular ?? null,
    usuarioSector: r.perfiles?.sector ?? null,
    gravedad: r.gravedad ?? "medio",
    grupo: r.grupo ?? null,
    enPeligro: r.en_peligro ?? false,
    vivo: vivoDe(r.ubicaciones_vivas),
    precisionM: r.precision_m ?? null,
    ubicacionManual: r.ubicacion_manual ?? false,
    respuestas: r.respuestas ?? [],
    ultimoCambioPor: r.ultimo_cambio_por,
    ultimoCambioEn: r.ultimo_cambio_en,
  }));
  oyentes.forEach((callback) => callback(lista));
}

export function escucharReportes(callback) {
  oyentes.add(callback);
  if (!canal) {
    canal = supabase
      .channel("reportes-en-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "reportes" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "respuestas" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "ubicaciones_vivas" }, programarRecarga)
      .subscribe();
    reloj = setInterval(recargar, 30000); // respaldo por si se corta la conexión en vivo
  }
  recargar();
  return () => {
    oyentes.delete(callback);
    if (!oyentes.size && canal) {
      supabase.removeChannel(canal);
      clearInterval(reloj);
      canal = null;
    }
  };
}

async function cambiarReporte(id, campos) {
  const { data, error } = await supabase.from("reportes").update(campos).eq("id", id).select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No tienes permiso para cambiar este reporte.");
  recargar();
}

export const despacharUnidad = (id) =>
  cambiarReporte(id, { estado: "en_proceso", despachado_en: new Date().toISOString() });
export const resolverReporte = (id) =>
  cambiarReporte(id, { estado: "resuelto", resuelto_en: new Date().toISOString() });
export const marcarFalsaAlarma = (id) =>
  cambiarReporte(id, { estado: "falsa_alarma", resuelto_en: new Date().toISOString() });

/* ---------- Estadísticas públicas (solo totales, sin datos personales) ---------- */

export async function estadisticasPublicas() {
  const { data, error } = await supabase.rpc("estadisticas_publicas");
  if (error) fallar(error);
  return data;
}

/* ---------- Red comunitaria (junta directiva y vecinos de confianza) ---------- */

async function cambiarRol(id, rol) {
  const { data, error } = await supabase.from("perfiles").update({ rol }).eq("id", id).select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No tienes permiso para cambiar este rol.");
}

export const designarRespondedor = (id) => cambiarRol(id, "respondedor");
export const quitarRespondedor = (id) => cambiarRol(id, "vecino");

// Solo alertas abiertas y sin datos personales de quien reportó
export async function alertasComunidad() {
  const { data, error } = await supabase.rpc("alertas_comunidad");
  if (error) fallar(error);
  return data.map((r) => ({
    id: r.id, tipo: r.tipo, texto: r.texto, lat: r.lat, lng: r.lng,
    creadoEn: r.creado_en, estado: r.estado,
    enCamino: Number(r.en_camino), miEstado: r.mi_estado, gravedad: r.gravedad ?? "medio",
  }));
}

// estado: "en_camino", "llegue" o "cancelado"
export async function responderAlerta(id, estado) {
  const { error } = await supabase.rpc("responder_alerta", { p_reporte: id, p_estado: estado });
  if (error) fallar(error);
}

/* ---------- Catálogo de incidentes y ubicación en vivo ---------- */

export async function tiposIncidente() {
  const { data, error } = await supabase
    .from("tipos_incidente")
    .select("nombre, grupo, gravedad, icono, orden")
    .eq("activo", true)
    .order("orden");
  if (error) fallar(error);
  return data;
}

// Solo funciona mientras la alerta del vecino esté abierta; al cerrarla, el servidor la rechaza
export async function actualizarUbicacionViva(idReporte, lat, lng, precision) {
  const { error } = await supabase.rpc("actualizar_ubicacion", {
    p_reporte: idReporte, p_lat: lat, p_lng: lng, p_precision: precision ?? null,
  });
  if (error) fallar(error);
}

function vivoDe(u) {
  const v = Array.isArray(u) ? u[0] : u;
  return v ? { lat: v.lat, lng: v.lng, precisionM: v.precision_m, actualizadoEn: v.actualizado_en } : null;
}

// Las posiciones en vivo llegan seguido: se agrupan para no recargar todo a cada rato
let temporizador = null;
function programarRecarga() {
  if (temporizador) return;
  temporizador = setTimeout(() => {
    temporizador = null;
    recargar();
  }, 1500);
}

/* ---------- Contraseñas (el serenazgo restablece, el vecino crea una nueva) ---------- */

// Devuelve una contraseña temporal de 8 números para dictarla por teléfono
export async function restablecerClave(idUsuario) {
  const { data, error } = await supabase.rpc("restablecer_clave", { p_usuario: idUsuario });
  if (error) fallar(error);
  return data;
}

export async function cambiarClave(nueva) {
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) fallar(error);
  await supabase.rpc("clave_cambiada");
}

/* ---------- Completar un reporte ya enviado (foto y descripción, después de enviar) ---------- */

export async function agregarDetalle(idReporte, { texto, foto }) {
  const u = await usuarioActual();
  if (!u) throw new Error("Tu sesión terminó. Vuelve a ingresar.");

  let foto_path = null;
  if (foto) {
    const blob = await (await fetch(foto)).blob(); // la foto llega comprimida como data URL
    foto_path = `${u.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(foto_path, blob, { contentType: "image/jpeg" });
    if (error) fallar(error);
  }

  const { error } = await supabase.rpc("agregar_detalle", {
    p_reporte: idReporte, p_texto: texto ?? null, p_foto_path: foto_path,
  });
  if (error) fallar(error);
}
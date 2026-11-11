// Gravedad de los incidentes: nombres y colores.
// El color nunca va solo: siempre lo acompaña un texto, por quienes no distinguen bien los colores.
export const GRAVEDAD = {
  critico: { nombre: "Crítico", sencillo: "Muy urgente", color: "#dc2626", texto: "#ffffff", rango: 0 },
  alto: { nombre: "Alto", sencillo: "Urgente", color: "#c2410c", texto: "#ffffff", rango: 1 },
  medio: { nombre: "Medio", sencillo: "Importante", color: "#facc15", texto: "#12201a", rango: 2 },
  leve: { nombre: "Leve", sencillo: "Aviso", color: "#0369a1", texto: "#ffffff", rango: 3 },
};

export const gravedadDe = (clave) => GRAVEDAD[clave] || GRAVEDAD.medio;
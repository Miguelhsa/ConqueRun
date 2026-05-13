export const LOGROS = [
  // Por km
  { id: 'km_10',   emoji: '👟', nombre: 'Primeros pasos',    desc: 'Corre 10 km en total',      tipo: 'km',      umbral: 10000,   bonus: 10 },
  { id: 'km_50',   emoji: '🏃', nombre: 'Medio centenar',    desc: 'Corre 50 km en total',      tipo: 'km',      umbral: 50000,   bonus: 50 },
  { id: 'km_100',  emoji: '💪', nombre: 'Centenario',        desc: 'Corre 100 km en total',     tipo: 'km',      umbral: 100000,  bonus: 100 },
  { id: 'km_500',  emoji: '🔥', nombre: 'Máquina',           desc: 'Corre 500 km en total',     tipo: 'km',      umbral: 500000,  bonus: 500 },
  { id: 'km_1000', emoji: '⚡', nombre: 'Leyenda',           desc: 'Corre 1000 km en total',    tipo: 'km',      umbral: 1000000, bonus: 1000 },

  // Por barrios
  { id: 'b_1',  emoji: '🏴', nombre: 'Primer territorio', desc: 'Conquista tu primer barrio', tipo: 'barrios', umbral: 1,  bonus: 5 },
  { id: 'b_5',  emoji: '🗺️', nombre: 'Explorador',        desc: 'Conquista 5 barrios',        tipo: 'barrios', umbral: 5,  bonus: 25 },
  { id: 'b_10', emoji: '👑', nombre: 'Dominador',          desc: 'Conquista 10 barrios',       tipo: 'barrios', umbral: 10, bonus: 50 },
  { id: 'b_20', emoji: '🏰', nombre: 'Rey del asfalto',   desc: 'Conquista 20 barrios',       tipo: 'barrios', umbral: 20, bonus: 100 },

  // Por racha
  { id: 'racha_3',  emoji: '📅', nombre: 'Constante',      desc: 'Corre 3 días seguidos',  tipo: 'racha', umbral: 3,  bonus: 10 },
  { id: 'racha_7',  emoji: '🗓️', nombre: 'Semana perfecta', desc: 'Corre 7 días seguidos',  tipo: 'racha', umbral: 7,  bonus: 30 },
  { id: 'racha_30', emoji: '🌟', nombre: 'Mes de hierro',   desc: 'Corre 30 días seguidos', tipo: 'racha', umbral: 30, bonus: 150 },
];

// Calcula la nueva racha a partir del estado anterior y la fecha de la carrera recién terminada.
// ultimasCarrerasPrevias = perfilRef.current.ultimasCarreras (sin incluir la carrera actual).
export const calcularRachaIncremental = (ultimasCarrerasPrevias, rachaActual, ahoraMs = Date.now()) => {
  if (!ultimasCarrerasPrevias || ultimasCarrerasPrevias.length === 0) return 1;
  const fechaUltimaMs = ultimasCarrerasPrevias[0]?.fecha;
  if (!fechaUltimaMs) return 1;
  const hoyMs = new Date(ahoraMs).setHours(0, 0, 0, 0);
  const ultDiaMs = new Date(fechaUltimaMs).setHours(0, 0, 0, 0);
  const diffDias = Math.round((hoyMs - ultDiaMs) / 86400_000);
  if (diffDias === 0) return rachaActual;  // ya corrió hoy, racha intacta
  if (diffDias === 1) return rachaActual + 1;  // día consecutivo
  return 1;  // hueco → racha se rompe
};

export const calcularLogrosDesbloqueados = (totalKm, totalBarrios, racha) => {
  return LOGROS.filter(l => {
    if (l.tipo === 'km') return totalKm >= l.umbral;
    if (l.tipo === 'barrios') return totalBarrios >= l.umbral;
    if (l.tipo === 'racha') return racha >= l.umbral;
    return false;
  });
};
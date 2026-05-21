// Cronómetro: "49:00" o "1:02:15" — para tiempos de carrera en curso
export const formatTiempo = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  return `${m}:${seg.toString().padStart(2, '0')}`;
};

// Duración total: "3h 8min" o "45min" — para stats del perfil
export const formatDuracion = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

export const formatRitmo = (segundosPorKm) => {
  if (!segundosPorKm || !isFinite(segundosPorKm)) return '--:--';
  const m = Math.floor(segundosPorKm / 60);
  const s = Math.round(segundosPorKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Buffer para URLs de Strava capturadas antes de que CorrerScreen esté montada.
// App.js escribe aquí al arrancar; CorrerScreen lo consume al montar.

let _pendingUrl = null;

const esUrlStrava = (url) =>
  Boolean(url) && (
    url.startsWith('conquerun://strava') ||
    url.startsWith('exp+conqurun://strava') ||
    url.includes('/--/strava')
  );

export const guardarStravaUrl = (url) => {
  if (esUrlStrava(url)) _pendingUrl = url;
};

export const consumirStravaUrl = () => {
  const url = _pendingUrl;
  _pendingUrl = null;
  return url;
};

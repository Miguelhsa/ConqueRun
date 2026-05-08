// Voronoi por intersección de semiplanos (O(n³), válido para n ≤ 600 zonas).
// Trabaja en coordenadas lng/lat (aproximación plana suficiente a escala de ciudad).
// Usa el casco convexo de los centros como perímetro exterior para evitar que las
// zonas costeras se extiendan al mar.

const cross = (o, a, b) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const convexHull = (points) => {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

const expandirCasco = (hull, padding) => {
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
};

const clipHalfPlane = (poly, site, other) => {
  if (poly.length === 0) return [];
  const mx = (site.x + other.x) / 2;
  const my = (site.y + other.y) / 2;
  const nx = site.x - other.x;
  const ny = site.y - other.y;
  const inside = p => (p.x - mx) * nx + (p.y - my) * ny >= 0;
  const intersect = (a, b) => {
    const da = (a.x - mx) * nx + (a.y - my) * ny;
    const db = (b.x - mx) * nx + (b.y - my) * ny;
    const t = da / (da - db);
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    const inCurr = inside(curr);
    const inNext = inside(next);
    if (inCurr) result.push(curr);
    if (inCurr !== inNext) result.push(intersect(curr, next));
  }
  return result;
};

export const calcularVoronoi = (barrios, padding = 0.015) => {
  if (!barrios || barrios.length === 0) return [];
  const sites = barrios.map(b => ({ x: b.lng, y: b.lat, barrio: b }));
  const hull = convexHull(sites);
  const boundary = expandirCasco(hull, padding);
  return sites.map(site => {
    let cell = [...boundary];
    for (const other of sites) {
      if (other === site) continue;
      cell = clipHalfPlane(cell, site, other);
      if (cell.length < 3) break;
    }
    if (cell.length < 3) return null;
    return {
      barrio: site.barrio,
      polygon: cell.map(p => ({ latitude: p.y, longitude: p.x })),
    };
  }).filter(Boolean);
};

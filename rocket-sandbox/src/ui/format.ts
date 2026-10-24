export function fmtDist(m: number, digits = 1): string {
  if (!Number.isFinite(m)) return '—';
  const a = Math.abs(m);
  if (a < 1000) return `${m.toFixed(a < 10 ? 1 : 0)} m`;
  if (a < 1e6) return `${(m / 1e3).toFixed(a < 1e4 ? digits : 0)} km`;
  if (a < 1e9) return `${(m / 1e6).toFixed(digits)} Mm`;
  if (a < 1.5e11 * 0.1) return `${(m / 1e9).toFixed(digits)} Gm`;
  return `${(m / 1.495978707e11).toFixed(2)} AU`;
}

export function fmtSpeed(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) < 1000 ? `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)} m/s` : `${(v / 1000).toFixed(2)} km/s`;
}

export function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const neg = s < 0;
  s = Math.abs(s);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const parts = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  return (neg ? '-' : '') + parts;
}

export function fmtMass(kg: number): string {
  return kg >= 10000 ? `${(kg / 1000).toFixed(1)} t` : kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${kg.toFixed(0)} kg`;
}

export function fmtForce(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)} MN` : `${(n / 1e3).toFixed(0)} kN`;
}

export function fmtPressure(pa: number): string {
  if (pa <= 0) return '0 Pa';
  if (pa >= 1e5) return `${(pa / 1e5).toFixed(2)} bar`;
  if (pa >= 1000) return `${(pa / 1000).toFixed(1)} kPa`;
  return `${pa.toFixed(pa < 1 ? 3 : 1)} Pa`;
}

export function fmtAngle(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(0)}°`;
}

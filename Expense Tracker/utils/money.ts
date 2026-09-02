export function money(n: number): string {
  const sign = n < 0 ? '-$' : '$';
  return (
    sign +
    Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function signedMoney(n: number): string {
  return (n >= 0 ? '+' : '') + money(n);
}

export function signedPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

export function compactNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

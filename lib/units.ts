// Integer token amounts as strings, the way chains count them. BigInt only — floats
// lose yoctoNEAR (24 decimals) silently.

export function toUnits(amount: string, decimals: number): string {
  const [whole = '0', frac = ''] = amount.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0')).toString();
}

export function fromUnits(units: string, decimals: number, maxFraction = 6): string {
  const n = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Ceil a decimal number of tokens to integer units — never ask for less than the bill. */
export function ceilUnits(amount: number, decimals: number): string {
  return BigInt(Math.ceil(amount * 10 ** decimals)).toString();
}

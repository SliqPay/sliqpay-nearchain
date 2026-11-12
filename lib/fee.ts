/**
 * SliqPay's fee in naira ("option B", the schedule agreed for SliqPay in Nov 2026).
 * Small top-ups get a small fee; the ₦250 floor meets 1.5% at ₦16,667, so a larger
 * amount never costs less. Shared by the page (to show the total) and the server
 * (to price the order) — one definition, so the two can never disagree.
 */
export function sliqFee(amountNgn: number): number {
  if (amountNgn < 1000) return 20;
  if (amountNgn < 5000) return 100;
  if (amountNgn <= 500_000) return Math.max(250, Math.round(amountNgn * 0.015));
  return Math.round(amountNgn * 0.01);
}

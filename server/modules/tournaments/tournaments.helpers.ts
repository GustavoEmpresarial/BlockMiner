export function isDepositMetric(metric: string): boolean {
  return metric === "DEPOSITS_POL" || metric === "DEPOSITS_USD";
}

export function depositScoreMismatch(stored: number, computed: number, metric: string): boolean {
  const eps = metric === "DEPOSITS_USD" ? 0.01 : 0.0001;
  return Math.abs(stored - computed) > eps;
}

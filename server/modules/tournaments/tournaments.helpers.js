export function isDepositMetric(metric) {
    return metric === "DEPOSITS_POL" || metric === "DEPOSITS_USD";
}
export function depositScoreMismatch(stored, computed, metric) {
    const eps = metric === "DEPOSITS_USD" ? 0.01 : 0.0001;
    return Math.abs(stored - computed) > eps;
}

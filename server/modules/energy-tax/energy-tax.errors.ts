// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Domain-specific errors for energy-tax. Ported 1:1 from legacy energyTax.service.ts. */
export class EnergyTaxNotStarted extends Error {
    startsAt;
    constructor(startsAt) {
        super(`A Taxa de Energia entra em vigor em ${startsAt.toISOString()}.`);
        this.startsAt = startsAt;
        this.name = "EnergyTaxNotStarted";
    }
}
export class EnergyTaxAlreadyPaid extends Error {
    constructor() {
        super("Você já quitou a taxa de energia de ontem.");
        this.name = "EnergyTaxAlreadyPaid";
    }
}
export class EnergyTaxNoRewards extends Error {
    constructor() {
        super("Você não minerou nada ontem — sem taxa pra cobrar.");
        this.name = "EnergyTaxNoRewards";
    }
}
export class EnergyTaxInsufficientBalance extends Error {
    required;
    available;
    currency;
    constructor(required, available, currency = "POL") {
        super(`Saldo insuficiente: precisa de ${required} ${currency}, tem ${available} ${currency}.`);
        this.required = required;
        this.available = available;
        this.currency = currency;
        this.name = "EnergyTaxInsufficientBalance";
    }
}

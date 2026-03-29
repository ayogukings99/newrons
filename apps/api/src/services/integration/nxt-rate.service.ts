/**
 * NXT Exchange Rate Service
 * Manages conversion between NXT and fiat currencies (NGN, KES, GHS, ZAR, ETB, UGX, TZS, USD)
 * Initially hardcoded rates; can be upgraded to oracle-fed (Pyth, Chainlink, etc.)
 */

export interface ExchangeRate {
  rate: number
  updatedAt: string
  currency: string
}

export class NxtRateService {
  // Base rates: 1 NXT = X fiat units
  // Initial rates assume 1 NXT ≈ 1 NGN equivalent in value
  private readonly RATES: Record<string, number> = {
    NGN: 1.0,        // 1 NXT = 1 NGN (baseline)
    KES: 0.13,       // 1 NXT ≈ 0.13 KES
    GHS: 0.14,       // 1 NXT ≈ 0.14 GHS
    ZAR: 0.018,      // 1 NXT ≈ 0.018 ZAR
    ETB: 0.05,       // 1 NXT ≈ 0.05 ETB
    UGX: 2.5,        // 1 NXT ≈ 2.5 UGX
    TZS: 0.33,       // 1 NXT ≈ 0.33 TZS
    USD: 0.00065,    // 1 NXT ≈ 0.00065 USD (very small, for stablecoin peg)
  }

  private readonly SUPPORTED_CURRENCIES = Object.keys(this.RATES)
  private lastUpdated = new Date().toISOString()

  /**
   * Get NXT/fiat rate for a currency
   */
  async getRate(currency: string): Promise<ExchangeRate> {
    const upper = currency.toUpperCase()
    if (!this.RATES[upper]) {
      throw new Error(`Unsupported currency: ${currency}. Supported: ${this.SUPPORTED_CURRENCIES.join(', ')}`)
    }

    return {
      rate: this.RATES[upper],
      updatedAt: this.lastUpdated,
      currency: upper,
    }
  }

  /**
   * Convert fiat amount to NXT
   * Formula: nxt_amount = fiat_amount / rate
   */
  async fiatToNxt(amount: number, currency: string): Promise<number> {
    if (amount < 0) throw new Error('Amount must be non-negative')

    const rate = await this.getRate(currency)
    const nxtAmount = amount / rate.rate

    return parseFloat(nxtAmount.toFixed(4))
  }

  /**
   * Convert NXT to fiat amount
   * Formula: fiat_amount = nxt_amount * rate
   */
  async nxtToFiat(nxtAmount: number, currency: string): Promise<number> {
    if (nxtAmount < 0) throw new Error('NXT amount must be non-negative')

    const rate = await this.getRate(currency)
    const fiatAmount = nxtAmount * rate.rate

    return parseFloat(fiatAmount.toFixed(2))
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): string[] {
    return this.SUPPORTED_CURRENCIES
  }

  /**
   * Batch convert multiple amounts
   */
  async batchFiatToNxt(amounts: Array<{ amount: number; currency: string }>): Promise<number[]> {
    return Promise.all(amounts.map(a => this.fiatToNxt(a.amount, a.currency)))
  }

  /**
   * Batch convert NXT to multiple currencies
   */
  async batchNxtToFiat(nxtAmount: number, currencies: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {}
    for (const currency of currencies) {
      result[currency] = await this.nxtToFiat(nxtAmount, currency)
    }
    return result
  }

  /**
   * Get rate for fiat currency (e.g., for UI display)
   */
  async getFormattedRate(currency: string): Promise<string> {
    const rate = await this.getRate(currency)
    return `1 NXT = ${rate.rate} ${currency}`
  }
}

export const nxtRateService = new NxtRateService()

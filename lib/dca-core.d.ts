import type { MarketPrice } from "./market-data";
export type PriceField = "open" | "close";
export type DailyPurchase = MarketPrice & { priceUsed: number; dailyInvestment: number; sharesPurchased: number; cumulativeInvestment: number; cumulativeShares: number; runningAverageCost: number };
export type MonthCalculation = { firstDate: string; lastDate: string; firstPrice: number; lastPrice: number; tradingDays: number; monthlyBudget: number; dailyInvestment: number; dcaShares: number; dcaAverageCost: number; differenceShares: number; dcaEndValue: number; lumpEndValue: number; dcaGain: number; lumpGain: number; averageMarketPrice: number; daily: DailyPurchase[] };
export function calculateMonth(prices: MarketPrice[], priceField?: PriceField): MonthCalculation;

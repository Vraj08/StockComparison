import type { MarketPrice } from "./market-data";
export type PriceField = "open" | "close" | "adjustedClose";
export type DailyPurchase = MarketPrice & { priceUsed: number; dailyInvestment: number; sharesPurchased: number; cumulativeInvestment: number; cumulativeShares: number; runningAverageCost: number };
export type WeeklyPurchase = MarketPrice & { priceUsed: number; weeklyInvestment: number; sharesPurchased: number; cumulativeInvestment: number; cumulativeShares: number; runningAverageCost: number };
export type MonthCalculation = { firstDate: string; lastDate: string; firstPrice: number; lastPrice: number; tradingDays: number; monthlyBudget: number; dailyInvestment: number; dcaShares: number; lumpShares: number; dcaAverageCost: number; differenceShares: number; dcaEndValue: number; lumpEndValue: number; dcaGain: number; lumpGain: number; weeklyInvestment: number; weeklyPurchaseCount: number; weeklyShares: number; weeklyAverageCost: number; weeklyDifferenceShares: number; weeklyEndValue: number; weeklyGain: number; averageMarketPrice: number; daily: DailyPurchase[]; weekly: WeeklyPurchase[] };
export function calculateMonth(prices: MarketPrice[], priceField?: PriceField, monthlyBudgetOverride?: number): MonthCalculation;

export type DipBuyMonthResult = {
  month: string;
  firstDate: string;
  lastDate: string;
  firstPrice: number;
  lastPrice: number;
  halfBudgetInvested: number;
  reserveAdded: number;
  reserveAfterMonth: number;
  dipOccurred: boolean;
  dipDate: string | null;
  dipPrice: number | null;
  dipAmountDeployed: number;
  dipShares: number;
  firstDayShares: number;
  totalInvestedSoFar: number;
  totalSharesSoFar: number;
  endValueSoFar: number;
};

export type DipBuyStrategyResult = {
  monthResults: DipBuyMonthResult[];
  totalInvested: number;
  totalReserveUndeployed: number;
  totalCashCommitted: number;
  totalShares: number;
  endValue: number;
  dipMonthCount: number;
};

export function calculateDipBuyStrategy(
  monthGroups: Array<{ month: string; prices: MarketPrice[] }>,
  priceField?: PriceField,
  monthlyBudget?: number,
  dipPercentage?: number
): DipBuyStrategyResult;

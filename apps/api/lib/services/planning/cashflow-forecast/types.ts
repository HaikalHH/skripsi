export type CashflowForecastHorizon =
  | "PAYDAY"
  | "MONTH_END"
  | "NEXT_7_DAYS"
  | "WEEKEND"
  | "TOMORROW";

export type CashflowForecastMode = "SAFETY" | "REMAINING";

export type CashflowForecastQuery = {
  horizon: CashflowForecastHorizon;
  mode: CashflowForecastMode;
  scenarioExpenseAmount?: number;
  scenarioExpenseLabel?: string | null;
};

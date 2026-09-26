type Entry = { name?: string; value?: number | string; color?: string; dataKey?: string | number };

export function FinancialChartTooltip({ active, payload, label, billions = false }: { active?: boolean; payload?: readonly Entry[]; label?: string | number; billions?: boolean }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip-premium"><span>{label}</span>{payload.filter(item => item.value != null).map((item, index) => {
    const value = Number(item.value) * (billions ? 1e9 : 1);
    const name = item.name === "realistic" ? "Portfolio value" : item.name === "cash" ? "Amount invested" : item.name;
    return <div key={`${item.dataKey}-${index}`}><i style={{ background: item.color }}/><span>{name}</span><strong className={billions ? value > 0 ? "positive" : value < 0 ? "negative" : "" : ""}>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value)}</strong></div>;
  })}</div>;
}

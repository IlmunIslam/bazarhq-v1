'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DayRevenue {
  date: string;  // YYYY-MM-DD
  revenue: number;
}

function shortDate(iso: string): string {
  const [, , dd] = iso.split('-');
  return dd;  // just the day number e.g. "01", "15"
}

export default function RevenueChart({ data }: { data: DayRevenue[] }) {
  if (data.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
        No revenue data yet.
      </div>
    );
  }

  const chartData = data.map(d => ({ day: shortDate(d.date), revenue: d.revenue, date: d.date }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#111827" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#111827" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => v === 0 ? '0' : `৳${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          width={52}
        />
        <Tooltip
          contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
          formatter={(value) => [`৳${Number(value).toLocaleString()}`, 'Revenue']}
          labelFormatter={(label, payload) => payload?.[0]?.payload?.date ?? label}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#111827"
          strokeWidth={2}
          fill="url(#revenueGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

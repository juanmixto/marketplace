'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RankedItem } from '@/domains/analytics/types'

interface Props {
  data: RankedItem[]
  color?: string
}

function formatEur(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k €`
  return `${value.toFixed(0)} €`
}

export function RankedBarChart({ data, color = '#10b981' }: Props) {
  const chartData = data.map(d => ({ name: d.name.length > 22 ? `${d.name.slice(0, 20)}…` : d.name, revenue: d.revenue }))
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tickFormatter={formatEur} stroke="var(--muted)" fontSize={11} />
          <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={11} width={130} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={value => [formatEur(Number(value ?? 0)), 'Revenue']}
          />
          <Bar dataKey="revenue" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategorySlice } from '@/domains/analytics/types'

interface Props {
  data: CategorySlice[]
}

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#14b8a6', '#8b5cf6', '#ec4899', '#0ea5e9']

export function CategoryPieChart({ data }: Props) {
  const chartData = data.slice(0, 8).map(d => ({ name: d.name, value: d.revenue, share: d.sharePct }))
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ pointerEvents: 'auto' }}
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value, _name, item) => {
              const num = Number(value ?? 0)
              const payload = (item as { payload?: { share?: number } } | undefined)?.payload
              return [`${num.toFixed(0)} € (${payload?.share?.toFixed(1) ?? '0'}%)`, 'Revenue']
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

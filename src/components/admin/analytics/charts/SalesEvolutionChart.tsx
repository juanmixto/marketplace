'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SalesPoint } from '@/domains/analytics/types'

interface Props {
  data: SalesPoint[]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function formatEur(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k €`
  return `${value.toFixed(0)} €`
}

export function SalesEvolutionChart({ data }: Props) {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--muted)" fontSize={11} />
          <YAxis
            yAxisId="gmv"
            tickFormatter={formatEur}
            stroke="var(--muted)"
            fontSize={11}
            width={60}
          />
          <YAxis
            yAxisId="orders"
            orientation="right"
            stroke="var(--muted)"
            fontSize={11}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={label => (typeof label === 'string' ? formatDate(label) : String(label ?? ''))}
            formatter={(value, name) => {
              const num = Number(value ?? 0)
              return name === 'GMV' ? [formatEur(num), 'GMV'] : [num.toLocaleString('es-ES'), 'Pedidos']
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Area
            yAxisId="gmv"
            type="monotone"
            dataKey="gmv"
            stroke="#10b981"
            fill="url(#gmvFill)"
            strokeWidth={2}
            name="GMV"
          />
          <Line
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            name="Pedidos"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

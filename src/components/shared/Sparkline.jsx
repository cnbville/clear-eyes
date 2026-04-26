import { Area, AreaChart, Line, ResponsiveContainer } from 'recharts'

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildFutureProjection(data = [], regressionLine = null) {
  if (!regressionLine || !data.length) {
    return []
  }

  const sortedData = [...data].sort((left, right) => toNumber(left.x) - toNumber(right.x))
  const lastPoint = sortedData[sortedData.length - 1]
  const step =
    sortedData.length > 1
      ? Math.max(
          1,
          Math.round(
            sortedData
              .slice(1)
              .reduce((sum, point, index) => sum + (point.x - sortedData[index].x), 0) /
              (sortedData.length - 1),
          ),
        )
      : 7

  return Array.from({ length: 4 }, (_, index) => ({
    x: lastPoint.x + step * (index + 1),
    y: null,
    projectedY:
      regressionLine.slope * (lastPoint.x + step * (index + 1)) + regressionLine.intercept,
  }))
}

function Sparkline({
  data = [],
  regressionLine = null,
  color = '#c9a227',
  width = '100%',
  height = 48,
}) {
  const normalizedData = [...data]
    .map((point) => ({
      x: toNumber(point?.x),
      y: toNumber(point?.y),
      projectedY: null,
    }))
    .sort((left, right) => left.x - right.x)

  const futurePoints = buildFutureProjection(normalizedData, regressionLine)
  const lastActualPoint = normalizedData[normalizedData.length - 1] ?? null

  const chartData = normalizedData.map((point) => ({
    ...point,
    projectedY:
      regressionLine && point === lastActualPoint
        ? regressionLine.slope * point.x + regressionLine.intercept
        : null,
  }))

  const dataWithProjection = [...chartData, ...futurePoints]

  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={dataWithProjection} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Area
          type="monotone"
          dataKey="y"
          stroke={color}
          fill={color}
          fillOpacity={0.08}
          strokeWidth={1.5}
          dot={{ r: 2, fill: color, stroke: color, strokeWidth: 0 }}
          activeDot={false}
          isAnimationActive={false}
        />
        {regressionLine ? (
          <Line
            type="monotone"
            dataKey="projectedY"
            stroke={color}
            strokeDasharray="4 4"
            strokeWidth={1}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default Sparkline

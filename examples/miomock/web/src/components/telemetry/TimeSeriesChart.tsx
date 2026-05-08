import { useMemo } from "react";

import { formatNumber } from "./utils";

export type SeriesPoint = { t: number; v: number };

type TimeSeriesChartProps = {
  points: SeriesPoint[];
  height?: number;
  mode?: "line" | "bar";
  stroke?: string;
  fill?: string;
  yLabel?: string;
  emptyHint?: string;
};

export function TimeSeriesChart({
  points,
  height = 200,
  mode = "line",
  stroke = "#0ea5e9",
  fill = "rgba(14, 165, 233, 0.16)",
  yLabel,
  emptyHint = "No data",
}: TimeSeriesChartProps) {
  const padding = { top: 12, right: 12, bottom: 24, left: 44 };

  const { minT, maxT, minV, maxV } = useMemo(() => {
    if (points.length === 0) {
      return { minT: 0, maxT: 1, minV: 0, maxV: 1 };
    }
    const ts = points.map((p) => p.t);
    const vs = points.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const span = hi - lo;
    const padV = span === 0 ? Math.max(1, Math.abs(hi) * 0.1) : span * 0.1;
    return {
      minT: Math.min(...ts),
      maxT: Math.max(...ts),
      minV: lo - padV,
      maxV: hi + padV,
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 800 ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        <ChartBody
          points={points}
          width={800}
          height={height}
          padding={padding}
          minT={minT}
          maxT={maxT}
          minV={minV}
          maxV={maxV}
          mode={mode}
          stroke={stroke}
          fill={fill}
          yLabel={yLabel}
        />
      </svg>
    </div>
  );
}

function ChartBody({
  points,
  width,
  height,
  padding,
  minT,
  maxT,
  minV,
  maxV,
  mode,
  stroke,
  fill,
  yLabel,
}: {
  points: SeriesPoint[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  minT: number;
  maxT: number;
  minV: number;
  maxV: number;
  mode: "line" | "bar";
  stroke: string;
  fill: string;
  yLabel?: string;
}) {
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const tRange = maxT - minT || 1;
  const vRange = maxV - minV || 1;

  const xOf = (t: number) => padding.left + ((t - minT) / tRange) * innerW;
  const yOf = (v: number) => padding.top + innerH - ((v - minV) / vRange) * innerH;

  const yTicks = computeTicks(minV, maxV, 4);

  const linePoints = points.map((p) => [xOf(p.t), yOf(p.v)] as const);
  const linePath = linePoints
    .map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    linePoints.length > 0
      ? `${linePath} L${linePoints.at(-1)?.[0].toFixed(2)},${(padding.top + innerH).toFixed(2)} L${linePoints[0][0].toFixed(2)},${(padding.top + innerH).toFixed(2)} Z`
      : "";

  return (
    <>
      {yTicks.map((tick, idx) => (
        <g key={idx}>
          <line
            x1={padding.left}
            y1={yOf(tick)}
            x2={width - padding.right}
            y2={yOf(tick)}
            stroke="#e5e7eb"
            strokeDasharray="2 2"
          />
          <text
            x={padding.left - 6}
            y={yOf(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 10 }}
          >
            {formatNumber(tick)}
          </text>
        </g>
      ))}
      {yLabel && (
        <text
          x={8}
          y={padding.top}
          dominantBaseline="hanging"
          className="fill-muted-foreground"
          style={{ fontSize: 10 }}
        >
          {yLabel}
        </text>
      )}
      <line
        x1={padding.left}
        y1={padding.top + innerH}
        x2={width - padding.right}
        y2={padding.top + innerH}
        stroke="#9ca3af"
      />
      <text
        x={padding.left}
        y={height - 4}
        className="fill-muted-foreground"
        style={{ fontSize: 10 }}
      >
        {new Date(minT).toLocaleTimeString("ko-KR", { hour12: false })}
      </text>
      <text
        x={width - padding.right}
        y={height - 4}
        textAnchor="end"
        className="fill-muted-foreground"
        style={{ fontSize: 10 }}
      >
        {new Date(maxT).toLocaleTimeString("ko-KR", { hour12: false })}
      </text>
      {mode === "line" && (
        <>
          <path d={areaPath} fill={fill} />
          <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} />
          {linePoints.map(([x, y], idx) => (
            <circle key={idx} cx={x} cy={y} r={2} fill={stroke} />
          ))}
        </>
      )}
      {mode === "bar" &&
        points.map((p, idx) => {
          const barW = Math.max(2, innerW / Math.max(1, points.length) - 2);
          const x = xOf(p.t) - barW / 2;
          const y = yOf(p.v);
          const h = padding.top + innerH - y;
          return (
            <rect
              key={idx}
              x={x.toFixed(2)}
              y={y.toFixed(2)}
              width={barW.toFixed(2)}
              height={h.toFixed(2)}
              fill={stroke}
              opacity={0.85}
            />
          );
        })}
    </>
  );
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const step = (max - min) / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i += 1) ticks.push(min + step * i);
  return ticks;
}

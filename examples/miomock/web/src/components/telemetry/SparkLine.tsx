type SparkLineProps = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  showDots?: boolean;
};

export function SparkLine({
  values,
  width = 120,
  height = 32,
  stroke = "#0ea5e9",
  fill = "rgba(14, 165, 233, 0.12)",
  showDots = false,
}: SparkLineProps) {
  if (values.length === 0) {
    return (
      <svg width={width} height={height} className="block">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#e5e7eb"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const padY = 2;
  const usableH = height - padY * 2;

  const points = values.map((value, idx) => {
    const x = idx * stepX;
    const y = padY + usableH - ((value - min) / range) * usableH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L${(points.at(-1)?.[0] ?? 0).toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className="block">
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} />
      {showDots &&
        points.map(([x, y], idx) => <circle key={idx} cx={x} cy={y} r={1.5} fill={stroke} />)}
    </svg>
  );
}

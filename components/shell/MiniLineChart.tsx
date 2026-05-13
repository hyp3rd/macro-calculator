"use client";

import { useId } from "react";

export type LinePoint = {
  /** Numeric x value — for time series, pass a unix-day index or epoch ms. */
  x: number;
  y: number;
  /** Optional human label shown on a few ticks. */
  label?: string;
};

type Props = {
  data: LinePoint[];
  /** Total width / height of the SVG (CSS pixels). */
  width?: number;
  height?: number;
  /** Force the y axis to include 0; useful for some metrics, off for weight. */
  yIncludeZero?: boolean;
  /** Number of x-axis labels to render. Picked evenly across the data. */
  xTicks?: number;
  /** Unit suffix shown on the y-axis ticks (e.g. "kg"). */
  yUnit?: string;
  /** Optional horizontal reference line (e.g. target calories). The line
   * is dashed and labelled at the right edge. */
  targetY?: number;
  /** Short text shown next to the reference line. */
  targetLabel?: string;
};

/** Lightweight line chart in pure SVG. No interactivity, no chart library;
 * deliberately minimal to fit the Linear/Vercel aesthetic. Renders a
 * single polyline with subtle gridlines, axis labels, and one dot per
 * data point. Returns null if `data` is empty — the caller renders the
 * empty state. */
export function MiniLineChart({
  data,
  width = 640,
  height = 220,
  yIncludeZero = false,
  xTicks = 5,
  yUnit = "",
  targetY,
  targetLabel,
}: Props) {
  const gradientId = useId();
  if (data.length === 0) return null;

  const padding = { top: 12, right: 16, bottom: 28, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // X-axis: pure value range (caller passes day indices or timestamps).
  const xs = data.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(1, xMax - xMin);

  // Y-axis: pad so the line doesn't kiss the edges. Force-include 0 if asked.
  // Also keep the reference target on-screen if it's outside the data range.
  const ys = data.map((p) => p.y);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yIncludeZero) yMin = Math.min(yMin, 0);
  if (targetY !== undefined) {
    yMin = Math.min(yMin, targetY);
    yMax = Math.max(yMax, targetY);
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad;
  yMax += yPad;
  const ySpan = yMax - yMin;

  const xScale = (x: number) => padding.left + ((x - xMin) / xSpan) * innerW;
  const yScale = (y: number) => padding.top + (1 - (y - yMin) / ySpan) * innerH;

  const path = data
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.x)},${yScale(p.y)}`)
    .join(" ");

  const areaPath = `${path} L${xScale(xMax)},${padding.top + innerH} L${xScale(xMin)},${padding.top + innerH} Z`;

  // Y-axis ticks: 4 evenly spaced.
  const yTickValues = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * ySpan);

  // X-axis labels: pick evenly spaced indices and use their `label` when
  // present, fall back to the numeric value.
  const xLabelIndices: number[] = [];
  if (data.length === 1) {
    xLabelIndices.push(0);
  } else {
    const step = (data.length - 1) / (xTicks - 1);
    for (let i = 0; i < xTicks; i++) {
      xLabelIndices.push(Math.round(i * step));
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto text-foreground"
      role="img"
      aria-label={`Line chart with ${data.length} data points`}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor="currentColor"
            stopOpacity="0.18"
          />
          <stop
            offset="100%"
            stopColor="currentColor"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>

      {/* Horizontal gridlines + y-axis labels */}
      {yTickValues.map((v) => {
        const y = yScale(v);
        return (
          <g key={v.toFixed(3)}>
            <line
              x1={padding.left}
              x2={padding.left + innerW}
              y1={y}
              y2={y}
              className="stroke-border/50"
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={y}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {Math.round(v * 10) / 10}
              {yUnit}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {xLabelIndices.map((i) => {
        const p = data[i];
        if (!p) return null;
        return (
          <text
            key={`x-${i}`}
            x={xScale(p.x)}
            y={padding.top + innerH + 16}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] tabular-nums"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {p.label ?? p.x}
          </text>
        );
      })}

      {/* Optional target reference line + label */}
      {targetY !== undefined && (
        <g>
          <line
            x1={padding.left}
            x2={padding.left + innerW}
            y1={yScale(targetY)}
            y2={yScale(targetY)}
            className="stroke-foreground/50"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {targetLabel && (
            <text
              x={padding.left + innerW - 4}
              y={yScale(targetY) - 4}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {targetLabel}
            </text>
          )}
        </g>
      )}

      {/* Area under the line */}
      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
        stroke="none"
      />

      {/* The line itself */}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data point dots */}
      {data.map((p, i) => (
        <circle
          key={`dot-${i}`}
          cx={xScale(p.x)}
          cy={yScale(p.y)}
          r={2}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

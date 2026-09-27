import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { colors } from '../theme';
import { Text } from './Text';

export interface ChartData {
  indicator?: 'hfa' | 'wfa' | 'wfh';
  x_unit?: 'months' | 'cm';
  y_unit?: 'cm' | 'kg';
  /** x = age in months (hfa/wfa) or height in cm (wfh); older responses only carry age_months. */
  points: { x?: number; age_months: number; value: number; z: number | null; measured_at?: string }[];
  reference: Record<string, [number, number][]>;
  projection: { age_months: number; expected_height_cm: number | null }[] | null;
  meaning?: string;
  details?: { label: string; z: number | null; class: string; reference: string };
}

export interface ChartLabels {
  child: string;
  average: string;
  lowerLimit: string;
  farBelow: string;
  projection: string;
  xAxis: string;
}

const xOf = (p: ChartData['points'][number]) => p.x ?? p.age_months;

const BAND_STYLE: Record<string, { color: string; dash?: string; label: string }> = {
  '2': { color: '#9CA3AF', dash: '4 4', label: '+2' },
  '0': { color: colors.ok, label: '0' },
  '-2': { color: colors.warn, label: '-2' },
  '-3': { color: colors.danger, label: '-3' },
};

export function GrowthChart({ data, labels }: { data: ChartData; labels?: ChartLabels }) {
  const byHeight = data.x_unit === 'cm';
  const [width, setWidth] = useState(320);
  const height = 240;
  const pad = { l: 38, r: 22, t: 12, b: 28 };

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const ages = data.points.map(xOf);
    const proj = byHeight ? [] : (data.projection ?? []).map((p) => p.age_months);
    const lo = Math.max(0, Math.floor(Math.min(...ages, ...(proj.length ? proj : ages)) - 3));
    const hi = byHeight ? Math.ceil(Math.max(...ages) + 3) : Math.min(60, Math.ceil(Math.max(...ages, ...proj) + 3));
    const inRange = (arr: [number, number][]) => arr.filter(([x]) => x >= lo && x <= hi).map(([, y]) => y);
    const ys = [
      ...inRange(data.reference['-3'] ?? []),
      ...inRange(data.reference['2'] ?? []),
      ...data.points.map((p) => p.value),
      ...(byHeight ? [] : (data.projection ?? []).map((p) => p.expected_height_cm ?? 0).filter(Boolean)),
    ];
    return { xMin: lo, xMax: Math.max(hi, lo + 6), yMin: Math.floor(Math.min(...ys) - 1), yMax: Math.ceil(Math.max(...ys) + 1) };
  }, [data, byHeight]);

  if (!data.points.length) return null;

  const sx = (x: number) => pad.l + ((x - xMin) / (xMax - xMin)) * (width - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');

  const last = data.points[data.points.length - 1];
  const projPts: [number, number][] = [[xOf(last), last.value]];
  if (!byHeight) (data.projection ?? []).forEach((p) => p.expected_height_cm && projPts.push([p.age_months, p.expected_height_cm]));

  const xTicks: number[] = [];
  const step = xMax - xMin > 24 ? 6 : 3;
  for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) xTicks.push(x);
  const yTicks: number[] = [];
  const ystep = yMax - yMin > 30 ? 10 : 5;
  for (let y = Math.ceil(yMin / ystep) * ystep; y <= yMax; y += ystep) yTicks.push(y);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        {yTicks.map((y) => (
          <G key={`y${y}`}>
            <Line x1={pad.l} x2={width - pad.r} y1={sy(y)} y2={sy(y)} stroke="#EEF2F0" />
            <SvgText x={pad.l - 6} y={sy(y) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
              {y}
            </SvgText>
          </G>
        ))}
        {xTicks.map((x) => (
          <SvgText key={`x${x}`} x={sx(x)} y={height - 8} fontSize={10} fill={colors.muted} textAnchor="middle">
            {x}
          </SvgText>
        ))}
        {Object.entries(BAND_STYLE).map(([z, s]) => {
          const pts = (data.reference[z] ?? []).filter(([x]) => x >= xMin && x <= xMax);
          if (!pts.length) return null;
          const end = pts[pts.length - 1];
          return (
            <G key={z}>
              <Path d={path(pts)} stroke={s.color} strokeWidth={1.5} strokeDasharray={s.dash} fill="none" />
              <SvgText x={sx(end[0]) + 3} y={sy(end[1]) + 3} fontSize={9} fill={s.color}>
                {s.label}
              </SvgText>
            </G>
          );
        })}
        {projPts.length > 1 && <Path d={path(projPts)} stroke={colors.info} strokeWidth={2} strokeDasharray="6 4" fill="none" />}
        <Path d={path(data.points.map((p) => [xOf(p), p.value]))} stroke={colors.primaryDark} strokeWidth={2.5} fill="none" />
        {data.points.map((p, i) => (
          <Circle
            key={i}
            cx={sx(xOf(p))}
            cy={sy(p.value)}
            r={4}
            fill={p.z !== null && p.z < -2 ? colors.danger : colors.primary}
            stroke="#fff"
            strokeWidth={1.5}
          />
        ))}
      </Svg>
      {labels?.xAxis ? <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>{labels.xAxis}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        <Legend color={colors.primaryDark} text={labels?.child ?? 'Anak / Child'} />
        <Legend color={colors.ok} text={labels?.average ?? '0 SD'} />
        <Legend color={colors.warn} text={labels?.lowerLimit ?? '-2 SD'} />
        <Legend color={colors.danger} text={labels?.farBelow ?? '-3 SD'} />
        {!byHeight && data.projection?.length ? <Legend color={colors.info} text={labels?.projection ?? 'Proyeksi / Projection'} dashed /> : null}
      </View>
    </View>
  );
}

function Legend({ color, text, dashed }: { color: string; text: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 16, height: 0, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Text style={{ fontSize: 12, color: colors.muted }}>{text}</Text>
    </View>
  );
}

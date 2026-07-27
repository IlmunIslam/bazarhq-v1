import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

// Minimal area/line chart on react-native-svg (Expo Go safe — no native chart
// lib). Mirrors the web's 30-day revenue AreaChart in the app's dark/minimal
// look. Width is measured via onLayout so it fills its container responsively.

interface Point {
  date: string; // YYYY-MM-DD
  revenue: number;
}

const HEIGHT = 180;
const PAD_T = 12;
const PAD_B = 8;
const PAD_X = 4;

export default function RevenueChart({ data }: { data: Point[] }) {
  const [width, setWidth] = useState(0);

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No revenue data yet.</Text>
      </View>
    );
  }

  const innerW = Math.max(width - PAD_X * 2, 1);
  const innerH = HEIGHT - PAD_T - PAD_B;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const n = data.length;

  const x = (i: number) => PAD_X + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD_T + innerH - (v / max) * innerH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.revenue).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(n - 1).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} Z`;

  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <View>
      <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0f172a" stopOpacity={0.18} />
                <Stop offset="1" stopColor="#0f172a" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#revGrad)" />
            <Path d={line} stroke="#0f172a" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        )}
      </View>
      <View style={styles.xLabels}>
        {labelIdx.map(i => (
          <Text key={i} style={styles.xLabel}>
            {data[i].date.slice(5)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: PAD_X },
  xLabel: { fontSize: 11, color: '#9ca3af' },
});

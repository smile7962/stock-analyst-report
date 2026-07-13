/**
 * 실적 추이용 그룹 막대 차트 (인라인 SVG, 의존성 없음).
 *
 * dataviz 스킬 준수: 형태=시간에 따른 크기 → 막대. 색은 정체성(카테고리) 기준으로
 * 고정 순서 슬롯 배정(매출=slot1, 영업이익=slot2, CVD 검증 통과). 단일 축(모두 원 단위),
 * 이중축 금지. 범례 상시, 그리드/기준선은 배경으로 물러남. 정확한 수치는 함께 놓인 표가
 * 제공(경감 규칙 충족)하므로 막대마다 값 라벨을 찍지 않는다.
 *
 * 음수(적자 분기/연도)는 0 기준선 아래로 내려가는 막대로 표현한다.
 * 프린트/다크 모드 색상은 globals.css 의 --chart-* 변수로 전환된다.
 */
export interface BarSeries {
  name: string;
  /** CSS 색상 변수 (예: "var(--chart-revenue)") */
  color: string;
  values: (number | null)[];
}

const H = 150; // 뷰박스 높이(px). 폭은 컨테이너에 맞춰 100%
const PAD_TOP = 10;
const PAD_BOTTOM = 20; // 카테고리 라벨 영역
const BAR_GAP = 2; // 인접 막대 사이 표면 간격(스킬 규칙)
const GROUP_PAD = 0.28; // 그룹 사이 여백 비율

export default function BarChart({
  categories,
  series,
  width = 340,
}: {
  categories: string[];
  series: BarSeries[];
  width?: number;
}) {
  const n = categories.length;
  if (!n || !series.length) return null;

  const nums = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const dataMax = Math.max(0, ...nums);
  const dataMin = Math.min(0, ...nums);
  const span = dataMax - dataMin || 1;

  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const yOf = (v: number) => PAD_TOP + ((dataMax - v) / span) * plotH;
  const zeroY = yOf(0);

  const groupW = width / n;
  const innerW = groupW * (1 - GROUP_PAD);
  const barW = Math.max(2, (innerW - BAR_GAP * (series.length - 1)) / series.length);

  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="실적 추이 막대 그래프 (정확한 수치는 아래 표 참고)"
      className="block"
    >
      {/* 0 기준선 */}
      <line
        x1={0}
        x2={width}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--chart-baseline)"
        strokeWidth={1}
      />
      {categories.map((cat, i) => {
        const gx = i * groupW + (groupW - innerW) / 2;
        return (
          <g key={cat}>
            {series.map((s, j) => {
              const v = s.values[i];
              if (v == null) return null;
              const x = gx + j * (barW + BAR_GAP);
              const y = yOf(Math.max(v, 0));
              const h = Math.abs(yOf(v) - zeroY);
              return (
                <rect
                  key={s.name}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, 0.5)}
                  rx={2}
                  fill={s.color}
                />
              );
            })}
            <text
              x={i * groupW + groupW / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={10}
              fill="var(--foreground)"
              opacity={0.55}
            >
              {cat}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 차트 범례 (색상 칩 + 계열명). 텍스트는 잉크색, 색은 칩에만 (스킬 규칙) */
export function ChartLegend({ series }: { series: BarSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5 text-xs opacity-70">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

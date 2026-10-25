import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import langDE from 'echarts/i18n/langDE-obj.js';
import type { EChartsCoreOption } from 'echarts/core';
import { aggregate, breakGaps, type ConcreteResolution, type Point } from './aggregate';
import { humidityUnits, type HumidityMode } from './humidity';
import { lang, locale, t } from './i18n';
import { sunTimes, type Night } from './sun';
import type { Location } from './types';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);
echarts.registerLocale('DE', langDE);

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  /** Reference series (weather): neutral, thinner, drawn behind the measurements. */
  reference: boolean;
  temp: Point[];
  hum: Point[];
}

export interface ChartInput {
  series: ChartSeries[];
  from: number;
  to: number;
  res: ConcreteResolution;
  humMode: HumidityMode;
  nights: Night[] | null;
  location: Location;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const fmt = (v: number, digits = 1) => v.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const time = (d: Date | null) => (d ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '–');

type Datum = [number, number | null, number?, number?];

/** Turns points into chart data at the requested resolution: [ts, value, min?, max?]. */
function prepare(points: Point[], res: ConcreteResolution): Datum[] {
  if (res === 'raw') {
    return breakGaps(points, (ts) => ({ ts, v: null })).map((p) => [p.ts, p.v]);
  }
  const buckets = aggregate(points, res);
  const data: Datum[] = buckets.map((b) => [b.ts, b.mean, b.min, b.max]);
  return breakGaps(
    data.map((d) => ({ ts: d[0], d })),
    (ts) => ({ ts, d: [ts, null] as Datum }),
    res === 'hour' ? 3 * 3_600_000 : 2.5 * 86_400_000,
  ).map((x) => x.d);
}

export class Chart {
  private chart?: echarts.ECharts;
  private chartLang?: string;
  private observer?: ResizeObserver;
  private last?: ChartInput;

  constructor(private el: HTMLElement) {}

  /** Created lazily: the container is hidden (zero size) until the first data arrives. */
  /** Recreated when the language changes, because ECharts fixes its locale at init. */
  private instance(): echarts.ECharts {
    if (this.chart && this.chartLang !== lang()) {
      this.chart.dispose();
      this.chart = undefined;
    }
    if (!this.chart) {
      this.chartLang = lang();
      this.chart = echarts.init(this.el, undefined, { renderer: 'canvas', locale: lang().toUpperCase() });
      this.observer ??= new ResizeObserver(() => this.chart?.resize());
      this.observer.observe(this.el);
    }
    return this.chart;
  }

  rerender() {
    if (this.last) this.render(this.last);
  }

  render(input: ChartInput) {
    this.last = input;
    const ink = token('--text-secondary');
    const muted = token('--text-muted');
    const grid = token('--grid');
    const axis = token('--axis');
    const surface = token('--surface-1');
    const night = token('--night');
    const humUnit = humidityUnits[input.humMode];
    const humAxis = { relative: t().axisHumRelative, absolute: t().axisHumAbsolute, dewpoint: t().axisHumDewpoint }[input.humMode];
    const humDigits = input.humMode === 'relative' ? 0 : 1;
    const series: any[] = [];

    for (const s of input.series) {
      ([['temp', 0], ['hum', 1]] as const).forEach(([field, axisIndex]) => {
        const data = prepare(s[field], input.res);
        series.push({
          id: `${s.id}:${field}`,
          name: s.name,
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data,
          showSymbol: false,
          symbolSize: 8,
          sampling: input.res === 'raw' ? 'lttb' : undefined,
          connectNulls: false,
          lineStyle: { width: s.reference ? 1.5 : 2, color: s.color, opacity: s.reference ? 0.8 : 1 },
          itemStyle: { color: s.color, borderColor: surface, borderWidth: 2 },
          emphasis: { disabled: true },
          z: s.reference ? 2 : 3,
        });
        if (input.res === 'day') {
          // Min–max band: invisible base at min, stacked area of (max - min) on top.
          const stack = `${s.id}:${field}:band`;
          const common = {
            name: s.name,
            type: 'line',
            xAxisIndex: axisIndex,
            yAxisIndex: axisIndex,
            stack,
            showSymbol: false,
            silent: true,
            connectNulls: false,
            lineStyle: { opacity: 0 },
            emphasis: { disabled: true },
            tooltip: { show: false },
            z: 1,
          };
          series.push({ ...common, id: `band:${stack}:lo`, data: data.map((d) => [d[0], d[2] ?? null]) });
          series.push({
            ...common,
            id: `band:${stack}:hi`,
            data: data.map((d) => [d[0], d[2] !== undefined && d[3] !== undefined ? d[3] - d[2] : null]),
            areaStyle: { color: s.color, opacity: s.reference ? 0.1 : 0.16 },
          });
        }
      });
    }

    if (input.nights) {
      for (const axisIndex of [0, 1]) {
        series.push({
          id: `nights:${axisIndex}`,
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: [],
          silent: true,
          tooltip: { show: false },
          markArea: {
            silent: true,
            itemStyle: { color: night },
            data: input.nights.map((n) => [{ xAxis: n.from }, { xAxis: n.to }]),
          },
        });
      }
    }

    const yAxis = (name: string) => ({
      type: 'value',
      scale: true,
      name,
      nameLocation: 'end',
      nameGap: 12,
      nameTextStyle: { color: ink, align: 'left', fontWeight: 600, padding: [0, 0, 0, -36] },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: grid } },
      axisLine: { show: false },
      axisTick: { show: false },
    });
    const xAxis = (index: number) => ({
      type: 'time',
      gridIndex: index,
      min: input.from,
      max: input.to,
      axisLine: { lineStyle: { color: axis } },
      axisTick: { show: false },
      axisLabel: { show: index === 1, color: muted, fontSize: 11, hideOverlap: true },
      splitLine: { show: false },
    });

    const option: EChartsCoreOption = {
      animation: false,
      textStyle: { fontFamily: token('--font') },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 14,
        itemHeight: 4,
        textStyle: { color: ink },
        data: input.series.map((s) => s.name),
      },
      grid: [
        { left: 48, right: 16, top: 64, bottom: '53%' },
        { left: 48, right: 16, top: '55%', bottom: 72 },
      ],
      xAxis: [xAxis(0), xAxis(1)],
      yAxis: [
        { ...yAxis(t().axisTemp), gridIndex: 0 },
        { ...yAxis(humAxis), gridIndex: 1 },
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: axis } },
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1] },
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          bottom: 12,
          height: 24,
          borderColor: grid,
          fillerColor: 'rgba(42,120,214,0.10)',
          handleStyle: { color: surface, borderColor: axis },
          moveHandleStyle: { color: axis },
          textStyle: { color: muted },
          dataBackground: { lineStyle: { color: axis }, areaStyle: { color: grid } },
          labelFormatter: (v: number) =>
            new Date(v).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' }),
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: surface,
        borderColor: grid,
        textStyle: { color: token('--text-primary'), fontSize: 12 },
        axisPointer: { type: 'line' },
        formatter: (params: any[]) => this.tooltip(params, input, humDigits, humUnit),
      },
      series,
    };
    this.instance().setOption(option, { notMerge: true });
  }

  private tooltip(params: any[], input: ChartInput, humDigits: number, humUnit: string): string {
    const visible = params.filter((p) => !String(p.seriesId).startsWith('band:') && p.value?.[1] != null);
    if (!params.length) return '';
    const ts: number = params[0].axisValue;
    const d = new Date(ts);
    const head =
      input.res === 'day'
        ? d.toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
        : d.toLocaleString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const sun = sunTimes(ts, input.location.lat, input.location.lon);
    const isTemp = (p: any) => String(p.seriesId).endsWith(':temp');
    const row = (p: any) => {
      const [, v, min, max] = p.value as Datum;
      const digits = isTemp(p) ? 1 : humDigits;
      const unit = isTemp(p) ? '°C' : humUnit;
      const range = input.res === 'day' && min !== undefined && max !== undefined ? ` <span class="tt-muted">(${fmt(min, digits)} – ${fmt(max, digits)})</span>` : '';
      return `<div class="tt-row"><span class="tt-dot" style="background:${p.color}"></span><span>${p.seriesName}</span><b>${fmt(v as number, digits)} ${unit}</b>${range}</div>`;
    };
    const temps = visible.filter(isTemp).map(row).join('');
    const hums = visible.filter((p) => !isTemp(p)).map(row).join('');
    return (
      `<div class="tt"><div class="tt-head">${head}</div>` +
      (temps ? `<div class="tt-group">${temps}</div>` : '') +
      (hums ? `<div class="tt-group">${hums}</div>` : '') +
      `<div class="tt-sun">${t().sunrise} ${time(sun.sunrise)} · ${t().sunset} ${time(sun.sunset)}</div></div>`
    );
  }
}

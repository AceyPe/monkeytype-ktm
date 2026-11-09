import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
  type ChartDataset,
  type Plugin,
} from "chart.js";
import { format } from "date-fns";
import type { AnalyticsDashboardData } from "@monkeytype/contracts/analytics";
import * as ThemeColors from "./theme-colors";
import { blendTwoHexColors } from "../utils/colors";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
);

export type AnalyticsDevice = "desktop" | "mobile";

type ThemePalette = {
  bg: string;
  main: string;
  caret: string;
  sub: string;
  subAlt: string;
  text: string;
  error: string;
  errorExtra: string;
  colorfulError: string;
  colorfulErrorExtra: string;
};

type AnalyticsView = {
  data: AnalyticsDashboardData;
  device: AnalyticsDevice;
};

let currentView: AnalyticsView | undefined;
let visitorsChart: Chart<"bar"> | undefined;
let trafficChart: Chart<"doughnut"> | undefined;
let returningChart: Chart<"doughnut"> | undefined;
let labelColor = "#d1d0c5";

const barValueLabels: Plugin<"bar"> = {
  id: "analyticsBarValueLabels",
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);
    if (dataset === undefined) return;
    const { ctx } = chart;
    meta.data.forEach((bar, index) => {
      const value = dataset.data[index];
      if (typeof value !== "number") return;
      ctx.save();
      ctx.fillStyle = labelColor;
      ctx.font = `8px ${Chart.defaults.font.family ?? "sans-serif"}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(value.toLocaleString(), bar.x, bar.y - 2);
      ctx.restore();
    });
  },
};

const sliceLabels: Plugin<"doughnut"> = {
  id: "analyticsSliceLabels",
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);
    const labels = chart.data.labels ?? [];
    if (dataset === undefined) return;
    const { ctx } = chart;
    meta.data.forEach((element, index) => {
      const sweep = arcSweep(element);
      if (sweep === undefined || sweep < 0.35) return;
      const label = labels[index];
      if (typeof label !== "string" || label === "") return;
      const position = element.tooltipPosition();
      ctx.save();
      ctx.fillStyle = labelColor;
      ctx.font = `12px ${Chart.defaults.font.family ?? "sans-serif"}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(truncate(label, 18), position.x, position.y);
      ctx.restore();
    });
  },
};

function arcSweep(element: unknown): number | undefined {
  if (typeof element !== "object" || element === null) return undefined;
  if (!("startAngle" in element) || !("endAngle" in element)) return undefined;
  const { startAngle, endAngle } = element;
  if (typeof startAngle !== "number" || typeof endAngle !== "number") {
    return undefined;
  }
  return Math.abs(endAngle - startAngle);
}

function panel(): JQuery {
  return $(".page.pageDashboard .analyticsPanel");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseAnalyticsDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const year = match?.[1];
  const month = match?.[2];
  const day = match?.[3];
  if (year === undefined || month === undefined || day === undefined) {
    return new Date(value);
  }
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
}

function isSafePath(path: string): boolean {
  if (path === "Unknown" || path === "") return false;
  if (path.startsWith("/") && !path.startsWith("//")) return true;
  return path.startsWith("https://") || path.startsWith("http://");
}

function referrerHref(referrer: string): string | undefined {
  if (referrer === "Direct" || referrer === "Unknown" || referrer === "") {
    return undefined;
  }
  if (/^https?:\/\//i.test(referrer)) {
    try {
      const url = new URL(referrer);
      if (url.protocol === "http:" || url.protocol === "https:")
        return url.href;
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (/^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(referrer)) {
    return `https://${referrer}`;
  }
  return undefined;
}

function linkedLabel(
  label: string,
  href: string | undefined,
  icon: string,
): string {
  const text = `<span class="truncate">${escapeHtml(label)}</span>`;
  if (href === undefined) {
    return `<span class="mutedLink">${text}</span>`;
  }
  const iconHtml =
    icon === "" ? "" : `<i class="fas ${icon}" aria-hidden="true"></i>`;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}${iconHtml}</a>`;
}

function tableCard(options: {
  title: string;
  description: string;
  labelHeader: string;
  valueHeader: string;
  rows: string;
  emptyMessage: string;
  limit: number;
  table: string;
}): string {
  const body =
    options.rows === ""
      ? `<p class="emptyNote">${escapeHtml(options.emptyMessage)}</p>`
      : `<table class="analyticsTable">
          <thead>
            <tr>
              <th>${escapeHtml(options.labelHeader)}</th>
              <th class="numeric">${escapeHtml(options.valueHeader)}</th>
            </tr>
          </thead>
          <tbody>${options.rows}</tbody>
        </table>
        <div class="analyticsCardFooter">
          <button type="button" class="analyticsShowMore" data-table="${options.table}">
            ${options.limit === 10 ? "Show More" : "Show Less"}
          </button>
        </div>`;

  return `<section class="analyticsCard">
    <header class="analyticsCardHeader">
      <h2>${escapeHtml(options.title)}</h2>
      <p>${escapeHtml(options.description)}</p>
    </header>
    <div class="analyticsCardBody">${body}</div>
  </section>`;
}

function chartPalette(colors: ThemePalette): string[] {
  return [
    colors.main,
    colors.text,
    colors.caret,
    colors.sub,
    colors.error,
    colors.colorfulError,
    blendTwoHexColors(colors.main, colors.text, 0.45),
    blendTwoHexColors(colors.main, colors.sub, 0.4),
    blendTwoHexColors(colors.text, colors.error, 0.45),
    blendTwoHexColors(colors.caret, colors.main, 0.5),
  ];
}

function displayUserType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatWelcome(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  if (first === undefined || first === "") return "Welcome back.";
  return `Welcome back, ${first}.`;
}

export function setRealtimeUsers(count: number): void {
  panel().find(".liveCount").text(count.toLocaleString());
}

export function destroyAnalyticsCharts(): void {
  visitorsChart?.destroy();
  trafficChart?.destroy();
  returningChart?.destroy();
  visitorsChart = undefined;
  trafficChart = undefined;
  returningChart = undefined;
  currentView = undefined;
}

function canvasOf(selector: string): HTMLCanvasElement | undefined {
  const canvas = panel().find(selector).get(0);
  return canvas instanceof HTMLCanvasElement ? canvas : undefined;
}

function tooltipStyle(colors: ThemePalette): {
  backgroundColor: string;
  titleColor: string;
  bodyColor: string;
  borderColor: string;
  borderWidth: number;
} {
  return {
    backgroundColor: colors.bg,
    titleColor: colors.text,
    bodyColor: colors.text,
    borderColor: colors.sub,
    borderWidth: 1,
  };
}

function syncVisitorsChart(view: AnalyticsView, colors: ThemePalette): void {
  const canvas = canvasOf(".visitorsChart");
  if (canvas === undefined) return;
  if (visitorsChart !== undefined && visitorsChart.canvas !== canvas) {
    visitorsChart.destroy();
    visitorsChart = undefined;
  }

  const labels = view.data.usersByDevice.map((point) => point.date);
  const values = view.data.usersByDevice.map((point) =>
    view.device === "desktop" ? point.desktop : point.mobile,
  );
  const color = view.device === "desktop" ? colors.main : colors.text;
  labelColor = colors.text;

  if (visitorsChart === undefined) {
    visitorsChart = new Chart(canvas, {
      type: "bar",
      plugins: [barValueLabels],
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: color,
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 16 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(colors),
            callbacks: {
              title: (items) => {
                const raw = items[0]?.label;
                if (raw === undefined) return "";
                return format(parseAnalyticsDate(raw), "MMM d, yyyy");
              },
              label: (item) => `Visitors: ${Number(item.raw).toLocaleString()}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: {
              color: colors.sub,
              maxRotation: 0,
              autoSkip: true,
              autoSkipPadding: 32,
              callback(value) {
                const raw = this.getLabelForValue(Number(value));
                return format(parseAnalyticsDate(raw), "MMM d");
              },
            },
          },
          y: {
            display: false,
            grid: {
              color: blendTwoHexColors(colors.sub, colors.bg, 0.72),
              drawBorder: false,
            },
            grace: "15%",
          },
        },
      },
    });
    return;
  }

  visitorsChart.data.labels = labels;
  const dataset = visitorsChart.data.datasets[0];
  if (dataset !== undefined) {
    dataset.data = values;
    dataset.backgroundColor = color;
  }
  if (visitorsChart.options.plugins?.tooltip !== undefined) {
    Object.assign(visitorsChart.options.plugins.tooltip, tooltipStyle(colors));
  }
  const xTicks = visitorsChart.options.scales?.["x"]?.ticks;
  if (xTicks !== undefined) xTicks.color = colors.sub;
  visitorsChart.update();
}

function syncDoughnut(
  current: Chart<"doughnut"> | undefined,
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  colors: ThemePalette,
): Chart<"doughnut"> {
  if (current !== undefined && current.canvas !== canvas) {
    current.destroy();
    current = undefined;
  }

  const backgroundColor = labels.map(
    (_, index) =>
      chartPalette(colors)[index % chartPalette(colors).length] ?? colors.main,
  );
  const dataset: ChartDataset<"doughnut", number[]> = {
    data: values,
    backgroundColor,
    borderColor: colors.subAlt,
    borderWidth: 2,
    hoverOffset: 4,
  };

  if (current === undefined) {
    return new Chart(canvas, {
      type: "doughnut",
      plugins: [sliceLabels],
      data: { labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: colors.text,
              boxWidth: 12,
              boxHeight: 12,
              padding: 12,
            },
          },
          tooltip: {
            ...tooltipStyle(colors),
            callbacks: {
              title: () => "",
              label: (item) =>
                `${item.label ?? ""}: ${Number(item.raw).toLocaleString()}`,
            },
          },
        },
      },
    });
  }

  current.data.labels = labels;
  current.data.datasets[0] = dataset;
  const legendLabels = current.options.plugins?.legend?.labels;
  if (legendLabels !== undefined) legendLabels.color = colors.text;
  if (current.options.plugins?.tooltip !== undefined) {
    Object.assign(current.options.plugins.tooltip, tooltipStyle(colors));
  }
  current.update();
  return current;
}

function syncPieCharts(view: AnalyticsView, colors: ThemePalette): void {
  const trafficCanvas = canvasOf(".trafficChart");
  const returningCanvas = canvasOf(".returningChart");
  const trafficEmpty = view.data.trafficSources.length === 0;
  const returningEmpty = view.data.newVsReturning.length === 0;

  panel().find(".trafficChartWrap").toggleClass("hidden", trafficEmpty);
  panel().find(".trafficEmpty").toggleClass("hidden", !trafficEmpty);
  panel().find(".returningChartWrap").toggleClass("hidden", returningEmpty);
  panel().find(".returningEmpty").toggleClass("hidden", !returningEmpty);
  panel().find(".trafficNote").toggleClass("hidden", trafficEmpty);

  if (!trafficEmpty && trafficCanvas !== undefined) {
    trafficChart = syncDoughnut(
      trafficChart,
      trafficCanvas,
      view.data.trafficSources.map((item) => item.channel),
      view.data.trafficSources.map((item) => item.users),
      colors,
    );
  }
  if (!returningEmpty && returningCanvas !== undefined) {
    returningChart = syncDoughnut(
      returningChart,
      returningCanvas,
      view.data.newVsReturning.map((item) => displayUserType(item.userType)),
      view.data.newVsReturning.map((item) => item.users),
      colors,
    );
  }
}

function renderTables(view: AnalyticsView, limits: AnalyticsLimits): void {
  const landings = view.data.topLandingPages
    .map(
      (page) => `<tr>
        <td>${linkedLabel(page.path, isSafePath(page.path) ? page.path : undefined, "fa-external-link-alt")}</td>
        <td class="numeric">${page.sessions.toLocaleString()}</td>
      </tr>`,
    )
    .join("");
  const referrers = view.data.topReferrers
    .map(
      (row) => `<tr>
        <td>${linkedLabel(row.referrer, referrerHref(row.referrer), "fa-link")}</td>
        <td class="numeric">${row.sessions.toLocaleString()}</td>
      </tr>`,
    )
    .join("");
  const pages = view.data.topPages
    .map((page) => {
      const label = page.title === "Unknown" ? page.path : page.title;
      return `<tr>
        <td>${linkedLabel(label, isSafePath(page.path) ? page.path : undefined, "fa-external-link-alt")}</td>
        <td class="numeric">${page.views.toLocaleString()}</td>
      </tr>`;
    })
    .join("");
  const countries = view.data.topCountries
    .map(
      (row) => `<tr>
        <td><span class="countryName">${escapeHtml(row.country)}</span></td>
        <td class="numeric">${row.users.toLocaleString()}</td>
      </tr>`,
    )
    .join("");

  panel()
    .find(".landingsHost")
    .html(
      tableCard({
        title: "Top Landing Pages",
        description: "Your site's main entry pages by sessions.",
        labelHeader: "Path",
        valueHeader: "Sessions",
        rows: landings,
        emptyMessage: "No data available.",
        limit: limits.landings,
        table: "landings",
      }),
    );
  panel()
    .find(".referrersHost")
    .html(
      tableCard({
        title: "Top Referrers",
        description: "Websites sending the most traffic to you.",
        labelHeader: "Website",
        valueHeader: "Sessions",
        rows: referrers,
        emptyMessage: "No referrer data available.",
        limit: limits.referrers,
        table: "referrers",
      }),
    );
  panel()
    .find(".pagesHost")
    .html(
      tableCard({
        title: "Top Pages",
        description: "Your most viewed pages by page views.",
        labelHeader: "Page",
        valueHeader: "Pageviews",
        rows: pages,
        emptyMessage: "No data available.",
        limit: limits.pages,
        table: "pages",
      }),
    );
  panel()
    .find(".countriesHost")
    .html(
      tableCard({
        title: "Users by Country",
        description: "Top countries sending you traffic.",
        labelHeader: "Country",
        valueHeader: "Users",
        rows: countries,
        emptyMessage: "No data available.",
        limit: limits.countries,
        table: "countries",
      }),
    );
}

export type AnalyticsLimits = {
  countries: number;
  pages: number;
  landings: number;
  referrers: number;
};

export async function renderAnalytics(
  view: AnalyticsView & {
    welcome: string;
    range: string;
    limits: AnalyticsLimits;
  },
): Promise<void> {
  currentView = view;
  const root = panel();
  root.find(".analyticsWelcome").text(view.welcome);
  root.find(".analyticsRange").val(view.range);
  root.find(".liveCount").text(view.data.realtimeUsers.toLocaleString());
  root.find("[data-kpi='users']").text(view.data.totalUsers.toLocaleString());
  root
    .find("[data-kpi='pageviews']")
    .text(view.data.totalPageViews.toLocaleString());
  root
    .find("[data-kpi='engagement']")
    .text(`${(view.data.engagementRate * 100).toFixed(1)}%`);
  root
    .find("[data-kpi='duration']")
    .text(formatDuration(view.data.averageSessionDuration));
  root.find(".deviceToggle").removeClass("active");
  root.find(`.deviceToggle[data-device='${view.device}']`).addClass("active");
  renderTables(view, view.limits);

  ThemeColors.update();
  const colors = await ThemeColors.getAll();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  if (currentView !== view) return;
  syncVisitorsChart(view, colors);
  syncPieCharts(view, colors);
  visitorsChart?.resize();
  trafficChart?.resize();
  returningChart?.resize();
}

export async function updateAnalyticsChartColors(): Promise<void> {
  if (currentView === undefined) return;
  ThemeColors.update();
  const colors = await ThemeColors.getAll();
  labelColor = colors.text;
  syncVisitorsChart(currentView, colors);
  syncPieCharts(currentView, colors);
}

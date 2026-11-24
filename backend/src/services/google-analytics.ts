import { BetaAnalyticsDataClient, protos } from "@google-analytics/data";
import { AnalyticsDashboardData } from "@monkeytype/contracts/analytics";
import { readFileSync } from "fs";
import getFirebaseAdmin, {
  getServiceAccountPath,
} from "../init/firebase-admin";
import MonkeyError, { getErrorMessage } from "../utils/error";
import Logger from "../utils/logger";

/** Same Firebase project as frontend/src/ts/constants/firebase-config.ts. */
const FIREBASE_PROJECT_ID = "ieee-ktm-f0742";
const CACHE_DURATION_MS = 60 * 60 * 1000;

type ReportValue = { value?: string | null };
type ReportRow = {
  dimensionValues?: ReportValue[] | null;
  metricValues?: ReportValue[] | null;
};
type ReportResponse = {
  rows?: ReportRow[] | null;
};

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

let analyticsClient: BetaAnalyticsDataClient | undefined;
let propertyResource: Promise<string> | undefined;
const cache = new Map<string, CacheEntry>();

type FirebaseAnalyticsDetails = {
  analyticsProperty?: {
    id?: string;
  };
};

function serviceAccountPath(): string {
  const keyPath = getServiceAccountPath();
  if (keyPath === undefined) {
    throw new MonkeyError(
      400,
      `Firebase credentials for project ${FIREBASE_PROJECT_ID} were not found. Place the service account key at backend/src/credentials/serviceAccountKey.json.`,
    );
  }
  return keyPath;
}

function readServiceAccount(keyPath: string): {
  project_id?: string;
  client_email?: string;
} {
  try {
    return JSON.parse(readFileSync(keyPath, "utf8")) as {
      project_id?: string;
      client_email?: string;
    };
  } catch {
    throw new MonkeyError(
      400,
      `The Firebase service account key for project ${FIREBASE_PROJECT_ID} could not be read.`,
    );
  }
}

function assertServiceAccountProject(keyPath: string): void {
  const projectId = readServiceAccount(keyPath).project_id;
  if (projectId !== FIREBASE_PROJECT_ID) {
    throw new MonkeyError(
      400,
      `The Firebase service account is for "${projectId ?? "unknown"}", but this site's Analytics history is in project ${FIREBASE_PROJECT_ID}.`,
    );
  }
}

async function firebaseAccessToken(): Promise<string> {
  const credential = getFirebaseAdmin().app().options.credential;
  if (credential === undefined) {
    throw new MonkeyError(
      400,
      `Firebase Admin for project ${FIREBASE_PROJECT_ID} has no credentials.`,
    );
  }
  const token = await credential.getAccessToken();
  return token.access_token;
}

async function resolveFirebaseAnalyticsProperty(): Promise<string> {
  const keyPath = serviceAccountPath();
  assertServiceAccountProject(keyPath);
  const response = await fetch(
    `https://firebase.googleapis.com/v1beta1/projects/${FIREBASE_PROJECT_ID}/analyticsDetails`,
    {
      headers: { Authorization: `Bearer ${await firebaseAccessToken()}` },
    },
  );

  if (response.status === 404) {
    throw new MonkeyError(
      400,
      `Firebase project ${FIREBASE_PROJECT_ID} is not linked to Google Analytics, so there is no existing analytics history to read.`,
    );
  }
  if (!response.ok) {
    Logger.error(
      `Firebase analyticsDetails failed: ${response.status} ${await response.text()}`,
    );
    const email =
      readServiceAccount(keyPath).client_email ??
      "the Firebase service account";
    throw new MonkeyError(
      400,
      `Google denied Analytics access for ${email}. In Google Cloud IAM for project ${FIREBASE_PROJECT_ID}, grant that account the role Firebase Analytics Viewer, then refresh.`,
    );
  }

  const details = (await response.json()) as FirebaseAnalyticsDetails;
  const propertyId = details.analyticsProperty?.id?.replace(
    /^properties\//,
    "",
  );
  if (propertyId === undefined || propertyId.trim() === "") {
    throw new MonkeyError(
      400,
      `Firebase project ${FIREBASE_PROJECT_ID} has no Analytics property.`,
    );
  }
  return `properties/${propertyId}`;
}

async function propertyName(): Promise<string> {
  propertyResource ??= resolveFirebaseAnalyticsProperty().catch(
    (error: unknown) => {
      propertyResource = undefined;
      throw error;
    },
  );
  return propertyResource;
}

function getClient(): BetaAnalyticsDataClient {
  if (analyticsClient === undefined) {
    const keyFilename = serviceAccountPath();
    assertServiceAccountProject(keyFilename);
    analyticsClient = new BetaAnalyticsDataClient({ keyFilename });
  }
  return analyticsClient;
}

async function runReport(
  request: protos.google.analytics.data.v1beta.IRunReportRequest,
): Promise<ReportResponse | null> {
  try {
    const [response] = await getClient().runReport({
      ...request,
      property: await propertyName(),
    });
    return response ?? null;
  } catch (error) {
    if (error instanceof MonkeyError) throw error;
    Logger.error(
      `Error fetching Google Analytics data: ${getErrorMessage(error) ?? "unknown error"}`,
    );
    return null;
  }
}

async function cached<T>(
  key: string,
  fallback: T,
  load: () => Promise<T | undefined>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing !== undefined && existing.expiresAt > Date.now()) {
    return existing.value as T;
  }

  const value = await load();
  if (value === undefined) return fallback;

  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_DURATION_MS,
  });
  return value;
}

function rowsOf(response: ReportResponse | null): ReportRow[] | undefined {
  if (response === null) return undefined;
  return response.rows ?? [];
}

function dimensionValue(row: ReportRow, index: number): string | undefined {
  const value = row.dimensionValues?.[index]?.value;
  if (value === undefined || value === null || value.trim() === "") {
    return undefined;
  }
  return value;
}

function metricNumber(row: ReportRow, index: number): number {
  const value = row.metricValues?.[index]?.value;
  if (value === undefined || value === null || value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function knownLabel(value: string | undefined, fallback = "Unknown"): string {
  if (value === undefined || value === "(not set)") return fallback;
  return value;
}

function singleMetric(response: ReportResponse | null): number | undefined {
  const rows = rowsOf(response);
  if (rows === undefined) return undefined;
  const row = rows[0];
  if (row === undefined) return 0;
  return metricNumber(row, 0);
}

export async function getTotalUsers(startDate: string): Promise<number> {
  return cached(`ga_total_users_${startDate}`, 0, async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      metrics: [{ name: "activeUsers" }],
    });
    return singleMetric(response);
  });
}

export async function getPageViews(startDate: string): Promise<number> {
  return cached(`ga_page_views_${startDate}`, 0, async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      metrics: [{ name: "screenPageViews" }],
    });
    return singleMetric(response);
  });
}

export async function getUsersByDeviceAndDate(
  startDate: string,
): Promise<AnalyticsDashboardData["usersByDevice"]> {
  return cached(`ga_users_by_device_${startDate}`, [], async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "date" }, { name: "deviceCategory" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [
        { dimension: { orderType: "ALPHANUMERIC", dimensionName: "date" } },
      ],
    });
    const rows = rowsOf(response);
    if (rows === undefined) return undefined;

    const aggregated: Record<
      string,
      { date: string; desktop: number; mobile: number }
    > = {};

    for (const row of rows) {
      const rawDate = dimensionValue(row, 0);
      const device = dimensionValue(row, 1);
      if (
        rawDate === undefined ||
        rawDate.length !== 8 ||
        device === undefined
      ) {
        continue;
      }

      const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      aggregated[formattedDate] ??= {
        date: formattedDate,
        desktop: 0,
        mobile: 0,
      };

      const users = metricNumber(row, 0);
      if (device === "desktop") {
        aggregated[formattedDate].desktop += users;
      } else if (device === "mobile" || device === "tablet") {
        aggregated[formattedDate].mobile += users;
      }
    }

    return Object.values(aggregated);
  });
}

export async function getTopPages(
  startDate: string,
  limit: number,
): Promise<AnalyticsDashboardData["topPages"]> {
  return cached(`ga_top_pages_${startDate}_${limit}`, [], async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit,
    });
    const rows = rowsOf(response);
    if (rows === undefined) return undefined;

    return rows.map((row) => ({
      path: knownLabel(dimensionValue(row, 0)),
      title: knownLabel(dimensionValue(row, 1)),
      views: metricNumber(row, 0),
    }));
  });
}

export async function getUsersByTrafficChannel(
  startDate: string,
): Promise<AnalyticsDashboardData["trafficSources"]> {
  return cached(`ga_traffic_channel_${startDate}`, [], async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    });
    const rows = rowsOf(response);
    if (rows === undefined) return undefined;

    return rows.map((row) => ({
      channel: knownLabel(dimensionValue(row, 0)),
      users: metricNumber(row, 0),
    }));
  });
}

export async function getUsersByCountry(
  startDate: string,
  limit: number,
): Promise<AnalyticsDashboardData["topCountries"]> {
  return cached(`ga_users_by_country_${startDate}_${limit}`, [], async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit,
    });
    const rows = rowsOf(response);
    if (rows === undefined) return undefined;

    return rows.map((row) => ({
      country: knownLabel(dimensionValue(row, 0)),
      users: metricNumber(row, 0),
    }));
  });
}

export async function getEngagementRate(startDate: string): Promise<number> {
  return cached(`ga_engagement_rate_${startDate}`, 0, async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      metrics: [{ name: "engagementRate" }],
    });
    return singleMetric(response);
  });
}

export async function getAverageSessionDuration(
  startDate: string,
): Promise<number> {
  return cached(`ga_avg_session_duration_${startDate}`, 0, async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      metrics: [{ name: "averageSessionDuration" }],
    });
    return singleMetric(response);
  });
}

export async function getUsersNewVsReturning(
  startDate: string,
): Promise<AnalyticsDashboardData["newVsReturning"]> {
  return cached(`ga_new_vs_returning_${startDate}`, [], async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    });
    const rows = rowsOf(response);
    if (rows === undefined) return undefined;

    return rows.map((row) => ({
      userType: (dimensionValue(row, 0) ?? "Unknown").replace(" user", ""),
      users: metricNumber(row, 0),
    }));
  });
}

export async function getTopLandingPages(
  startDate: string,
  limit: number,
): Promise<AnalyticsDashboardData["topLandingPages"]> {
  return cached(`ga_top_landing_pages_${startDate}_${limit}`, [], async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit,
    });
    const rows = rowsOf(response);
    if (rows === undefined) return undefined;

    return rows.map((row) => ({
      path: knownLabel(dimensionValue(row, 0)),
      sessions: metricNumber(row, 0),
    }));
  });
}

export async function getTopReferrers(
  startDate: string,
  limit: number,
): Promise<AnalyticsDashboardData["topReferrers"]> {
  return cached(`ga_top_referrers_${startDate}_${limit}`, [], async () => {
    const response = await runReport({
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "pageReferrer" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: limit + 5,
    });
    const rows = rowsOf(response);
    if (rows === undefined) return undefined;

    return rows
      .map((row) => ({
        referrer: knownLabel(dimensionValue(row, 0), "Direct"),
        sessions: metricNumber(row, 0),
      }))
      .filter((row) => row.referrer !== "Direct")
      .slice(0, limit);
  });
}

export async function getActiveUsersRightNow(): Promise<number> {
  try {
    const [response] = await getClient().runRealtimeReport({
      property: await propertyName(),
      metrics: [{ name: "activeUsers" }],
    });
    return singleMetric(response ?? null) ?? 0;
  } catch (error) {
    if (error instanceof MonkeyError) throw error;
    Logger.error(
      `Error fetching real-time data: ${getErrorMessage(error) ?? "unknown error"}`,
    );
    return 0;
  }
}

export async function getAnalyticsDashboard(input: {
  range: string;
  limitCountries: number;
  limitPages: number;
  limitLandings: number;
  limitReferrers: number;
}): Promise<AnalyticsDashboardData> {
  const range = input.range;
  const [
    totalUsers,
    totalPageViews,
    usersByDevice,
    trafficSources,
    engagementRate,
    averageSessionDuration,
    newVsReturning,
    realtimeUsers,
    topCountries,
    topPages,
    topLandingPages,
    topReferrers,
  ] = await Promise.all([
    getTotalUsers(range),
    getPageViews(range),
    getUsersByDeviceAndDate(range),
    getUsersByTrafficChannel(range),
    getEngagementRate(range),
    getAverageSessionDuration(range),
    getUsersNewVsReturning(range),
    getActiveUsersRightNow(),
    getUsersByCountry(range, input.limitCountries),
    getTopPages(range, input.limitPages),
    getTopLandingPages(range, input.limitLandings),
    getTopReferrers(range, input.limitReferrers),
  ]);

  return {
    totalUsers,
    totalPageViews,
    engagementRate,
    averageSessionDuration,
    realtimeUsers,
    usersByDevice,
    trafficSources,
    newVsReturning,
    topCountries,
    topPages,
    topLandingPages,
    topReferrers,
  };
}

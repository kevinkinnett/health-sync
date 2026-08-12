import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AnalyticsLayout } from "./components/AnalyticsLayout";

const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Readiness = lazy(() => import("./pages/Readiness").then((m) => ({ default: m.Readiness })));
const Timeline = lazy(() => import("./pages/Timeline").then((m) => ({ default: m.Timeline })));
const Ingest = lazy(() => import("./pages/Ingest").then((m) => ({ default: m.Ingest })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const ApiConsole = lazy(() => import("./pages/ApiConsole").then((m) => ({ default: m.ApiConsole })));
const Insights = lazy(() => import("./pages/Insights").then((m) => ({ default: m.Insights })));
const Supplements = lazy(() => import("./pages/Supplements").then((m) => ({ default: m.Supplements })));
const Medications = lazy(() => import("./pages/Medications").then((m) => ({ default: m.Medications })));
const Alerts = lazy(() => import("./pages/Alerts").then((m) => ({ default: m.Alerts })));
const AnalyticsOverview = lazy(() => import("./pages/analytics/Overview").then((m) => ({ default: m.AnalyticsOverview })));
const AnalyticsActivity = lazy(() => import("./pages/analytics/Activity").then((m) => ({ default: m.AnalyticsActivity })));
const AnalyticsSleep = lazy(() => import("./pages/analytics/Sleep").then((m) => ({ default: m.AnalyticsSleep })));
const AnalyticsHeartRate = lazy(() => import("./pages/analytics/HeartRate").then((m) => ({ default: m.AnalyticsHeartRate })));
const AnalyticsHrv = lazy(() => import("./pages/analytics/Hrv").then((m) => ({ default: m.AnalyticsHrv })));
const AnalyticsWeight = lazy(() => import("./pages/analytics/Weight").then((m) => ({ default: m.AnalyticsWeight })));
const AnalyticsExercises = lazy(() => import("./pages/analytics/Exercises").then((m) => ({ default: m.AnalyticsExercises })));
const AnalyticsVitals = lazy(() => import("./pages/analytics/Vitals").then((m) => ({ default: m.AnalyticsVitals })));
const AnalyticsEightSleep = lazy(() => import("./pages/analytics/EightSleep").then((m) => ({ default: m.AnalyticsEightSleep })));
const AnalyticsSensors = lazy(() => import("./pages/analytics/Sensors").then((m) => ({ default: m.AnalyticsSensors })));
const AnalyticsNutrition = lazy(() => import("./pages/analytics/Nutrition").then((m) => ({ default: m.AnalyticsNutrition })));
const AnalyticsRecords = lazy(() => import("./pages/analytics/Records").then((m) => ({ default: m.AnalyticsRecords })));
const AnalyticsCorrelations = lazy(() => import("./pages/analytics/Correlations").then((m) => ({ default: m.AnalyticsCorrelations })));
const AnalyticsSupplements = lazy(() => import("./pages/analytics/Supplements").then((m) => ({ default: m.AnalyticsSupplements })));
const AnalyticsMedications = lazy(() => import("./pages/analytics/Medications").then((m) => ({ default: m.AnalyticsMedications })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchInterval: 60_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<div role="status" className="px-6 py-20 text-center text-sm text-outline">Loading view…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/readiness" element={<Readiness />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/analytics" element={<AnalyticsLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AnalyticsOverview />} />
              <Route path="activity" element={<AnalyticsActivity />} />
              <Route path="sleep" element={<AnalyticsSleep />} />
              <Route path="heart-rate" element={<AnalyticsHeartRate />} />
              <Route path="hrv" element={<AnalyticsHrv />} />
              <Route path="weight" element={<AnalyticsWeight />} />
              <Route path="exercises" element={<AnalyticsExercises />} />
              <Route path="vitals" element={<AnalyticsVitals />} />
              <Route path="eight-sleep" element={<AnalyticsEightSleep />} />
              <Route path="sensors" element={<AnalyticsSensors />} />
              <Route path="nutrition" element={<AnalyticsNutrition />} />
              <Route path="records" element={<AnalyticsRecords />} />
              <Route path="correlations" element={<AnalyticsCorrelations />} />
              <Route path="supplements" element={<AnalyticsSupplements />} />
              <Route path="medications" element={<AnalyticsMedications />} />
            </Route>
            <Route
              path="/explore"
              element={<Navigate to="/analytics/overview" replace />}
            />
            <Route path="/ingest" element={<Ingest />} />
            <Route path="/supplements" element={<Supplements />} />
            <Route path="/medications" element={<Medications />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/api-console" element={<ApiConsole />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

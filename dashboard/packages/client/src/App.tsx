import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AnalyticsLayout } from "./components/AnalyticsLayout";
import { Dashboard } from "./pages/Dashboard";
import { Ingest } from "./pages/Ingest";
import { Settings } from "./pages/Settings";
import { ApiConsole } from "./pages/ApiConsole";
import { Insights } from "./pages/Insights";
import { Supplements } from "./pages/Supplements";
import { Medications } from "./pages/Medications";
import { AnalyticsOverview } from "./pages/analytics/Overview";
import { AnalyticsActivity } from "./pages/analytics/Activity";
import { AnalyticsSleep } from "./pages/analytics/Sleep";
import { AnalyticsHeartRate } from "./pages/analytics/HeartRate";
import { AnalyticsHrv } from "./pages/analytics/Hrv";
import { AnalyticsWeight } from "./pages/analytics/Weight";
import { AnalyticsExercises } from "./pages/analytics/Exercises";
import { AnalyticsRecords } from "./pages/analytics/Records";
import { AnalyticsCorrelations } from "./pages/analytics/Correlations";
import { AnalyticsSupplements } from "./pages/analytics/Supplements";
import { AnalyticsMedications } from "./pages/analytics/Medications";

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
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<AnalyticsLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AnalyticsOverview />} />
              <Route path="activity" element={<AnalyticsActivity />} />
              <Route path="sleep" element={<AnalyticsSleep />} />
              <Route path="heart-rate" element={<AnalyticsHeartRate />} />
              <Route path="hrv" element={<AnalyticsHrv />} />
              <Route path="weight" element={<AnalyticsWeight />} />
              <Route path="exercises" element={<AnalyticsExercises />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

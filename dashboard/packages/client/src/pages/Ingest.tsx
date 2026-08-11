import {
  ActiveJobsPanel,
  HistoricalCoveragePanel,
  JobHistoryPanel,
} from "../components/ingest/IngestJobs";
import {
  PartialRefreshWarning,
  PipelineHeader,
  PipelineNotices,
  ScheduleGrid,
} from "../components/ingest/IngestStatusCards";
import { useIngestPage } from "../components/ingest/useIngestPage";
import { PageError, PageSkeleton } from "../components/ui/PageState";

export function Ingest() {
  const page = useIngestPage();

  if (page.isLoading) return <PageSkeleton />;
  if (page.hasLoadFailure) {
    return (
      <PageError
        title="Vitalis couldn’t load pipeline status"
        message="The dashboard could not reach the ingestion overview. No jobs were started and your stored data has not been changed."
        onRetry={page.retry}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PipelineHeader
        databaseStatus={page.databaseStatus}
        windmillConnected={page.data.windmillConnected}
        refreshing={page.isRefreshing}
        onRefresh={page.refresh}
      />

      {page.hasPartialFailure && <PartialRefreshWarning />}
      <PipelineNotices status={page.data.status} state={page.data.state} />

      <ScheduleGrid
        schedules={page.data.schedules}
        windmillConnected={page.data.windmillConnected}
        triggeredSchedulePath={page.triggeredSchedulePath}
        triggerJobId={page.triggerJobId}
        triggerError={page.triggerError}
        isTriggering={page.isTriggering}
        onTrigger={page.triggerSchedule}
      />

      <ActiveJobsPanel
        jobs={page.data.activeJobs}
        runningCount={page.data.runningJobCount}
        scheduledCount={page.data.scheduledJobCount}
        queuedCount={page.data.queuedJobCount}
      />

      <HistoricalCoveragePanel state={page.data.state} />

      <JobHistoryPanel
        jobs={page.data.completedJobs}
        runs={page.data.runs}
        expandedJobs={page.expandedJobs}
        onToggle={page.toggleJob}
      />
    </div>
  );
}

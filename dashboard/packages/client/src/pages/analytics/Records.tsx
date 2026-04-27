import { useRecords } from "../../api/queries";
import { PersonalRecords } from "../../components/PersonalRecords";

export function AnalyticsRecords() {
  const records = useRecords();
  if (!records.data) return null;
  return <PersonalRecords data={records.data} />;
}

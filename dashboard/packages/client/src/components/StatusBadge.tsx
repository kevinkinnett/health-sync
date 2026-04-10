const statusStyles: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  running: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

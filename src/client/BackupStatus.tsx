export function BackupStatus({ value }: { value: string | null }) {
  const date = value ? new Date(value) : null;
  const timestamp =
    date && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : "Never";
  return <p className="backup-status">Last local backup: {timestamp}</p>;
}

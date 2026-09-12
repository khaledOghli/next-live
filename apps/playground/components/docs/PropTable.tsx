interface PropRow {
  name: string;
  type: string;
  default?: string;
  notes?: string;
}

interface PropTableProps {
  rows: PropRow[];
}

export function PropTable({ rows }: PropTableProps) {
  return (
    <div className="my-6 w-full overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">Prop</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Default</th>
            <th className="px-3 py-2 text-left font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-mono text-foreground">{row.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.type}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.default ?? '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

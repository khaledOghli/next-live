interface CompareRow {
  feature: string;
  reactLive: string;
  nextLive: string;
}

interface CompareTableProps {
  rows: CompareRow[];
}

export function CompareTable({ rows }: CompareTableProps) {
  return (
    <div className="my-6 w-full overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">Feature</th>
            <th className="px-3 py-2 text-left font-medium">react-live</th>
            <th className="px-3 py-2 text-left font-medium">next-live</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-medium">{row.feature}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.reactLive}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.nextLive}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CalloutProps {
  variant?: 'info' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
}

export function Callout({ variant = 'info', title, children }: CalloutProps) {
  return (
    <Alert variant={variant} className="my-6">
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

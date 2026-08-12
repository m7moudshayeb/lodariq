import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { DASHBOARD_PAGE_COPY, type DashboardViewId } from '../lib/dashboard-constants';
import { Button } from './ui/button';

export function DashboardPageHeader({
  view,
  action,
  editorial = false,
}: {
  view: DashboardViewId;
  action?: ReactNode;
  editorial?: boolean;
}): React.ReactElement {
  const copy = DASHBOARD_PAGE_COPY[view];
  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid max-w-2xl gap-2">
        <h1
          data-dashboard-view-heading
          tabIndex={-1}
          className={
            editorial
              ? 'font-serif text-4xl font-medium tracking-[-0.035em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 sm:text-5xl'
              : 'text-3xl font-semibold tracking-[-0.025em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4'
          }
        >
          {copy.title}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">{copy.description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function OpenInProductAction({ url }: { url: string }): React.ReactElement {
  if (!url) {
    return (
      <Button className="h-11" disabled type="button" variant="outline">
        Open in product
        <ExternalLink aria-hidden="true" />
      </Button>
    );
  }
  return (
    <Button asChild className="h-11" variant="outline">
      <a href={url} rel="noreferrer" target="_blank">
        Open in product
        <ExternalLink aria-hidden="true" />
      </a>
    </Button>
  );
}

export function DashboardEmptyView({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}): React.ReactElement {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="grid max-w-lg justify-items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
          {icon}
        </span>
        <div className="grid gap-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

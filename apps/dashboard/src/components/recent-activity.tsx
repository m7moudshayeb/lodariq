import { Clock3, FilePenLine, Globe2, Palette, ShieldCheck } from 'lucide-react';
import type { DashboardRecentActivity } from '../lib/view-model';
import { Button } from './ui/button';

interface RecentActivityProps {
  activities: DashboardRecentActivity[];
  onViewAll: () => void;
}

export function RecentActivity({ activities, onViewAll }: RecentActivityProps): React.ReactElement {
  return (
    <section aria-labelledby="recent-activity-heading" className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="recent-activity-heading" className="text-base font-semibold">
          Recent activity
        </h2>
        {activities.length ? (
          <Button
            className="h-11 px-2 text-xs sm:h-8"
            onClick={onViewAll}
            type="button"
            variant="ghost"
          >
            View all experiences
          </Button>
        ) : null}
      </div>

      {activities.length ? (
        <ol className="divide-y divide-border/70 border-y border-border/70">
          {activities.map((activity) => (
            <li
              className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={activity.id}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ActivityIcon activity={activity} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{activity.title}</span>
                  <span className="text-xs text-muted-foreground">{activity.typeLabel}</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 pl-11 text-xs text-muted-foreground sm:pl-0">
                <Clock3 aria-hidden="true" className="size-3.5" />
                {activity.detail}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="border-y border-dashed border-border py-8 text-sm text-muted-foreground">
          Document, release, and Brand activity will appear here.
        </div>
      )}
    </section>
  );
}

function ActivityIcon({ activity }: { activity: DashboardRecentActivity }): React.ReactElement {
  if (activity.kind === 'staging') {
    return <ShieldCheck aria-hidden="true" className="size-4" />;
  }
  if (activity.kind === 'production') {
    return <Globe2 aria-hidden="true" className="size-4" />;
  }
  if (activity.kind === 'brand') {
    return <Palette aria-hidden="true" className="size-4" />;
  }
  return <FilePenLine aria-hidden="true" className="size-4" />;
}

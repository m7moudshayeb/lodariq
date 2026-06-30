import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { Building2 } from 'lucide-react';
import { hasDashboardClerkProvider } from '../lib/clerk-config';

export function DashboardAuthControls(): React.ReactElement | null {
  if (!hasDashboardClerkProvider()) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
      <Building2 aria-hidden="true" className="size-4 text-muted-foreground" />
      <OrganizationSwitcher
        hidePersonal
        afterCreateOrganizationUrl="/"
        afterLeaveOrganizationUrl="/"
        afterSelectOrganizationUrl="/"
        appearance={{
          elements: {
            organizationSwitcherTrigger:
              'min-h-8 max-w-52 text-foreground hover:bg-accent hover:text-accent-foreground',
            organizationPreviewTextContainer: 'min-w-0',
            organizationPreviewMainIdentifier: 'truncate text-sm font-semibold',
          },
        }}
      />
      <UserButton
        appearance={{
          elements: {
            userButtonAvatarBox: 'size-8',
          },
        }}
      />
    </div>
  );
}

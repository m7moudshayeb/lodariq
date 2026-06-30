import { CreateOrganization, OrganizationSwitcher } from '@clerk/nextjs';
import { Building2 } from 'lucide-react';

export function OrganizationRequired(): React.ReactElement {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full gap-5 rounded-lg border border-border bg-surface p-6 shadow-sm shadow-black/20">
        <div className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Building2 aria-hidden="true" className="size-5" />
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Workspace</p>
          <h1 className="text-2xl font-semibold tracking-normal">Choose an organization</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            The API scopes documents by the active Clerk organization. Choose or create one before
            opening the control plane.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            appearance={{
              elements: {
                organizationSwitcherTrigger:
                  'min-h-9 border border-input bg-background px-3 text-foreground hover:bg-accent hover:text-accent-foreground',
              },
            }}
          />
          <CreateOrganization
            routing="hash"
            afterCreateOrganizationUrl="/"
            appearance={{
              elements: {
                cardBox: 'shadow-none border border-border bg-card',
                formButtonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
              },
            }}
          />
        </div>
      </section>
    </main>
  );
}

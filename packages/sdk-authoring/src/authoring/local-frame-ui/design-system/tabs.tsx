import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export interface AuthoringTabItem {
  content: ReactNode;
  label: string;
  value: string;
}

export function AuthoringTabs({
  defaultValue,
  items,
}: {
  defaultValue: string;
  items: AuthoringTabItem[];
}) {
  return (
    <RadixTabs.Root className="ui-tabs" defaultValue={defaultValue}>
      <RadixTabs.List aria-label="Authoring utilities" className="ui-tabs-list">
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} className="ui-tabs-trigger" value={item.value}>
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          className="ui-tabs-content"
          forceMount
          value={item.value}
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

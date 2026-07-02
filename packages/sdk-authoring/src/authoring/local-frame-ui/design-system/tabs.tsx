import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export interface AuthoringTabItem {
  content: ReactNode;
  label: string;
  value: string;
}

export function AuthoringTabs({
  ariaLabel = 'Support package',
  defaultValue,
  items,
  onValueChange,
  value,
}: {
  ariaLabel?: string;
  defaultValue: string;
  items: AuthoringTabItem[];
  onValueChange?: (value: string) => void;
  value?: string;
}) {
  return (
    <RadixTabs.Root
      className="ui-tabs"
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      value={value}
    >
      <RadixTabs.List aria-label={ariaLabel} className="ui-tabs-list">
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

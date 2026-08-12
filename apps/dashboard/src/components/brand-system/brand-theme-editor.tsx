'use client';

import * as React from 'react';
import { RotateCcw, Save } from 'lucide-react';
import type { BrandThemeDefinition } from '@lodariq/schema';
import {
  BRAND_FONT_OPTIONS,
  BRAND_RADIUS_OPTIONS,
  safeBrandSwatchColor,
} from '../../lib/brand-system';
import type { updateBrandThemeDefinition } from '../../lib/brand-system';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { withCurrentOption } from './brand-system-view-helpers';

export function BrandSummary({
  definition,
}: {
  definition: BrandThemeDefinition;
}): React.ReactElement {
  const colors = definition.tokens.modes.light.colors;
  const fontFamily = definition.tokens.typography.fontFamilies[0] ?? 'system-ui';
  return (
    <section className="grid content-start gap-5" aria-labelledby="brand-summary-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Essentials
        </p>
        <h3 className="mt-1 font-semibold" id="brand-summary-title">
          One glance, five decisions
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ThemeSwatch label="Accent" value={colors.accent} />
        <ThemeSwatch label="Surface" value={colors.surface} />
        <ThemeSwatch label="Text" value={colors.text} />
      </div>
      <dl className="divide-y divide-border rounded-xl border border-border">
        <SummaryRow label="Font family" value={fontFamily} />
        <SummaryRow label="Card radius" value={`${definition.tokens.radii.md}px`} />
        <SummaryRow
          label="Dark mode"
          value={definition.tokens.modes.dark ? 'Included' : 'Uses light theme'}
        />
      </dl>
    </section>
  );
}

export function BrandEssentialEditor({
  definition,
  pending,
  onCancel,
  onChange,
  onSave,
}: {
  definition: BrandThemeDefinition;
  pending: boolean;
  onCancel: () => void;
  onChange: (patch: Parameters<typeof updateBrandThemeDefinition>[1]) => void;
  onSave: () => void;
}): React.ReactElement {
  const colors = definition.tokens.modes.light.colors;
  const currentFontFamily = definition.tokens.typography.fontFamilies[0] ?? 'system-ui';
  const fontOptions = withCurrentOption(BRAND_FONT_OPTIONS, currentFontFamily, 'Current font');
  const currentRadius = definition.tokens.radii.md;
  const radiusOptions = withCurrentOption(BRAND_RADIUS_OPTIONS, currentRadius, 'Current radius');
  return (
    <section className="grid content-start gap-5" aria-labelledby="brand-editor-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Editing draft
        </p>
        <h3 className="mt-1 font-semibold" id="brand-editor-title">
          Brand essentials
        </h3>
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3">
          <ColorControl
            label="Accent"
            value={colors.accent}
            onChange={(accent) => onChange({ accent })}
          />
          <ColorControl
            label="Surface"
            value={colors.surface}
            onChange={(surface) => onChange({ surface })}
          />
          <ColorControl label="Text" value={colors.text} onChange={(text) => onChange({ text })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="brand-font-family">Font family</Label>
            <Select
              value={currentFontFamily}
              onValueChange={(fontFamily) => onChange({ fontFamily })}
            >
              <SelectTrigger id="brand-font-family">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fontOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="brand-card-radius">Card radius</Label>
            <Select
              value={String(currentRadius)}
              onValueChange={(radius) => onChange({ radius: Number(radius) })}
            >
              <SelectTrigger id="brand-card-radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {radiusOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label} · {option.value}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button disabled={pending} onClick={onCancel} type="button" variant="ghost">
          <RotateCcw aria-hidden="true" />
          Cancel
        </Button>
        <Button disabled={pending} onClick={onSave} type="button">
          <Save aria-hidden="true" />
          {pending ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </section>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const id = React.useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background p-1.5 pr-2 text-xs font-medium outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/35">
        <input
          aria-label={`${label} color`}
          className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={safeBrandSwatchColor(value)}
        />
        <span className="truncate text-muted-foreground">Choose</span>
      </div>
    </div>
  );
}

function ThemeSwatch({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-subtle)] p-2">
      <span
        aria-hidden="true"
        className="block aspect-[4/3] w-full rounded-lg border border-black/10"
        style={{ backgroundColor: safeBrandSwatchColor(value) }}
      />
      <p className="mt-2 truncate text-xs font-semibold">{label}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-sm font-semibold">{value}</dd>
    </div>
  );
}

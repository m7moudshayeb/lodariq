'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
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

type Translate = ReturnType<typeof useLingui>['_'];

const COPY = {
  essentials: msg({ id: 'dashboard.brand.editor.essentials', message: 'Essentials' }),
  summaryTitle: msg({
    id: 'dashboard.brand.editor.summaryTitle',
    message: 'One glance, five decisions',
  }),
  accent: msg({ id: 'dashboard.brand.editor.accent', message: 'Accent' }),
  surface: msg({ id: 'dashboard.brand.editor.surface', message: 'Surface' }),
  text: msg({ id: 'dashboard.brand.editor.text', message: 'Text' }),
  fontFamily: msg({ id: 'dashboard.brand.editor.fontFamily', message: 'Font family' }),
  cardRadius: msg({ id: 'dashboard.brand.editor.cardRadius', message: 'Card radius' }),
  darkMode: msg({ id: 'dashboard.brand.editor.darkMode', message: 'Dark mode' }),
  included: msg({ id: 'dashboard.brand.editor.included', message: 'Included' }),
  usesLight: msg({ id: 'dashboard.brand.editor.usesLight', message: 'Uses light theme' }),
  editing: msg({ id: 'dashboard.brand.editor.editing', message: 'Editing draft' }),
  editorTitle: msg({ id: 'dashboard.brand.editor.title', message: 'Brand essentials' }),
  currentFont: msg({ id: 'dashboard.brand.editor.currentFont', message: 'Current font' }),
  currentRadius: msg({ id: 'dashboard.brand.editor.currentRadius', message: 'Current radius' }),
  systemSans: msg({ id: 'dashboard.brand.editor.systemSans', message: 'System sans' }),
  georgiaSerif: msg({ id: 'dashboard.brand.editor.georgiaSerif', message: 'Georgia serif' }),
  crisp: msg({ id: 'dashboard.brand.editor.radius.crisp', message: 'Crisp' }),
  balanced: msg({ id: 'dashboard.brand.editor.radius.balanced', message: 'Balanced' }),
  soft: msg({ id: 'dashboard.brand.editor.radius.soft', message: 'Soft' }),
  rounded: msg({ id: 'dashboard.brand.editor.radius.rounded', message: 'Rounded' }),
  cancel: msg({ id: 'dashboard.brand.editor.cancel', message: 'Cancel' }),
  saving: msg({ id: 'dashboard.brand.editor.saving', message: 'Saving…' }),
  save: msg({ id: 'dashboard.brand.editor.save', message: 'Save draft' }),
  colorLabel: msg({ id: 'dashboard.brand.editor.colorLabel', message: '{label} color' }),
  choose: msg({ id: 'dashboard.brand.editor.choose', message: 'Choose' }),
} as const;

export function BrandSummary({
  definition,
}: {
  definition: BrandThemeDefinition;
}): React.ReactElement {
  const { _ } = useLingui();
  const colors = definition.tokens.modes.light.colors;
  const fontFamily = definition.tokens.typography.fontFamilies[0] ?? 'system-ui';
  return (
    <section className="grid content-start gap-5" aria-labelledby="brand-summary-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {_(COPY.essentials)}
        </p>
        <h3 className="mt-1 font-semibold" id="brand-summary-title">
          {_(COPY.summaryTitle)}
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ThemeSwatch label={_(COPY.accent)} value={colors.accent} />
        <ThemeSwatch label={_(COPY.surface)} value={colors.surface} />
        <ThemeSwatch label={_(COPY.text)} value={colors.text} />
      </div>
      <dl className="divide-y divide-border rounded-xl border border-border">
        <SummaryRow label={_(COPY.fontFamily)} value={fontFamily} />
        <SummaryRow label={_(COPY.cardRadius)} value={`${definition.tokens.radii.md}px`} />
        <SummaryRow
          label={_(COPY.darkMode)}
          value={definition.tokens.modes.dark ? _(COPY.included) : _(COPY.usesLight)}
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
  const { _ } = useLingui();
  const colors = definition.tokens.modes.light.colors;
  const currentFontFamily = definition.tokens.typography.fontFamilies[0] ?? 'system-ui';
  const fontOptions = withCurrentOption(
    BRAND_FONT_OPTIONS.map((option) => ({
      ...option,
      label: brandFontOptionLabel(option.value, option.label, _),
    })),
    currentFontFamily,
    _(COPY.currentFont),
  );
  const currentRadius = definition.tokens.radii.md;
  const radiusOptions = withCurrentOption(
    BRAND_RADIUS_OPTIONS.map((option) => ({
      ...option,
      label: brandRadiusOptionLabel(option.value, option.label, _),
    })),
    currentRadius,
    _(COPY.currentRadius),
  );
  return (
    <section className="grid content-start gap-5" aria-labelledby="brand-editor-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {_(COPY.editing)}
        </p>
        <h3 className="mt-1 font-semibold" id="brand-editor-title">
          {_(COPY.editorTitle)}
        </h3>
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3">
          <ColorControl
            label={_(COPY.accent)}
            value={colors.accent}
            onChange={(accent) => onChange({ accent })}
          />
          <ColorControl
            label={_(COPY.surface)}
            value={colors.surface}
            onChange={(surface) => onChange({ surface })}
          />
          <ColorControl
            label={_(COPY.text)}
            value={colors.text}
            onChange={(text) => onChange({ text })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="brand-font-family">{_(COPY.fontFamily)}</Label>
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
            <Label htmlFor="brand-card-radius">{_(COPY.cardRadius)}</Label>
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
          {_(COPY.cancel)}
        </Button>
        <Button disabled={pending} onClick={onSave} type="button">
          <Save aria-hidden="true" />
          {pending ? _(COPY.saving) : _(COPY.save)}
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
  const { _ } = useLingui();
  const id = React.useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background p-1.5 pe-2 text-xs font-medium outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/35">
        <input
          aria-label={_({ ...COPY.colorLabel, values: { label } })}
          className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={safeBrandSwatchColor(value)}
        />
        <span className="truncate text-muted-foreground">{_(COPY.choose)}</span>
      </div>
    </div>
  );
}

function brandFontOptionLabel(value: string, fallback: string, translate: Translate): string {
  if (value === 'system-ui') return translate(COPY.systemSans);
  if (value === 'Georgia') return translate(COPY.georgiaSerif);
  return fallback;
}

function brandRadiusOptionLabel(value: number, fallback: string, translate: Translate): string {
  if (value === 6) return translate(COPY.crisp);
  if (value === 10) return translate(COPY.balanced);
  if (value === 16) return translate(COPY.soft);
  if (value === 24) return translate(COPY.rounded);
  return fallback;
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
      <dd className="truncate text-end text-sm font-semibold">{value}</dd>
    </div>
  );
}

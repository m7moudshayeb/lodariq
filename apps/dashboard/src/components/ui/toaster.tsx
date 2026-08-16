'use client';

import type { ReactElement, ReactNode } from 'react';
import { DEFAULT_LOCALE, isSupportedLocale, localeDirection } from '@lodariq/i18n';
import { useLingui } from '@lingui/react';
import { Toaster, toast } from 'sonner';
import { StatusBanner, type StatusBannerKind } from './status-banner';

const TOAST_WIDTH_CLASS = 'w-[300px] max-w-[300px]';

export function DashboardToaster(): ReactElement {
  const { i18n } = useLingui();
  const locale = isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
  const rtl = localeDirection(locale) === 'rtl';
  return (
    <Toaster
      dir={rtl ? 'rtl' : 'ltr'}
      gap={8}
      offset={16}
      position={rtl ? 'bottom-left' : 'bottom-right'}
      toastOptions={{
        className: TOAST_WIDTH_CLASS,
        unstyled: true,
      }}
      visibleToasts={4}
    />
  );
}

export function StatusToast({
  kind,
  title,
  children,
}: {
  kind: StatusBannerKind;
  title: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <StatusBanner className={TOAST_WIDTH_CLASS} kind={kind} title={title}>
      {children}
    </StatusBanner>
  );
}

export function statusToast(
  kind: StatusBannerKind,
  title: string,
  children?: ReactNode,
): string | number {
  return toast.custom(() => (
    <StatusToast kind={kind} title={title}>
      {children}
    </StatusToast>
  ));
}

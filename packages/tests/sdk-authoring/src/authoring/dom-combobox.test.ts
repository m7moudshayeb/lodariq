// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import {
  createAuthoringDomCombobox,
  type AuthoringDomComboboxIcon,
} from '../../../../../packages/sdk-authoring/src/authoring/dom-combobox';
import { createInlinePreviewEditor } from '../../../../../packages/sdk-authoring/src/authoring/inline-preview-editor';

const PANEL_BOTTOM_ICON = [['path', { d: 'M3 3h18v18H3z' }]] as unknown as AuthoringDomComboboxIcon;
const POINTER_CLICK_ICON = [
  ['path', { d: 'm9 9 6 12 2-5 5-2Z' }],
] as unknown as AuthoringDomComboboxIcon;
const MAXIMIZE_ICON = [
  ['path', { d: 'M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5' }],
] as unknown as AuthoringDomComboboxIcon;
const CUSTOM_ICON = [
  ['circle', { cx: '12', cy: '12', r: '9' }],
] as unknown as AuthoringDomComboboxIcon;

describe('authoring DOM combobox', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('retains the inline toolbar DOM classes and selection behavior by default', () => {
    const onChange = vi.fn();
    const control = createAuthoringDomCombobox({
      document,
      label: 'Tooltip placement',
      items: [
        { value: 'bottom', label: 'Below' },
        { value: 'top', label: 'Above' },
      ],
      initialValue: 'bottom',
      triggerIcon: PANEL_BOTTOM_ICON,
      onChange,
    });
    document.body.appendChild(control.element);

    const trigger = control.element.querySelector<HTMLButtonElement>(
      '.lodariq-inline-toolbar-trigger',
    );
    const list = control.element.querySelector<HTMLElement>('.lodariq-inline-toolbar-listbox');
    const options = Array.from(
      control.element.querySelectorAll<HTMLButtonElement>('.lodariq-inline-toolbar-option'),
    );

    expect(control.element.className).toBe('lodariq-inline-toolbar-combobox');
    expect(trigger?.getAttribute('role')).toBe('combobox');
    expect(trigger?.getAttribute('aria-label')).toBe('Tooltip placement');
    expect(trigger?.children[0]?.tagName).toBe('svg');
    expect(trigger?.children[1]?.className).toBe('lodariq-inline-toolbar-value');
    expect(trigger?.children[2]?.classList.contains('lodariq-inline-toolbar-chevron')).toBe(true);
    expect(list?.getAttribute('role')).toBe('listbox');
    expect(list?.hidden).toBe(true);
    expect(options.map((option) => option.textContent)).toEqual(['Below', 'Above']);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options[0]?.querySelector('.lodariq-inline-toolbar-check')?.hasAttribute('hidden')).toBe(
      false,
    );

    trigger?.click();
    expect(list?.hidden).toBe(false);
    options[1]?.click();

    expect(onChange).toHaveBeenCalledWith('top');
    expect(control.value).toBe('top');
    expect(trigger?.querySelector('.lodariq-inline-toolbar-value')?.textContent).toBe('Above');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses item icons, omits the selected item, and supports silent value updates', () => {
    const onChange = vi.fn();
    const control = createAuthoringDomCombobox({
      document,
      label: 'Workspace width',
      items: [
        { value: 'compact', label: 'Compact', icon: PANEL_BOTTOM_ICON },
        { value: 'standard', label: 'Standard', icon: POINTER_CLICK_ICON },
        { value: 'focus', label: 'Focused', icon: MAXIMIZE_ICON },
        {
          value: 'custom',
          label: 'Custom',
          icon: CUSTOM_ICON,
          omitFromList: true,
        },
      ],
      initialValue: 'focus',
      omitSelectedOption: true,
      showSelectionIndicator: false,
      classNames: {
        optionIcon: 'layout-option-icon',
        triggerIcon: 'layout-trigger-icon',
      },
      onChange,
    });
    document.body.appendChild(control.element);

    const trigger = control.element.querySelector<HTMLButtonElement>('[role="combobox"]');
    const optionFor = (value: string): HTMLButtonElement | null =>
      control.element.querySelector<HTMLButtonElement>(`[role="option"][data-value="${value}"]`);
    const initialTriggerIcon = trigger?.querySelector('.layout-trigger-icon')?.innerHTML;

    expect(initialTriggerIcon).toBeTruthy();
    expect(optionFor('focus')?.hidden).toBe(true);
    expect(optionFor('compact')?.hidden).toBe(false);
    expect(control.element.querySelectorAll('.layout-option-icon')).toHaveLength(3);
    expect(optionFor('custom')).toBeNull();
    expect(control.element.querySelector('.lodariq-inline-toolbar-check')).toBeNull();

    trigger?.click();
    expect(
      Array.from(control.element.querySelectorAll<HTMLButtonElement>('[role="option"]')).filter(
        (option) => !option.hidden,
      ),
    ).toHaveLength(2);

    control.close();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(control.element.querySelector<HTMLElement>('[role="listbox"]')?.hidden).toBe(true);
    trigger?.click();

    control.setValue('custom');
    expect(onChange).not.toHaveBeenCalled();
    expect(control.value).toBe('custom');
    expect(trigger?.querySelector('.lodariq-inline-toolbar-value')?.textContent).toBe('Custom');
    expect(
      Array.from(control.element.querySelectorAll<HTMLButtonElement>('[role="option"]')).filter(
        (option) => !option.hidden,
      ),
    ).toHaveLength(3);

    control.setValue('compact');

    expect(onChange).not.toHaveBeenCalled();
    expect(control.value).toBe('compact');
    expect(trigger?.querySelector('.lodariq-inline-toolbar-value')?.textContent).toBe('Compact');
    expect(trigger?.querySelector('.layout-trigger-icon')?.innerHTML).not.toBe(initialTriggerIcon);
    expect(optionFor('compact')?.hidden).toBe(true);
    expect(optionFor('focus')?.hidden).toBe(false);

    optionFor('standard')?.click();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('standard');
    expect(control.value).toBe('standard');
  });

  it('does not install inline controls into the output-only preview', () => {
    const host = document.createElement('lodariq-tour');
    host.setAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE, 'preview_owner');
    const root = host.attachShadow({ mode: 'open' });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const heading = document.createElement('h2');
    heading.setAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE, 'heading_1');
    heading.setAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE, 'heading');
    heading.textContent = 'Welcome';
    const button = document.createElement('button');
    button.setAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE, 'button_1');
    button.setAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE, 'button');
    button.textContent = 'Continue';
    dialog.appendChild(heading);
    dialog.appendChild(button);
    root.appendChild(dialog);
    document.body.appendChild(host);
    const onControlCommit = vi.fn();

    const editor = createInlinePreviewEditor({
      document,
      previewOwnerId: 'preview_owner',
      onCommit: vi.fn(),
      resolveControlContext: () => ({
        stepId: 'step_1',
        tooltipBlockId: 'tooltip_1',
        placement: 'bottom',
        actionBlockId: 'button_1',
        actionType: '',
      }),
      onControlCommit,
    });

    expect(root.querySelector('[data-lodariq-authoring-context-toolbar="true"]')).toBeNull();
    expect(root.querySelector('[data-lodariq-authoring-inline-style="true"]')).not.toBeNull();
    expect(heading.hasAttribute('contenteditable')).toBe(false);
    expect(button.hasAttribute('contenteditable')).toBe(false);
    expect(onControlCommit).not.toHaveBeenCalled();

    editor.destroy();
  });
});

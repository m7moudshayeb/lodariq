import {
  BLOCK_ALIGNMENT_VALUES,
  BUTTON_ICON_PLACEMENT_VALUES,
  BUTTON_ICON_VALUES,
  BUTTON_RADIUS_VALUES,
  BUTTON_SIZE_VALUES,
  BUTTON_WIDTH_VALUES,
  FORM_FIELD_CONTROL_VALUES,
  type FormFieldControl,
  type FormFieldPresentation,
  type LodariqBlockProps,
} from '@lodariq/schema';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  type LexicalEditor,
  type NodeKey,
} from 'lexical';
import { X } from 'lucide-react';
import { useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { authoringText } from '../i18n';
import { RichContentHostContext } from './rich-content-host-context';
import {
  $isRichButtonNode,
  $isRichFormFieldNode,
  RICH_BUTTON_ACTION_OPTIONS,
  RICH_BUTTON_SEQUENCE_ACTION_OPTION,
  RICH_BUTTON_VARIANT_OPTIONS,
  type RichButtonActionType,
  type RichButtonNode,
  type RichFormFieldNode,
} from './rich-content-nodes';
import { RichContentSelect } from './rich-content-select';

const BUTTON_WIDTH_OPTIONS = BUTTON_WIDTH_VALUES.map((value) => ({
  value,
  label: value === 'hug' ? authoringText('Hug') : authoringText('Fill'),
}));
const BUTTON_SIZE_OPTIONS = BUTTON_SIZE_VALUES.map((value) => ({
  value,
  label: value === 'compact' ? authoringText('Compact') : authoringText('Regular'),
}));
const BUTTON_RADIUS_OPTIONS = [
  { value: 'theme', label: authoringText('Brand') },
  { value: 'square', label: authoringText('Square') },
  { value: 'soft', label: authoringText('Soft') },
  { value: 'round', label: authoringText('Pill') },
] as const satisfies ReadonlyArray<{ value: (typeof BUTTON_RADIUS_VALUES)[number]; label: string }>;
const BUTTON_ICON_OPTIONS = [
  { value: 'none', label: authoringText('None') },
  { value: 'arrow-right', label: authoringText('Arrow') },
  { value: 'external-link', label: authoringText('External') },
  { value: 'check', label: authoringText('Check') },
] as const satisfies ReadonlyArray<{ value: (typeof BUTTON_ICON_VALUES)[number]; label: string }>;
const BUTTON_ICON_PLACEMENT_OPTIONS = BUTTON_ICON_PLACEMENT_VALUES.map((value) => ({
  value,
  label: value === 'start' ? authoringText('Before') : authoringText('After'),
}));
const ALIGNMENT_OPTIONS = BLOCK_ALIGNMENT_VALUES.map((value) => ({
  value,
  label:
    value === 'start'
      ? authoringText('Start')
      : value === 'center'
        ? authoringText('Center')
        : value === 'end'
          ? authoringText('End')
          : authoringText('Stretch'),
}));
const FIELD_CONTROL_OPTIONS = FORM_FIELD_CONTROL_VALUES.map((value) => ({
  value,
  label:
    value === 'checkbox'
      ? authoringText('Checkbox')
      : value === 'radio'
        ? authoringText('Radio')
        : authoringText('Text field'),
}));
const NAVIGATION_OPTIONS = [
  { value: 'continue', label: authoringText('Continue tour') },
  { value: 'stay', label: authoringText('Keep current step') },
] as const;
const BUTTON_INSPECTOR_SECTIONS = [
  { value: 'action', label: authoringText('Action') },
  { value: 'appearance', label: authoringText('Appearance') },
] as const satisfies ReadonlyArray<{ value: 'action' | 'appearance'; label: string }>;
const FIELD_INSPECTOR_SECTIONS = [
  { value: 'field', label: authoringText('Field') },
  { value: 'appearance', label: authoringText('Appearance') },
] as const satisfies ReadonlyArray<{ value: 'field' | 'appearance'; label: string }>;

type InspectedKind = 'button' | 'formField';
type InspectedTarget = { kind: InspectedKind; key: NodeKey };

function sameInspectedTarget(
  current: InspectedTarget | null,
  next: InspectedTarget | null,
): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.kind === next.kind && current.key === next.key;
}

function closeInspector(editor: LexicalEditor): void {
  editor.update(() => $setSelection(null));
}

function keepInspectedNodeSelected(nodeKey: NodeKey): void {
  const selection = $createNodeSelection();
  selection.add(nodeKey);
  $setSelection(selection);
}

function useInspectedSnapshot<T>(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  read: () => T | null,
): T | null {
  const readRef = useRef(read);
  readRef.current = read;
  const [snapshot, setSnapshot] = useState<T | null>(() => editor.getEditorState().read(read));
  useEffect(() => {
    const sync = (): void => {
      const next = editor.getEditorState().read(readRef.current);
      setSnapshot((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    sync();
    return editor.registerUpdateListener(sync);
  }, [editor, nodeKey]);
  return snapshot;
}

function updateInspectedNode(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  apply: () => boolean,
): void {
  editor.update(
    () => {
      if (!apply()) return;
      keepInspectedNodeSelected(nodeKey);
    },
    { discrete: true },
  );
}

function InspectorCloseButton({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <button
      aria-label={authoringText('Close settings')}
      className="storyboard-tray-close"
      onClick={onClose}
      type="button"
    >
      <X aria-hidden="true" size={17} strokeWidth={2} />
    </button>
  );
}

export function BlockInspectorPlugin(): ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const host = useContext(RichContentHostContext);
  const [target, setTarget] = useState<InspectedTarget | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          dismissedRef.current = false;
          const node = selection.getNodes()[0];
          const next = $isRichButtonNode(node)
            ? { kind: 'button' as const, key: node.getKey() }
            : $isRichFormFieldNode(node)
              ? { kind: 'formField' as const, key: node.getKey() }
              : null;
          setTarget((current) => (sameInspectedTarget(current, next) ? current : next));
          return;
        }
        setTarget((current) => {
          if (dismissedRef.current || !current) return null;
          return $getNodeByKey(current.key) ? current : null;
        });
      });
    });
  }, [editor]);

  useEffect(() => {
    if (!host.suppressInspector) return;
    setTarget(null);
    editor.update(() => {
      if ($isNodeSelection($getSelection())) $setSelection(null);
    });
  }, [editor, host.suppressInspector]);

  const onInspectOpen = host.onInspectOpen;
  const onInspectOpenRef = useRef(onInspectOpen);
  onInspectOpenRef.current = onInspectOpen;
  useEffect(() => {
    if (target) onInspectOpenRef.current?.();
  }, [target]);

  if (!host.inspectorHost || !target) return null;
  const close = (): void => {
    dismissedRef.current = true;
    setTarget(null);
    closeInspector(editor);
  };
  return createPortal(
    <section
      aria-label={
        target.kind === 'button' ? authoringText('Button settings') : authoringText('Field settings')
      }
      className="storyboard-property-tray"
      data-tool-mode="content"
    >
      <span aria-hidden="true" className="storyboard-tray-handle" />
      {target.kind === 'button' ? (
        <ButtonInspector nodeKey={target.key} onClose={close} />
      ) : (
        <FormFieldInspector nodeKey={target.key} onClose={close} />
      )}
    </section>,
    host.inspectorHost,
  );
}

function ButtonInspector({
  nodeKey,
  onClose,
}: {
  nodeKey: NodeKey;
  onClose: () => void;
}): ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const host = useContext(RichContentHostContext);
  const [section, setSection] = useState<(typeof BUTTON_INSPECTOR_SECTIONS)[number]['value']>(
    'action',
  );
  const snapshot = useInspectedSnapshot(editor, nodeKey, () => {
    const node = $getNodeByKey(nodeKey);
    return $isRichButtonNode(node) ? { content: node.getContent(), props: node.getProps() } : null;
  });
  if (!snapshot) return null;
  const { content, props } = snapshot;
  const actionType = props.action?.type ?? 'next';
  const actionOptions =
    actionType === 'runSequence' || host.onOpenSequence
      ? [RICH_BUTTON_SEQUENCE_ACTION_OPTION, ...RICH_BUTTON_ACTION_OPTIONS]
      : RICH_BUTTON_ACTION_OPTIONS;
  const update = (change: (node: RichButtonNode) => void): void => {
    updateInspectedNode(editor, nodeKey, () => {
      const node = $getNodeByKey(nodeKey);
      if (!$isRichButtonNode(node)) return false;
      change(node);
      return true;
    });
  };
  return (
    <>
      <div className="content-inspector-chrome">
        <nav className="popup-inspector-tabs" aria-label={authoringText('Button settings')}>
          {BUTTON_INSPECTOR_SECTIONS.map((item) => (
            <button
              aria-current={section === item.value ? 'page' : undefined}
              key={item.value}
              onClick={() => setSection(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <InspectorCloseButton onClose={onClose} />
      </div>
      <div className="storyboard-tab-panel behavior" data-section={section}>
        {section === 'action' ? (
          <>
      <InspectorField id="button.label" label={authoringText('Button label')}>
        <input
          aria-label={authoringText('Button label')}
          className="ui-input"
          onChange={(event) => update((node) => node.setContent(event.currentTarget.value))}
          type="text"
          value={content}
        />
      </InspectorField>
      <InspectorField id="button.action" label={authoringText('After click')}>
        <RichContentSelect
          ariaLabel={authoringText('After click')}
          onValueChange={(value) => {
            if (value === 'runSequence') {
              const node = editor.getEditorState().read(() => $getNodeByKey(nodeKey));
              if ($isRichButtonNode(node)) host.onOpenSequence?.(node.getBlockId());
              return;
            }
            update((item) => item.setActionType(value as RichButtonActionType));
          }}
          options={actionOptions}
          value={actionType}
        />
      </InspectorField>
      {actionType === 'openPage' ? (
        <>
          <InspectorField id="button.destination" label={authoringText('Page URL')}>
            <input
              aria-label={authoringText('Page URL')}
              className="ui-input"
              defaultValue={props.action?.type === 'openPage' ? (props.action.url ?? '') : ''}
              onBlur={(event) => update((node) => node.setActionUrl(event.currentTarget.value))}
              placeholder="https://"
              type="url"
            />
          </InspectorField>
          <InspectorField id="button.navigationBehavior" label={authoringText('After navigation')}>
            <RichContentSelect
              ariaLabel={authoringText('After navigation')}
              onValueChange={(value) =>
                update((node) => node.setNavigationBehavior(value as 'stay' | 'continue'))
              }
              options={NAVIGATION_OPTIONS}
              value={
                props.action?.type === 'openPage'
                  ? (props.action.navigationBehavior ?? 'stay')
                  : 'stay'
              }
            />
          </InspectorField>
        </>
      ) : null}
          </>
        ) : (
          <>
      <InspectorField id="button.variant" label={authoringText('Style')}>
        <RichContentSelect
          ariaLabel={authoringText('Button style')}
          onValueChange={(value) =>
            update((node) => node.setVariant(value as NonNullable<LodariqBlockProps['variant']>))
          }
          options={RICH_BUTTON_VARIANT_OPTIONS}
          value={props.variant ?? 'primary'}
        />
      </InspectorField>
      <InspectorField id="button.width" label={authoringText('Width')}>
        <RichContentSelect
          ariaLabel={authoringText('Width')}
          onValueChange={(value) =>
            update((node) =>
              node.setButtonStyle({
                width: value as (typeof BUTTON_WIDTH_VALUES)[number],
                widthPx: undefined,
              }),
            )
          }
          options={BUTTON_WIDTH_OPTIONS}
          value={props.buttonStyle?.widthPx ? 'hug' : (props.buttonStyle?.width ?? 'hug')}
        />
      </InspectorField>
      <InspectorField id="button.size" label={authoringText('Size')}>
        <RichContentSelect
          ariaLabel={authoringText('Size')}
          onValueChange={(value) =>
            update((node) =>
              node.setButtonStyle({ size: value as (typeof BUTTON_SIZE_VALUES)[number] }),
            )
          }
          options={BUTTON_SIZE_OPTIONS}
          value={props.buttonStyle?.size ?? 'regular'}
        />
      </InspectorField>
      <InspectorField id="button.radius" label={authoringText('Corner radius')}>
        <RichContentSelect
          ariaLabel={authoringText('Corner radius')}
          onValueChange={(value) =>
            update((node) =>
              node.setButtonStyle({ radius: value as (typeof BUTTON_RADIUS_VALUES)[number] }),
            )
          }
          options={BUTTON_RADIUS_OPTIONS}
          value={props.buttonStyle?.radius ?? 'theme'}
        />
      </InspectorField>
      <InspectorField id="button.icon" label={authoringText('Icon')}>
        <RichContentSelect
          ariaLabel={authoringText('Icon')}
          onValueChange={(value) =>
            update((node) =>
              node.setButtonStyle({ icon: value as (typeof BUTTON_ICON_VALUES)[number] }),
            )
          }
          options={BUTTON_ICON_OPTIONS}
          value={props.buttonStyle?.icon ?? 'none'}
        />
      </InspectorField>
      <InspectorField id="button.iconPlacement" label={authoringText('Icon position')}>
        <RichContentSelect
          ariaLabel={authoringText('Icon position')}
          onValueChange={(value) =>
            update((node) =>
              node.setButtonStyle({
                iconPlacement: value as (typeof BUTTON_ICON_PLACEMENT_VALUES)[number],
              }),
            )
          }
          options={BUTTON_ICON_PLACEMENT_OPTIONS}
          value={props.buttonStyle?.iconPlacement ?? 'end'}
        />
      </InspectorField>
      <div className="storyboard-property-color-row">
      <InspectorField id="button.fillColor" label={authoringText('Fill')}>
        <input
          aria-label={authoringText('Fill')}
          onChange={(event) =>
            update((node) => node.setButtonStyle({ fillColor: event.currentTarget.value }))
          }
          type="color"
          value={props.buttonStyle?.fillColor ?? '#006b58'}
        />
      </InspectorField>
      <InspectorField id="button.textColor" label={authoringText('Label color')}>
        <input
          aria-label={authoringText('Label color')}
          onChange={(event) =>
            update((node) => node.setButtonStyle({ textColor: event.currentTarget.value }))
          }
          type="color"
          value={props.buttonStyle?.textColor ?? '#ffffff'}
        />
      </InspectorField>
      <InspectorField id="button.borderColor" label={authoringText('Border')}>
        <input
          aria-label={authoringText('Border')}
          onChange={(event) =>
            update((node) => node.setButtonStyle({ borderColor: event.currentTarget.value }))
          }
          type="color"
          value={props.buttonStyle?.borderColor ?? '#006b58'}
        />
      </InspectorField>
      </div>
          </>
        )}
      </div>
    </>
  );
}

function FormFieldInspector({
  nodeKey,
  onClose,
}: {
  nodeKey: NodeKey;
  onClose: () => void;
}): ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const [section, setSection] = useState<(typeof FIELD_INSPECTOR_SECTIONS)[number]['value']>(
    'field',
  );
  const snapshot = useInspectedSnapshot(editor, nodeKey, () => {
    const node = $getNodeByKey(nodeKey);
    return $isRichFormFieldNode(node)
      ? { content: node.getContent(), props: node.getProps() }
      : null;
  });
  if (!snapshot) return null;
  const field = snapshot.props.formField ?? { control: 'text' as const };
  const update = (change: (node: RichFormFieldNode) => void): void => {
    updateInspectedNode(editor, nodeKey, () => {
      const node = $getNodeByKey(nodeKey);
      if (!$isRichFormFieldNode(node)) return false;
      change(node);
      return true;
    });
  };
  const patchField = (next: FormFieldPresentation): void => {
    update((node) => node.setFormField(next));
  };
  return (
    <>
      <div className="content-inspector-chrome">
        <nav className="popup-inspector-tabs" aria-label={authoringText('Field settings')}>
          {FIELD_INSPECTOR_SECTIONS.map((item) => (
            <button
              aria-current={section === item.value ? 'page' : undefined}
              key={item.value}
              onClick={() => setSection(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <InspectorCloseButton onClose={onClose} />
      </div>
      <div className="storyboard-tab-panel behavior" data-section={section}>
        {section === 'field' ? (
          <>
      <InspectorField id="formField.label" label={authoringText('Label')}>
        <input
          aria-label={authoringText('Field label')}
          className="ui-input"
          onChange={(event) => update((node) => node.setContent(event.currentTarget.value))}
          type="text"
          value={snapshot.content}
        />
      </InspectorField>
      <InspectorField id="formField.control" label={authoringText('Field type')}>
        <RichContentSelect
          ariaLabel={authoringText('Field type')}
          onValueChange={(value) => {
            const control = value as FormFieldControl;
            const next: FormFieldPresentation = { ...field, control };
            if (control !== 'radio') delete next.options;
            if (control !== 'text') delete next.placeholder;
            if (control === 'radio' && (next.options?.length ?? 0) < 2) {
              next.options = [
                { id: 'option_a', label: authoringText('Option 1') },
                { id: 'option_b', label: authoringText('Option 2') },
              ];
            }
            if (control === 'text' && !next.placeholder) {
              next.placeholder = authoringText('Type here');
            }
            patchField(next);
          }}
          options={FIELD_CONTROL_OPTIONS}
          value={field.control}
        />
      </InspectorField>
      <InspectorField id="formField.required" label={authoringText('Required')}>
        <RichContentSelect
          ariaLabel={authoringText('Required')}
          onValueChange={(value) =>
            patchField({ ...field, required: value === 'yes' ? true : undefined })
          }
          options={[
            { value: 'no', label: authoringText('Optional') },
            { value: 'yes', label: authoringText('Required') },
          ]}
          value={field.required ? 'yes' : 'no'}
        />
      </InspectorField>
      {field.control === 'text' ? (
        <InspectorField id="formField.placeholder" label={authoringText('Placeholder')}>
          <input
            aria-label={authoringText('Placeholder')}
            className="ui-input"
            onChange={(event) =>
              patchField({ ...field, placeholder: event.currentTarget.value.slice(0, 120) })
            }
            type="text"
            value={field.placeholder ?? ''}
          />
        </InspectorField>
      ) : null}
      {field.control === 'radio' ? (
        <InspectorField id="formField.options" label={authoringText('Choices')}>
          <div className="rich-content-form-field-options">
            {(field.options ?? []).map((option, index) => (
              <div key={option.id}>
                <input
                  aria-label={authoringText('Choice {number}', { number: index + 1 })}
                  className="ui-input"
                  onChange={(event) => {
                    const options = [...(field.options ?? [])];
                    options[index] = { ...option, label: event.currentTarget.value.slice(0, 80) };
                    patchField({ ...field, options });
                  }}
                  type="text"
                  value={option.label}
                />
                <button
                  aria-label={authoringText('Remove choice {number}', { number: index + 1 })}
                  className="ui-button ui-button-ghost"
                  disabled={(field.options?.length ?? 0) <= 2}
                  onClick={() =>
                    patchField({
                      ...field,
                      options: (field.options ?? []).filter((item) => item.id !== option.id),
                    })
                  }
                  type="button"
                >
                  {authoringText('Remove')}
                </button>
              </div>
            ))}
            {(field.options?.length ?? 0) < 8 ? (
              <button
                className="ui-button"
                onClick={() => {
                  const options = [...(field.options ?? [])];
                  options.push({
                    id: `option_${options.length + 1}`,
                    label: authoringText('Option {number}', { number: options.length + 1 }),
                  });
                  patchField({ ...field, options });
                }}
                type="button"
              >
                {authoringText('Add choice')}
              </button>
            ) : null}
          </div>
        </InspectorField>
      ) : null}
      <p className="rich-content-form-field-note">
        {authoringText(
          'Answers stay in this experience. Lodariq does not read your product database.',
        )}
      </p>
          </>
        ) : (
          <>
      <InspectorField id="formField.size" label={authoringText('Size')}>
        <RichContentSelect
          ariaLabel={authoringText('Size')}
          onValueChange={(value) =>
            patchField({ ...field, size: value as (typeof BUTTON_SIZE_VALUES)[number] })
          }
          options={BUTTON_SIZE_OPTIONS}
          value={field.size ?? 'regular'}
        />
      </InspectorField>
      <InspectorField id="formField.alignment" label={authoringText('Alignment')}>
        <RichContentSelect
          ariaLabel={authoringText('Alignment')}
          onValueChange={(value) =>
            update((node) =>
              node.setBlockAlign(value as (typeof BLOCK_ALIGNMENT_VALUES)[number]),
            )
          }
          options={ALIGNMENT_OPTIONS}
          value={snapshot.props.blockLayout?.align ?? 'start'}
        />
      </InspectorField>
      <InspectorField id="formField.radius" label={authoringText('Corner radius')}>
        <RichContentSelect
          ariaLabel={authoringText('Corner radius')}
          onValueChange={(value) =>
            patchField({ ...field, radius: value as (typeof BUTTON_RADIUS_VALUES)[number] })
          }
          options={BUTTON_RADIUS_OPTIONS}
          value={field.radius ?? 'theme'}
        />
      </InspectorField>
      <div className="storyboard-property-color-row">
        <InspectorField id="formField.fillColor" label={authoringText('Fill')}>
          <input
            aria-label={authoringText('Fill')}
            onChange={(event) => patchField({ ...field, fillColor: event.currentTarget.value })}
            type="color"
            value={field.fillColor ?? (field.control === 'text' ? '#ffffff' : '#006b58')}
          />
        </InspectorField>
        <InspectorField id="formField.labelColor" label={authoringText('Label color')}>
          <input
            aria-label={authoringText('Label color')}
            onChange={(event) => patchField({ ...field, labelColor: event.currentTarget.value })}
            type="color"
            value={field.labelColor ?? '#1c2b28'}
          />
        </InspectorField>
        <InspectorField id="formField.borderColor" label={authoringText('Border')}>
          <input
            aria-label={authoringText('Border')}
            onChange={(event) => patchField({ ...field, borderColor: event.currentTarget.value })}
            type="color"
            value={field.borderColor ?? '#006b58'}
          />
        </InspectorField>
      </div>
      {field.control === 'text' ? (
        <InspectorField id="formField.textColor" label={authoringText('Text')}>
          <input
            aria-label={authoringText('Text')}
            onChange={(event) => patchField({ ...field, textColor: event.currentTarget.value })}
            type="color"
            value={field.textColor ?? '#1c2b28'}
          />
        </InspectorField>
      ) : null}
          </>
        )}
      </div>
    </>
  );
}

function InspectorField({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: string;
  label: string;
}): ReactElement {
  return (
    <label className="storyboard-property-control" data-property-id={id}>
      <span>{label}</span>
      {children}
    </label>
  );
}

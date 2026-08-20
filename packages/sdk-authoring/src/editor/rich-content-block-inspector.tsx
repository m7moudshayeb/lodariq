import {
  BLOCK_ALIGNMENT_VALUES,
  BUTTON_ICON_PLACEMENT_VALUES,
  BUTTON_SIZE_VALUES,
  BUTTON_WIDTH_PX_LIMITS,
  BUTTON_WIDTH_VALUES,
  FORM_FIELD_CONTROL_VALUES,
  FORM_FIELD_GAP_PX_LIMITS,
  MEDIA_ASPECT_RATIO_VALUES,
  MEDIA_HEIGHT_PX_LIMITS,
  MEDIA_WIDTH_PERCENT_LIMITS,
  type FormFieldControl,
  type FormFieldPresentation,
  type LodariqBlockProps,
  type MediaPresentation,
} from '@lodariq/schema';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import { X } from 'lucide-react';
import { useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { authoringText } from '../i18n';
import { readViewportRect, RichContentFloatingAnchor } from './rich-content-floating';
import { RichContentHostContext } from './rich-content-host-context';
import {
  $isRichButtonNode,
  $isRichFormFieldNode,
  $isRichMediaNode,
  MEDIA_FIT_OPTIONS,
  RICH_BUTTON_ACTION_OPTIONS,
  RICH_BUTTON_SEQUENCE_ACTION_OPTION,
  RICH_BUTTON_VARIANT_OPTIONS,
  type RichButtonActionType,
  type RichButtonNode,
  type RichFormFieldNode,
  type RichMediaNode,
} from './rich-content-nodes';
import { InspectorSections } from './rich-content-inspector-sections';
import {
  AuthoringRange,
  ExclusiveFloatingGroup,
  Globe,
  RefreshCcw,
  Wand2,
} from '../authoring/local-frame-ui/design-system';
import { PropertyChoiceField } from '../authoring/local-frame-ui/properties/property-controls';
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
] as const;
const BUTTON_ICON_OPTIONS = [
  { value: 'none', label: authoringText('None') },
  { value: 'arrow-right', label: authoringText('Arrow') },
  { value: 'external-link', label: authoringText('External') },
  { value: 'check', label: authoringText('Check') },
] as const;
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
/** §4.3's floor: the runtime pads anything smaller, so the figure is a promise. */
const TAP_TARGET_MIN_PX = 44;
const MEDIA_KIND_OPTIONS = [
  { value: 'image', label: authoringText('Image') },
  { value: 'video', label: authoringText('Video') },
] as const;
const MEDIA_ASPECT_OPTIONS = [
  ...MEDIA_ASPECT_RATIO_VALUES.map((value) => ({ value, label: value })),
  { value: 'free', label: authoringText('Free') },
];
const FIELD_LABEL_PLACEMENT_OPTIONS = [
  { value: 'above', label: authoringText('Above') },
  { value: 'beside', label: authoringText('Beside') },
  { value: 'hidden', label: authoringText('Hidden') },
] as const;
const FIELD_LABEL_SIZE_OPTIONS = [
  { value: 'small', label: authoringText('Small') },
  { value: 'regular', label: authoringText('Regular') },
  { value: 'large', label: authoringText('Large') },
] as const;
const FIELD_LABEL_WEIGHT_OPTIONS = [
  { value: 'regular', label: authoringText('Regular') },
  { value: 'medium', label: authoringText('Medium') },
  { value: 'bold', label: authoringText('Bold') },
] as const;
const FIELD_CONTROL_WIDTH_OPTIONS = [
  { value: 'full', label: authoringText('Full') },
  { value: 'half', label: authoringText('Half') },
  { value: 'auto', label: authoringText('Fits content') },
] as const;
const NAVIGATION_OPTIONS = [
  { value: 'continue', label: authoringText('Continue tour') },
  { value: 'stay', label: authoringText('Keep current step') },
] as const;
type InspectedKind = 'button' | 'formField' | 'media';
type InspectedTarget = { kind: InspectedKind; key: NodeKey };

/** §4.3 titles the popover with the thing it inspects, not with the word "settings". */
const INSPECTOR_LABELS: Record<InspectedKind, string> = {
  button: authoringText('Button'),
  formField: authoringText('Form field'),
  media: authoringText('Media block'),
};

function inspectedTargetFromNode(node: LexicalNode): InspectedTarget | null {
  if ($isRichButtonNode(node)) return { kind: 'button', key: node.getKey() };
  if ($isRichFormFieldNode(node)) return { kind: 'formField', key: node.getKey() };
  if ($isRichMediaNode(node)) return { kind: 'media', key: node.getKey() };
  return null;
}

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
          const next = node ? inspectedTargetFromNode(node) : null;
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

  if (!target) return null;
  const close = (): void => {
    dismissedRef.current = true;
    setTarget(null);
    closeInspector(editor);
  };
  let InspectorView = MediaInspector;
  if (target.kind === 'button') InspectorView = ButtonInspector;
  else if (target.kind === 'formField') InspectorView = FormFieldInspector;
  const tray = (
    <section aria-label={INSPECTOR_LABELS[target.kind]} className="storyboard-property-tray" data-tool-mode="content">
      <span aria-hidden="true" className="storyboard-tray-handle" />
      {/* Same rule as the step's inspector: one picker open at a time. */}
      <ExclusiveFloatingGroup>
        <InspectorView nodeKey={target.key} onClose={close} />
      </ExclusiveFloatingGroup>
    </section>
  );
  if (host.inspectorHost) return createPortal(tray, host.inspectorHost);
  const contextElement = editor.getRootElement();
  if (!contextElement) return null;
  return (
    <RichContentFloatingAnchor
      anchorRect={() => {
        const element = editor.getElementByKey(target.key);
        return element ? readViewportRect(element) : readViewportRect(contextElement);
      }}
      className="rich-content-inspector-popover"
      contextElement={contextElement}
      open
      placement="right-start"
    >
      {tray}
    </RichContentFloatingAnchor>
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
        <strong className="content-inspector-title">{INSPECTOR_LABELS.button}</strong>
        <InspectorCloseButton onClose={onClose} />
      </div>
      <div className="overlay-step-inspector-body" data-overlay-inspector-scroll="">
      <InspectorSections
        kind="button"
        resetKey={nodeKey}
        bodies={{
          /*
           * §4.3 puts everything about the button's *shape* here and leaves Style
           * for colour. Splitting them the other way — one text row here, eight
           * rows under Style — meant the section named after the thing said
           * almost nothing about it.
           */
          button: (
            <>
      <InspectorField id="button.label" label={authoringText('Label')}>
        <input
          aria-label={authoringText('Label')}
          className="ui-input"
          onChange={(event) => update((node) => node.setContent(event.currentTarget.value))}
          type="text"
          value={content}
        />
      </InspectorField>
      <PropertyChoiceField
        label={authoringText('Variant')}
        onChange={(value) =>
          update((node) => node.setVariant(value as NonNullable<LodariqBlockProps['variant']>))
        }
        options={RICH_BUTTON_VARIANT_OPTIONS}
        presentation="track"
        value={props.variant ?? 'primary'}
      />
      <PropertyChoiceField
        label={authoringText('Size')}
        onChange={(value) =>
          update((node) =>
            node.setButtonStyle({ size: value as (typeof BUTTON_SIZE_VALUES)[number] }),
          )
        }
        options={BUTTON_SIZE_OPTIONS}
        presentation="track"
        value={props.buttonStyle?.size ?? 'regular'}
      />
      <PropertyChoiceField
        label={authoringText('Width')}
        onChange={(value) =>
          update((node) =>
            node.setButtonStyle({
              width: value as (typeof BUTTON_WIDTH_VALUES)[number],
              widthPx: undefined,
            }),
          )
        }
        options={BUTTON_WIDTH_OPTIONS}
        presentation="track"
        value={props.buttonStyle?.widthPx ? 'hug' : (props.buttonStyle?.width ?? 'hug')}
      />
      {/* Only a hugging button has room for an exact figure; a filling one is told its width. */}
      {(props.buttonStyle?.width ?? 'hug') === 'hug' ? (
        <AuthoringRange
          label={authoringText('Exact width')}
          max={BUTTON_WIDTH_PX_LIMITS.max}
          min={BUTTON_WIDTH_PX_LIMITS.min}
          onValueChange={(value) => update((node) => node.setButtonStyle({ widthPx: value }))}
          step={BUTTON_WIDTH_PX_LIMITS.step}
          unit={authoringText('px')}
          value={props.buttonStyle?.widthPx ?? 160}
        />
      ) : null}
      <PropertyChoiceField
        label={authoringText('Corner')}
        onChange={(value) =>
          update((node) =>
            node.setButtonStyle({
              radius: value as (typeof BUTTON_RADIUS_OPTIONS)[number]['value'],
            }),
          )
        }
        options={BUTTON_RADIUS_OPTIONS}
        presentation="track"
        value={props.buttonStyle?.radius ?? 'theme'}
      />
      <PropertyChoiceField
        label={authoringText('Icon')}
        onChange={(value) =>
          update((node) =>
            node.setButtonStyle({ icon: value as (typeof BUTTON_ICON_OPTIONS)[number]['value'] }),
          )
        }
        options={BUTTON_ICON_OPTIONS}
        presentation="menu"
        value={props.buttonStyle?.icon ?? 'none'}
      />
      <PropertyChoiceField
        label={authoringText('Icon side')}
        onChange={(value) =>
          update((node) =>
            node.setButtonStyle({
              iconPlacement: value as (typeof BUTTON_ICON_PLACEMENT_VALUES)[number],
            }),
          )
        }
        options={BUTTON_ICON_PLACEMENT_OPTIONS}
        presentation="track"
        value={props.buttonStyle?.iconPlacement ?? 'end'}
      />
      <p className="overlay-step-inspector-note">
        {authoringText(
          'Tap target {height}×{width} — the runtime pads anything under {min}×{min} CSS px.',
          {
            height: props.buttonStyle?.size === 'compact' ? 28 : 34,
            min: TAP_TARGET_MIN_PX,
            width:
              (props.buttonStyle?.width ?? 'hug') === 'fill'
                ? authoringText('full')
                : authoringText('auto'),
          },
        )}
      </p>
            </>
          ),
          action: (
            <>
      <InspectorField id="button.action" label={authoringText('On click')}>
        <RichContentSelect
          ariaLabel={authoringText('On click')}
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
      {/*
        Two actions carry a consequence the label cannot: one hands the click to
        Lodariq, the other leaves this document entirely.
      */}
      {actionType === 'clickTarget' ? (
        <p className="overlay-step-inspector-note">
          {authoringText(
            'Lodariq performs the click for them, then advances. Useful when the point is the outcome, not the practice.',
          )}
        </p>
      ) : null}
      {actionType === 'runSequence' ? (
        <p className="overlay-step-inspector-note">
          {authoringText('The sequence runs in the flow map, where it can be watched and edited.')}
        </p>
      ) : null}
            </>
          ),
          /*
           * Colour only. The shape rows moved to Button, where §4.3 has them —
           * what is left is the part a theme can own.
           */
          style: (
            <>
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
          ),
        }}
      />
      </div>
    </>
  );
}

function MediaInspector({
  nodeKey,
  onClose,
}: {
  nodeKey: NodeKey;
  onClose: () => void;
}): ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const snapshot = useInspectedSnapshot(editor, nodeKey, () => {
    const node = $getNodeByKey(nodeKey);
    return $isRichMediaNode(node) ? node.getMedia() : null;
  });
  if (!snapshot) return null;
  const update = (change: (node: RichMediaNode) => void): void => {
    updateInspectedNode(editor, nodeKey, () => {
      const node = $getNodeByKey(nodeKey);
      if (!$isRichMediaNode(node)) return false;
      change(node);
      return true;
    });
  };
  return (
    <>
      <div className="content-inspector-chrome">
        <strong className="content-inspector-title">{INSPECTOR_LABELS.media}</strong>
        <InspectorCloseButton onClose={onClose} />
      </div>
      <div className="overlay-step-inspector-body" data-overlay-inspector-scroll="">
      <InspectorSections
        kind="media"
        resetKey={nodeKey}
        bodies={{
          media: (
            <>
              {/*
                Kind reads back rather than switches: an image and a video are
                different assets, so changing it is replacing the media, which is
                the menu item below — not a segment that would strand the asset id.
              */}
              <PropertyChoiceField
                label={authoringText('Kind')}
                onChange={() => undefined}
                options={MEDIA_KIND_OPTIONS}
                presentation="track"
                value={snapshot.kind}
              />
              <PropertyChoiceField
                label={authoringText('Framing')}
                onChange={(value) =>
                  update((node) => node.setFit(value as NonNullable<MediaPresentation['fit']>))
                }
                options={MEDIA_FIT_OPTIONS}
                presentation="menu"
                value={snapshot.fit ?? 'contain'}
              />
              <AuthoringRange
                label={authoringText('Width')}
                max={MEDIA_WIDTH_PERCENT_LIMITS.max}
                min={MEDIA_WIDTH_PERCENT_LIMITS.min}
                onValueChange={(widthPercent) => update((node) => node.setSize({ widthPercent }))}
                step={1}
                unit={authoringText('% of card')}
                value={snapshot.widthPercent ?? 100}
              />
              <AuthoringRange
                label={authoringText('Height')}
                max={MEDIA_HEIGHT_PX_LIMITS.max}
                min={MEDIA_HEIGHT_PX_LIMITS.min}
                onValueChange={(heightPx) => update((node) => node.setSize({ heightPx }))}
                step={2}
                unit={authoringText('px')}
                value={snapshot.heightPx ?? 120}
              />
              <PropertyChoiceField
                label={authoringText('Aspect')}
                onChange={(value) =>
                  update((node) =>
                    node.setAspectRatio(
                      value === 'free'
                        ? undefined
                        : (value as NonNullable<MediaPresentation['aspectRatio']>),
                    ),
                  )
                }
                options={MEDIA_ASPECT_OPTIONS}
                presentation="track"
                value={snapshot.aspectRatio ?? 'free'}
              />
              <p className="overlay-step-inspector-note">
                {authoringText(
                  'Width {minWidth}–{maxWidth}%, height {minHeight}–{maxHeight}px. Drag the handles on the media itself.',
                  {
                    maxHeight: MEDIA_HEIGHT_PX_LIMITS.max,
                    maxWidth: MEDIA_WIDTH_PERCENT_LIMITS.max,
                    minHeight: MEDIA_HEIGHT_PX_LIMITS.min,
                    minWidth: MEDIA_WIDTH_PERCENT_LIMITS.min,
                  },
                )}
              </p>
              {/*
                WIRE_BE: replacing an asset and holding a per-locale variant both
                need the media library the control plane serves. Shown disabled so
                the section says what it will do rather than hiding it.
              */}
              <div className="inspector-menu">
                <button data-media-action="replace" disabled type="button">
                  <RefreshCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                  {authoringText('Replace media…')}
                </button>
                <button data-media-action="per-locale" disabled type="button">
                  <Globe size={14} strokeWidth={2.2} aria-hidden="true" />
                  {authoringText('Per-locale media…')}
                </button>
              </div>
            </>
          ),
          frame: <MediaFrameSection kind={snapshot.kind} />,
          altText: (
            <MediaAltTextSection
              alt={snapshot.accessibilityName}
              onChange={(value) => update((node) => node.setAccessibilityName(value))}
            />
          ),
        }}
      />
      </div>
    </>
  );
}

/**
 * WIRE_BE: the frame is drawn by the runtime from theme tokens today, so a
 * per-block radius, caption and playback pair have nowhere to persist. They hold
 * for the session, which is enough to show what the section will control.
 */
function MediaFrameSection({ kind }: { kind: MediaPresentation['kind'] }): ReactElement {
  const [radius, setRadius] = useState(8);
  const [caption, setCaption] = useState('');
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(true);
  return (
    <>
      <AuthoringRange
        label={authoringText('Corner radius')}
        max={32}
        min={0}
        onValueChange={setRadius}
        step={1}
        unit={authoringText('px')}
        value={radius}
      />
      <label className="rich-step-choice-field" data-presentation="text">
        <span className="rich-step-field-label">{authoringText('Caption')}</span>
        <input
          className="rich-step-text-value"
          data-media-caption=""
          onChange={(event) => setCaption(event.target.value)}
          placeholder={authoringText('Shown under the media')}
          type="text"
          value={caption}
        />
      </label>
      {kind === 'video' ? (
        <>
          <PropertyChoiceField
            label={authoringText('Loop the video')}
            onChange={(value) => setLoop(value === 'on')}
            options={[
              { value: 'on', label: authoringText('On') },
              { value: 'off', label: authoringText('Off') },
            ]}
            presentation="menu"
            value={loop ? 'on' : 'off'}
          />
          <PropertyChoiceField
            label={authoringText('Start muted')}
            onChange={(value) => setMuted(value === 'on')}
            options={[
              { value: 'on', label: authoringText('On') },
              { value: 'off', label: authoringText('Off') },
            ]}
            presentation="menu"
            value={muted ? 'on' : 'off'}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * Alt text. The stored name starts as the uploaded file's, which is a name and
 * not a description — so a value that still looks like a filename counts as
 * missing, and says so where it blocks publish.
 */
function MediaAltTextSection({
  alt,
  onChange,
}: {
  alt: string;
  onChange: (value: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState(alt);
  const missing = draft.trim().length === 0 || /\.[a-z0-9]{2,4}$/iu.test(draft.trim());
  return (
    <>
      <label className="rich-step-choice-field" data-presentation="text">
        <span className="rich-step-field-label">{authoringText('Describe it')}</span>
        <textarea
          className="rich-step-text-value"
          data-media-alt=""
          onBlur={() => {
            if (draft.trim()) onChange(draft.trim().slice(0, 300));
          }}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={authoringText('What does the image show?')}
          rows={3}
          value={draft}
        />
      </label>
      {missing ? (
        <p className="inspector-warning warning" data-media-alt-missing="">
          {authoringText('Missing alt text blocks publish in the Check report.')}
        </p>
      ) : null}
      {/* WIRE_BE: description generation is an Assist call the frame cannot make. */}
      <div className="inspector-menu">
        <button data-media-action="describe" disabled type="button">
          <Wand2 size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Describe it for me')}
        </button>
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
        <strong className="content-inspector-title">{INSPECTOR_LABELS.formField}</strong>
        <InspectorCloseButton onClose={onClose} />
      </div>
      <div className="overlay-step-inspector-body" data-overlay-inspector-scroll="">
      <InspectorSections
        kind="formField"
        resetKey={nodeKey}
        bodies={{
          /*
           * Control first, as §4.3 has it: what kind of question this is decides
           * which of the rows below even apply.
           */
          field: (
            <>
      <PropertyChoiceField
        label={authoringText('Control')}
        onChange={(value) => {
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
        presentation="track"
        value={field.control}
      />
      <InspectorField id="formField.label" label={authoringText('Label')}>
        <input
          aria-label={authoringText('Field label')}
          className="ui-input"
          onChange={(event) => update((node) => node.setContent(event.currentTarget.value))}
          type="text"
          value={snapshot.content}
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
      <PropertyChoiceField
        label={authoringText('Size')}
        onChange={(value) =>
          patchField({ ...field, size: value as (typeof BUTTON_SIZE_VALUES)[number] })
        }
        options={BUTTON_SIZE_OPTIONS}
        presentation="track"
        value={field.size ?? 'regular'}
      />
      <PropertyChoiceField
        label={authoringText('Corner')}
        onChange={(value) =>
          patchField({
            ...field,
            radius: value as (typeof BUTTON_RADIUS_OPTIONS)[number]['value'],
          })
        }
        options={BUTTON_RADIUS_OPTIONS}
        presentation="track"
        value={field.radius ?? 'theme'}
      />
      <p className="rich-content-form-field-note">
        {authoringText(
          'Answers stay in this experience. Lodariq does not read your product database.',
        )}
      </p>
            </>
          ),
          validation: (
            <FormFieldValidationSection
              onRequiredChange={(required) =>
                patchField({ ...field, required: required ? true : undefined })
              }
              required={Boolean(field.required)}
            />
          ),
          /*
           * Three groups, because a field is two things a creator styles
           * separately and then arranges together: the question, the answer box,
           * and how the pair sits.
           */
          style: (
            <>
      <p className="inspector-group-title">{authoringText('The label')}</p>
      <PropertyChoiceField
        label={authoringText('Position')}
        onChange={(value) =>
          patchField({
            ...field,
            labelPlacement: value as (typeof FIELD_LABEL_PLACEMENT_OPTIONS)[number]['value'],
          })
        }
        options={FIELD_LABEL_PLACEMENT_OPTIONS}
        presentation="track"
        value={field.labelPlacement ?? 'above'}
      />
      <PropertyChoiceField
        label={authoringText('Text size')}
        onChange={(value) =>
          patchField({
            ...field,
            labelSize: value as (typeof FIELD_LABEL_SIZE_OPTIONS)[number]['value'],
          })
        }
        options={FIELD_LABEL_SIZE_OPTIONS}
        presentation="track"
        value={field.labelSize ?? 'regular'}
      />
      <PropertyChoiceField
        label={authoringText('Weight')}
        onChange={(value) =>
          patchField({
            ...field,
            labelWeight: value as (typeof FIELD_LABEL_WEIGHT_OPTIONS)[number]['value'],
          })
        }
        options={FIELD_LABEL_WEIGHT_OPTIONS}
        presentation="track"
        value={field.labelWeight ?? 'medium'}
      />
      <InspectorField id="formField.labelColor" label={authoringText('Colour')}>
        <input
          aria-label={authoringText('Label color')}
          onChange={(event) => patchField({ ...field, labelColor: event.currentTarget.value })}
          type="color"
          value={field.labelColor ?? '#1c2b28'}
        />
      </InspectorField>
      {field.labelPlacement === 'hidden' ? (
        <p className="overlay-step-inspector-note">
          {authoringText(
            'Hidden on screen, still read aloud — a screen reader announces it either way.',
          )}
        </p>
      ) : null}

      <p className="inspector-group-title">{authoringText('The answer box')}</p>
      <PropertyChoiceField
        label={authoringText('Width')}
        onChange={(value) =>
          patchField({
            ...field,
            controlWidth: value as (typeof FIELD_CONTROL_WIDTH_OPTIONS)[number]['value'],
          })
        }
        options={FIELD_CONTROL_WIDTH_OPTIONS}
        presentation="track"
        value={field.controlWidth ?? 'full'}
      />
      <div className="storyboard-property-color-row">
        <InspectorField id="formField.fillColor" label={authoringText('Fill')}>
          <input
            aria-label={authoringText('Fill')}
            onChange={(event) => patchField({ ...field, fillColor: event.currentTarget.value })}
            type="color"
            value={field.fillColor ?? (field.control === 'text' ? '#ffffff' : '#006b58')}
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
        {field.control === 'text' ? (
          <InspectorField id="formField.textColor" label={authoringText('Typed text')}>
            <input
              aria-label={authoringText('Text')}
              onChange={(event) => patchField({ ...field, textColor: event.currentTarget.value })}
              type="color"
              value={field.textColor ?? '#1c2b28'}
            />
          </InspectorField>
        ) : null}
      </div>

      <p className="inspector-group-title">{authoringText('The two together')}</p>
      <PropertyChoiceField
        label={authoringText('Alignment')}
        onChange={(value) =>
          update((node) => node.setBlockAlign(value as (typeof BLOCK_ALIGNMENT_VALUES)[number]))
        }
        options={ALIGNMENT_OPTIONS}
        presentation="track"
        value={snapshot.props.blockLayout?.align ?? 'start'}
      />
      <AuthoringRange
        label={authoringText('Space between')}
        max={FORM_FIELD_GAP_PX_LIMITS.max}
        min={FORM_FIELD_GAP_PX_LIMITS.min}
        onValueChange={(gapPx) => patchField({ ...field, gapPx })}
        step={1}
        unit={authoringText('px')}
        value={field.gapPx ?? 6}
      />
            </>
          ),
        }}
      />
      </div>
    </>
  );
}

/**
 * §4.3's Validation section: whether an answer is needed, what it says when one
 * is missing, and where the answers land.
 *
 * WIRE_BE: the empty-field message is a runtime string with no schema field yet,
 * so it holds for the session. Where responses land is a fact about the product,
 * not a choice — it reads back rather than picks.
 */
function FormFieldValidationSection({
  onRequiredChange,
  required,
}: {
  onRequiredChange: (required: boolean) => void;
  required: boolean;
}): ReactElement {
  const [message, setMessage] = useState('');
  return (
    <>
      <PropertyChoiceField
        label={authoringText('Required')}
        onChange={(value) => onRequiredChange(value === 'on')}
        options={[
          { value: 'off', label: authoringText('Optional') },
          { value: 'on', label: authoringText('Required') },
        ]}
        presentation="track"
        value={required ? 'on' : 'off'}
      />
      <label className="rich-step-choice-field" data-presentation="text">
        <span className="rich-step-field-label">
          {authoringText('Message when it is empty')}
        </span>
        <input
          className="rich-step-text-value"
          data-field-empty-message=""
          onChange={(event) => setMessage(event.target.value)}
          placeholder={authoringText('Please answer this')}
          type="text"
          value={message}
        />
      </label>
      <div className="rich-step-choice-field" data-presentation="menu">
        <span className="rich-step-field-label">{authoringText('Capture responses to')}</span>
        <span className="inspector-readback">{authoringText('Form responses report')}</span>
      </div>
      <p className="overlay-step-inspector-note">
        {authoringText('Responses land in Operations → Analytics → Form responses.')}
      </p>
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

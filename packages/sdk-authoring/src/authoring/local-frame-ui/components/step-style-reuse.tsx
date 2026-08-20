import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { ClipboardPaste, Copy, Layers, Plus, Save } from '../design-system';

/**
 * Style reuse (§6.2), the whole fix for audit finding #5 — six cards that
 * "required repeating alignment, padding, radius, palette, border and shadow
 * choices one step at a time".
 *
 * §4.3 draws these as one menu, glyph and shortcut per row, rather than as four
 * buttons in a strip: they are commands, not properties, and a menu is what says
 * so. `Apply to…` names how many steps it will touch before it does anything,
 * because a batch operation that does not state its blast radius is a trap.
 */
export function StepStyleReuse({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
}) {
  const selectedCount = snapshot.selectedStepIds.size;
  const recipes = snapshot.stepStyleRecipes;
  const canPaste = snapshot.stepStyleClipboardAvailable;
  /* The style this step last wore, which is what `Update` would rewrite. */
  const boundRecipeId = snapshot.stepStyleRecipeByStep.get(step.id);
  const boundRecipe = recipes.find((recipe) => recipe.id === boundRecipeId);

  return (
    <section className="step-style-reuse" aria-label={authoringText('Reuse this style')}>
      <div className="inspector-menu">
        <button
          type="button"
          data-style-action="copy"
          onClick={() => controller.copyStepStyle(step.id)}
        >
          <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>{authoringText('Copy style')}</span>
          <kbd>⌘⌥C</kbd>
        </button>
        <button
          type="button"
          data-style-action="paste"
          disabled={!canPaste}
          onClick={() => controller.pasteStepStyle(step.id)}
        >
          <ClipboardPaste size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>{authoringText('Paste style')}</span>
          <kbd>⌘⌥V</kbd>
        </button>
        <button
          type="button"
          data-style-action="apply-to"
          disabled={!canPaste}
          onClick={() => controller.applyCopiedStyleToSelected(step.id)}
        >
          <Layers size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>
            {selectedCount > 0
              ? authoringText('Apply to {count} selected steps', { count: selectedCount })
              : authoringText('Apply to…')}
          </span>
        </button>
        <button
          type="button"
          data-style-action="create"
          onClick={() => controller.saveStepStyleRecipe(step.id)}
        >
          <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>{authoringText('Create style from this step…')}</span>
        </button>
        {/* Disabled until the step has worn a saved style: nothing to rewrite. */}
        <button
          type="button"
          data-style-action="update"
          disabled={!boundRecipe}
          onClick={() => {
            if (boundRecipe) controller.updateStepStyleRecipe(boundRecipe.id, step.id);
          }}
        >
          <Save size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>
            {boundRecipe
              ? authoringText('Update “{name}”', { name: boundRecipe.name })
              : authoringText('Update the saved style')}
          </span>
        </button>
      </div>
      <p className="step-style-reuse-hint">
        {selectedCount > 0
          ? authoringText('{count} steps selected in the filmstrip.', { count: selectedCount })
          : authoringText('Shift-click or ⌘-click steps in the filmstrip to apply to several.')}
      </p>
      {recipes.length === 0 ? null : (
        <ul className="step-style-recipe-list" aria-label={authoringText('Saved styles')}>
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                data-style-recipe={recipe.id}
                onClick={() => controller.applyStepStyleRecipe(recipe.id, step.id)}
              >
                <span
                  aria-hidden="true"
                  className="step-style-recipe-swatch"
                  style={{
                    background: recipe.thumbnail.surfaceColor,
                    borderColor: recipe.thumbnail.actionColor,
                    color: recipe.thumbnail.textColor,
                  }}
                />
                {recipe.name}
              </button>
              <button
                type="button"
                className="step-style-recipe-remove"
                aria-label={authoringText('Delete {name}', { name: recipe.name })}
                onClick={() => controller.deleteStepStyleRecipe(recipe.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

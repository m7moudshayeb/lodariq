import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface ExclusiveFloatingGroup {
  readonly openId: string | null;
  readonly setOpenId: (id: string | null) => void;
  /**
   * Flip one picker against whatever is open *now*.
   *
   * A trigger that toggled against its rendered `open` was always wrong on the
   * gesture that matters: pressing picker B while A is open runs A's dismissal
   * first, in the same batch, so by the time B's handler reads `open` the value
   * it sees is already stale and B closes itself instead of opening.
   */
  readonly toggleOpenId: (id: string) => void;
  /**
   * Close one picker, and only if it is still the open one.
   *
   * Radix dismisses on a document-level pointerdown that runs *after* the
   * trigger's own handler, so an unguarded close would undo the open that the
   * very same press just asked for — which is what made a neighbouring picker
   * need two clicks.
   */
  readonly closeOpenId: (id: string) => void;
}

const ExclusiveFloatingContext = createContext<ExclusiveFloatingGroup | null>(null);

/**
 * One open menu at a time, for a surface full of pickers.
 *
 * Each Radix root manages its own open state, and its dismiss layer only knows
 * about pointers that land outside *it*. Inside a 320px inspector that produced
 * two problems at once: menus that could coexist, and — because the first
 * menu's dismissal and the second trigger's press are the same gesture — a
 * second picker that took two clicks to open, since the first click was spent
 * closing its neighbour.
 *
 * Hoisting "which one is open" to the group settles both. The dismissal clears
 * the id and the trigger sets it, in that order, so the gesture reads as a swap.
 */
export function ExclusiveFloatingGroup({ children }: { readonly children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggleOpenId = useCallback((id: string): void => {
    setOpenId((current) => (current === id ? null : id));
  }, []);
  const closeOpenId = useCallback((id: string): void => {
    setOpenId((current) => (current === id ? null : current));
  }, []);
  const value = useMemo(
    () => ({ closeOpenId, openId, setOpenId, toggleOpenId }),
    [closeOpenId, openId, toggleOpenId],
  );
  return (
    <ExclusiveFloatingContext.Provider value={value}>{children}</ExclusiveFloatingContext.Provider>
  );
}

/**
 * Open state for one picker: shared when it sits in a group, its own otherwise.
 * A control outside a group keeps working exactly as it did.
 */
export function useExclusiveFloating(controlled?: {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}): { open: boolean; setOpen: (open: boolean) => void; toggle: () => void } {
  const id = useId();
  const group = useContext(ExclusiveFloatingContext);
  const [standalone, setStandalone] = useState(false);
  const { onOpenChange, open: openProp } = controlled ?? {};

  const setOpen = useCallback(
    (next: boolean): void => {
      if (group) {
        if (next) group.setOpenId(id);
        else group.closeOpenId(id);
      } else setStandalone(next);
      onOpenChange?.(next);
    },
    [group, id, onOpenChange],
  );

  const toggle = useCallback((): void => {
    if (group) group.toggleOpenId(id);
    else setStandalone((current) => !current);
  }, [group, id]);

  // An explicit `open` prop is the caller's business and always wins.
  if (openProp !== undefined) return { open: openProp, setOpen, toggle };
  return { open: group ? group.openId === id : standalone, setOpen, toggle };
}

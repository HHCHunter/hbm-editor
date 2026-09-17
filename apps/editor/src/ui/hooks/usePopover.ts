import { autoUpdate, flip, offset, shift, size, useFloating, type Placement } from '@floating-ui/react-dom';

export interface PopoverOptions {
  open: boolean;
  placement?: Placement;
  gap?: number;
  /** Make the popup at least as wide as its anchor, as a select list is. */
  matchWidth?: boolean;
}

/** Position a popup next to an anchor, keeping it on screen as the anchor moves or the window resizes. */
export function usePopover({ open, placement = 'bottom-start', gap = 2, matchWidth = false }: PopoverOptions) {
  return useFloating({
    open,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(gap),
      flip({ padding: 4 }),
      shift({ padding: 4 }),
      size({
        padding: 4,
        apply({ availableHeight, rects, elements }) {
          elements.floating.style.maxHeight = `${Math.max(120, availableHeight)}px`;
          if (matchWidth) elements.floating.style.minWidth = `${rects.reference.width}px`;
        },
      }),
    ],
  });
}

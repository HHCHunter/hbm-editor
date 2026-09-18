import type { ReactNode } from 'react';
import { usePaneSize } from '../shell/layoutStore';
import { SplitPane } from '../ui';

export interface BrowserSplitProps {
  /** Remembers the size for the session, e.g. "textures.detail". */
  id: string;
  label: string;
  /** The side that keeps its size: a list on the left, or a details pane on the right. */
  fixed?: 'start' | 'end';
  defaultSize?: string;
  min?: number;
  minOther?: number;
  start: ReactNode;
  /** Leave out while there's nothing to show; the start pane then takes the width. */
  end?: ReactNode;
}

/** A browser's list and details side by side, with a splitter between them. */
export function BrowserSplit({
  id,
  label,
  fixed = 'end',
  defaultSize = '22rem',
  min = 14,
  minOther = 16,
  start,
  end,
}: BrowserSplitProps) {
  const pane = usePaneSize(id);
  return (
    <SplitPane
      label={label}
      direction="row"
      fixed={fixed}
      defaultSize={defaultSize}
      min={min}
      minOther={minOther}
      {...pane}
      // Hidden rather than removed, so the list keeps its focus and scroll when details appear.
      hide={end ? undefined : 'end'}
      className="browser-body"
      start={start}
      end={end}
    />
  );
}

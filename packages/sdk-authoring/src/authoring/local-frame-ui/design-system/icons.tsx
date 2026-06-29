import {
  Activity,
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FileJson,
  GripVertical,
  Heading,
  MoreHorizontal,
  MousePointer2,
  Plus,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Type,
  Wand2,
} from 'lucide-react';
import type { ReactNode } from 'react';

export {
  Activity,
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FileJson,
  GripVertical,
  Heading,
  MoreHorizontal,
  MousePointer2,
  Plus,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Type,
  Wand2,
};

export function IconGlyph({ children }: { children: ReactNode }) {
  return <span className="ui-icon">{children}</span>;
}

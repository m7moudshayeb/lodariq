import type { ICON_RECIPE_VALUES } from '@lodariq/schema';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Bookmark,
  Calendar,
  CalendarDays,
  Camera,
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  CircleHelp,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Gift,
  Globe,
  Heart,
  Home,
  Image,
  Info,
  KeyRound,
  Laptop,
  Laugh,
  Lightbulb,
  Link,
  Lock,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Music,
  Package,
  PartyPopper,
  Phone,
  Play,
  Plus,
  Rocket,
  Search,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Smartphone,
  Smile,
  Sparkles,
  Star,
  Tag,
  Target,
  ThumbsUp,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Truck,
  Upload,
  User,
  Users,
  Video,
  Wrench,
  X,
  Zap,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';

type IconRecipe = (typeof ICON_RECIPE_VALUES)[number];

/**
 * Every icon a document can name, imported by name.
 *
 * This replaces lucide's `DynamicIcon`, which resolves an icon at runtime from
 * a map of roughly sixteen hundred lazy imports. Three costs came with it: the
 * map itself, around 118 KB before an icon was drawn; a separate chunk emitted
 * for every icon in the library, which is why the build produced more than
 * sixteen hundred assets; and a network round trip the first time each icon
 * appeared, so icons faded in one at a time.
 *
 * A document can only ever ask for a recipe in `ICON_RECIPE_VALUES`, so the
 * whole library was never reachable. Listing them makes the set explicit and
 * lets the bundler keep only what is named. Adding a recipe without adding it
 * here is a type error rather than a blank space.
 */
export const RICH_CONTENT_ICONS: Readonly<Record<IconRecipe, ComponentType<LucideProps>>> = {
  info: Info,
  check: Check,
  warning: TriangleAlert,
  star: Star,
  rocket: Rocket,
  search: Search,
  link: Link,
  lock: Lock,
  target: Target,
  settings: Settings,
  heart: Heart,
  sparkles: Sparkles,
  play: Play,
  flag: Flag,
  bell: Bell,
  calendar: Calendar,
  'circle-check': CircleCheck,
  'triangle-alert': TriangleAlert,
  'lock-keyhole': LockKeyhole,
  home: Home,
  user: User,
  users: Users,
  mail: Mail,
  phone: Phone,
  'map-pin': MapPin,
  globe: Globe,
  clock: Clock,
  camera: Camera,
  image: Image,
  video: Video,
  music: Music,
  download: Download,
  upload: Upload,
  'share-2': Share2,
  copy: Copy,
  x: X,
  plus: Plus,
  minus: Minus,
  'arrow-right': ArrowRight,
  'arrow-left': ArrowLeft,
  'chevron-right': ChevronRight,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  shield: Shield,
  'key-round': KeyRound,
  zap: Zap,
  lightbulb: Lightbulb,
  gift: Gift,
  trophy: Trophy,
  'badge-check': BadgeCheck,
  'thumbs-up': ThumbsUp,
  'message-circle': MessageCircle,
  'circle-help': CircleHelp,
  'circle-dollar-sign': CircleDollarSign,
  'chart-no-axes-column': ChartNoAxesColumn,
  'trending-up': TrendingUp,
  'calendar-days': CalendarDays,
  bookmark: Bookmark,
  tag: Tag,
  'shopping-cart': ShoppingCart,
  'credit-card': CreditCard,
  package: Package,
  truck: Truck,
  wrench: Wrench,
  laptop: Laptop,
  smartphone: Smartphone,
  smile: Smile,
  laugh: Laugh,
  'party-popper': PartyPopper,
};

/**
 * Renders the icon a document named.
 *
 * Returns nothing for a recipe that is not in the set, which keeps a document
 * carrying an icon from a newer build from breaking the surface it appears on.
 */
export function RichContentIcon({
  icon,
  ...props
}: { icon: IconRecipe } & LucideProps): ReactElement | null {
  const Icon = RICH_CONTENT_ICONS[icon];
  return Icon ? <Icon {...props} /> : null;
}

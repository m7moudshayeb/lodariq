import { EmojiPicker } from 'frimousse';
import { authoringText } from '../i18n';

export default function RichContentEmojiPicker({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  return (
    <EmojiPicker.Root
      className="rich-content-emoji-picker"
      columns={9}
      onEmojiSelect={({ emoji }) => onSelect(emoji)}
    >
      <EmojiPicker.Search
        aria-label={authoringText('Search emoji')}
        placeholder={authoringText('Search emoji')}
      />
      <EmojiPicker.Viewport>
        <EmojiPicker.Loading>{authoringText('Loading…')}</EmojiPicker.Loading>
        <EmojiPicker.Empty>{authoringText('No matching content')}</EmojiPicker.Empty>
        <EmojiPicker.List />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}

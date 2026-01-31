'use client'

import { EmojiPicker as FrimousseEmojiPicker, type EmojiPickerListCategoryHeaderProps, type EmojiPickerListRowProps, type EmojiPickerListEmojiProps, type Emoji } from 'frimousse'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
}

/**
 * Emoji picker using frimousse (lightweight, shadcn-compatible).
 * Styled to match the shadcn theme.
 */
export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  return (
    <FrimousseEmojiPicker.Root
      onEmojiSelect={(emoji: Emoji) => onSelect(emoji.emoji)}
      locale="es"
      columns={8}
      className="w-[320px] h-[400px] bg-popover border rounded-lg shadow-lg overflow-hidden flex flex-col"
    >
      <FrimousseEmojiPicker.Search
        className="m-2 h-9 px-3 bg-background border rounded-md text-sm outline-none focus:ring-2 focus:ring-ring"
        placeholder="Buscar emoji..."
      />
      <FrimousseEmojiPicker.Viewport className="flex-1 overflow-y-auto">
        <FrimousseEmojiPicker.Loading className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Cargando emojis...
        </FrimousseEmojiPicker.Loading>
        <FrimousseEmojiPicker.Empty className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No se encontraron emojis
        </FrimousseEmojiPicker.Empty>
        <FrimousseEmojiPicker.List
          className="p-2"
          components={{
            CategoryHeader: ({ category, ...props }: EmojiPickerListCategoryHeaderProps) => (
              <div
                {...props}
                className="text-xs font-medium text-muted-foreground px-1 py-2 sticky top-0 bg-popover"
              >
                {category.label}
              </div>
            ),
            Row: (props: EmojiPickerListRowProps) => (
              <div {...props} className="flex gap-0.5" />
            ),
            Emoji: ({ emoji, ...props }: EmojiPickerListEmojiProps) => (
              <button
                {...props}
                className="w-8 h-8 flex items-center justify-center text-xl rounded hover:bg-muted cursor-pointer transition-colors"
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </FrimousseEmojiPicker.Viewport>
    </FrimousseEmojiPicker.Root>
  )
}

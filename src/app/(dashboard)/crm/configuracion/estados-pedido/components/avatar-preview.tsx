interface AvatarPreviewProps {
  emoji?: string
}

export function AvatarPreview({ emoji }: AvatarPreviewProps) {
  return (
    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
      <div className="relative inline-block">
        {/* Sample avatar */}
        <div className="w-12 h-12 rounded-full bg-violet-500 flex items-center justify-center">
          <span className="text-lg font-medium text-white">JD</span>
        </div>
        {/* Emoji indicator badge - Callbell style (top-right corner) */}
        {emoji && (
          <span className="absolute -top-1 -right-1 text-base bg-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm border border-gray-200">
            {emoji}
          </span>
        )}
      </div>
      <div className="text-sm text-muted-foreground">
        {emoji
          ? 'Asi se vera el indicador en las conversaciones'
          : 'Selecciona un emoji para ver la vista previa'}
      </div>
    </div>
  )
}

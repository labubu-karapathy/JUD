import React, { useState } from 'react'
import { Smile, Hand, Heart, Sparkles, X } from 'lucide-react'

const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys',
    icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋',
      '😛', '😜', '🤪', '😎', '🤓', '🧐', '🥳', '😏', '😌', '😴',
      '😷', '🤒', '🤕', '🥺', '😳', '🤔', '🤫', '🤭', '🥱', '🤤',
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures',
    icon: Hand,
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈',
      '👉', '👆', '👇', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏',
      '👏', '🙌', '👐', '🫶', '🫂', '💪', '👊', '✊', '🤛', '🤜',
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts',
    icon: Heart,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '💌', '💋', '💐', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻',
    ],
  },
  {
    id: 'reactions',
    name: 'Reactions',
    icon: Sparkles,
    emojis: [
      '✨', '🔥', '💯', '🎉', '🎊', '🥂', '☕', '📚', '🎬', '🎵',
      '🎸', '🎨', '🌈', '🍕', '🍦', '🍩', '🚀', '⭐', '🌙', '⚡',
      '🎈', '🧸', '🎁', '🏆', '💎', '💡', '💬', '🕊️', '👀', '🪄',
    ],
  },
] as const

interface RichEmojiPickerProps {
  onSelectEmoji: (emoji: string) => void
  onClose: () => void
}

export const RichEmojiPicker: React.FC<RichEmojiPickerProps> = ({
  onSelectEmoji,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<string>('smileys')

  const currentCategory = EMOJI_CATEGORIES.find((c) => c.id === activeTab) || EMOJI_CATEGORIES[0]

  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2.5 flex flex-col w-full max-w-sm select-none z-40 text-white animate-fade-in"
      style={{ touchAction: 'manipulation' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Category Navigation Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 px-1">
        <div className="flex space-x-1">
          {EMOJI_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = cat.id === activeTab
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                title={cat.name}
                className={`p-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Emoji Matrix */}
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-1 text-center">
        {currentCategory.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onSelectEmoji(emoji)
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-slate-800 active:scale-125 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

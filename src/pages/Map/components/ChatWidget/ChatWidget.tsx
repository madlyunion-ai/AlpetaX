import { useState, type ReactNode } from 'react'
import Button from '@/components/common/Button/Button'
import Icon from '@/components/common/Icon/Icon'
import './ChatWidget.scss'

export interface ChatMessage {
  id: string | number
  role: 'user' | 'assistant'
  content: string
}

interface ChatWidgetProps {
  title: string
  icon?: ReactNode
  messages: ChatMessage[]
  isLoading?: boolean
  open?: boolean
  onClose?: () => void
  placeholder?: string
}

function ChatWidget({
  title,
  icon,
  messages,
  isLoading = false,
  open = false,
  onClose,
  placeholder = 'Ask me anything...',
}: ChatWidgetProps) {
  const [input, setInput] = useState('')

  return (
    <div className={`chat-widget${open ? ' is-open' : ''}`}>
      <div className="chat-widget-header">
        <span className="title">
          {icon && <span className="chat-widget__icon">{icon}</span>}
          {title}
        </span>
        {onClose && (
          <Button isOnlyIcon className="btn-chat-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </Button>
        )}
      </div>

      <div className="chat-widget-body">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble chat-bubble-${msg.role}`}>
            {msg.content}
          </div>
        ))}

        {isLoading && (
          <div className="chat-bubble chat-bubble-assistant chat-bubble-loading">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
      </div>

      <div className="chat-widget-footer">
        <div className="footer-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
          />
          <Button isOnlyIcon className="btn-chat-send" aria-label="send">
            <Icon name="arrow-up" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ChatWidget

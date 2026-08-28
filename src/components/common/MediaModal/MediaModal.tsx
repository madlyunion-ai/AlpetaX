import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/common/Icon/Icon'
import Button from '@/components/common/Button/Button'
import './MediaModal.scss'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabelledBy?: string
}

function MediaModal({ open, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="media-modal">
      <div className="media-modal-backdrop" onClick={onClose}></div>
      <div className="media-modal-panel">
        <Button isOnlyIcon className="btn-close" onClick={onClose}>
          <Icon name="close" />
        </Button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export default MediaModal

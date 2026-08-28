import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/common/Icon/Icon'
import './SlidePanel.scss'

interface SlidePanelProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabelledBy?: string
}

function SlidePanel({ open, onClose, children }: SlidePanelProps) {
  useEffect(() => {
    if (!open) return
  }, [open, onClose])

  return createPortal(
    <div className={`slide-panel${open ? ' open' : ''}`}>
      <div className="slide-panel-backdrop" onClick={onClose}></div>
      <div className="slide-panel-wrapper">
        <div className="slide-panel-body">
          <button type="button" className="btn-close" aria-label="close" onClick={onClose}>
            <Icon name="chevron-right" />
          </button>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default SlidePanel

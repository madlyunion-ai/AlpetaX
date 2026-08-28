import type { ReactNode } from 'react'
import Icon from '@/components/common/Icon/Icon'
import './Accordion.scss'

interface AccordionProps {
  title: ReactNode
  open: boolean
  onToggle: () => void
  children?: ReactNode
  className?: string
}

function Accordion({ title, open, onToggle, children, className }: AccordionProps) {
  const classes = ['accordion', open ? 'is-open' : '', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <button type="button" className="accordion-header" onClick={onToggle}>
        <span className="accordion-title">{title}</span>
        <Icon name="chevron-down" className={open ? 'open' : ''} />
      </button>

      <div className={`accordion-body-slide${open ? ' is-open' : ''}`}>
        <div className="accordion-body">
          <div className="accordion-body-content">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default Accordion

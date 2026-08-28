import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/common/Icon/Icon'
import './Select.scss'

export interface SelectOption {
  label: string
  value: string
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  color?: 'default' | 'blue'
  size?: 'default' | 'sm'
  full?: boolean
}

function Select({
  options,
  value,
  onChange,
  placeholder = 'select',
  color = 'default',
  size = 'default',
  full = false,
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = options.find((option) => option.value === value)

  const rootClasses = [
    'select',
    open ? 'select-open' : '',
    disabled ? 'select-disabled' : '',
    full ? 'select-full' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} className={rootClasses}>
      <button
        type="button"
        className={`select-control${color === 'blue' ? ' select-blue' : ''}${size === 'sm' ? ' select-sm' : ''}`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={selected ? 'select-value' : 'select-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevron-down" />
      </button>

      {open && (
        <ul className="select-list" role="listbox">
          {options.map((option) => {
            const optionClasses = [
              'select-option',
              option.value === value ? 'select-option-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={optionClasses}
                onClick={() => {
                  onChange?.(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default Select

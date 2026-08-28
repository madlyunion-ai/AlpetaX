import { forwardRef, type InputHTMLAttributes } from 'react'
import Icon from '@/components/common/Icon/Icon'
import Button from '@/components/common/Button/Button'
import './TextInput.scss'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  searchable?: boolean
  sm?: boolean
  btnIcon?: string
  btnLabel?: string
  onBtnClick?: () => void
}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ error, searchable, className, sm, btnIcon, btnLabel, onBtnClick, ...props }, ref) => {
    const classes = [
      'text-input',
      error ? 'text-input-error' : '',
      sm ? 'text-input-sm' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={`text-input-box${searchable ? ' is-searchable' : ''}`}>
        {searchable && <Icon name="search" />}
        <input ref={ref} className={classes} {...props} />
        {btnIcon && (
          <Button
            isOnlyIcon
            className="button-text-input"
            aria-label={btnLabel ?? btnIcon}
            onClick={onBtnClick}
          >
            <Icon name={btnIcon} />
          </Button>
        )}
      </div>
    )
  },
)

TextInput.displayName = 'TextInput'

export default TextInput

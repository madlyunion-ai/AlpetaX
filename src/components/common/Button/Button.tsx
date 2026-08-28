import type { ButtonHTMLAttributes } from 'react'
import './Button.scss'

export type ButtonVariant = 'primary' | 'line' | 'gray' | 'red'
export type ButtonSize = 'small' | 'medium' | 'large' | 'xlarge'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isOnlyIcon?: boolean
  full?: boolean
}

function Button({
  variant = 'primary',
  size = 'medium',
  className,
  type = 'button',
  isOnlyIcon = false,
  full = false,
  ...props
}: ButtonProps) {
  const classes = [
    'button',
    `button-${variant}`,
    `button-${size}`,
    full ? `button-full` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const onlyIconClass = ['button', 'button-only-icon', className].filter(Boolean).join(' ')

  return <button type={type} className={!isOnlyIcon ? classes : onlyIconClass} {...props} />
}

export default Button

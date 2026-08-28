import type { ReactNode } from 'react'
import './Badge.scss'

export type BadgeRounded = 'default' | 'rounded'
export type BadgeStatus = 'default' | 'active' | 'warning'

interface BadgeProps {
  rounded?: BadgeRounded
  children: ReactNode
  status?: string
  isFilter?: boolean
}

function Badge({
  status = 'default',
  rounded = 'default',
  isFilter = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`badge badge-radius-${rounded} badge-${status}${isFilter ? ' badge-filter-type' : ''}`}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge

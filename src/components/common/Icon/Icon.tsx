
import type { HTMLAttributes } from 'react'
import './Icon.scss'

interface IconProps extends HTMLAttributes<HTMLElement> {
  name: string
}


function Icon({name, className, ...rest}: IconProps) {
  return (
    <i className={`icon icon-${name}${className ? ` ${className}` : ''}`} {...rest}></i>
  )

}

export default Icon
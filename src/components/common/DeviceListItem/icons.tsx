import type { SVGProps } from 'react'

export function ImagePlaceholderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="7" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M3.5 14.5 7.5 10.5l2.5 2.5 3-3.5 3.5 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="9" fill="rgba(0,0,0,0.4)" />
      <path d="M8 6.5 14 10 8 13.5V6.5Z" fill="white" />
    </svg>
  )
}

export function SlidersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2 5h7M11.5 5H14M2 11h3.5M8 11h6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="9" cy="5" r="1.6" stroke="currentColor" strokeWidth="1.4" fill="white" />
      <circle cx="6.5" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.4" fill="white" />
    </svg>
  )
}

export function ExpandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

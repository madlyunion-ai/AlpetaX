import { useState } from 'react'
import Button from '@/components/common/Button/Button'
import Icon from '@/components/common/Icon/Icon'
import Badge from '@/components/common/Badge/Badge'
import './ThumbnailGrid.scss'

export interface ThumbnailItem {
  id: string | number
  label: string
  thumbnailUrl?: string
}

interface ThumbnailGridProps {
  items: ThumbnailItem[]
  filters: string[]
  visibleCount?: number
}

function ThumbnailGrid({ items, filters, visibleCount = 10 }: ThumbnailGridProps) {
  const [expanded, setExpanded] = useState(false)
  const [removed, setRemoved] = useState(false)

  if (removed) {
    return null
  }

  const visibleItems = expanded ? items : items.slice(0, visibleCount)
  const hasHidden = items.length > visibleCount

  return (
    <div className="thumbnail-grid">
      <div className="thumbnail-grid-toolbar">
        <div className="filters">
          {filters.map((filter) => (
            <Badge isFilter status="active">
              {filter}
            </Badge>
          ))}
          <span className="count-badge">{items.length}</span>
        </div>

        <Button
          isOnlyIcon
          className="btn-delete"
          aria-label="섹션 삭제"
          onClick={() => setRemoved(true)}
        >
          <Icon name="minus-circle" />
        </Button>
      </div>

      <div className="thumbnail-grid-body">
        <ul className="grid">
          {visibleItems.map((item, i) => (
            <li key={item.id} className="tile">
              <figure className="figure">
                <img src={item.thumbnailUrl} alt="" />
                <figcaption className="label">{item.label}</figcaption>
              </figure>
            </li>
          ))}

          {hasHidden && (
            <li className="more">
              <button
                type="button"
                className="load-more-tile"
                onClick={() => setExpanded((prev) => !prev)}
              >
                <span>
                  Load <br /> more
                </span>
                <Icon name="plus-circle" />
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

export default ThumbnailGrid

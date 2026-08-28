import Badge from '@/components/common/Badge/Badge'
import Icon from '@/components/common/Icon/Icon'
import Button from '@/components/common/Button/Button'
import type { Device } from '@/components/common/DeviceList/DeviceList'
import './DeviceListItem.scss'

interface DeviceListItemProps {
  device: Device
  selected?: boolean
  onClick?: () => void
  onOpenSettings?: () => void
  onOpenVideo?: () => void
}

function DeviceListItem({
  device,
  selected,
  onClick,
  onOpenSettings,
  onOpenVideo,
}: DeviceListItemProps) {
  const classes = ['device-list-item', selected ? 'selected' : ''].filter(Boolean).join(' ')

  return (
    <div className={classes} role="button" onClick={onClick}>
      <span className="thumbnail">
        {device.status === 'online' && <img src={device.thumbnail} alt="" />}
        {device.status === 'offline' ? (
          <span className="status">{device.status}</span>
        ) : (
          <Button isOnlyIcon className="btn-play">
            <Icon name="play" />
          </Button>
        )}
      </span>

      <div className="item-body">
        <span className="item-id">ID {device.deviceId}</span>
        <span className="name">{device.name}</span>

        <div className="device-item-badge">
          <Badge status="active">{device.model}</Badge>
          <Badge rounded="rounded" status={device.status === 'online' ? 'active' : 'warning'}>
            {device.status}
          </Badge>
        </div>
      </div>

      {selected && (onOpenSettings || onOpenVideo) && (
        <span className="device-list-item-actions">
          {onOpenSettings && (
            <Button
              isOnlyIcon
              className="btn-action"
              onClick={(event) => {
                event.stopPropagation()
                onOpenSettings()
              }}
            >
              <Icon name="option" />
            </Button>
          )}
          {onOpenVideo && (
            <Button
              isOnlyIcon
              className="btn-action"
              onClick={(event) => {
                event.stopPropagation()
                onOpenVideo()
              }}
            >
              <Icon name="expand" />
            </Button>
          )}
        </span>
      )}
    </div>
  )
}

export default DeviceListItem

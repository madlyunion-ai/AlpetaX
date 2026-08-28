import { useState } from 'react'
import DeviceListItem from '@/components/common/DeviceListItem/DeviceListItem'
import './DeviceList.scss'

export interface Device {
  id: string
  deviceId: string
  name: string
  model: string
  status: 'online' | 'offline'
  location: string
  type?: string
  firmware?: string
  description?: string
  thumbnail?: string
  hasVideo?: boolean
  disabled?: boolean
  selected?: boolean
  active?: boolean
  warning?: boolean
}

interface DeviceListProps {
  devices: Device[]
  onOpenSettings?: (device: Device) => void
  onOpenVideo?: (device: Device) => void
}

function DeviceList({ devices, onOpenSettings, onOpenVideo }: DeviceListProps) {
  const [selectedId, setSelectedId] = useState<string>()

  return (
    <ul className="device-list">
      {devices.map((device) => (
        <li key={device.id} className="item">
          <DeviceListItem
            device={device}
            selected={device.id === selectedId}
            onClick={() => setSelectedId(device.id)}
            onOpenSettings={onOpenSettings ? () => onOpenSettings(device) : undefined}
            onOpenVideo={onOpenVideo ? () => onOpenVideo(device) : undefined}
          />
        </li>
      ))}
    </ul>
  )
}

export default DeviceList

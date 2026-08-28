import { useState } from 'react'
import Select from '@/components/common/Select/Select'
import Badge from '@/components/common/Badge/Badge'
import Accordion from '@/components/common/Accordion/Accordion'
import Icon from '@/components/common/Icon/Icon'
import type { Device } from '@/components/common/DeviceList/DeviceList'
import './DeviceDetailPanel.scss'
import Button from '@/components/common/Button/Button'

export interface DeviceDetailInfo {
  deviceType: string
  status: 'online' | 'offline'
  deviceId: string
  firmware: string
  model: string
  location: string
  description: string
}

const settingFields = [
  'Settings',
  'Camera Name',
  'Device ID / IP Address',
  'Time Zone',
  'Resolution',
  'Frame Rate (FPS)',
  'Bitrate Mode',
  'Image Adjustment',
]

interface DeviceDetailPanelProps {
  device: Device
}

function DeviceDetailPanel({ device }: DeviceDetailPanelProps) {
  const [openFields, setOpenFields] = useState<Set<string>>(new Set())

  const [selectvalue1, setSelectValue1] = useState<string | undefined>()
  const Options1 = [
    { label: 'label1', value: 'val1' },
    { label: 'label2', value: 'val2' },
  ]

  function toggleField(id: string) {
    setOpenFields((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="device-detail-panel">
      <div className="panel-header">
        <h2 className="title">{device.type}</h2>
        <Badge status={device.status === 'online' ? 'active' : 'warning'} rounded="rounded">
          {device.status}
        </Badge>
      </div>

      <div className="panel-body">
        <div className="device-info">
          <div className="device-image">
            <span className="img">
              <img src={`${import.meta.env.BASE_URL}images/temp/temp_device.png`} alt="" />
            </span>
            <button type="button" className="btn-live-cam">
              Live View
              <Icon name="live-cam" />
            </button>
          </div>
          <dl className="device-detail">
            <div>
              <dt>DeviceID</dt>
              <dd>{device.id}</dd>
            </div>
            <div>
              <dt>Device Type</dt>
              <dd>{device.type}</dd>
            </div>
            <div>
              <dt>Firmware</dt>
              <dd>{device.firmware}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{device.model}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{device.location}</dd>
            </div>
            <div className="desc">
              <dt>Device Description</dt>
              <dd>{device.description}</dd>
            </div>
          </dl>
        </div>

        <ul className="detail-fields">
          {settingFields.map((field) => (
            <li key={field}>
              <Accordion
                title={field}
                open={openFields.has(field)}
                onToggle={() => toggleField(field)}
              >
                <div className="form-box">
                  <label htmlFor="">UTC Setting</label>
                  <Select
                    options={Options1}
                    value={selectvalue1}
                    onChange={setSelectValue1}
                    placeholder="Select an option"
                    full
                  />
                </div>
                <div className="form-box">
                  <label htmlFor="">Operation Mode</label>
                  <Select
                    options={Options1}
                    value={selectvalue1}
                    onChange={setSelectValue1}
                    placeholder="Select an option"
                    full
                  />
                </div>
              </Accordion>
            </li>
          ))}
        </ul>
      </div>

      <Button variant="line" size="large">
        <Icon name="plus" /> Event log
      </Button>
    </div>
  )
}

export default DeviceDetailPanel

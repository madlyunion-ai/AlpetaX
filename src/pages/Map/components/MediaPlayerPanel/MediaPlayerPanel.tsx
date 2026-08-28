import Tabs, { TabList, Tab, TabPanel } from '@/components/common/Tabs/Tabs'
import Badge from '@/components/common/Badge/Badge'
import MediaPlayer from '@/components/common/MediaPlayer/MediaPlayer'
import type { Device } from '@/components/common/DeviceList/DeviceList'
import Table, { type TableColumn } from '@/components/common/Table/Table'
import './MediaPlayerPanel.scss'

interface DataProps {
  id: string
  date: string
  userGroup: string
  user: string
  event: string
  result: string
}
interface DataEvtLogProps {
  id: string
  date: string
  acessGroup: string
  event: string
  action: string
  active?: boolean
  warning?: boolean
}
interface DataThumbProps {
  id: string
  date: string
  time: string
  thumb: string
  name: string
  status: string
}

interface DeviceDetailPanelProps {
  device: Device
}

const dataColumns: TableColumn<DataProps>[] = [
  {
    id: 'date',
    header: 'Date',
    align: 'center',
    width: '100px',
    render: (row) => row.date,
  },
  {
    id: 'userGroup',
    header: 'User Group',
    align: 'center',
    width: '110px',
    render: (row) => <span className="ellipsis">{row.userGroup}</span>,
  },
  {
    id: 'user',
    header: 'User',
    align: 'center',
    className: '',
    width: '110px',
    render: (row) => <span className="ellipsis">{row.user}</span>,
  },
  {
    id: 'event',
    header: 'Event',
    align: 'center',
    width: '100px',
    render: (row) => row.event,
  },
  {
    id: 'result',
    header: 'Result',
    align: 'center',
    width: 'auto',
    render: (row) => row.result,
  },
]
const data: DataProps[] = [
  {
    id: '1',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '2',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '3',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '41',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '5',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '6',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '7',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '8',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
  {
    id: '91',
    date: '2026.00.00 00:00:00',
    userGroup: 'HQ Security Team',
    user: 'James Anderson',
    event: 'User Login Success',
    result: '{result}',
  },
]
const dataEventLogColumns: TableColumn<DataEvtLogProps>[] = [
  {
    id: 'date',
    header: 'Date',
    align: 'center',
    width: '100px',
    render: (row) => row.date,
  },
  {
    id: 'acessGroup',
    header: 'Acess Group',
    align: 'center',
    width: '110px',
    render: (row) => row.acessGroup,
  },
  {
    id: 'event',
    header: 'Event',
    align: 'center',
    className: '',
    width: '110px',
    render: (row) => row.event,
  },
  {
    id: 'action',
    header: 'Action',
    align: 'center',
    width: '100px',
    render: (row) => {
      if (!row.action) return ''
      return <Badge status="warning">{row.action}</Badge>
    },
  },
]
const dataEventLog: DataEvtLogProps[] = [
  {
    id: '1',
    date: '2026.00.00 00:00:00',
    acessGroup: 'System Administrators',
    event: '-',
    action: '',
  },
  {
    id: '2',
    date: '2026.00.00 00:00:00',
    acessGroup: 'Security Operator',
    event: 'Event Clear',
    action: '',
    active: true,
  },
  {
    id: '3',
    date: '2026.00.00 00:00:00',
    acessGroup: 'Facility Management',
    event: 'Intrusion Detection',
    action: 'Resolve',
    warning: true,
  },
  {
    id: '41',
    date: '2026.00.00 00:00:00',
    acessGroup: 'System Administrators',
    event: '-',
    action: '',
  },
  {
    id: '5',
    date: '2026.00.00 00:00:00',
    acessGroup: 'System Administrators',
    event: '-',
    action: '',
  },
  {
    id: '6',
    date: '2026.00.00 00:00:00',
    acessGroup: 'System Administrators',
    event: '-',
    action: '',
  },
  {
    id: '7',
    date: '2026.00.00 00:00:00',
    acessGroup: 'System Administrators',
    event: '-',
    action: '',
  },
  {
    id: '8',
    date: '2026.00.00 00:00:00',
    acessGroup: 'System Administrators',
    event: '-',
    action: '',
  },
  {
    id: '91',
    date: '2026.00.00 00:00:00',
    acessGroup: 'System Administrators',
    event: '-',
    action: '',
  },
]
const dataThumbColumns: TableColumn<DataThumbProps>[] = [
  {
    id: 'date',
    header: 'Date',
    align: 'center',
    width: '100px',
    render: (row) => row.date,
  },
  {
    id: 'time',
    header: 'Time',
    align: 'center',
    width: '110px',
    render: (row) => row.time,
  },
  {
    id: 'name',
    header: 'Name',
    align: 'left',
    className: '',
    width: '160px',
    render: (row) => {
      return (
        <div className="flex evt-log-name">
          <i className="evt-log-thumbnail">
            <img src={row.thumb} alt="" />
          </i>
          <span className="">{row.name}</span>
        </div>
      )
    },
  },
  {
    id: 'status',
    header: 'Status',
    align: 'center',
    width: '100px',
    render: (row) => {
      if (!row.status) return ''
      return row.status === 'success' ? (
        <span className="text-success">{row.status}</span>
      ) : (
        <span className="text-failed">{row.status}</span>
      )
    },
  },
]
const dataThumb: DataThumbProps[] = [
  {
    id: '1',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
  {
    id: '2',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'failed',
  },
  {
    id: '3',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
  {
    id: '41',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
  {
    id: '5',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
  {
    id: '6',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
  {
    id: '7',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
  {
    id: '8',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
  {
    id: '91',
    date: '2026.00.00',
    time: '00:00:00',
    thumb: `${import.meta.env.BASE_URL}images/temp/temp_user.png`,
    name: 'James Anderson',
    status: 'success',
  },
]

function MediaPlayerPanel({ device }: DeviceDetailPanelProps) {
  return (
    <div className="media-player-panel">
      <MediaPlayer />
      <div className="media-player-body">
        <Badge status="active">{device.model}</Badge>
        <span className="device-id">DeviceID {device.deviceId}</span>
        <h2 className="title">{device.name}</h2>

        <div className="contents">
          <Tabs defaultValue="info" className="media-player-tabs">
            <TabList>
              <Tab value="info">Event log</Tab>
              <Tab value="event">Auth Log</Tab>
            </TabList>

            <TabPanel value="info">
              {/* <Table columns={dataEventLogColumns} rows={dataEventLog} rowKey={(row) => row.id} /> */}
              <Table columns={dataThumbColumns} rows={dataThumb} rowKey={(row) => row.id} />
            </TabPanel>
            <TabPanel value="event">
              <Table columns={dataColumns} rows={data} rowKey={(row) => row.id} />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

export default MediaPlayerPanel

import { useState } from 'react'
import Icon from '@/components/common/Icon/Icon'
import Select from '@/components/common/Select/Select'
import TextInput from '@/components/common/TextInput/TextInput'
import ChatWidget, { type ChatMessage } from './components/ChatWidget/ChatWidget'
import DeviceList, { type Device } from '@/components/common/DeviceList/DeviceList'
import Table, { type TableColumn } from '@/components/common/Table/Table'
import Button from '@/components/common/Button/Button'
import DeviceDetailPanel from './components/DeviceDetailPanel/DeviceDetailPanel'
import MapTree from '@/components/common/Tree/Tree'
import SlidePanel from '@/components/common/SlidePanel/SlidePanel'
import MediaModal from '@/components/common/MediaModal/MediaModal'
import MediaPlayerPanel from '@/pages/Map/components/MediaPlayerPanel/MediaPlayerPanel'
import useModal from '@/hooks/useModal'
import './Map.scss'

const deviceColumns: TableColumn<Device>[] = [
  {
    id: 'deviceId',
    header: 'DeviceID',
    align: 'center',
    width: '100px',
    render: (row) => row.deviceId,
  },
  {
    id: 'name',
    header: 'Name',
    align: 'center',
    width: '150px',
    render: (row) => row.name,
  },
  {
    id: 'model',
    header: 'Model',
    align: 'center',
    className: 'text-primary model',
    width: '150px',
    render: (row) => row.model,
  },
  {
    id: 'location',
    header: 'Location',
    align: 'center',
    width: '86px',
    render: (row) => row.location,
  },
  {
    id: 'status',
    header: 'Status',
    align: 'center',
    width: '60px',
    render: (row) => <span className={row.status === 'online' ? 'status-on' : 'status-off'}></span>,
  },
  {
    id: 'event',
    header: 'Event',
    align: 'center',
    width: '70px',
    render: (row) => row.status,
  },
]

const devices: Device[] = [
  {
    id: '1',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio-X Face Premium',
    status: 'online',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
  {
    id: '2',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio CCTV',
    status: 'online',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
  {
    id: '3',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio CCTV',
    status: 'offline',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
  {
    id: '4',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio CCTV',
    status: 'online',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
  {
    id: '5',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio CCTV',
    status: 'online',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
  {
    id: '6',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio CCTV',
    status: 'online',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
  {
    id: '7',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio CCTV',
    status: 'online',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
  {
    id: '8',
    deviceId: '00000000',
    name: 'main entrance door',
    type: 'CCTV',
    model: 'Ubio CCTV',
    status: 'online',
    location: 'place 04',
    thumbnail: `${import.meta.env.BASE_URL}images/temp/temp_video_01.png`,
    hasVideo: true,
    firmware: 'v.0.0.0',
    description: 'CCTV located in the upper-left section of the Central Operations Hall.',
  },
]

const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  { id: 1, role: 'user', content: '오늘 지각한 사람들을 알려줘' },
  {
    id: 2,
    role: 'assistant',
    content:
      '오늘 지각한 사람은 Adams, Baker, Brown, Carter, Clark, Cooper, Davis, Evans, Foster, Garcia, Harris, Jackson, Johnson, Kelly, Lewis, Martin, Nelson, Parker, Reed, Scott으로, 총 20명입니다.',
  },
  { id: 3, role: 'user', content: '오늘 출입통제 현황을 요약해줘.' },
  {
    id: 4,
    role: 'assistant',
    content: `오늘의 출입 통제 현황 요약입니다.
총 342건의 출입 기록이 확인되었으며, 이 중 328건은 정상 출입, 14건은 출입이 거부된 시도였습니다.
다음 3곳의 출입문에서 비정상적인 개방 시간 경고가 발생했습니다.

 • Main Entrance(정문)
 • Server Room(서버실)
 • Loading Dock(하역장)

각 출입문은 모두 기준 개방 시간을 30초 이상 초과했습니다.
또한 야간 근무 중 관리자 계정 2개에서 수동 출입 승인(Override) 기록이 확인되었으며, 2층 회의실(2F Meeting Room)의 카드 리더기에서 두 차례 오작동이 발생한 후 자동으로 초기화되었습니다.
현재 모든 비상구는 잠금 상태를 유지하고 있으며, 오늘 화재 경보로 인한 자동 잠금 해제는 발생하지 않았습니다.`,
  },
]

function Map() {
  const [hasNew] = useState(true)
  const [viewMode, setViewMode] = useState('cam')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setchatInput] = useState('')
  const [chatLoading] = useState(true)
  const [chatMessages] = useState(INITIAL_CHAT_MESSAGES)

  const [settingsDevice, setSettingsDevice] = useState<Device | null>(null)
  const [videoDevice, setVideoDevice] = useState<Device | null>(null)

  const settingsPanel = useModal()
  const vdieoModal = useModal()
  const name = 'Buddy'

  const [selectvalue1, setSelectValue1] = useState<string | undefined>()
  const Options1 = [
    { label: 'label1', value: 'val1' },
    { label: 'label2', value: 'val2' },
  ]
  const [selectvalue2, setSelectValue2] = useState<string | undefined>()
  const Options2 = [
    { label: 'label1', value: 'val1' },
    { label: 'label2', value: 'val2' },
  ]

  const suggestions = ['오늘 지각한 사람들을 알려줘', '홍길동 사용자 정보를 찾아줘']

  function onViewModeChange(mode: string) {
    setViewMode(mode)
  }

  function sendChatMessage() {
    setChatOpen(true)
  }

  function openSettings(device: Device) {
    setSettingsDevice(device)
    settingsPanel.open()
  }
  function onOpenVideo(device: Device) {
    setVideoDevice(device)
    vdieoModal.open()
  }

  return (
    <div className="map-page">
      {/* 좌측 맵  */}
      <section className="device-map-area">
        {/* head */}
        <div className="map-header">
          <div className="greeting">
            <strong className="greeting-hello">Hello,</strong>
            <em className="greeting-name">{name}</em>
            <span className="greeting-desc">AlpetaX 방문을 환영합니다. 무엇을 도와드릴까요?</span>
          </div>
          <div className="btn-area">
            <Button isOnlyIcon className={`btn-bell${hasNew ? ' has-new' : ''}`}>
              <Icon name="bell" />
            </Button>
            <Button isOnlyIcon className="btn-setting">
              <Icon name="set" />
            </Button>
          </div>
        </div>
        {/* // head */}

        {/* chat */}
        <div className="chat-area">
          {!chatOpen && (
            <div className="chat-box">
              <div className="chat-input">
                <Icon name="question" />
                <textarea
                  placeholder="오늘은 어떤 내용이 궁금하신가요?"
                  value={chatInput}
                  onChange={(event) => setchatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') sendChatMessage()
                  }}
                />
              </div>

              <div className="chat-suggestions">
                <div className="suggestion-items">
                  {suggestions.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => sendChatMessage()}>
                      {suggestion}
                    </button>
                  ))}
                </div>

                <span className="dot">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                <Button
                  isOnlyIcon
                  className="btn-chat-send"
                  aria-label="send"
                  onClick={() => sendChatMessage()}
                >
                  <Icon name="arrow-up" />
                </Button>
              </div>
            </div>
          )}
          <ChatWidget
            title="AlpetaX AI Agent"
            messages={chatMessages}
            isLoading={chatLoading}
            open={chatOpen}
            onClose={() => setChatOpen(false)}
          />
        </div>

        {/* map */}
        <div className="map-panel">
          <MapTree />

          <div className="map-canvas">
            {/**** 맵 영역 */}
            <div className="canvas-panel"></div>
            {/* 맵 영역 ****/}

            <div className="device-panel">
              <strong className="title">UNION</strong>
              <ul className="device-items">
                <li className="item is-selected">
                  <figure className="figure">
                    <Button isOnlyIcon className="btn-option">
                      <Icon name="option" />
                    </Button>
                    <img src={`${import.meta.env.BASE_URL}images/temp/temp_img_cctv.png`} alt="" />
                    <figcaption className="caption">laboratory</figcaption>
                  </figure>
                  <button type="button" className="btn-cam">
                    <Icon name="live-cam" />
                  </button>
                </li>
                <li className="item">
                  <figure className="figure">
                    <Button isOnlyIcon className="btn-option">
                      <Icon name="option" />
                    </Button>
                    <img src={`${import.meta.env.BASE_URL}images/temp/temp_img_cctv.png`} alt="" />
                    <figcaption className="caption">laboratory</figcaption>
                  </figure>
                  <button type="button" className="btn-cam">
                    <Icon name="live-cam" />
                  </button>
                </li>
                <li className="item">
                  <figure className="figure">
                    <Button isOnlyIcon className="btn-option">
                      <Icon name="option" />
                    </Button>
                    <img src={`${import.meta.env.BASE_URL}images/temp/temp_img_cctv.png`} alt="" />
                    <figcaption className="caption">laboratory</figcaption>
                  </figure>
                  <button type="button" className="btn-cam">
                    <Icon name="live-cam" />
                  </button>
                </li>
                <li className="item">
                  <figure className="figure">
                    <Button isOnlyIcon className="btn-option">
                      <Icon name="option" />
                    </Button>
                    <img src={`${import.meta.env.BASE_URL}images/temp/temp_img_cctv.png`} alt="" />
                    <figcaption className="caption">laboratory</figcaption>
                  </figure>
                  <button type="button" className="btn-cam">
                    <Icon name="live-cam" />
                  </button>
                </li>
              </ul>
            </div>
          </div>
          {/* // 맵 영역 */}
        </div>
      </section>

      {/* 우측 목록 */}
      <section className="device-list-area">
        <div className="list-top">
          <Select
            options={Options1}
            value={selectvalue1}
            onChange={setSelectValue1}
            placeholder="Device Type"
            color="blue"
          />
          <Select
            options={Options2}
            value={selectvalue2}
            onChange={setSelectValue2}
            placeholder="Device Status"
            color="blue"
          />
          <TextInput placeholder="Search Device ID/Name" searchable />

          <div className="list-toggle">
            <button
              type="button"
              className={`btn-toggle${viewMode === 'cam' ? ' is-active' : ''}`}
              onClick={() => onViewModeChange('cam')}
            >
              <Icon name="cam" />
            </button>
            <button
              type="button"
              className={`btn-toggle${viewMode === 'list' ? ' is-active' : ''}`}
              onClick={() => onViewModeChange('list')}
            >
              <Icon name="list" />
            </button>
          </div>
        </div>

        {viewMode === 'cam' && (
          <div className="device-list-card">
            <DeviceList devices={devices} onOpenSettings={openSettings} onOpenVideo={onOpenVideo} />
          </div>
        )}

        {viewMode === 'list' && (
          <div className="device-list-table">
            <Table
              columns={deviceColumns}
              rows={devices}
              rowKey={(row) => row.id}
              tableLayout="auto"
            />
          </div>
        )}
      </section>

      {/* 슬라이드 팝업 */}
      <SlidePanel open={settingsPanel.isOpen} onClose={settingsPanel.close}>
        {settingsDevice && <DeviceDetailPanel device={settingsDevice} />}
      </SlidePanel>

      {/* 미디어 모달 */}
      <MediaModal open={vdieoModal.isOpen} onClose={vdieoModal.close}>
        {videoDevice && <MediaPlayerPanel device={videoDevice} />}
      </MediaModal>
    </div>
  )
}

export default Map

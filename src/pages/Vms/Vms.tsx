import { useState } from 'react'
import ThumbnailGrid, { type ThumbnailItem } from '@/components/common/ThumbnailGrid/ThumbnailGrid'
import Select from '@/components/common/Select/Select'
import TextInput from '@/components/common/TextInput/TextInput'
import Button from '@/components/common/Button/Button'
import Badge from '@/components/common/Badge/Badge'
import Icon from '@/components/common/Icon/Icon'

import './Vms.scss'

const CAMERA_LOCATION_NAMES = [
  '12F stair',
  'main hall',
  'sub passage',
  'rnd lab 1',
  'cafe place',
  'elevator 1',
  'executive office room',
  'center office door',
  'elevator 2',
  'main entrance door',
  'storage room 2',
  'office sales part',
  'design team',
  'main passage',
  'internal security door',
]

const cameraDemoItems: ThumbnailItem[] = Array.from({ length: 60 }, (_, i) => {
  const tempImgCount = i % 4
  return {
    id: i,
    label: CAMERA_LOCATION_NAMES[i % CAMERA_LOCATION_NAMES.length],
    thumbnailUrl: `${import.meta.env.BASE_URL}images/temp/temp_vms_0${tempImgCount + 1}.png`,
  }
})

interface FilterItem {
  label: string
  id: string
}

interface GridSection {
  id: string
  filters: string[]
}

function Vms() {
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
  const [selectvalue3, setSelectValue3] = useState<string | undefined>()
  const Options3 = [
    { label: 'label1', value: 'val1' },
    { label: 'label2', value: 'val2' },
  ]
  const [selectvalue4, setSelectValue4] = useState<string | undefined>()
  const Options4 = [
    { label: 'label1', value: 'val1' },
    { label: 'label2', value: 'val2' },
  ]

  const [keywordInput, setKeywordInput] = useState('')
  const [visibleKeyowrd, setVisibleKeyowrd] = useState(false)
  const [filterList, setFilterList] = useState<FilterItem[]>([
    { label: 'white shirt', id: '1' },
    { label: 'long hair', id: '2' },
    { label: 'black pants', id: '3' },
  ])

  function onDeleteFilter(item: FilterItem) {
    setFilterList((prev) => prev.filter((f) => f.id !== item.id))
  }
  function onAddKeyword() {
    const value = keywordInput
    if (!value) return
    setFilterList((prev) => [...prev, { label: value, id: crypto.randomUUID() }])
    setVisibleKeyowrd(true)
    setKeywordInput('')
  }

  const [gridSections, setGridSections] = useState<GridSection[]>([
    { id: 'default', filters: ['All Place', 'All Device'] },
  ])

  function onAddFilterGrid() {
    setGridSections((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        filters:
          filterList.length > 0 ? filterList.map((f) => f.label) : ['All Place', 'All Device'],
      },
    ])
  }

  return (
    <div className="vms-page">
      <div className="vms-filter">
        <strong className="title">Advanced Filter</strong>
        <div className="filter-items">
          <Select
            options={Options1}
            value={selectvalue1}
            onChange={setSelectValue1}
            placeholder="Category"
            color="blue"
            full
          />
          <Select
            options={Options2}
            value={selectvalue2}
            onChange={setSelectValue2}
            placeholder="SubCategory"
            color="blue"
            full
          />
          <Select
            options={Options3}
            value={selectvalue3}
            onChange={setSelectValue3}
            placeholder="Device Type"
            color="blue"
            full
          />
          <Select
            options={Options4}
            value={selectvalue4}
            onChange={setSelectValue4}
            placeholder="Device Status"
            color="blue"
            full
          />
          <TextInput
            value={keywordInput}
            placeholder="Keyword"
            btnIcon="zoom-plus"
            btnLabel="키워드 추가"
            onChange={(e) => setKeywordInput(e.target.value)}
            onBtnClick={onAddKeyword}
          />

          <div className={`keyword-items-slide${visibleKeyowrd ? ' is-open' : ''}`}>
            <div className="keyword-items">
              {filterList.map((item) => (
                <Badge key={item.id} isFilter status="active">
                  {item.label}
                  <Button isOnlyIcon onClick={() => onDeleteFilter(item)}>
                    <Icon name="close-issue" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>

          <Button size="large" full className="button-add-filter" onClick={onAddFilterGrid}>
            <Icon name="zoom-plus" />
            Add View Filter
          </Button>
        </div>
      </div>

      <div className="thumbnail-grid-list">
        {gridSections.map((section) => (
          <ThumbnailGrid
            key={section.id}
            items={cameraDemoItems}
            filters={section.filters}
            visibleCount={15}
          />
        ))}
      </div>
    </div>
  )
}
export default Vms

import type { ReactNode } from 'react'
import './Table.scss'

export interface TableColumn<T> {
  id: string
  header: string
  align?: 'left' | 'center' | 'right'
  width?: string
  className?: string | ((row: T) => string)
  render: (row: T) => ReactNode
}

interface TableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  isRowDisabled?: (row: T) => boolean
  isRowSelected?: (row: T) => boolean
  isActive?: (row: T) => boolean
  isWarning?: (row: T) => boolean
  tableLayout?: 'fixed' | 'auto'
}

function Table<T>({
  columns,
  rows,
  rowKey,
  isRowDisabled,
  isRowSelected,
  isActive,
  isWarning,
  tableLayout = 'fixed',
}: TableProps<T>) {
  return (
    <div className="table">
      <table style={{ tableLayout }}>
        <colgroup>
          {columns.map((col) => (
            <col key={col.id} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} className="center">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const disabled = isRowDisabled
              ? isRowDisabled(row)
              : Boolean((row as { disabled?: boolean }).disabled)
            const selected = isRowSelected
              ? isRowSelected(row)
              : Boolean((row as { selected?: boolean }).selected)
            const active = isActive ? isActive(row) : Boolean((row as { active?: boolean }).active)
            const warning = isWarning
              ? isWarning(row)
              : Boolean((row as { warning?: boolean }).warning)
            return (
              <tr
                key={rowKey(row, index)}
                className={[
                  disabled && 'disabled',
                  selected && 'selected',
                  active && 'active',
                  warning && 'warning',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-disabled={disabled}
                aria-selected={selected}
              >
                {columns.map((column) => {
                  const cellClassName =
                    typeof column.className === 'function'
                      ? column.className(row)
                      : column.className
                  return (
                    <td
                      key={column.id}
                      className={[`table-align-${column.align ?? 'left'}`, cellClassName]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {column.render(row)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default Table

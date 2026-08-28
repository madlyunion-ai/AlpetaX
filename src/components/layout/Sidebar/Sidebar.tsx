import { useState, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import { useCountUp } from '@/hooks/useCountUp'
import ThemeToggle from '@/components/common/ThemeToggle/ThemeToggle'
import Badge from '@/components/common/Badge/Badge'
import Button from '@/components/common/Button/Button'
import './Sidebar.scss'

import Icon from '@/components/common/Icon/Icon'

interface CredentialRate {
  label: string
  value: number
  modifier: 'primary' | 'purple' | 'sky' | 'gray'
}
const credentialRates: CredentialRate[] = [
  { label: 'Face Recognition', value: 60, modifier: 'primary' },
  { label: 'Fingerprint', value: 20, modifier: 'purple' },
  { label: 'Card', value: 15, modifier: 'sky' },
  { label: 'Other', value: 5, modifier: 'gray' },
]

const dashboardNav = [
  { to: '/map', label: 'Map', icon: 'gps' },
  { to: '/vms', label: 'VMS', icon: 'vms' },
]

const menuNav = [
  { to: '/people', label: 'People', icon: 'people' },
  { to: '/device', label: 'Device', icon: 'terminal' },
  { to: '/access', label: 'Access', icon: 'door' },
  { to: '/resource', label: 'Resource', icon: 'resource' },
]

interface Issue {
  id: string
  message: string
}
const issues: Issue[] = [
  { id: '00000001', message: 'Terminal disconnected' },
  { id: '00000001', message: 'CCTV battery low' },
]

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const userCountBasic = 9999
  const userCount = useCountUp(userCountBasic)
  const terminalCount = 9999
  const cctvCount = 9999

  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="sidebar-wrapper">
        <button
          type="button"
          className="sidebar-collapse-toggle"
          aria-label={collapsed ? 'expand sidebar' : 'collapse sidebar'}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          <Icon name={collapsed ? 'chevron-left' : 'chevron-right'} />
        </button>

        {/* header */}
        <div className="sidebar-header">
          <h1 className="logo" aria-label="AlpetaX"></h1>
          <ThemeToggle />
        </div>

        {/* 출입인증현황 */}
        <div className="sidebar-summary">
          <div className="sidebar-user-count">
            <Icon name="people" />
            <span className="value">
              <span className="value-sizer" aria-hidden="true">
                {userCountBasic}
              </span>
              <span className="value-current">{userCount.toLocaleString()}</span>
            </span>

            <div className="add-user">
              <button type="button" aria-label="사용자추가" className="btn-add-user">
                <Icon name="people" />
                <Icon name="plus" />
              </button>

              <Badge children="사용자 추가" status="active" />
            </div>
          </div>

          <div className="sidebar-device-count">
            <span className="cont">
              Terminal <b>{terminalCount}</b>
            </span>
            <span className="cont">
              CCTV <b>{cctvCount}</b>
            </span>
          </div>

          <div className="sidebar-credential">
            <strong className="title">
              <Icon name="shield" />
              출입인증 현황
            </strong>

            <div className="credential-bar">
              {credentialRates.map((rate) => (
                <span
                  key={rate.label}
                  className={`credential-segment credential-segment-${rate.modifier}`}
                  style={{ '--segment-width': `${rate.value}%` } as CSSProperties}
                />
              ))}
            </div>

            <ul className="credential-legend">
              {credentialRates.map((rate) => (
                <li key={rate.label}>
                  <span className={`legend legend-${rate.modifier}`}>{rate.label}</span>
                  <b className="rate">{rate.value}%</b>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* menu */}
        <nav className="sidebar-nav">
          <strong className="sidebar-title">Dashboard</strong>
          <ul>
            {dashboardNav.map(({ to, label, icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  title={label}
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
                >
                  {icon && <Icon name={icon} />}
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="sidebar-nav">
          <strong className="sidebar-title">Menu</strong>
          <ul>
            {menuNav.map(({ to, label, icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  title={label}
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
                >
                  {icon && <Icon name={icon} />}
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* issue */}
        <div className="sidebar-issues">
          <h2 className="sidebar-title">
            Issue <b className="text-red">{issues.length}</b>
          </h2>
          <ul className="issue-card-items">
            {issues.map((issue, index) => (
              <li key={`${issue.id}-${index}`} className="issue-card">
                <p className="issue-item issue-id">
                  <span className="text">ID {issue.id}</span>
                  <Button isOnlyIcon className="btn-issue-close">
                    <Icon name="close-issue" />
                  </Button>
                </p>
                <p className="issue-item issue-status">
                  <span className="text">ID {issue.message}</span>
                  <Button isOnlyIcon className="btn-issue-go">
                    <Icon name="go-issue" />
                  </Button>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar

import { Outlet } from 'react-router-dom'
import Sidebar from '../Sidebar/Sidebar'
import './AppLayout.scss'

function AppLayout () {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-layout-main">
        <Outlet />
      </main>
    </div>
  )
}
export default AppLayout
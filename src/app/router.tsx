import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout/AppLayout'
import Map from '../pages/Map/Map'
import Vms from '../pages/Vms/Vms'
import People from '@/pages/People/People'
import Device from '@/pages/Device/Device'
import Access from '@/pages/Access/Access'
import Resource from '@/pages/Resource/Resource'

// vite의 base와 동일한 경로를 basename으로 써서 하위 경로 배포(GitHub Pages)에서도 동작하게 한다
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/map" replace /> },
        { path: 'map', element: <Map /> },
        { path: 'vms', element: <Vms /> },
        { path: 'people', element: <People /> },
        { path: 'device', element: <Device /> },
        { path: 'access', element: <Access /> },
        { path: 'resource', element: <Resource /> },
      ],
    },
  ],
  { basename },
)


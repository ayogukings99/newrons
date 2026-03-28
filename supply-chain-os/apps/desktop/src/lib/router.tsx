import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { DashboardScreen } from '../screens/DashboardScreen'
import { InventoryScreen } from '../screens/InventoryScreen'
import { ForecastingScreen } from '../screens/ForecastingScreen'
import { ProcurementScreen } from '../screens/ProcurementScreen'
import { WarehouseScreen } from '../screens/WarehouseScreen'
import { RoutesScreen } from '../screens/RoutesScreen'
import { QualityScreen } from '../screens/QualityScreen'
import { PeersScreen } from '../screens/PeersScreen'
import { ChainInspectorScreen } from '../screens/ChainInspectorScreen'
import { OnboardingScreen } from '../screens/OnboardingScreen'

export const router = createBrowserRouter([
  {
    path: '/onboarding',
    element: <OnboardingScreen />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardScreen /> },
      { path: 'inventory', element: <InventoryScreen /> },
      { path: 'forecasting', element: <ForecastingScreen /> },
      { path: 'procurement', element: <ProcurementScreen /> },
      { path: 'warehouse', element: <WarehouseScreen /> },
      { path: 'routes', element: <RoutesScreen /> },
      { path: 'quality', element: <QualityScreen /> },
      { path: 'peers', element: <PeersScreen /> },
      { path: 'chain', element: <ChainInspectorScreen /> },
    ],
  },
])

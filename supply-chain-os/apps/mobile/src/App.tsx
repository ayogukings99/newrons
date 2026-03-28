import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text } from 'react-native'

import { HomeScreen } from './screens/HomeScreen'
import { WarehouseScreen } from './screens/WarehouseScreen'
import { TasksScreen } from './screens/TasksScreen'
import { RoutesScreen } from './screens/RoutesScreen'
import { ScanScreen } from './screens/ScanScreen'

const Tab = createBottomTabNavigator()

// 5-tab bottom navigation as specified in SUPPLY-CHAIN-DESIGN.md
// Home | Warehouse | Tasks | Routes | Scan
export function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#0a0a0f' },
            headerTintColor: '#e5e7eb',
            tabBarStyle: {
              backgroundColor: '#111827',
              borderTopColor: '#1f2937',
            },
            tabBarActiveTintColor: '#2dd4bf',
            tabBarInactiveTintColor: '#6b7280',
          }}
        >
          <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>⬡</Text> }}
          />
          <Tab.Screen
            name="Warehouse"
            component={WarehouseScreen}
            options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>🏭</Text> }}
          />
          <Tab.Screen
            name="Tasks"
            component={TasksScreen}
            options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>📋</Text> }}
          />
          <Tab.Screen
            name="Routes"
            component={RoutesScreen}
            options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>🗺️</Text> }}
          />
          <Tab.Screen
            name="Scan"
            component={ScanScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color }}>📷</Text>,
              tabBarLabel: 'Scan',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

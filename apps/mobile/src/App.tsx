/**
 * neurons.app Unified Mobile Application
 *
 * Architecture:
 *   - ONE unified app covering both social and economic layers
 *   - Bottom tab navigation: Social | Economy | Settings | etc.
 *   - Social layer: LOGOS, Flight Logs, Audio, Security, Barbershop, World Scans
 *   - Economic layer: Warehouse, Inventory, Routes, Tasks, NFC Scans
 *   - Integration: DID ↔ User identity, settlements, intelligence
 *
 * This is the root entry point. It imports screens from both layers
 * and organizes them into coherent feature tabs.
 */

import React, { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text, ActivityIndicator, View } from 'react-native'

// Social layer screens
import { EconomyScreen } from './screens/EconomyScreen'
import { NfcWarehouseScreen } from './screens/NfcWarehouseScreen'

// Supply chain screens (imported from supply-chain-os monorepo path)
// These would be imported via workspace dependencies:
// import { HomeScreen as SCHomeScreen } from 'supply-chain-os/apps/mobile/src/screens/HomeScreen'
// For now, we'll create simple placeholder screens

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

/**
 * Economy Stack Navigator
 * Nested stack for economic features with Economy home + NFC warehouse
 */
function EconomyStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0f' },
        headerTintColor: '#2dd4bf',
        headerTitleStyle: { color: '#e5e7eb', fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="EconomyHome"
        component={EconomyScreen}
        options={{ title: 'Economy', headerShown: false }}
      />
      <Stack.Screen
        name="NfcWarehouse"
        component={NfcWarehouseScreen}
        options={{ title: 'Warehouse Scan', headerShown: true }}
      />
    </Stack.Navigator>
  )
}

/**
 * Main App Navigator
 * Bottom tabs: Social, Economy, Settings (+ future tabs)
 */
export function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Initialize app state (auth, config, etc.)
    const initializeApp = async () => {
      try {
        // Simulate initialization
        await new Promise(r => setTimeout(r, 500))
        setIsLoading(false)
      } catch (err) {
        console.error('App initialization failed:', err)
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [])

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#2dd4bf" />
          <Text style={{ color: '#9ca3af', marginTop: 16 }}>Initializing neurons.app...</Text>
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#111827',
              borderTopColor: '#1f2937',
              borderTopWidth: 1,
            },
            tabBarActiveTintColor: '#2dd4bf',
            tabBarInactiveTintColor: '#6b7280',
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
              marginBottom: 2,
            },
          }}
        >
          {/* Social Tab — placeholder for future integration */}
          <Tab.Screen
            name="Social"
            component={PlaceholderScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⬡</Text>,
              tabBarLabel: 'Social',
            }}
          />

          {/* Economy Tab — unified warehouse + supply chain */}
          <Tab.Screen
            name="Economy"
            component={EconomyStackNavigator}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📦</Text>,
              tabBarLabel: 'Economy',
            }}
          />

          {/* Settings Tab — placeholder */}
          <Tab.Screen
            name="Settings"
            component={PlaceholderScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
              tabBarLabel: 'Settings',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

/**
 * Placeholder Screen — shown for future feature tabs
 */
function PlaceholderScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#e5e7eb', fontSize: 18, fontWeight: '700' }}>Coming Soon</Text>
      <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>Feature in development</Text>
    </View>
  )
}

export default App

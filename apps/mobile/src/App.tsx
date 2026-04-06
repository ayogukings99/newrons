/**
 * newrons — Sovereign OS Unified Mobile Application
 *
 * 5 tabs: Anima (identity) | Social | Economy | Storefront | Wallet
 * Each tab is a nested stack navigator for drill-down screens.
 */

import React, { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text, ActivityIndicator, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Phase 1 screens
import AnimaScreen from './screens/AnimaScreen'
import StorefrontScreen from './screens/StorefrontScreen'
import BrandFinanceCardScreen from './screens/BrandFinanceCardScreen'
import { EconomyScreen } from './screens/EconomyScreen'
import { NfcWarehouseScreen } from './screens/NfcWarehouseScreen'

// Supply chain screens (unified from supply-chain-os)
import { HomeScreen as SCHomeScreen } from './screens/supply-chain/SCHomeScreen'
import { ScanScreen as SCScanScreen } from './screens/supply-chain/SCScanScreen'
import { TasksScreen as SCTasksScreen } from './screens/supply-chain/SCTasksScreen'
import { WarehouseScreen as SCWarehouseScreen } from './screens/supply-chain/SCWarehouseScreen'
import { RoutesScreen as SCRoutesScreen } from './screens/supply-chain/SCRoutesScreen'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

const stackScreenOptions = {
  headerStyle: { backgroundColor: '#0a0a0f' },
  headerTintColor: '#2dd4bf',
  headerTitleStyle: { color: '#e5e7eb', fontWeight: '700' as const },
}

function AnimaStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="AnimaHome" component={AnimaScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}

function SocialStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="SocialHome" component={PlaceholderScreen} options={{ title: 'Social', headerShown: false }} />
    </Stack.Navigator>
  )
}

function EconomyStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="EconomyHome" component={EconomyScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NfcWarehouse" component={NfcWarehouseScreen} options={{ title: 'Warehouse Scan' }} />
      <Stack.Screen name="SCHome" component={SCHomeScreen} options={{ title: 'Supply Chain' }} />
      <Stack.Screen name="SCScan" component={SCScanScreen} options={{ title: 'Barcode Scan' }} />
      <Stack.Screen name="SCTasks" component={SCTasksScreen} options={{ title: 'Tasks' }} />
      <Stack.Screen name="SCWarehouse" component={SCWarehouseScreen} options={{ title: 'Warehouse' }} />
      <Stack.Screen name="SCRoutes" component={SCRoutesScreen} options={{ title: 'Routes' }} />
    </Stack.Navigator>
  )
}

function StorefrontStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="StorefrontHome" component={StorefrontScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}

function WalletStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="WalletHome" component={BrandFinanceCardScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}

export function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initializeApp = async () => {
      try {
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
          <Text style={{ color: '#9ca3af', marginTop: 16 }}>Initializing newrons...</Text>
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
              paddingTop: 4,
              height: 60,
            },
            tabBarActiveTintColor: '#2dd4bf',
            tabBarInactiveTintColor: '#6b7280',
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '600',
              marginBottom: 4,
            },
          }}
        >
          <Tab.Screen
            name="Anima"
            component={AnimaStack}
            options={{
              tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
              tabBarLabel: 'Anima',
            }}
          />
          <Tab.Screen
            name="Social"
            component={SocialStack}
            options={{
              tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
              tabBarLabel: 'Social',
            }}
          />
          <Tab.Screen
            name="Economy"
            component={EconomyStack}
            options={{
              tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
              tabBarLabel: 'Economy',
            }}
          />
          <Tab.Screen
            name="Store"
            component={StorefrontStack}
            options={{
              tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} />,
              tabBarLabel: 'Store',
            }}
          />
          <Tab.Screen
            name="Wallet"
            component={WalletStack}
            options={{
              tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
              tabBarLabel: 'Wallet',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

function PlaceholderScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#e5e7eb', fontSize: 18, fontWeight: '700' }}>Coming Soon</Text>
      <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>Feature in development</Text>
    </View>
  )
}

export default App

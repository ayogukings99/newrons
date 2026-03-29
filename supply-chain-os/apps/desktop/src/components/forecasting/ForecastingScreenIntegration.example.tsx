/**
 * INTEGRATION EXAMPLE: LogosSignals in ForecastingScreen
 *
 * This file demonstrates how to integrate the LogosSignals component
 * into the existing ForecastingScreen.tsx.
 *
 * Steps to integrate:
 * 1. Import LogosSignals at the top of ForecastingScreen.tsx:
 *    import { LogosSignals } from './LogosSignals'
 *
 * 2. Add state to track selected SKU for filtering:
 *    const [selectedSkuKeywords, setSelectedSkuKeywords] = useState<string[]>([])
 *    const [selectedLocation, setSelectedLocation] = useState<string | undefined>()
 *
 * 3. In the render section (TabPanels), add the LogosSignals component
 *    as shown below — typically as a secondary panel or card below the forecast chart.
 *
 * 4. When user selects a SKU forecast, update the filter keywords:
 *    const handleSelectSku = (skuId: string) => {
 *      setSelectedSku(forecast)
 *      setSelectedSkuKeywords([skuId.toLowerCase()])
 *    }
 */

import React, { useState } from 'react'
import {
  Container,
  Heading,
  Button,
  VStack,
  HStack,
  Tab,
  Tabs,
  TabList,
  TabPanels,
  TabPanel,
  Divider,
  Box,
} from '@chakra-ui/react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { LogosSignals } from './LogosSignals'

// Mock forecast data structure
interface ForecastData {
  sku_id: string
  location_id: string
  predicted: number
  date: string
}

/**
 * Example integration showing LogosSignals below the main forecast chart.
 * This is the recommended placement for desktop supply chain operators.
 */
export function ForecastingScreenWithLogosIntegration() {
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [forecastData, setForecastData] = useState<ForecastData[]>([])

  // Handler when a SKU is selected in the forecast chart
  const handleSelectSku = (skuId: string, locationId?: string) => {
    setSelectedSku(skuId)
    if (locationId) setSelectedLocation(locationId)
  }

  // When LOGOS signals are loaded, optionally update forecast logic
  const handleSignalsLoaded = (signals: any[]) => {
    console.log('LOGOS signals loaded:', signals)

    // Optional: Parse signals and adjust local forecast display
    // Example: highlight SKUs with high demand signals
    // Example: show alert badge on products with critical alerts
  }

  return (
    <Container maxW="100%" p={6}>
      <Heading mb={6}>Demand Forecasting with LOGOS Intelligence</Heading>

      <Tabs variant="enclosed">
        <TabList mb="1em">
          <Tab>Forecasts</Tab>
          <Tab>Analytics</Tab>
          <Tab>Market Intelligence</Tab>
        </TabList>

        <TabPanels>
          {/* TAB 1: Forecasts */}
          <TabPanel>
            <VStack align="stretch" spacing={6}>
              {/* Forecast Chart */}
              <Box>
                <Heading size="md" mb={4}>
                  Demand Forecast Chart
                </Heading>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={forecastData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="#8884d8"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>

              <Divider my={4} />

              {/* LOGOS INTELLIGENCE PANEL — Main Integration Point */}
              <Box>
                <LogosSignals
                  apiEndpoint="http://localhost:3000/api/v1/integration/intelligence"
                  skuKeywords={selectedSku ? [selectedSku.toLowerCase()] : undefined}
                  locationCode={selectedLocation || undefined}
                  refreshIntervalMs={30 * 60 * 1000} // 30 minutes
                  onSignalsLoaded={handleSignalsLoaded}
                />
              </Box>

              <Divider my={4} />

              {/* Action Buttons */}
              <HStack spacing={3}>
                <Button colorScheme="blue">Run Forecast</Button>
                <Button colorScheme="teal" variant="outline">
                  Refresh LOGOS Signals
                </Button>
                <Button colorScheme="green" variant="outline">
                  Export Forecast
                </Button>
              </HStack>
            </VStack>
          </TabPanel>

          {/* TAB 2: Analytics */}
          <TabPanel>
            <Heading size="md">Forecast Analytics</Heading>
            <Box mt={4}>
              {/* Accuracy metrics, anomalies, etc. */}
              <p>Analytics dashboard here...</p>
            </Box>
          </TabPanel>

          {/* TAB 3: Market Intelligence */}
          <TabPanel>
            <VStack align="stretch" spacing={4}>
              <Heading size="md">Market Context from LOGOS</Heading>

              {/* Full-width LOGOS signals component */}
              <LogosSignals
                apiEndpoint="http://localhost:3000/api/v1/integration/intelligence"
                // No SKU filter — show all signals
                refreshIntervalMs={10 * 60 * 1000} // 10 minutes for this tab
                onSignalsLoaded={handleSignalsLoaded}
              />
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Container>
  )
}

/**
 * MINIMAL INTEGRATION: Add to existing ForecastingScreen.tsx
 *
 * Near the bottom of the render, after the forecast chart, add:
 *
 * ```tsx
 * import { LogosSignals } from './LogosSignals'
 *
 * // Inside ForecastingScreen component:
 * export function ForecastingScreen() {
 *   // ... existing state and handlers ...
 *   const [selectedSkuForLogosFil, setSelectedSkuForLogosFilter] = useState<string[]>([])
 *
 *   // ... existing code ...
 *
 *   return (
 *     <Container>
 *       {/* ... existing forecast chart ... */}
 *
 *       {/* ADD THIS SECTION: */}
 *       <Box mt={8}>
 *         <LogosSignals
 *           skuKeywords={selectedSkuForLogosFilter}
 *           locationCode={selectedSku?.location_id}
 *           onSignalsLoaded={(signals) => {
 *             console.log('Market signals loaded:', signals)
 *           }}
 *         />
 *       </Box>
 *     </Container>
 *   )
 * }
 * ```
 */

/**
 * LOGOS Intelligence Signals Panel
 *
 * Displays demand signals extracted from the LOGOS community knowledge graph.
 * Integrated into the ForecastingScreen to augment ONNX local forecasting.
 *
 * Features:
 *   - Real-time demand signals from LOGOS community discussions
 *   - Magnitude + confidence indicators
 *   - Location-aware filtering
 *   - Signal type badges (trend_up, trend_down, demand_spike, alert, seasonal)
 *   - LOGOS community attribution
 *   - Auto-refresh every 30 minutes
 */

import React, { useState, useEffect } from 'react'
import {
  Card,
  CardBody,
  CardHeader,
  Heading,
  VStack,
  HStack,
  Badge,
  Box,
  Text,
  Spinner,
  useToast,
  Divider,
  Tag,
  TagLabel,
  Progress,
  Button,
  Input,
  Select,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
} from '@chakra-ui/react'
import { ArrowUpIcon, ArrowDownIcon, WarningIcon, TimeIcon, StarIcon } from '@chakra-ui/icons'

interface DemandSignal {
  id?: string
  skuExternalId: string
  locationCode?: string
  source: 'logos' | 'community' | 'manual' | 'market'
  signalType: 'demand_spike' | 'trend_up' | 'trend_down' | 'seasonal' | 'alert'
  magnitude: number
  confidence: number
  logosNodeId?: string
  context: string
  validFrom: string
  validUntil?: string
}

interface LogosSignalsProps {
  apiEndpoint?: string // configurable endpoint (default: from Tauri config)
  skuKeywords?: string[] // auto-filter to these SKU keywords
  locationCode?: string  // auto-filter to this location
  refreshIntervalMs?: number // default: 30 minutes
  onSignalsLoaded?: (signals: DemandSignal[]) => void
}

export function LogosSignals({
  apiEndpoint = 'http://localhost:3000/api/v1/integration/intelligence',
  skuKeywords,
  locationCode,
  refreshIntervalMs = 30 * 60 * 1000,
  onSignalsLoaded,
}: LogosSignalsProps) {
  const [signals, setSignals] = useState<DemandSignal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Filter state
  const [filterSku, setFilterSku] = useState(skuKeywords?.join(',') || '')
  const [filterLocation, setFilterLocation] = useState(locationCode || '')
  const [filterType, setFilterType] = useState<string>('all')

  const toast = useToast()

  // Load signals on mount and auto-refresh
  useEffect(() => {
    loadSignals()

    const interval = setInterval(() => {
      loadSignals()
    }, refreshIntervalMs)

    return () => clearInterval(interval)
  }, [filterSku, filterLocation])

  const loadSignals = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()

      const keywords = filterSku
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
      if (keywords.length > 0) {
        params.append('sku_keywords', keywords.join(','))
      }

      if (filterLocation) {
        params.append('location', filterLocation)
      }

      params.append('limit', '50')

      const response = await fetch(
        `${apiEndpoint}/demand-signals?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const data = await response.json()
      const loadedSignals = data.signals || []

      setSignals(loadedSignals)
      setLastUpdated(new Date())
      onSignalsLoaded?.(loadedSignals)

      if (loadedSignals.length === 0) {
        setError('No demand signals found for the current filters.')
      }
    } catch (err: any) {
      const message = err.message || 'Failed to load demand signals'
      setError(message)
      console.error('Failed to load LOGOS signals:', err)

      toast({
        title: 'Error loading LOGOS signals',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setLoading(false)
    }
  }

  const getSignalIcon = (type: DemandSignal['signalType']) => {
    switch (type) {
      case 'trend_up':
        return <ArrowUpIcon color="green.500" mr={2} />
      case 'trend_down':
        return <ArrowDownIcon color="red.500" mr={2} />
      case 'demand_spike':
        return <StarIcon color="orange.500" mr={2} />
      case 'alert':
        return <WarningIcon color="red.600" mr={2} />
      case 'seasonal':
        return <TimeIcon color="blue.500" mr={2} />
      default:
        return null
    }
  }

  const getSignalBadgeColor = (type: DemandSignal['signalType']): string => {
    switch (type) {
      case 'trend_up':
        return 'green'
      case 'trend_down':
        return 'red'
      case 'demand_spike':
        return 'orange'
      case 'alert':
        return 'red'
      case 'seasonal':
        return 'blue'
      default:
        return 'gray'
    }
  }

  const getMagnitudeColor = (magnitude: number): string => {
    if (magnitude > 1.3) return 'red'
    if (magnitude > 1.1) return 'orange'
    if (magnitude < 0.7) return 'blue'
    if (magnitude < 0.9) return 'cyan'
    return 'gray'
  }

  const getMagnitudeLabel = (magnitude: number): string => {
    const percent = Math.round((magnitude - 1) * 100)
    if (percent > 0) return `+${percent}%`
    if (percent < 0) return `${percent}%`
    return 'Baseline'
  }

  const filteredSignals = signals.filter(s => {
    if (filterType !== 'all' && s.signalType !== filterType) return false
    return true
  })

  return (
    <Card variant="elevated" shadow="md" mb={6}>
      <CardHeader bg="linear-gradient(to right, teal.600, teal.500)" color="white">
        <HStack justify="space-between" align="center">
          <HStack>
            <Heading size="md">LOGOS Market Intelligence</Heading>
            <Badge colorScheme="teal" variant="solid">
              Community Powered
            </Badge>
          </HStack>
          {lastUpdated && (
            <Text fontSize="xs" opacity={0.8}>
              Updated: {lastUpdated.toLocaleTimeString()}
            </Text>
          )}
        </HStack>
      </CardHeader>

      <CardBody>
        <VStack align="stretch" spacing={4}>
          {/* Filters */}
          <Card variant="outline" p={4}>
            <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4}>
              <FormControl>
                <FormLabel fontSize="sm" fontWeight="bold">
                  Product Keywords
                </FormLabel>
                <Input
                  placeholder="e.g., mango, cement"
                  value={filterSku}
                  onChange={e => setFilterSku(e.target.value)}
                  size="sm"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" fontWeight="bold">
                  Location (ISO Code)
                </FormLabel>
                <Input
                  placeholder="e.g., NG, KE, GH"
                  value={filterLocation}
                  onChange={e => setFilterLocation(e.target.value.toUpperCase())}
                  size="sm"
                  maxLength={2}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" fontWeight="bold">
                  Signal Type
                </FormLabel>
                <Select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  size="sm"
                >
                  <option value="all">All Types</option>
                  <option value="demand_spike">Demand Spike</option>
                  <option value="trend_up">Trending Up</option>
                  <option value="trend_down">Trending Down</option>
                  <option value="seasonal">Seasonal</option>
                  <option value="alert">Alert</option>
                </Select>
              </FormControl>

              <FormControl display="flex" alignItems="flex-end">
                <Button
                  colorScheme="teal"
                  size="sm"
                  onClick={loadSignals}
                  isLoading={loading}
                  w="full"
                >
                  Refresh
                </Button>
              </FormControl>
            </Grid>
          </Card>

          {/* Loading state */}
          {loading && (
            <HStack justify="center" py={8}>
              <Spinner color="teal.500" mr={2} />
              <Text color="gray.600">Loading LOGOS signals...</Text>
            </HStack>
          )}

          {/* Error state */}
          {error && !loading && (
            <Box
              p={4}
              bg="orange.50"
              borderLeft="4px solid"
              borderColor="orange.500"
              borderRadius="md"
            >
              <Text color="orange.800" fontSize="sm">
                {error}
              </Text>
            </Box>
          )}

          {/* Signals list */}
          {!loading && filteredSignals.length > 0 && (
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between" px={2}>
                <Heading size="sm" color="gray.700">
                  Active Signals ({filteredSignals.length})
                </Heading>
                <Text fontSize="xs" color="gray.500">
                  Sourced from community LOGOS graphs
                </Text>
              </HStack>

              <Divider />

              {filteredSignals.map((signal, idx) => (
                <Card
                  key={signal.id || idx}
                  variant="outline"
                  p={4}
                  borderLeft="4px solid"
                  borderColor={getMagnitudeColor(signal.magnitude)}
                  hover={{ boxShadow: 'md' }}
                  transition="box-shadow 0.2s"
                >
                  <VStack align="stretch" spacing={3}>
                    {/* Header */}
                    <HStack justify="space-between">
                      <HStack flex={1}>
                        {getSignalIcon(signal.signalType)}
                        <VStack align="flex-start" spacing={0}>
                          <Text fontWeight="bold" fontSize="sm">
                            {signal.skuExternalId.replace(/-/g, ' ').toUpperCase()}
                          </Text>
                          {signal.locationCode && (
                            <Tag size="sm" colorScheme="gray">
                              <TagLabel>{signal.locationCode}</TagLabel>
                            </Tag>
                          )}
                        </VStack>
                      </HStack>

                      <VStack align="flex-end" spacing={1}>
                        <Badge
                          colorScheme={getSignalBadgeColor(signal.signalType)}
                          textTransform="capitalize"
                        >
                          {signal.signalType.replace(/_/g, ' ')}
                        </Badge>
                        <Text fontSize="xs" color="gray.500">
                          Confidence: {Math.round(signal.confidence * 100)}%
                        </Text>
                      </VStack>
                    </HStack>

                    {/* Magnitude bar */}
                    <Box w="full">
                      <HStack justify="space-between" mb={2}>
                        <Text fontSize="xs" fontWeight="bold" color="gray.600">
                          Magnitude
                        </Text>
                        <Text fontSize="sm" fontWeight="bold" color={getMagnitudeColor(signal.magnitude)}>
                          {getMagnitudeLabel(signal.magnitude)}
                        </Text>
                      </HStack>
                      <Progress
                        value={(signal.magnitude / 2) * 100}
                        colorScheme={getMagnitudeColor(signal.magnitude)}
                        height="6px"
                        borderRadius="full"
                        hasStripe
                        isAnimated
                      />
                    </Box>

                    {/* Context */}
                    <Box
                      p={3}
                      bg="gray.50"
                      borderRadius="md"
                      fontSize="xs"
                      color="gray.700"
                      fontStyle="italic"
                      borderLeft="2px solid"
                      borderColor="teal.300"
                    >
                      {signal.context}
                    </Box>

                    {/* Metadata */}
                    <HStack fontSize="xs" color="gray.500" justify="space-between">
                      <HStack>
                        <Text>Source:</Text>
                        <Badge colorScheme="teal" variant="subtle">
                          LOGOS
                        </Badge>
                      </HStack>
                      {signal.validUntil && (
                        <Text>
                          Valid until:{' '}
                          {new Date(signal.validUntil).toLocaleDateString()}
                        </Text>
                      )}
                    </HStack>
                  </VStack>
                </Card>
              ))}
            </VStack>
          )}

          {/* Empty state */}
          {!loading && filteredSignals.length === 0 && !error && (
            <Box textAlign="center" py={8}>
              <Text color="gray.500" mb={3}>
                No demand signals match your current filters.
              </Text>
              <Button colorScheme="teal" size="sm" onClick={loadSignals}>
                Try refreshing
              </Button>
            </Box>
          )}

          {/* Info footer */}
          <Box p={3} bg="teal.50" borderRadius="md" borderLeft="4px solid" borderColor="teal.500">
            <Text fontSize="xs" color="teal.900">
              <strong>💡 Tip:</strong> LOGOS signals augment your local ONNX forecasts with
              real-time community market intelligence. Higher confidence scores indicate stronger
              community consensus.
            </Text>
          </Box>
        </VStack>
      </CardBody>
    </Card>
  )
}

export default LogosSignals

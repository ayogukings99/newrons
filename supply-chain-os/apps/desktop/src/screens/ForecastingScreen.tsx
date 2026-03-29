import React, { useState, useEffect } from 'react';
import {
  Container,
  Heading,
  Button,
  Input,
  VStack,
  HStack,
  Grid,
  Tab,
  Tabs,
  TabList,
  TabPanels,
  TabPanel,
  Select,
  FormControl,
  FormLabel,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Card,
  CardBody,
  CardHeader,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Divider,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
  ComposedChart,
  Area,
} from 'recharts';
import { invoke } from '@tauri-apps/api/core';

interface ForecastValue {
  date_epoch: number;
  predicted: number;
  lower_bound?: number;
  upper_bound?: number;
}

interface ForecastSummary {
  sku_id: string;
  location_id: string;
  latest_forecast?: ForecastValue;
  next_7_days: ForecastValue[];
  next_30_days: ForecastValue[];
  created_at: number;
}

interface AccuracyMetrics {
  sku_id: string;
  mae: number;
  mape: number;
  rmse: number;
  last_30_days_mape: number;
}

interface Anomaly {
  date_epoch: number;
  quantity: number;
  deviation_stddev: number;
  severity: string;
}

interface ReorderSuggestion {
  sku_id: string;
  reorder_qty: number;
  reorder_date_epoch: number;
  safety_stock: number;
  lead_time_days: number;
  reason: string;
}

export function ForecastingScreen() {
  const [forecasts, setForecasts] = useState<ForecastSummary[]>([]);
  const [selectedSku, setSelectedSku] = useState<ForecastSummary | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyMetrics | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [reorderSuggestion, setReorderSuggestion] = useState<ReorderSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    loadForecasts();
  }, []);

  const loadForecasts = async () => {
    setLoading(true);
    try {
      const result = await invoke<any>('cmd_get_all_forecasts', {});
      if (result.success) {
        setForecasts(result.data || []);
        if (result.data && result.data.length > 0) {
          await loadForecastDetails(result.data[0].sku_id);
        }
      } else {
        toast({
          title: 'Error',
          description: result.error,
          status: 'error',
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: 'Error loading forecasts',
        description: String(error),
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadForecastDetails = async (skuId: string) => {
    try {
      const result = await invoke<any>('cmd_get_forecast', {
        req: { sku_id: skuId },
      });
      if (result.success && result.data) {
        setSelectedSku(result.data);
        await loadAccuracy(skuId);
        await loadAnomalies(skuId);
        await loadReorder(skuId);
      }
    } catch (error) {
      toast({
        title: 'Error loading forecast details',
        description: String(error),
        status: 'error',
        duration: 3000,
      });
    }
  };

  const loadAccuracy = async (skuId: string) => {
    try {
      const result = await invoke<any>('cmd_check_accuracy', {
        req: { sku_id: skuId },
      });
      if (result.success) {
        setAccuracy(result.data);
      }
    } catch (error) {
      console.error('Error loading accuracy:', error);
    }
  };

  const loadAnomalies = async (skuId: string) => {
    try {
      const result = await invoke<any>('cmd_detect_anomalies', {
        req: { sku_id: skuId },
      });
      if (result.success) {
        setAnomalies(result.data || []);
      }
    } catch (error) {
      console.error('Error loading anomalies:', error);
    }
  };

  const loadReorder = async (skuId: string) => {
    try {
      const result = await invoke<any>('cmd_suggest_reorder', {
        req: { sku_id: skuId },
      });
      if (result.success) {
        setReorderSuggestion(result.data);
      }
    } catch (error) {
      console.error('Error loading reorder suggestion:', error);
    }
  };

  const runForecast = async (skuId: string) => {
    setLoading(true);
    try {
      const result = await invoke<any>('cmd_run_forecast', {
        req: { sku_id: skuId, location_id: 'default', horizon_days: 30 },
      });
      if (result.success) {
        await loadForecasts();
        toast({
          title: 'Forecast completed',
          status: 'success',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Error',
          description: result.error,
          status: 'error',
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: 'Error running forecast',
        description: String(error),
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = () => {
    if (!selectedSku || !selectedSku.next_30_days) return [];

    return selectedSku.next_30_days.map((val) => ({
      date: new Date(val.date_epoch).toLocaleDateString(),
      predicted: val.predicted,
      upper: val.upper_bound,
      lower: val.lower_bound,
      isAnomaly: anomalies.some((a) => a.date_epoch === val.date_epoch),
    }));
  };

  return (
    <Container maxW="100%" py={6} bg="gray.900" color="white" minH="100vh">
      <Heading mb={6} color="teal.400">
        Demand Forecasting Dashboard
      </Heading>

      <Tabs colorScheme="teal">
        <TabList>
          <Tab>Forecast Chart</Tab>
          <Tab>Accuracy Metrics</Tab>
          <Tab>Anomalies</Tab>
          <Tab>Reorder Suggestions</Tab>
        </TabList>

        <TabPanels>
          {/* Forecast Chart */}
          <TabPanel>
            <VStack spacing={6} align="stretch">
              <HStack spacing={4}>
                <FormControl maxW="300px">
                  <FormLabel>Select SKU</FormLabel>
                  <Select
                    value={selectedSku?.sku_id || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        loadForecastDetails(e.target.value);
                      }
                    }}
                  >
                    {forecasts.map((f) => (
                      <option key={f.sku_id} value={f.sku_id}>
                        {f.sku_id}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  colorScheme="teal"
                  onClick={() => selectedSku && runForecast(selectedSku.sku_id)}
                  isLoading={loading}
                  mt={7}
                >
                  Run Forecast
                </Button>
              </HStack>

              {selectedSku && (
                <Card bg="gray.800" borderColor="teal.500" borderWidth={2}>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={prepareChartData()}>
                        <defs>
                          <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="gray" />
                        <XAxis dataKey="date" stroke="gray" />
                        <YAxis stroke="gray" />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #14b8a6' }} />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="upper"
                          fill="url(#colorArea)"
                          stroke="none"
                          name="Upper Bound"
                        />
                        <Line
                          type="monotone"
                          dataKey="predicted"
                          stroke="#14b8a6"
                          strokeWidth={2}
                          name="Forecast"
                          dot={{ fill: '#14b8a6', r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="lower"
                          stroke="#14b8a6"
                          strokeDasharray="5 5"
                          strokeWidth={1}
                          name="Lower Bound"
                        />
                        {anomalies.map((anomaly) => (
                          <ReferenceDot
                            key={anomaly.date_epoch}
                            x={new Date(anomaly.date_epoch).toLocaleDateString()}
                            y={anomaly.quantity}
                            r={6}
                            fill="#ef4444"
                            name="Anomaly"
                          />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              {selectedSku && (
                <Grid templateColumns="1fr 1fr" gap={4}>
                  <Stat>
                    <StatLabel color="gray.400">Next 7 Days Average</StatLabel>
                    <StatNumber color="teal.300">
                      {(selectedSku.next_7_days.reduce((sum, v) => sum + v.predicted, 0) / 7).toFixed(0)}
                    </StatNumber>
                  </Stat>
                  <Stat>
                    <StatLabel color="gray.400">Next 30 Days Average</StatLabel>
                    <StatNumber color="teal.300">
                      {(selectedSku.next_30_days.reduce((sum, v) => sum + v.predicted, 0) / 30).toFixed(0)}
                    </StatNumber>
                  </Stat>
                </Grid>
              )}
            </VStack>
          </TabPanel>

          {/* Accuracy Metrics */}
          <TabPanel>
            {accuracy ? (
              <Grid templateColumns="repeat(2, 1fr)" gap={6}>
                <Card bg="gray.800">
                  <CardBody>
                    <Stat>
                      <StatLabel color="gray.400">MAE (Mean Absolute Error)</StatLabel>
                      <StatNumber color="teal.300">{accuracy.mae.toFixed(2)}</StatNumber>
                      <StatHelpText color="gray.500">Lower is better</StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
                <Card bg="gray.800">
                  <CardBody>
                    <Stat>
                      <StatLabel color="gray.400">MAPE (Mean Absolute % Error)</StatLabel>
                      <StatNumber color={accuracy.mape < 20 ? 'green.300' : 'orange.300'}>
                        {accuracy.mape.toFixed(2)}%
                      </StatNumber>
                      <StatHelpText color="gray.500">&lt;20% is good</StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
                <Card bg="gray.800">
                  <CardBody>
                    <Stat>
                      <StatLabel color="gray.400">RMSE (Root Mean Squared Error)</StatLabel>
                      <StatNumber color="teal.300">{accuracy.rmse.toFixed(2)}</StatNumber>
                      <StatHelpText color="gray.500">Penalizes large errors</StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
                <Card bg="gray.800">
                  <CardBody>
                    <Stat>
                      <StatLabel color="gray.400">Last 30 Days MAPE</StatLabel>
                      <StatNumber color={accuracy.last_30_days_mape < 20 ? 'green.300' : 'orange.300'}>
                        {accuracy.last_30_days_mape.toFixed(2)}%
                      </StatNumber>
                      <StatHelpText color="gray.500">Recent accuracy</StatHelpText>
                    </Stat>
                  </CardBody>
                </Card>
              </Grid>
            ) : (
              <Heading color="gray.400">No accuracy data available</Heading>
            )}
          </TabPanel>

          {/* Anomalies */}
          <TabPanel>
            {anomalies.length > 0 ? (
              <Table variant="striped" colorScheme="blackAlpha" bg="gray.800">
                <Thead>
                  <Tr>
                    <Th color="teal.300">Date</Th>
                    <Th color="teal.300">Quantity</Th>
                    <Th color="teal.300">Deviation (σ)</Th>
                    <Th color="teal.300">Severity</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {anomalies.map((anomaly) => (
                    <Tr key={anomaly.date_epoch}>
                      <Td>{new Date(anomaly.date_epoch).toLocaleDateString()}</Td>
                      <Td>{anomaly.quantity}</Td>
                      <Td>{anomaly.deviation_stddev.toFixed(2)}</Td>
                      <Td>
                        <Badge
                          colorScheme={
                            anomaly.severity === 'SEVERE'
                              ? 'red'
                              : anomaly.severity === 'MODERATE'
                              ? 'orange'
                              : 'yellow'
                          }
                        >
                          {anomaly.severity}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            ) : (
              <Heading color="gray.400">No anomalies detected</Heading>
            )}
          </TabPanel>

          {/* Reorder Suggestions */}
          <TabPanel>
            {reorderSuggestion ? (
              <Card bg="gray.800" borderColor="teal.500" borderWidth={2}>
                <CardHeader>
                  <Heading size="md" color="teal.300">
                    Reorder Recommendation for {reorderSuggestion.sku_id}
                  </Heading>
                </CardHeader>
                <Divider />
                <CardBody>
                  <Grid templateColumns="repeat(2, 1fr)" gap={6}>
                    <Stat>
                      <StatLabel color="gray.400">Reorder Quantity</StatLabel>
                      <StatNumber color="teal.300" fontSize="2xl">
                        {reorderSuggestion.reorder_qty}
                      </StatNumber>
                      <StatHelpText color="gray.500">units</StatHelpText>
                    </Stat>
                    <Stat>
                      <StatLabel color="gray.400">Reorder Date</StatLabel>
                      <StatNumber color="teal.300">
                        {new Date(reorderSuggestion.reorder_date_epoch).toLocaleDateString()}
                      </StatNumber>
                      <StatHelpText color="gray.500">Lead time {reorderSuggestion.lead_time_days} days</StatHelpText>
                    </Stat>
                    <Stat>
                      <StatLabel color="gray.400">Safety Stock</StatLabel>
                      <StatNumber color="orange.300">{reorderSuggestion.safety_stock}</StatNumber>
                      <StatHelpText color="gray.500">units</StatHelpText>
                    </Stat>
                    <Stat>
                      <StatLabel color="gray.400">Lead Time</StatLabel>
                      <StatNumber color="blue.300">{reorderSuggestion.lead_time_days}</StatNumber>
                      <StatHelpText color="gray.500">days</StatHelpText>
                    </Stat>
                  </Grid>
                  <VStack spacing={4} mt={6} align="stretch">
                    <Divider />
                    <Heading size="sm" color="gray.300">
                      Reasoning
                    </Heading>
                    <HStack p={4} bg="gray.700" rounded="md">
                      <Stat>
                        <StatHelpText color="gray.300">{reorderSuggestion.reason}</StatHelpText>
                      </Stat>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>
            ) : (
              <Heading color="gray.400">No reorder suggestion available</Heading>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Container>
  );
}

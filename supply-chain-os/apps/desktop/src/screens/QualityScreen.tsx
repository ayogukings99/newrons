import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Heading,
  Button,
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  VStack,
  HStack,
  Grid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  FormControl,
  FormLabel,
  Select,
  Card,
  CardBody,
  CardHeader,
  Divider,
  useToast,
} from '@chakra-ui/react';
import { invoke } from '@tauri-apps/api/core';

interface InspectionRow {
  id: string;
  po_id?: string;
  supplier_did: string;
  status: string;
  aql_level: string;
  sample_size: number;
  defects_found: number;
  created_at: number;
  completed_at?: number;
}

interface BatchDetail {
  batch: InspectionRow;
  items: Array<{
    id: string;
    batch_id: string;
    sku_id?: string;
    result: string;
    defect_type?: string;
    notes?: string;
    inspected_at: number;
  }>;
  defect_summary: {
    critical_count: number;
    major_count: number;
    minor_count: number;
    critical_pct: number;
    major_pct: number;
    minor_pct: number;
  };
  aql_verdict: string;
}

interface SupplierQuality {
  supplier_did: string;
  total_batches_inspected: number;
  batches_passed: number;
  batches_failed: number;
  pass_rate_pct: number;
  defect_rate_pct: number;
  ncr_count: number;
  quality_tier: string;
}

export function QualityScreen() {
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierQuality[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const {
    isOpen: isInspectionOpen,
    onOpen: onInspectionOpen,
    onClose: onInspectionClose,
  } = useDisclosure();

  useEffect(() => {
    loadInspections();
  }, []);

  const loadInspections = async () => {
    setLoading(true);
    try {
      const result = await invoke<any>('cmd_list_inspections', {
        req: { status: null },
      });
      if (result.success) {
        setInspections(result.data || []);
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
        title: 'Error loading inspections',
        description: String(error),
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadBatchDetail = async (batchId: string) => {
    try {
      const result = await invoke<any>('cmd_get_batch_detail', {
        req: { batch_id: batchId },
      });
      if (result.success) {
        setSelectedBatch(result.data);
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
        title: 'Error loading batch',
        description: String(error),
        status: 'error',
        duration: 3000,
      });
    }
  };

  const loadSupplierQuality = async (supplierDid: string) => {
    try {
      const result = await invoke<any>('cmd_get_supplier_quality', {
        req: { supplier_did: supplierDid },
      });
      if (result.success) {
        setSuppliers([result.data]);
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
        title: 'Error loading supplier quality',
        description: String(error),
        status: 'error',
        duration: 3000,
      });
    }
  };

  const getQualityBadgeColor = (tier: string) => {
    switch (tier) {
      case 'A':
        return 'green';
      case 'B':
        return 'blue';
      case 'C':
        return 'yellow';
      case 'D':
        return 'orange';
      case 'F':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'PASSED':
        return 'green';
      case 'FAILED':
        return 'red';
      case 'IN_PROGRESS':
        return 'blue';
      default:
        return 'gray';
    }
  };

  return (
    <Container maxW="100%" py={6} bg="gray.900" color="white" minH="100vh">
      <Heading mb={6} color="teal.400">
        Quality Control Dashboard
      </Heading>

      <Tabs colorScheme="teal">
        <TabList>
          <Tab>Inspection Queue</Tab>
          <Tab>Supplier Quality</Tab>
          <Tab>Batch Details</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <VStack spacing={4} align="stretch">
              <HStack justify="space-between">
                <Heading size="md">Pending Inspections</Heading>
                <Button colorScheme="teal" onClick={onInspectionOpen} size="sm">
                  + Start Inspection
                </Button>
              </HStack>

              <Table variant="striped" colorScheme="blackAlpha" bg="gray.800">
                <Thead>
                  <Tr>
                    <Th color="teal.300">Batch ID</Th>
                    <Th color="teal.300">PO</Th>
                    <Th color="teal.300">Supplier</Th>
                    <Th color="teal.300">Status</Th>
                    <Th color="teal.300">AQL</Th>
                    <Th color="teal.300">Sample Size</Th>
                    <Th color="teal.300">Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {inspections.map((inspection) => (
                    <Tr key={inspection.id}>
                      <Td>{inspection.id.substring(0, 8)}</Td>
                      <Td>{inspection.po_id || '-'}</Td>
                      <Td fontSize="xs">{inspection.supplier_did.substring(0, 12)}...</Td>
                      <Td>
                        <Badge colorScheme={getStatusBadgeColor(inspection.status)}>
                          {inspection.status}
                        </Badge>
                      </Td>
                      <Td>{inspection.aql_level}</Td>
                      <Td>{inspection.sample_size}</Td>
                      <Td>
                        <Button
                          size="xs"
                          colorScheme="teal"
                          variant="outline"
                          onClick={() => loadBatchDetail(inspection.id)}
                        >
                          View
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </VStack>
          </TabPanel>

          <TabPanel>
            <VStack spacing={4} align="stretch">
              <FormControl maxW="300px">
                <FormLabel>Search by Supplier DID</FormLabel>
                <Input
                  placeholder="did:key:..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value) {
                      loadSupplierQuality(e.currentTarget.value);
                    }
                  }}
                />
              </FormControl>

              <Grid templateColumns="repeat(auto-fit, minmax(300px, 1fr))" gap={4}>
                {suppliers.map((supplier) => (
                  <Card key={supplier.supplier_did} bg="gray.800" borderColor="teal.500" borderWidth={2}>
                    <CardHeader>
                      <HStack justify="space-between">
                        <Heading size="md" color="teal.300">
                          {supplier.supplier_did.substring(0, 16)}...
                        </Heading>
                        <Badge fontSize="lg" p={2} colorScheme={getQualityBadgeColor(supplier.quality_tier)}>
                          {supplier.quality_tier}
                        </Badge>
                      </HStack>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                      <Grid templateColumns="1fr 1fr" gap={4}>
                        <Stat>
                          <StatLabel color="gray.400">Pass Rate</StatLabel>
                          <StatNumber color="teal.300">{supplier.pass_rate_pct.toFixed(1)}%</StatNumber>
                        </Stat>
                        <Stat>
                          <StatLabel color="gray.400">Defect Rate</StatLabel>
                          <StatNumber color="orange.400">{supplier.defect_rate_pct.toFixed(1)}%</StatNumber>
                        </Stat>
                        <Stat>
                          <StatLabel color="gray.400">Batches</StatLabel>
                          <StatNumber>{supplier.total_batches_inspected}</StatNumber>
                        </Stat>
                        <Stat>
                          <StatLabel color="gray.400">NCRs</StatLabel>
                          <StatNumber color="red.400">{supplier.ncr_count}</StatNumber>
                        </Stat>
                      </Grid>
                    </CardBody>
                  </Card>
                ))}
              </Grid>
            </VStack>
          </TabPanel>

          <TabPanel>
            {selectedBatch ? (
              <VStack spacing={4} align="stretch">
                <Card bg="gray.800" borderColor="teal.500" borderWidth={2}>
                  <CardHeader>
                    <HStack justify="space-between">
                      <Heading size="md" color="teal.300">
                        Batch {selectedBatch.batch.id.substring(0, 8)}
                      </Heading>
                      <Badge fontSize="lg" p={2} colorScheme={selectedBatch.aql_verdict === 'ACCEPT' ? 'green' : 'red'}>
                        {selectedBatch.aql_verdict}
                      </Badge>
                    </HStack>
                  </CardHeader>
                  <CardBody>
                    <Grid templateColumns="repeat(4, 1fr)" gap={4}>
                      <Stat>
                        <StatLabel color="gray.400">Critical</StatLabel>
                        <StatNumber color="red.400">{selectedBatch.defect_summary.critical_count}</StatNumber>
                        <StatHelpText>{selectedBatch.defect_summary.critical_pct.toFixed(1)}%</StatHelpText>
                      </Stat>
                      <Stat>
                        <StatLabel color="gray.400">Major</StatLabel>
                        <StatNumber color="orange.400">{selectedBatch.defect_summary.major_count}</StatNumber>
                        <StatHelpText>{selectedBatch.defect_summary.major_pct.toFixed(1)}%</StatHelpText>
                      </Stat>
                      <Stat>
                        <StatLabel color="gray.400">Minor</StatLabel>
                        <StatNumber color="yellow.400">{selectedBatch.defect_summary.minor_count}</StatNumber>
                        <StatHelpText>{selectedBatch.defect_summary.minor_pct.toFixed(1)}%</StatHelpText>
                      </Stat>
                      <Stat>
                        <StatLabel color="gray.400">Sample Size</StatLabel>
                        <StatNumber color="teal.300">{selectedBatch.batch.sample_size}</StatNumber>
                      </Stat>
                    </Grid>
                  </CardBody>
                </Card>

                <Heading size="sm" color="teal.300">Item Results</Heading>
                <Table variant="striped" colorScheme="blackAlpha" bg="gray.800">
                  <Thead>
                    <Tr>
                      <Th color="teal.300">Item</Th>
                      <Th color="teal.300">SKU</Th>
                      <Th color="teal.300">Result</Th>
                      <Th color="teal.300">Defect Type</Th>
                      <Th color="teal.300">Notes</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {selectedBatch.items.map((item) => (
                      <Tr key={item.id}>
                        <Td>{item.id.substring(0, 8)}</Td>
                        <Td>{item.sku_id || '-'}</Td>
                        <Td>
                          <Badge colorScheme={item.result === 'PASS' ? 'green' : item.result === 'FAIL' ? 'red' : 'yellow'}>
                            {item.result}
                          </Badge>
                        </Td>
                        <Td>{item.defect_type || '-'}</Td>
                        <Td fontSize="sm">{item.notes || '-'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </VStack>
            ) : (
              <Box textAlign="center" py={10}>
                <Heading color="gray.400">Select a batch to view details</Heading>
              </Box>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal isOpen={isInspectionOpen} onClose={onInspectionClose}>
        <ModalOverlay />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>Start New Inspection</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl>
                <FormLabel>PO ID</FormLabel>
                <Input placeholder="PO-001" id="po_id" />
              </FormControl>
              <FormControl>
                <FormLabel>Supplier DID</FormLabel>
                <Input placeholder="did:key:..." id="supplier_did" />
              </FormControl>
              <FormControl>
                <FormLabel>AQL Level</FormLabel>
                <Select id="aql_level" defaultValue="NORMAL">
                  <option value="NORMAL">Normal</option>
                  <option value="TIGHTENED">Tightened</option>
                  <option value="REDUCED">Reduced</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Sample Size</FormLabel>
                <Input type="number" placeholder="125" id="sample_size" />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onInspectionClose}>
              Cancel
            </Button>
            <Button colorScheme="teal">Start</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
}

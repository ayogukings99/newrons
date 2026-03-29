/**
 * NfcWarehouseScreen
 *
 * NFC warehouse scanning hub within the Economy mode.
 * - Active task card at top (if any)
 * - Large SCAN button to initiate NFC scan
 * - After scan: shows bin contents + pending tasks
 * - Context-aware actions
 * - Recent scans list
 */

import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native'
import NfcManager, { NfcTech } from 'react-native-nfc-manager'

interface ActiveTask {
  id: string
  type: string
  qty: number
  binId: string
}

interface BinInfo {
  binId: string
  label: string
  contents: Array<{ skuId: string; skuName: string; qty: number }>
  pendingTasks: Array<{ taskId: string; taskType: string; qty: number }>
}

interface ScanResult {
  scanType: 'bin_lookup' | 'task_complete' | 'goods_receipt' | 'transfer'
  binId?: string
  taskId?: string
  message: string
  requiresConfirmation: boolean
  pendingAction?: object
}

interface RecentScan {
  id: string
  binLabel: string
  scanType: string
  timestamp: string
}

interface NfcWarehouseScreenProps {
  userId?: number
  apiBaseUrl?: string
  userToken?: string
}

export function NfcWarehouseScreen({
  userId,
  apiBaseUrl = 'https://api.neurons.app/api/v1',
  userToken,
}: NfcWarehouseScreenProps) {
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [scanMode, setScanMode] = useState<'idle' | 'scanning' | 'result'>('idle')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [binInfo, setBinInfo] = useState<BinInfo | null>(null)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [nfcSupported, setNfcSupported] = useState(true)

  useEffect(() => {
    checkNfcSupport()
    loadActiveTask()
  }, [userId])

  const checkNfcSupport = async () => {
    try {
      const supported = await NfcManager.isSupported()
      setNfcSupported(supported)
      if (supported) {
        await NfcManager.start()
      }
    } catch (err: any) {
      console.warn('NFC support check failed:', err.message)
      setNfcSupported(false)
    }
  }

  const loadActiveTask = useCallback(async () => {
    // Simulate loading active task
    setActiveTask({
      id: 'TASK-001',
      type: 'Pick and Pack',
      qty: 10,
      binId: 'BIN-A3',
    })
  }, [])

  const startScan = useCallback(async () => {
    if (!nfcSupported) {
      Alert.alert('NFC Not Available', 'Your device does not support NFC')
      return
    }

    setScanMode('scanning')
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef)
      const tag = await NfcManager.getTag()

      if (!tag?.id) {
        throw new Error('No NFC tag detected')
      }

      // Call warehouse scan endpoint
      const response = await fetch(`${apiBaseUrl}/integration/warehouse/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nfcUid: tag.id,
          actionHint: activeTask ? 'task_complete' : 'bin_lookup',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to process scan')
      }

      const { data: result } = await response.json()
      setScanResult(result)

      // Fetch bin info
      if (result.binId) {
        const binResponse = await fetch(
          `${apiBaseUrl}/integration/warehouse/bin/${tag.id}`,
          {
            headers: {
              Authorization: `Bearer ${userToken}`,
            },
          }
        )
        if (binResponse.ok) {
          const { data: bin } = await binResponse.json()
          setBinInfo(bin)
        }
      }

      // Add to recent scans
      const newScan: RecentScan = {
        id: tag.id,
        binLabel: result.binId || 'Unknown',
        scanType: result.scanType,
        timestamp: new Date().toISOString(),
      }
      setRecentScans(prev => [newScan, ...prev.slice(0, 9)])

      setScanMode('result')
    } catch (err: any) {
      Alert.alert('Scan Failed', err.message)
      setScanMode('idle')
    } finally {
      NfcManager.cancelTechnologyRequest()
    }
  }, [activeTask, apiBaseUrl, userToken])

  const handleConfirmAction = useCallback(async () => {
    if (!scanResult) return

    try {
      setIsLoading(true)

      // Perform the appropriate action based on scan type
      if (scanResult.scanType === 'task_complete' && activeTask) {
        // Complete the task
        Alert.alert('Task Complete', 'Task marked as completed')
        setScanMode('idle')
        setScanResult(null)
        setBinInfo(null)
      } else if (scanResult.scanType === 'goods_receipt') {
        // Start goods receipt flow
        Alert.alert('Goods Receipt', 'Ready to record goods receipt')
      } else if (scanResult.scanType === 'transfer') {
        // Start transfer flow
        Alert.alert('Transfer', 'Ready to transfer items')
      }
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsLoading(false)
    }
  }, [scanResult, activeTask])

  const resetScan = useCallback(() => {
    setScanMode('idle')
    setScanResult(null)
    setBinInfo(null)
  }, [])

  const getActionButtonLabel = () => {
    if (!scanResult) return 'Scan'
    switch (scanResult.scanType) {
      case 'task_complete':
        return 'Complete Task'
      case 'goods_receipt':
        return 'Record Receipt'
      case 'transfer':
        return 'Confirm Transfer'
      default:
        return 'Continue'
    }
  }

  const getScanTypeIcon = (type: string) => {
    switch (type) {
      case 'task_complete':
        return '✓'
      case 'goods_receipt':
        return '📦'
      case 'transfer':
        return '↔️'
      default:
        return '📍'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <ScrollView style={styles.container}>
      {/* Active Task Card */}
      {activeTask && (
        <View style={styles.activeTaskCard}>
          <View style={styles.taskHeader}>
            <Text style={styles.taskLabel}>Active Task</Text>
            <View style={styles.taskBadge}>
              <Text style={styles.taskBadgeText}>{activeTask.qty} items</Text>
            </View>
          </View>
          <Text style={styles.taskType}>{activeTask.type}</Text>
          <Text style={styles.taskBin}>Bin: {activeTask.binId}</Text>
        </View>
      )}

      {/* Scan Result Section */}
      {scanMode === 'result' && scanResult && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultIcon}>{getScanTypeIcon(scanResult.scanType)}</Text>
            <Text style={styles.resultMessage}>{scanResult.message}</Text>
          </View>

          {/* Bin Contents */}
          {binInfo && (
            <View style={styles.binContentsSection}>
              <Text style={styles.sectionTitle}>Bin Contents</Text>
              {binInfo.contents.length > 0 ? (
                <View style={styles.contentsList}>
                  {binInfo.contents.map(item => (
                    <View key={item.skuId} style={styles.contentItem}>
                      <Text style={styles.skuName}>{item.skuName}</Text>
                      <Text style={styles.skuQty}>{item.qty} units</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No items in this bin</Text>
              )}

              {/* Pending Tasks */}
              {binInfo.pendingTasks.length > 0 && (
                <View>
                  <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Pending Tasks</Text>
                  <View style={styles.tasksList}>
                    {binInfo.pendingTasks.map(task => (
                      <View key={task.taskId} style={styles.pendingTask}>
                        <Text style={styles.pendingTaskType}>{task.taskType}</Text>
                        <Text style={styles.pendingTaskQty}>{task.qty} qty</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.resultActions}>
            {scanResult.requiresConfirmation && (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmAction}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#0a0a0f" />
                ) : (
                  <Text style={styles.confirmButtonText}>{getActionButtonLabel()}</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelButton} onPress={resetScan}>
              <Text style={styles.cancelButtonText}>Scan Another</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Idle/Scanning Mode */}
      {scanMode === 'idle' && (
        <View style={styles.idleSection}>
          <TouchableOpacity style={styles.largeButton} onPress={startScan} disabled={!nfcSupported}>
            <Text style={styles.largeButtonIcon}>📲</Text>
            <Text style={styles.largeButtonText}>SCAN</Text>
            <Text style={styles.largeButtonSubtext}>Hold phone near NFC tag</Text>
          </TouchableOpacity>
        </View>
      )}

      {scanMode === 'scanning' && (
        <View style={styles.scanningSection}>
          <ActivityIndicator size="large" color="#2dd4bf" />
          <Text style={styles.scanningText}>Waiting for NFC tag...</Text>
          <TouchableOpacity onPress={resetScan} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent Scans */}
      <View style={styles.recentScansSection}>
        <Text style={styles.sectionTitle}>Recent Scans</Text>
        {recentScans.length > 0 ? (
          <FlatList
            scrollEnabled={false}
            data={recentScans}
            renderItem={({ item }) => (
              <View style={styles.recentScanItem}>
                <Text style={styles.recentIcon}>{getScanTypeIcon(item.scanType)}</Text>
                <View style={styles.recentContent}>
                  <Text style={styles.recentLabel}>{item.binLabel}</Text>
                  <Text style={styles.recentTime}>{formatTime(item.timestamp)}</Text>
                </View>
                <Text style={styles.recentType}>{item.scanType}</Text>
              </View>
            )}
            keyExtractor={item => item.id}
          />
        ) : (
          <View style={styles.emptyScans}>
            <Text style={styles.emptyScansText}>No recent scans</Text>
          </View>
        )}
      </View>

      {/* Footer spacer */}
      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },

  // Active Task Card
  activeTaskCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2dd4bf',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  taskBadge: {
    backgroundColor: '#0d9488',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  taskBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  taskType: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  taskBin: {
    color: '#2dd4bf',
    fontSize: 13,
    fontWeight: '500',
  },

  // Idle Section with Large Button
  idleSection: {
    paddingHorizontal: 16,
    paddingVertical: 40,
    alignItems: 'center',
  },
  largeButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#0d9488',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    elevation: 8,
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  largeButtonIcon: {
    fontSize: 60,
  },
  largeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  largeButtonSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    textAlign: 'center',
  },

  // Scanning Section
  scanningSection: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 16,
  },
  scanningText: {
    color: '#9ca3af',
    fontSize: 15,
  },

  // Result Card
  resultCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2dd4bf',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  resultIcon: {
    fontSize: 32,
  },
  resultMessage: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },

  // Bin Contents
  binContentsSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  contentsList: {
    gap: 6,
  },
  contentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  skuName: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
  },
  skuQty: {
    color: '#2dd4bf',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Pending Tasks
  tasksList: {
    gap: 6,
  },
  pendingTask: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  pendingTaskType: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
  },
  pendingTaskQty: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
  },

  // Result Actions
  resultActions: {
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  confirmButton: {
    backgroundColor: '#2dd4bf',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#0a0a0f',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#1f2937',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },

  // Recent Scans
  recentScansSection: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 20,
  },
  recentScanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  recentIcon: {
    fontSize: 20,
  },
  recentContent: {
    flex: 1,
  },
  recentLabel: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
  },
  recentTime: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
  },
  recentType: {
    color: '#2dd4bf',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyScans: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyScansText: {
    color: '#6b7280',
    fontSize: 13,
  },
})

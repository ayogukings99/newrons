/**
 * Integration Router
 *
 * Central router for all integration layer routes.
 * Registers sub-routers for:
 *   - /integration/identity — identity bridge routes
 *   - /integration/settlements — PO settlement routes (future)
 *   - /integration/warehouse — warehouse NFC event routes (future)
 *   - /integration/intelligence — demand signal + supply chain AI routes (future)
 *
 * This file serves as the integration layer entry point.
 * All economic ↔ social bridges are registered here.
 */

import { FastifyInstance } from 'fastify'
import identityRoutes from './identity'
import settlementRoutes from './settlement'
import warehouseNfcRoutes from './warehouse-nfc'
import intelligenceRoutes from './intelligence'

export default async function integrationRoutes(app: FastifyInstance) {
  /**
   * Sub-router: Identity bridge (social ↔ economic identity)
   * Prefix: /integration/identity
   */
  app.register(identityRoutes, { prefix: '/identity' })

  /**
   * Sub-router: PO Settlement bridge (supply chain ↔ NXT wallet)
   * Prefix: /integration/settlement
   */
  app.register(settlementRoutes, { prefix: '/settlement' })

  /**
   * Sub-router: Warehouse NFC operations
   * Prefix: /integration/warehouse
   */
  app.register(warehouseNfcRoutes, { prefix: '/warehouse' })

  /**
   * Sub-router: LOGOS intelligence + demand signals
   * Prefix: /integration/intelligence
   */
  app.register(intelligenceRoutes, { prefix: '/intelligence' })
}

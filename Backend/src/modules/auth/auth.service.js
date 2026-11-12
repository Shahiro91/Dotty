import { pool } from '../../database/pool.js'
import { activateLocalApplication } from '../businesses/applications.service.js'
import { lockAvailableApplication, lockCustomer } from './auth.repository.js'

export async function activatePartnerAccount(customerId) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    let customer = await lockCustomer(client, customerId)
    if (customer?.role === 'customer') {
      const application = await lockAvailableApplication(client, customer)
      if (!application) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return { error: 'no_application' }
      }
      customer = await activateLocalApplication(client, application, customer.id)
    }
    if (!customer || !['local_owner', 'admin'].includes(customer.role)) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { error: 'invalid_role' }
    }
    await client.query('COMMIT')
    transactionStarted = false
    return { customer }
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

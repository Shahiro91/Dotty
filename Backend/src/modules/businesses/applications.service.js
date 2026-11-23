import bcrypt from 'bcryptjs'
import { pool } from '../../database/pool.js'
import { BILLING_INITIAL_TRIAL_DAYS } from '../billing/billing.rules.js'
import { businessSlug } from './business.rules.js'
import { applicationExists, associateOwner, createApplicationCustomer, customerExists, insertApplication, insertBusiness, markApplicationClaimed, restartTrial } from './applications.repository.js'

export async function registerLocalApplication(input) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    if (await customerExists(client, input.phone, input.email)) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { error: 'customer_exists' }
    }
    if (await applicationExists(client, input.phone, input.email)) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { error: 'application_exists' }
    }
    const passwordHash = await bcrypt.hash(input.password, 12)
    const customer = await createApplicationCustomer(client, input, passwordHash)
    const application = await insertApplication(client, input)
    const user = await activateLocalApplication(client, application, customer.id)
    await client.query('COMMIT')
    transactionStarted = false
    return { applicationId: application.id, user }
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function activateLocalApplication(client, application, customerId) {
  let businessId = application.business_id
  if (!businessId) {
    const suffix = `-${application.id}`
    const slug = businessSlug(application.business_name, suffix)
    businessId = await insertBusiness(client, application, slug, BILLING_INITIAL_TRIAL_DAYS)
  } else {
    await restartTrial(client, businessId, BILLING_INITIAL_TRIAL_DAYS)
  }
  const customer = await associateOwner(client, application, businessId, customerId)
  if (!customer) throw new Error('No se pudo asociar la cuenta al local.')
  await markApplicationClaimed(client, application.id, businessId)
  return customer
}

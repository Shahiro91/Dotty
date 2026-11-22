import { pool } from '../../database/pool.js'
import { describeBilling } from '../billing/billing.rules.js'
import { deleteBusinessData, listApplications, lockApplication, lockBusiness, updateApplicationStatus } from './admin.repository.js'

export async function getApplications(status) {
  const rows = await listApplications(status)
  return rows.map(({ businessPlan, subscriptionDueAt, ...application }) => ({
    ...application,
    currentPlan: businessPlan || application.requestedPlan,
    billing: subscriptionDueAt ? describeBilling({ plan: businessPlan, subscriptionDueAt }) : null,
  }))
}

export async function deleteBusiness(businessId) {
  const client = await pool.connect()
  let started = false
  try {
    await client.query('BEGIN')
    started = true
    if (!await lockBusiness(client, businessId)) {
      await client.query('ROLLBACK')
      started = false
      return false
    }
    await deleteBusinessData(client, businessId)
    await client.query('COMMIT')
    started = false
    return true
  } catch (error) {
    if (started) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function changeApplicationStatus(applicationId, status) {
  const client = await pool.connect()
  let started = false
  try {
    await client.query('BEGIN')
    started = true
    const application = await lockApplication(client, applicationId)
    if (!application || ['approved', 'rejected'].includes(application.status)) {
      await client.query('ROLLBACK')
      started = false
      return { error: application ? 'final' : 'not_found' }
    }
    const updated = await updateApplicationStatus(client, applicationId, status)
    await client.query('COMMIT')
    started = false
    return { application: updated }
  } catch (error) {
    if (started) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

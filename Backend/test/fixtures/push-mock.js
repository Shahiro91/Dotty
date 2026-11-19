import webPush from 'web-push'

webPush.sendNotification = async (subscription, payload) => {
  process.send?.({ endpoint: subscription.endpoint, payload: JSON.parse(payload) })
}

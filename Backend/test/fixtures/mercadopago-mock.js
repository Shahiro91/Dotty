const originalFetch = globalThis.fetch

globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  if (url.hostname !== 'api.mercadopago.com') return originalFetch(input, options)
  if (url.pathname === '/checkout/preferences') {
    return Response.json({ init_point: 'https://sandbox.example.test/checkout' })
  }
  const match = /^\/v1\/payments\/(\d+)$/.exec(url.pathname)
  if (!match) return Response.json({ message: 'Ruta no simulada' }, { status: 404 })
  const payments = {
    101: { id: 101, status: 'approved', external_reference: 'sabor-vivo-business-1', transaction_amount: 15000 },
    102: { id: 102, status: 'pending', external_reference: 'sabor-vivo-business-1', transaction_amount: 15000 },
    103: { id: 103, status: 'approved', external_reference: 'sabor-vivo-business-1', transaction_amount: 1 },
    104: { id: 104, status: 'rejected', external_reference: 'sabor-vivo-business-1', transaction_amount: 15000 },
    105: { id: 105, status: 'approved', external_reference: 'other-reference', transaction_amount: 15000 },
  }
  return payments[match[1]]
    ? Response.json(payments[match[1]])
    : Response.json({ message: 'Pago inexistente' }, { status: 404 })
}

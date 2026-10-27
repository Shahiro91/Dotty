export const menuItems = [
  {
    id: 'milanesa-napolitana',
    name: 'Milanesa Napolitana',
    description: 'Milanesa de ternera con jamón, mozzarella y salsa casera.',
    price: 9800,
    category: 'Más pedidos',
    image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=85',
    tag: 'Popular',
  },
  {
    id: 'flan-dulce-leche',
    name: 'Flan con Dulce de Leche',
    description: 'Flan casero con dulce de leche y crema.',
    price: 3500,
    category: 'Postres',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=85',
    tag: 'Popular',
  },
  {
    id: 'combo-familiar',
    name: 'Combo Familiar',
    description: '1 pizza grande + 6 empanadas + 2 bebidas 500 ml.',
    price: 16900,
    oldPrice: 17700,
    category: 'Combos',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=85',
    tag: 'Ahorrás $800',
  },
  {
    id: 'pizza-napolitana',
    name: 'Pizza Napolitana',
    description: 'Tomate fresco, mozzarella, ajo y albahaca.',
    price: 14500,
    category: 'Pizzas',
    image: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=900&q=85',
    tag: 'Favorita',
  },
  {
    id: 'doble-smash',
    name: 'Doble Smash',
    description: 'Doble medallón, cheddar, cebolla y salsa de la casa.',
    price: 11500,
    category: 'Hamburguesas',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85',
    tag: '2x1 los martes',
  },
  {
    id: 'empanadas-caseras',
    name: 'Empanadas Caseras',
    description: 'Carne suave, pollo o jamón y queso. Elegí tus 6.',
    price: 9000,
    category: 'Empanadas',
    image: 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?auto=format&fit=crop&w=900&q=85',
    tag: 'Hechas a mano',
  },
]

export const menuCategories = [
  'Todos',
  'Más pedidos',
  'Combos',
  'Pizzas',
  'Hamburguesas',
  'Empanadas',
  'Postres',
]

export const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
# API de Dotty

La API crea y migra las tablas de cuentas, locales, productos, recompensas, pedidos y canjes al iniciarse. Las contraseñas se almacenan con bcrypt; las sesiones usan JWT y los datos del partner se filtran por el local asociado a su cuenta.

## Configuración

1. Copiá `.env.example` como `.env` y ajustá `DATABASE_URL` a tu instancia de PostgreSQL y `JWT_SECRET` a una clave aleatoria de al menos 32 caracteres. Configurá también `ADMIN_PASSWORD_1` y `ADMIN_PASSWORD_2` con contraseñas distintas de 8 a 72 caracteres.
2. Desde esta carpeta, ejecutá `npm install` y después `npm run dev`.
3. En otra terminal, iniciá el frontend con `npm run dev` desde `FrontEnd`.

La base indicada en `DATABASE_URL` debe existir y el usuario debe poder crear tablas. Si tu PostgreSQL requiere SSL, configurá `PGSSL=true`. El frontend usa `http://localhost:3000` como API por defecto; se puede cambiar con `VITE_API_URL`.

Las rutas de autenticación son `POST /api/auth/register`, `POST /api/auth/login` y `GET /api/auth/me`. Al aprobar una solicitud, se crea el local; el solicitante se registra luego con el mismo celular y obtiene acceso al panel partner. El panel permite editar identidad, logo, banner obligatorio y colores, además de previsualizar la página como cliente. El color primario se usa en títulos y botones; el secundario, en puntos, etiquetas y acentos. También permite administrar productos y sus puntos por unidad, configurar canjes, consultar clientes y mover pedidos entre estados.

Los puntos se guardan por cliente y por local en `customer_business_points`: el celular identifica una cuenta global, pero cada local tiene su propio saldo. Al iniciar, los saldos faltantes se reconstruyen desde pedidos y canjes existentes (ignorando lo cancelado). `POST /api/auth/login` y `GET /api/auth/me?businessSlug=<slug>` devuelven en `points` el saldo de ese local; sin `businessSlug` devuelven 0.

Las categorías se guardan por local y pueden existir antes de cargar productos; al iniciar, las categorías de productos existentes se migran automáticamente. Cada local tiene una página pública en `/local/<slug>`. Sus pedidos quedan en `customer_orders` con el `business_id` correspondiente. Los puntos se calculan con `points_per_unit` de cada producto. Cancelar un pedido revierte esos puntos una sola vez; cancelar un canje devuelve el costo descontado. El menú del sitio raíz conserva el cálculo heredado de 1 punto por cada $1.000.

Los logos y fotos se optimizan en el navegador y se guardan como imágenes WebP en PostgreSQL. Es práctico para comenzar; si el volumen de imágenes crece, conviene migrarlas a almacenamiento de objetos persistente.

Las solicitudes para registrar un local se guardan como `pending` en `local_applications` mediante `POST /api/local-applications`. No crean una cuenta ni otorgan acceso; el equipo debe contactar al solicitante y aprobarlo antes de darlo de alta. El formulario solicita plan `basic` o `vip`.

El administrador usa el celular `1133113604`. El backend crea o actualiza esa cuenta al iniciar, usando la contraseña privada de `ADMIN_PASSWORD_2`; ese valor es la fuente de verdad y nunca se solicita en el formulario público. Iniciá sesión en la web con el número exacto y la contraseña correspondiente: aparecerá el botón de administración. Los endpoints de administración verifican el rol contra PostgreSQL.

Desde el panel admin se puede marcar una solicitud como contactada, aprobarla o rechazarla. Al aprobar, una cuenta ya registrada con ese celular pasa a ser dueña del local; si todavía no tiene cuenta, podrá registrarse con ese mismo celular y se le asignará ese rol. El panel admin y el partner aparecen automáticamente después de iniciar sesión con el rol correspondiente.

```sql
SELECT id, first_name, last_name, phone, business_name, requested_plan, created_at
FROM local_applications
WHERE status = 'pending'
ORDER BY created_at;
```

**Importante:** el sistema actual deriva los pedidos a WhatsApp, por lo que los puntos se acreditan cuando se registra el pedido enviado, no cuando se verifica su pago o entrega. Para acreditar solo compras confirmadas hace falta conectar una confirmación desde el negocio.

## Despliegue en Render

Un solo servicio web sirve la API y el frontend (`FrontEnd/dist`), con PostgreSQL de Render. El archivo `render.yaml` de la raíz lo define:

1. Subí el proyecto completo a GitHub (el backend importa `FrontEnd/src/data/menu.js`).
2. En Render: **New > Blueprint** y elegí el repositorio.
3. Completá `ADMIN_PASSWORD_2` y `MP_ACCESS_TOKEN` (token de producción de Mercado Pago) cuando lo pida.
4. `JWT_SECRET` y `DATABASE_URL` se generan solos; la URL pública (`RENDER_EXTERNAL_URL`) se usa para los links de pago y el webhook.

Si usás un dominio propio, definí `FRONTEND_ORIGIN=https://tudominio.com`. Para volver a probar en sandbox, poné `MP_ENVIRONMENT=sandbox` con un token de prueba.

## Suscripción de los locales

Plan Básico $15.000/mes y VIP $25.000/mes. Si pasan 5 días del vencimiento sin pago, la cuenta se suspende (panel, tienda, pedidos y canjes quedan bloqueados) sin borrar datos. Al pagar se reactiva. Los locales nuevos arrancan con el pago pendiente desde el alta y tienen los 5 días de gracia para abonar.

El cobro de suscripciones usa Checkout Pro de Mercado Pago. En desarrollo local, el backend arranca en modo sandbox y no acepta tokens de producción:

- Copiá las credenciales de prueba de Mercado Pago Developers a `Backend\.env`: `MP_ENVIRONMENT=sandbox` y `MP_ACCESS_TOKEN=TEST-...`. Usá una cuenta compradora de prueba y los datos de tarjeta de prueba de Mercado Pago; no uses una tarjeta real.
- Iniciá sesión con un local de prueba y abrí **Suscripción**. El botón se habilita dentro de los 10 días previos al vencimiento; para probar antes, usá un local de prueba y la acción administrativa **Suspender**, que hace que el botón quede disponible. El pago de sandbox no mueve dinero real.
- Al volver al panel, la aplicación consulta el pago a Mercado Pago y acredita solo los pagos aprobados. En localhost esto funciona sin webhook. `BACKEND_PUBLIC_URL` es opcional localmente y se usa para configurar `POST /api/billing/webhook` cuando el backend tenga una URL pública HTTPS.
- Para producción, configurá explícitamente `MP_ENVIRONMENT=production` y un Access Token de producción `APP_USR-...`. Nunca mezcles un token `APP_USR-` con sandbox ni compartas tokens en el chat o el repositorio.

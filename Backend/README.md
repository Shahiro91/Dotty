# API de Dotty

La API crea y migra las tablas de cuentas, locales, productos, recompensas, pedidos y canjes al iniciarse. Los clientes ingresan solo con su celular; las contraseñas de locales y administradores se almacenan con bcrypt. Las sesiones usan JWT y los datos del partner se filtran por el local asociado a su cuenta.

## Configuración

1. Copiá `.env.example` como `.env` y ajustá `DATABASE_URL` a tu instancia de PostgreSQL y `JWT_SECRET` a una clave aleatoria de al menos 32 caracteres. Configurá `ADMIN_PASSWORD_1` con una contraseña de 8 a 72 caracteres.
2. Desde esta carpeta, ejecutá `npm install` y después `npm run dev`.
3. En otra terminal, iniciá el frontend con `npm run dev` desde `FrontEnd`.

La base indicada en `DATABASE_URL` debe existir y el usuario debe poder crear tablas. Si tu PostgreSQL requiere SSL, configurá `PGSSL=true`. El frontend usa `http://localhost:3000` como API por defecto; se puede cambiar con `VITE_API_URL`.

Los clientes usan `POST /api/auth/phone` con `phone` y opcionalmente `businessSlug`: crea la cuenta si no existe o recupera la existente. No solicita nombre ni contraseña. Los locales ingresan con `POST /api/auth/login` y su contraseña; `GET /api/auth/me` consulta la sesión. Las sesiones iniciadas solo con celular no dan acceso al panel aunque la cuenta cambie de rol. El panel permite administrar la identidad del local, productos, canjes, clientes y pedidos.

**Seguridad:** el celular no se verifica. Cualquier persona que conozca un número de cliente puede ingresar a esa cuenta, consultar y usar sus puntos o realizar pedidos en su nombre. Para evitarlo es necesario incorporar una verificación del número.

Los puntos se guardan por cliente y por local en `customer_business_points`: el celular identifica una cuenta global, pero cada local tiene su propio saldo. Al iniciar, los saldos faltantes se reconstruyen desde pedidos y canjes existentes (ignorando lo cancelado). `POST /api/auth/phone` y `GET /api/auth/me?businessSlug=<slug>` devuelven en `points` el saldo de ese local; sin `businessSlug` devuelven 0.

En cada pedido de un local se solicita el nombre, el apellido opcional y los datos de entrega necesarios. Se guardan con el pedido, no en la cuenta nueva del cliente. La pestaña Clientes muestra el nombre del primer pedido y la primera dirección de entrega de cada cliente en ese local; los pedidos anteriores conservan sus datos existentes. El navegador recuerda el nombre y la dirección para pedidos posteriores.

Las categorías se guardan por local y pueden existir antes de cargar productos; al iniciar, las categorías de productos existentes se migran automáticamente. Cada local tiene una página pública en `/local/<slug>`. Sus pedidos quedan en `customer_orders` con el `business_id` correspondiente. Los puntos se calculan con `points_per_unit` de cada producto. Cancelar un pedido revierte esos puntos una sola vez; cancelar un canje devuelve el costo descontado. El menú del sitio raíz conserva el cálculo heredado de 1 punto por cada $1.000.

Los logos y fotos se optimizan en el navegador y se guardan como imágenes WebP en PostgreSQL. Es práctico para comenzar; si el volumen de imágenes crece, conviene migrarlas a almacenamiento de objetos persistente.

`POST /api/local-applications` crea la cuenta con contraseña y el local en una transacción, lo activa inmediatamente y devuelve la sesión del dueño. Se guarda el registro como `approved` en `local_applications` y comienza una prueba gratuita de 30 días. El formulario solicita plan `basic` o `vip`; no se requiere aprobación ni código. El celular y el email no pueden estar asociados a otra cuenta.

El administrador usa solo el email `mariaquintana520@gmail.com` y la contraseña privada de `ADMIN_PASSWORD_1`; no tiene celular asociado. El backend crea o actualiza esa cuenta al iniciar y quita cualquier celular previo de las cuentas con rol de administrador. Iniciá sesión en la web con ese email y la contraseña correspondiente: aparecerá el botón de administración. Los endpoints de administración verifican el rol contra PostgreSQL.

Las solicitudes anteriores pendientes, contactadas o aprobadas sin activar se activan al ingresar con las credenciales de la cuenta asociada; su prueba comienza entonces. Las solicitudes rechazadas no se activan. Los locales ya activos conservan su vencimiento al ingresar.

Para ejecutar las pruebas, configurá `TEST_DATABASE_URL` con una base PostgreSQL de pruebas y ejecutá `node --test test/phone-order.test.js test/billing-rules.test.js test/order-schema.test.js test/order-items.test.js test/push-notifications.test.js test/push-integration.test.js` desde `Backend`. Las pruebas de integración crean y eliminan esquemas aislados. Mercado Pago y los envíos push se simulan: no se realizan pagos ni llamadas reales a estos servicios.

La integración comprueba que los métodos y rutas de API incluidos en `test/fixtures/api-coverage.js` reciben al menos una respuesta exitosa; además verifica respuestas y errores en distintos flujos. El inventario debe actualizarse cuando cambien los endpoints. Esta comprobación no cubre todos los escenarios ni reemplaza una prueba con el sandbox real de Mercado Pago. Sin `TEST_DATABASE_URL`, la integración se omite.

## Notificaciones web

Los clientes que tengan al menos un pedido no cancelado pueden activar las notificaciones de cada local desde su tienda, en cada dispositivo. El navegador pide permiso solo al pulsar «Activar notificaciones»; el cliente puede desactivarlas desde la misma tienda. Se avisa al crear o importar nuevos canjes, al reactivar canjes mediante importación y al cambiar los días de puntos dobles. No se envían avisos por editar canjes existentes. Los avisos abren la tienda del local.

Para habilitarlas, generá una sola vez un par de claves desde `Backend` con `npx web-push generate-vapid-keys`. Configurá `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (por ejemplo, `mailto:contacto@tudominio.com`) en el entorno del backend. En Render agregalas como variables de entorno privadas. Conservá el mismo par entre despliegues y no compartas la clave privada; si cambiás las claves, los clientes deberán borrar los datos del sitio y volver a suscribirse. Sin las tres variables la función queda desactivada; una configuración incompleta impide el inicio.

Las notificaciones requieren HTTPS (o localhost) y un navegador compatible. En iPhone y iPad Web Push requiere una aplicación web instalada en la pantalla de inicio; este sitio aún no ofrece instalación como aplicación, por lo que esa plataforma no está cubierta. Los envíos son de mejor esfuerzo, sin cola persistente ni garantía de entrega; los errores se registran en el servidor y las suscripciones vencidas se eliminan.

## Organización del backend

La configuración y la conexión/inicialización de PostgreSQL están en `src/config` y `src/database`. `src/middleware` contiene autenticación, autorización y limitación de solicitudes. `src/modules` agrupa autenticación, administración, locales, categorías, productos, agregados, importación de catálogo, clientes, estadísticas, facturación, videos, recompensas, canjes y pedidos. Los servicios y repositorios de pedidos mantienen sus operaciones transaccionales en una misma conexión; el repositorio de puntos y el validador de recompensas se comparten entre los flujos que los necesitan. `server.js` configura y monta los módulos e inicia la aplicación.

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
3. Completá `ADMIN_PASSWORD_1` y `MP_ACCESS_TOKEN` (token de producción de Mercado Pago) cuando lo pida.
4. `JWT_SECRET` y `DATABASE_URL` se generan solos; la URL pública (`RENDER_EXTERNAL_URL`) se usa para los links de pago y el webhook.

Si usás un dominio propio, definí `FRONTEND_ORIGIN=https://tudominio.com`. Para volver a probar en sandbox, poné `MP_ENVIRONMENT=sandbox` con un token de prueba.

## Suscripción de los locales

Plan Básico $15.000/mes, VIP $25.000/mes y VIP PLUS $35.000/mes. VIP PLUS incluye las funciones VIP y permite enviar notificaciones promocionales de hasta 200 caracteres a clientes con al menos un pedido no cancelado y notificaciones push habilitadas. Los locales nuevos tienen 30 días de prueba gratis desde su registro. El cambio de plan se aplica de inmediato y el siguiente pago usa el precio del plan elegido. Al vencer la prueba sin pago se suspende la cuenta; tras una suscripción pagada hay 5 días de gracia. La suspensión bloquea panel, tienda, pedidos y canjes sin borrar datos. Al pagar se reactiva.

El cobro de suscripciones usa Checkout Pro de Mercado Pago. En desarrollo local, el backend arranca en modo sandbox y no acepta tokens de producción:

- Copiá las credenciales de prueba de Mercado Pago Developers a `Backend\.env`: `MP_ENVIRONMENT=sandbox` y `MP_ACCESS_TOKEN=TEST-...`. Usá una cuenta compradora de prueba y los datos de tarjeta de prueba de Mercado Pago; no uses una tarjeta real.
- Iniciá sesión con un local de prueba y abrí **Suscripción**. El botón se habilita dentro de los 10 días previos al vencimiento; para probar antes, usá un local de prueba y la acción administrativa **Suspender**, que hace que el botón quede disponible. El pago de sandbox no mueve dinero real.
- Al volver al panel, la aplicación consulta el pago a Mercado Pago y acredita solo los pagos aprobados. En localhost esto funciona sin webhook. `BACKEND_PUBLIC_URL` es opcional localmente y se usa para configurar `POST /api/billing/webhook` cuando el backend tenga una URL pública HTTPS.
- Para producción, configurá explícitamente `MP_ENVIRONMENT=production` y un Access Token de producción `APP_USR-...`. Nunca mezcles un token `APP_USR-` con sandbox ni compartas tokens en el chat o el repositorio.

**Add your own guidelines here**
<!--

System Guidelines

Use this file to provide the AI with rules and guidelines you want it to follow.
This template outlines a few examples of things you can add. You can add your own sections and format it to suit your needs

TIP: More context isn't always better. It can confuse the LLM. Try and add the most important rules you need

# General guidelines

Any general rules you want the AI to follow.
For example:

* Only use absolute positioning when necessary. Opt for responsive and well structured layouts that use flexbox and grid by default
* Refactor code as you go to keep code clean
* Keep file sizes small and put helper functions and components in their own files.

--------------

# Design system guidelines
Rules for how the AI should make generations look like your company's design system

Additionally, if you select a design system to use in the prompt box, you can reference
your design system's components, tokens, variables and components.
For example:

* Use a base font-size of 14px
* Date formats should always be in the format “Jun 10”
* The bottom toolbar should only ever have a maximum of 4 items
* Never use the floating action button with the bottom toolbar
* Chips should always come in sets of 3 or more
* Don't use a dropdown if there are 2 or fewer options

You can also create sub sections and add more specific details
For example:


## Button
The Button component is a fundamental interactive element in our design system, designed to trigger actions or navigate
users through the application. It provides visual feedback and clear affordances to enhance user experience.

### Usage
Buttons should be used for important actions that users need to take, such as form submissions, confirming choices,
or initiating processes. They communicate interactivity and should have clear, action-oriented labels.

### Variants
* Primary Button
  * Purpose : Used for the main action in a section or page
  * Visual Style : Bold, filled with the primary brand color
  * Usage : One primary button per section to guide users toward the most important action
* Secondary Button
  * Purpose : Used for alternative or supporting actions
  * Visual Style : Outlined with the primary color, transparent background
  * Usage : Can appear alongside a primary button for less important actions
* Tertiary Button
  * Purpose : Used for the least important actions
  * Visual Style : Text-only with no border, using primary color
  * Usage : For actions that should be available but not emphasized
-->
<!--PROMPT
Quiero que actúes como un arquitecto de software senior, analista funcional, experto en sistemas POS, inventarios, operación comercial, control de caja y análisis financiero, y me ayudes a diseñar, documentar y planificar el desarrollo de un sistema de punto de venta modular, escalable, revendido a múltiples clientes con personalización mínima, orientado a distintos tipos de negocio como abarroterías, farmacias, ferreterías y comercios similares.
El sistema debe construirse con la siguiente base tecnológica:
•	Backend: Node.js, preferiblemente con arquitectura limpia y modular 
•	Base de datos: PostgreSQL 
•	Frontend: Angular 
•	Estilos: Tailwind CSS 
•	API: REST 
•	Diseño: moderno, profesional, responsive y optimizado para pantallas touch 
•	UI/UX: compatible con tablets, teléfonos, pantallas táctiles y escritorio 
•	Tema: incluir soporte para dark mode opcional 
________________________________________
Objetivo general
Diseñar un sistema POS moderno y modular que pueda venderse en diferentes esquemas:
1.	Versión local básica para una sola tienda con múltiples cajas. 
2.	Versión híbrida con operación local por sucursal y sincronización en línea. 
3.	Versión modular premium con activación de módulos adicionales según licencia. 
El sistema debe permitir revenderse a diferentes clientes con configuración del negocio sin necesidad de modificar mucho código, y debe quedar preparado desde su diseño para crecer a futuro hacia multisucursal, multiempresa, sincronización online/offline, FEL/SAT y módulos especializados.
________________________________________
Enfoque de arquitectura
El sistema debe diseñarse como un monolito modular bien estructurado, con separación clara por módulos, entidades, casos de uso y permisos, priorizando:
•	mantenibilidad 
•	escalabilidad 
•	facilidad de despliegue local en Windows 
•	preparación para futura sincronización híbrida 
•	capacidad de activar o desactivar módulos por licencia 
Debe contemplarse desde el diseño:
•	soporte para multiempresa 
•	soporte para múltiples sucursales 
•	soporte para múltiples cajas por sucursal 
•	operación local-first 
•	sincronización futura entre sucursales y servidor central 
•	resolución de conflictos por política last-write-wins o última actualización gana 
________________________________________
Requerimientos funcionales del paquete principal
1. Seguridad y acceso
•	login seguro 
•	roles iniciales: 
o	superadmin 
o	admin 
o	cajero 
•	permisos por acción 
•	control de sesiones 
•	cierre automático por inactividad 
•	control de intentos fallidos 
•	bitácora o auditoría de acciones sensibles 
•	preparación para 2FA en futuras versiones 
________________________________________
2. Configuración general del sistema
El sistema debe permitir parametrizar por cliente:
•	nombre del negocio 
•	logo 
•	NIT 
•	dirección 
•	teléfono 
•	tipo de documento a imprimir 
•	moneda 
•	sucursal por defecto 
•	cajas 
•	módulos activos 
•	uso de dark mode 
•	uso o no de control de caducidad 
•	configuración de impresión 
•	activación futura de funcionalidades por licencia 
________________________________________
3. Catálogos base
Debe incluir catálogos configurables para distintos giros de negocio, como:
•	categorías 
•	subcategorías 
•	departamentos 
•	marcas 
•	laboratorios 
•	unidades de medida 
•	presentaciones 
•	sucursales 
•	cajas 
•	métodos de pago 
________________________________________
4. Gestión de productos
El sistema debe permitir registrar productos usando código de barras como identificador principal, contemplando:
•	nombre del producto 
•	código de barras 
•	categoría 
•	subcategoría 
•	departamento 
•	marca o laboratorio 
•	unidad de venta 
•	múltiples formas de venta, por ejemplo: 
o	unidad 
o	docena 
o	caja 
•	costo 
•	precio de venta 
•	stock mínimo 
•	control de inventario 
•	opción de manejar: 
o	lotes 
o	fecha de caducidad 
o	fecha de ingreso 
o	según el tipo de producto 
Debe guardar historial de cambios de precio con:
•	precio anterior 
•	precio nuevo 
•	usuario 
•	fecha 
________________________________________
5. Inventario
El módulo de inventario debe incluir:
•	entradas manuales de producto 
•	salidas 
•	ajustes 
•	devoluciones 
•	kardex completo 
•	control por sucursal 
•	inventario consolidado si existen varias sucursales 
•	alertas de: 
o	bajo stock 
o	producto próximo a vencer 
•	sugerencia de rotación de inventario cuando aplique 
•	costos configurables: 
o	costo promedio 
o	PEPS/FIFO 
o	último costo 
•	soporte para traspasos entre sucursales si el módulo está activo 
________________________________________
6. Ventas
El módulo de ventas debe permitir:
•	ventas rápidas con lector de código de barras 
•	ventas en pantalla touch 
•	ventas suspendidas y reanudables 
•	cotizaciones 
•	descuentos: 
o	por producto 
o	por venta completa 
o	por porcentaje 
o	por monto fijo 
•	devoluciones: 
o	totales 
o	parciales 
o	con retorno automático a inventario 
•	impresión de recibos 
•	futura emisión de factura FEL 
•	asociación obligatoria de la venta a: 
o	cajero 
o	caja 
o	sucursal 
o	turno 
________________________________________
7. Métodos de pago
Debe permitir registrar:
•	efectivo 
•	tarjeta POS 
•	crédito 
•	pagos mixtos 
En esta etapa, el pago con tarjeta solo debe registrarse como tipo de pago, sin integración directa con terminal bancaria.
________________________________________
8. Caja, corte y arqueo
Debe incluir:
•	apertura de caja 
•	monto inicial 
•	registro de ventas por método de pago 
•	retiros 
•	ingresos extra 
•	cierre de caja 
•	corte por turno 
•	arqueo de caja 
•	comparación entre monto esperado y monto físico 
•	control de diferencias o descuadres 
•	reporte de movimientos de caja 
________________________________________
9. Reportería base
El sistema debe incluir reportes y consultas para:
•	ventas por día 
•	ventas por rango de fechas 
•	ventas por cajero 
•	ventas por sucursal 
•	ventas por departamento o categoría 
•	ventas totales 
•	ganancia basada únicamente en costo del producto 
•	inventario actual 
•	inventario bajo mínimo 
•	productos próximos a vencer 
•	movimientos de inventario 
•	corte de caja 
•	cuentas por cobrar 
•	dashboard simple con indicadores clave 
Debe permitir:
•	exportar inventario 
•	importar inventario 
•	exportar reportes a Excel y PDF 
________________________________________
Módulos adicionales
Módulo de clientes y crédito
•	CRUD de clientes 
•	datos básicos: 
o	nombre 
o	NIT 
o	teléfono 
o	dirección 
o	correo 
o	límite de crédito 
•	ventas a crédito 
•	control de saldo pendiente 
•	detalle de productos llevados 
•	abonos parciales 
•	liquidación total 
•	estado de cuenta imprimible 
•	alerta de mora o crédito vencido 
•	antigüedad de saldos 
•	bloqueo automático si excede el límite de crédito 
________________________________________
Módulo de proveedores
•	CRUD de proveedores 
•	vinculación del proveedor con ingreso de producto 
•	comparación entre costo anterior y nuevo costo al ingresar inventario 
•	por ahora sin módulo completo de compras, solo registro base relacionado con entradas 
________________________________________
Módulo multisucursal
•	catálogo de sucursales 
•	control de inventario por sucursal 
•	múltiples cajas por sucursal 
•	traspasos entre sucursales 
•	sincronización de información 
•	operación local por sucursal 
•	servidor local por sucursal 
•	sincronización con servidor central cuando exista conexión 
•	operación offline total con sincronización posterior 
•	misma funcionalidad offline y online 
________________________________________
Requerimientos no funcionales
•	interfaz moderna 
•	responsive 
•	optimizada para touch 
•	dark mode opcional 
•	rendimiento adecuado para equipos modestos en Windows 
•	facilidad de instalación local 
•	diseño preparado para escalar 
•	código limpio y mantenible 
•	arquitectura modular 
•	base lista para activación por licencias 
•	seguridad en autenticación y autorización 
•	trazabilidad de cambios mediante bitácora 
________________________________________
Requerimientos fiscales y contables
El sistema será orientado principalmente a Guatemala, por lo que debe contemplar:
•	NIT del cliente y del negocio 
•	preparación para futura integración con SAT/FEL 
•	opción de imprimir recibo y posteriormente factura 
•	cierres diarios y mensuales 
•	reportería útil para control administrativo y contable 
________________________________________
Requerimientos de despliegue
•	primera etapa: despliegue local en Windows 
•	preparado para evolución a esquema híbrido 
•	preparado para instalación por cliente 
•	preparado para revender como marca blanca 
•	preparado para activar módulos según licencia 
________________________________________
Lo que necesito que generes
Quiero que me entregues de forma estructurada y profesional:
1.	levantamiento completo de requerimientos funcionales y no funcionales 
2.	propuesta de arquitectura técnica recomendada 
3.	diseño modular del sistema 
4.	definición del MVP realista 
5.	roadmap por fases 
6.	modelo inicial de base de datos 
7.	entidades principales y relaciones 
8.	roles y permisos por módulo 
9.	flujos operativos de: 
o	venta 
o	inventario 
o	corte de caja 
o	crédito 
o	devoluciones 
10.	estrategia offline/online y sincronización 
11.	riesgos técnicos y recomendaciones 
12.	propuesta de paquetes comercializables 
13.	recomendaciones para que el sistema sea rentable, mantenible y fácil de implementar en distintos negocios 
Además, quiero que analices esta propuesta con mentalidad de:
•	desarrollador senior 
•	arquitecto de software 
•	experto en UX de POS 
•	contador operativo 
•	consultor de negocio 
Y que me indiques qué decisiones son las más importantes para evitar retrabajos y hacer el producto más fácil de vender.
 -->
# 🛵 SanFer Eats - "Tu ciudad, en un solo lugar"

Plataforma web integral, funcional y visualmente administrable para pedidos locales de **Comida Multirestaurante**, **Compras de Súper/Tiendas locales** y **Servicios de Entrega y Paquetería Local**, conectada con mensajería dinámica a **WhatsApp**.

Desarrollada bajo la **Especificación Funcional Integral de 52 Puntos**.

---

## 🌟 Características Principales

### 1. Experiencia del Cliente (Frontend Responsive)
* **Diseño e Identidad Visual Oficial**: Inspirado en los mockups de San Fernando con paleta cálida verde esmeralda y naranja tostado, y la mascota del jaguar repartidor en scooter.
* **Comida Multirestaurante**: El cliente puede agregar platillos de diferentes restaurantes en un mismo pedido sin perder su selección, manteniendo el carrito agrupado por restaurante con subtotales independientes.
* **Compras y Súper**: Catálogo de referencia con categorías sugeridas (Abarrotes, Bebidas, Lácteos, Limpieza, Frutas y Verduras, Mascotas, etc.) con selección rápida mediante un clic y caja de texto libre para cualquier marca o encargo.
* **Servicio de Entrega / Paquetería**: Formulario para recoger y entregar paquetes, documentos, medicinas y llaves con tarifas de referencia.
* **Cálculo Automático de Zonas y Tarifas**: Detección inteligente de zona por palabras clave de la dirección (Centro: $20 MXN, Orillas: $30 MXN, Colonias externas: desde $50 MXN).
* **Identificación Ligera de Clientes**: Registro sin contraseñas engorrosas; el cliente elige su identificador único (ej. `Henry`, `HenryC`, `HCV`) con validación en tiempo real de disponibilidad.
* **Mensajes Dinámicos de WhatsApp**: Generación automática de mensajes estructurados con emojis, desglose por restaurante, subtotales, tarifa estimada, dirección y folio de seguimiento `#SF-XXXX`.

### 2. Panel Administrativo Visual (Sin Código)
* **Acceso Protegido por PIN**: Seguridad integrada (PIN inicial: `1234`, modificable en Ajustes).
* **Dashboard y Estadísticas en Tiempo Real**:
  * Indicadores clave (KPIs): Total de pedidos, completados, cancelados, ingresos totales y clientes activos.
  * **4 Gráficas Interactivas nativas**:
    1. *Evolución de pedidos a lo largo del tiempo*.
    2. *Platillos más solicitados (Top productos)*.
    3. *Restaurantes con mayor movimiento y volumen*.
    4. *Actividad y frecuencia de clientes recurrentes*.
  * Filtros por periodo: Hoy, Esta semana, Este mes, Últimos 3 meses, Año actual, Todo el historial.
* **Gestión de Pedidos & Confirmación de Tarifa**:
  * Control de estados: *Nueva solicitud, En revisión, Confirmada, En preparación, En camino, Entregada, Cancelada*.
  * **Ajuste y Confirmación de Tarifa de Entrega**: El administrador puede revisar la tarifa sugerida por el sistema y confirmarla o ajustarla (ej. de $30 a $35), registrando fecha, hora, responsable y recalculando el total automáticamente.
* **Gestión de Restaurantes y Platillos**: Alta, edición, disponibilidad (*Disponible* vs *Agotado* / *Cerrado*), precios y subida de fotografías desde cualquier dispositivo (móvil, tablet, computadora).
* **Zonas y Tarifas Administrables**: Configuración de nombres de zona, tarifas y palabras clave de detección.
* **Números de WhatsApp Administrables**: Permite asignar y rotar números del administrador o repartidores sin tocar código.
* **Control de Estado y Horarios del Servicio**:
  * Botones de acción rápida: *"Abrir servicio ahora"* / *"Cerrar servicio ahora"*.
  * Horarios semanales programables por día de la semana con mensaje personalizado de cierre.
* **Mantenimiento y Almacenamiento Seguro (Protocolo en 6 Pasos)**:
  * Diagnóstico de tamaño de base de datos SQLite y carpeta de imágenes.
  * **Archivado histórico por año**: Mueve pedidos antiguos fuera del flujo operativo actual pero **blinda las estadísticas** en resúmenes históricos (`historical_summaries`).
  * **Limpieza Segura en 6 Pasos**: Muestra impacto, rango de fechas, advertencia clara, exige confirmación explícita escribiendo `"CONFIRMAR"`, ejecuta y registra auditoría en `admin_audit_logs`.
  * **Limpieza de imágenes huérfanas**: Identifica fotografías en disco que ya no están vinculadas a ningún platillo ni restaurante activo para liberar espacio con seguridad.

---

## 🏗️ Arquitectura Técnica

* **Entorno**: Node.js v24 con `node:sqlite` nativo (sin dependencias externas pesadas, velocidad y máxima estabilidad).
* **Base de Datos Relacional**: SQLite con modo WAL y claves foráneas activas (`/data/sanfer_eats.db`).
* **Almacenamiento Separado**:
  * Datos estructurados en SQLite.
  * Archivos multimedia en `/uploads/` con registro en `media_registry`.
* **Frontend**: HTML5 Semántico, CSS3 con Custom Properties (Variables de diseño y layouts responsivos móvil/escritorio) y JavaScript Vanilla modular.

---

## 🚀 Cómo Iniciar la Plataforma

1. Abre la carpeta del proyecto en una terminal o ejecuta el archivo:
   ```cmd
   iniciar_sanfer_eats.bat
   ```
2. O manualmente ejecutando:
   ```powershell
   & "$env:APPDATA\Antigravity\bin\agy-node.cmd" server.js
   ```
3. Accede desde tu navegador web:
   * **Plataforma Pública**: [http://localhost:3000](http://localhost:3000)
   * **Panel Administrativo**: [http://localhost:3000/#admin](http://localhost:3000/#admin) (PIN: `1234`)

---

## 🧪 Pruebas Automatizadas

La aplicación cuenta con una suite completa de pruebas en `test_system.js` que verifica automáticamente los 12 flujos críticos del sistema:
```powershell
& "$env:APPDATA\Antigravity\bin\agy-node.cmd" test_system.js
```
Resultado: **12/12 módulos verificados exitosamente**.

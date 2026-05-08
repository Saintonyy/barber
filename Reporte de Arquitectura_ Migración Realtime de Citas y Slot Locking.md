# Reporte de Arquitectura: Migración Realtime de Citas y Slot Locking

## 1. Resumen Ejecutivo
Se ha migrado la vista principal de operaciones (`Appointments.tsx`) desde un estado de datos mockeados hacia una infraestructura distribuida en tiempo real sobre Supabase. La implementación mantiene la filosofía de diseño original ("Minimalist Brutalism" y "Event-driven architecture"), reemplazando la simulación por persistencia real, detección de conflictos mediante funciones SQL y concurrencia optimizada mediante *advisory locks*.

## 2. Infraestructura de Base de Datos (Supabase)

Para soportar concurrencia real y evitar *double-booking* en un entorno multi-usuario, se implementó un sistema de *Slot Locking* directamente en Postgres:

*   **Tabla `appointment_locks`**: Almacena reservas temporales (TTL de 60s) con aislamiento multi-tenant (RLS).
*   **`acquire_slot_lock` (RPC)**: Función atómica que utiliza `pg_try_advisory_xact_lock` para garantizar que dos peticiones simultáneas no puedan reservar el mismo horario. Valida solapamientos tanto con *locks* activos como con citas ya confirmadas.
*   **`get_available_slots_v2` (RPC)**: Genera el mapa de disponibilidad diario de un barbero, marcando cada slot como `available`, `locked` (con el nombre del usuario que lo retiene) o `booked`.
*   **`detect_appointment_conflicts` (RPC)**: Motor SQL de detección de solapamientos (overlap) que alimenta el `ConflictEngine` del frontend.

## 3. Capa de Negocio (React Hooks & Zustand)

Se diseñó una capa de orquestación para aislar la complejidad de Supabase de la UI:

*   **`useAppointmentLocks`**: Maneja la adquisición (`acquireLock`), liberación (`releaseLock`) y renovación automática (heartbeat de 20s) de los *locks* del usuario actual.
*   **`useAppointmentLocksRealtime`**: Se suscribe al canal de Postgres de la tabla `appointment_locks` y sincroniza el store global (`useAppointmentLocksStore`). Dispara eventos hacia el `EventBus` (`Events.CALENDAR_SLOT_LOCKED`, etc.).
*   **`useConflictDetection`**: Evalúa los conflictos de agenda en tiempo real llamando a la RPC de Supabase y notifica al sistema a través del `EventBus` (`Events.CALENDAR_CONFLICT_DETECTED`).
*   **`useAppointmentsPage`**: Hook maestro que orquesta la carga de barberos, servicios, clientes y citas del día. Maneja la suscripción Realtime a la tabla `appointments` y las mutaciones (crear, cancelar, confirmar).

## 4. UI y Experiencia de Usuario (Appointments.tsx)

La vista `Appointments.tsx` fue reescrita completamente para reflejar el estado distribuido:

*   **Multiplayer UX**: Los *slots* bloqueados por otros usuarios muestran un candado amarillo y el nombre de quien está reservando.
*   **Conflict UI**: Si el motor detecta un conflicto de agenda, la cita infractora se resalta con un borde rojo, y un panel de alertas muestra los detalles del solapamiento.
*   **Flujo Optimista**: La creación y modificación de citas actualiza la UI instantáneamente antes de confirmar con la base de datos, manteniendo la sensación de inmediatez.
*   **Modal de Nueva Cita (Aware)**: El modal intenta adquirir el *lock* en el momento en que se seleccionan barbero, servicio y hora. Si el slot está ocupado, bloquea el formulario y muestra una advertencia.

## 5. Integración con Arquitectura Existente

La migración respetó estrictamente la arquitectura original:

1.  **Supabase Realtime** captura el cambio en DB.
2.  Los hooks emiten la acción al **`EventBus`**.
3.  El **Zustand Store** actualiza su estado.
4.  La **UI reacciona** al store.

El código compila correctamente en TypeScript (`tsc --noEmit`) y el build de Vite se genera sin errores.

## 6. Próximos Pasos Recomendados

1.  **Conversaciones WhatsApp**: Migrar `Conversations.tsx` conectando los webhooks de n8n/WhatsApp Cloud API hacia las tablas `conversations` y `messages` de Supabase.
2.  **Drag & Drop Realtime**: Conectar los eventos de arrastre (`onDragEnd`) del calendario a mutaciones de actualización de horario en Supabase, re-disparando el motor de conflictos.

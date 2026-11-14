# Orca Teams — Plan de Implementación y Seguimiento Multiagente

**Repositorio:** `https://github.com/FrancisCuarto/orca-teams`  
**Ramas Base:** `main` (Producción), `staging` (Pre-producción), `develop` (Integración Continua)  
**Coordinador General (Tech Lead):** Antigravity

---

## 1. Estado de Fases

| Fase       | Descripción                                               |     Estado     | Criterio de Salida                                                                                        |
| ---------- | --------------------------------------------------------- | :------------: | --------------------------------------------------------------------------------------------------------- |
| **Fase 0** | Auditoría de Arquitectura y Configuración del Repositorio | **Completada** | Repositorio independiente configurado, ramas `main`, `staging`, `develop` publicadas y CI inicial activo. |
| **Fase 1** | Espacios de trabajo, equipos y proyectos                  |  **En Curso**  | Dos usuarios distintos pueden acceder al mismo proyecto con roles y permisos correctos.                   |
| **Fase 2** | Kanban colaborativo en tiempo real                        |   Pendiente    | Movimientos sincronizados instantáneamente con Yjs sin pérdida ni sobrescritura.                          |
| **Fase 3** | Asignación y ejecución de agentes                         |   Pendiente    | Asignar tarjeta a un agente ejecuta tarea automáticamente con streaming de logs y feedback.               |
| **Fase 4** | Whiteboard colaborativo                                   |   Pendiente    | Lienzo colaborativo en tiempo real con persistencia multiusuario.                                         |
| **Fase 5** | Notes y documentación vinculada                           |   Pendiente    | Notas sincronizadas con guardado automático y vinculación a tarjetas Kanban.                              |
| **Fase 6** | Integración global y empaquetado                          |   Pendiente    | Build instalable de escritorio (`orca-teams`) con suite de pruebas completa en verde.                     |

---

## 2. Issues y Asignación de Tareas — Fase 1

| Issue  | Título                                                                                                         | Agente / Rol Asignado                   | Rama Asociada                    | PR        |            Estado            |
| ------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------- | --------- | :--------------------------: |
| **#1** | [[Fase 1] Modelos de datos y contratos compartidos](https://github.com/FrancisCuarto/orca-teams/issues/1)      | Backend / Shared Engineer (Antigravity) | `feat/teams-fase1-models`        | Pendiente |         **En Curso**         |
| **#2** | [[Fase 1] Esquema de Base de Datos y Persistencia](https://github.com/FrancisCuarto/orca-teams/issues/2)       | Database & Auth Engineer                | `feat/teams-fase1-db-auth`       | Pendiente | Pendiente (bloqueado por #1) |
| **#3** | [[Fase 1] UI: Selector y Gestión de Equipos y Proyectos](https://github.com/FrancisCuarto/orca-teams/issues/3) | Frontend Engineer                       | `feat/teams-fase1-ui-workspaces` | Pendiente | Pendiente (bloqueado por #1) |
| **#4** | [[Fase 1] Flujo de Invitaciones y Enlaces Seguros](https://github.com/FrancisCuarto/orca-teams/issues/4)       | Security & API Engineer                 | `feat/teams-fase1-invitations`   | Pendiente | Pendiente (bloqueado por #2) |

---

## 3. Registro de Pruebas y Validación Continua

- `src/renderer/src/components/team/kanban/team-kanban-board-mutations.test.ts`: **14/14 tests pasando**.
- Workflow de CI: `.github/workflows/orca-teams-ci.yml` activo en `develop`.

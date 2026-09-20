# Project Management & Multi-Tenant Isolation

Every project represents an isolated storage boundary. Collections and records created in Project A are strictly inaccessible from Project B.

---

## 🚀 Endpoints

### 1. Create Project
- **Method**: `POST /api/db/projects`
- **Headers**: `Authorization: Bearer <userSessionToken>`
- **Body**: `{"projectId": "my-app"}`
- **Response**: `{"success": true, "projectId": "my-app", "projectToken": "..."}`

### 2. List Projects
- **Method**: `GET /api/db/projects`
- **Headers**: `Authorization: Bearer <userSessionToken>`
- **Response**: `{"success": true, "projects": [...]}`

### 3. Rotate Project Token
- **Method**: `POST /api/db/projects/:projectId/token/rotate`
- **Headers**: `Authorization: Bearer <userSessionToken>`
- **Response**: `{"success": true, "projectId": "my-app", "projectToken": "<new_token>"}`

### 4. Revoke Project Token
- **Method**: `POST /api/db/projects/:projectId/token/revoke`
- **Headers**: `Authorization: Bearer <userSessionToken>`
- **Response**: `{"success": true, "projectId": "my-app", "status": "disabled"}`

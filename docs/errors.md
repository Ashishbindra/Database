# HTTP Error Codes & Handling

All API errors return consistent JSON payloads with standard HTTP status codes:

```json
{
  "error": "Record not found",
  "code": "NOT_FOUND",
  "status": 404
}
```

---

## 📋 Common Status Codes

| HTTP Status | Error Code | Description & Resolution |
| :--- | :--- | :--- |
| **400 Bad Request** | `INVALID_INPUT` / `PATH_TRAVERSAL_DETECTED` | Invalid JSON payload, malformed path, or prohibited characters. |
| **401 Unauthorized** | `AUTH_REQUIRED` / `INVALID_TOKEN` | Missing or invalid Bearer token in `Authorization` header. |
| **403 Forbidden** | `CROSS_PROJECT_FORBIDDEN` | Project token is not authorized for the requested `projectId`. |
| **404 Not Found** | `NOT_FOUND` | Collection or record ID does not exist in the project namespace. |
| **409 Conflict** | `CONCURRENCY_CONFLICT` | Stale Git blob SHA provided on update/delete; concurrent mutation occurred. |
| **413 Payload Too Large**| `PAYLOAD_TOO_LARGE` | JSON body exceeds the maximum allowable payload size (2 MB). |
| **429 Too Many Requests**| `RATE_LIMITED` | Rate limit threshold exceeded. Check `Retry-After` header. |
| **500 Server Error** | `INTERNAL_ERROR` | Server execution error. No stack traces or secrets are leaked. |
| **503 Unavailable** | `SERVICE_UNAVAILABLE` | Upstream GitHub API rate limit or outage. |

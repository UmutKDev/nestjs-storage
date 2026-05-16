---
type: "query"
date: "2026-05-16T20:11:31.670574+00:00"
question: "Why does NotificationService reach into 14 different communities — is it a healthy event bus or a hidden god object?"
contributor: "graphify"
source_nodes: ["NotificationService", "NotificationGateway", "NotificationModule", "NotificationHistoryDocument", "HttpExceptionFilter", "CoreModule", "DocumentService", "CloudArchiveService", "CloudDuplicateService", "ApiWebhookService"]
---

# Q: Why does NotificationService reach into 14 different communities — is it a healthy event bus or a hidden god object?

## Answer

Healthy event bus, not a god object. Surface is 3 methods (EmitToUser/EmitToUsers/EmitToAll) with no domain logic; the service only fans out to NotificationGateway (WebSocket) and NotificationHistoryDocument (Mongo TTL). The 14 communities reflect fan-IN from domain producers (DocumentService, CloudArchiveService, CloudDuplicateService, ApiWebhookService, SessionService, SubscriptionService, CloudUsageService, TeamInvitationService, etc.), not fan-OUT into them. Betweenness centrality 0.050 reflects its position on every 'domain event -> user inbox' path. The one borderline coupling is HttpExceptionFilter injecting NotificationService in CoreModule (APP_FILTER), where the framework filter layer reaches into a domain service — the only edge in this subgraph that crosses an architectural boundary the wrong way.

## Source Nodes

- NotificationService
- NotificationGateway
- NotificationModule
- NotificationHistoryDocument
- HttpExceptionFilter
- CoreModule
- DocumentService
- CloudArchiveService
- CloudDuplicateService
- ApiWebhookService
- SessionService
- SubscriptionService
- CloudUsageService
- TeamInvitationService
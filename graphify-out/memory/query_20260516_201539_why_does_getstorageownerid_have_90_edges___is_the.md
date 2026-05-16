---
type: "query"
date: "2026-05-16T20:15:39.104790+00:00"
question: "Why does GetStorageOwnerId have 90 edges — is the personal-vs-team architecture properly contained or leaking everywhere?"
contributor: "graphify"
source_nodes: ["GetStorageOwnerId()", "KeyBuilder()", "GetCacheOwnerId()", "CloudArchiveService", "CloudService", "DocumentService", "CloudDirectoryService", "CloudObjectService", "CloudListService", "CloudUsageService"]
---

# Q: Why does GetStorageOwnerId have 90 edges — is the personal-vs-team architecture properly contained or leaking everywhere?

## Answer

Healthy abstraction, well contained. 155 total call sites — every one inside src/modules/cloud/* or src/modules/document/*. Zero leakage into auth, subscription, webhook, notification, team-invite, session domains. BFS spans 9 communities but all are storage-domain (cloud-archive, cloud-directory, cloud-duplicate, cloud-list, cloud-object, document, etc.). Always paired with KeyBuilder([GetStorageOwnerId(user), ...]) — the two functions compose into 'what owns this' + 'build the S3 key'. The 90-edge god-node signal reflects degree on a single chokepoint primitive, which is the abstraction working as designed. ONE bypass exists at cloud.archive.service.ts:598/605/945/962 where the BullMQ worker reconstructs UserContext from job.data.ownerId and uses user.Id directly in KeyBuilder. This is correct (the producer resolved GetStorageOwnerId at enqueue time and persisted the result), but deserves a one-line comment to lock in the invariant — it's the only place a future reader could accidentally break team storage.

## Source Nodes

- GetStorageOwnerId()
- KeyBuilder()
- GetCacheOwnerId()
- CloudArchiveService
- CloudService
- DocumentService
- CloudDirectoryService
- CloudObjectService
- CloudListService
- CloudUsageService
- CloudDuplicateService
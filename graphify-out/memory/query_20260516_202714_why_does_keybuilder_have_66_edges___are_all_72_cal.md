---
type: "query"
date: "2026-05-16T20:27:14.587215+00:00"
question: "Why does KeyBuilder have 66 edges — are all 72 call sites properly paired with GetStorageOwnerId, or are there raw user.Id bypasses?"
contributor: "graphify"
source_nodes: ["KeyBuilder()", "GetStorageOwnerId()", "CloudScanService", "CloudUsageService", "CloudObjectService", "CloudDirectoryService", "CloudArchiveService", "DocumentService", "CloudService"]
---

# Q: Why does KeyBuilder have 66 edges — are all 72 call sites properly paired with GetStorageOwnerId, or are there raw user.Id bypasses?

## Answer

72 KeyBuilder call sites audited, zero real leaks. All 'suspicious' single-line patterns resolve cleanly: cloud.object.service.ts:210,250 build display keys for API conflict responses (not S3 keys); the real S3 ops on lines 194/219/223 use [ownerId,...]. cloud.scan.service.ts:139 and cloud.usage.service.ts:164 use pre-resolved storage-owner IDs from BullMQ job payloads and read-through Redis paths — enqueued/seeded by callers that always pass GetStorageOwnerId(User). Multi-line KeyBuilder calls (cloud.directory.service.ts:1006/1099/1558/1635, cloud.object.service.ts:406) place GetStorageOwnerId(User) on the second line. KeyBuilder + GetStorageOwnerId are the cloud module's two-function scoping primitive and the abstraction holds across 100% of call sites. NAMING SMELL FOUND: three sites use 'userId: string' as a parameter name when the value is actually a pre-resolved storage-owner (could be 'team/{id}') — cloud.scan.service.ts (EnqueueScan/ProcessScanJob), cloud.usage.service.ts (Increment/Decrement/GetOrSeed/ComputeUsageFromS3), and the archive worker. Renaming to 'ownerId' would lock in the invariant by name alone; the archive worker already has a comment fix at L598.

## Source Nodes

- KeyBuilder()
- GetStorageOwnerId()
- CloudScanService
- CloudUsageService
- CloudObjectService
- CloudDirectoryService
- CloudArchiveService
- DocumentService
- CloudService
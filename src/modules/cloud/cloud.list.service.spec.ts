import { Test, TestingModule } from '@nestjs/testing';
import { CloudListService } from './cloud.list.service';
import { CloudS3Service } from './cloud.s3.service';
import { CloudMetadataService } from './cloud.metadata.service';
import { RedisService } from '@modules/redis/redis.service';

// Ensure signed URL processing is disabled in tests (Bun auto-loads .env)
process.env.S3_PROTOCOL_SIGNED_URL_PROCESSING = 'false';

describe('CloudListService', () => {
  let service: CloudListService;
  let mockS3Send: jest.Mock;

  const mockCloudS3Service = {
    Send: jest.fn(),
    GetBuckets: jest.fn().mockReturnValue({
      Storage: 'test-bucket',
      Photos: 'Photos',
    }),
    GetPublicHostname: jest.fn().mockReturnValue('cdn.test.com'),
    GetPublicEndpoint: jest.fn().mockReturnValue('https://cdn.test.com'),
    GetKey: jest.fn((key: string, userId: string) =>
      key.replace(userId + '/', ''),
    ),
    GetUrl: jest.fn((key: string) => `https://cdn.test.com/${key}`),
    GetClient: jest.fn(),
    IsNotFoundError: jest.fn().mockReturnValue(false),
  };

  const mockCloudMetadataService = {
    DecodeMetadataFromS3: jest.fn().mockReturnValue({}),
    ExtractAndStoreImageMetadata: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn().mockResolvedValue(undefined),
  };

  const testUser: UserContext = {
    Id: 'user-1',
    Email: 'test@test.com',
    Role: [],
    Status: undefined,
  } as any;

  // Standard test objects representing a typical user's file structure
  const createTestObjects = () => [
    {
      Key: 'user-1/photo.jpg',
      Size: 1024,
      ETag: 'e1',
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'user-1/document.pdf',
      Size: 2048,
      ETag: 'e2',
      LastModified: new Date('2025-01-02'),
    },
    {
      Key: 'user-1/notes.txt',
      Size: 512,
      ETag: 'e3',
      LastModified: new Date('2025-01-03'),
    },
    {
      Key: 'user-1/folder/report.pdf',
      Size: 4096,
      ETag: 'e4',
      LastModified: new Date('2025-01-04'),
    },
    {
      Key: 'user-1/folder/.emptyFolderPlaceholder',
      Size: 0,
      ETag: 'e5',
      LastModified: new Date('2025-01-05'),
    },
    {
      Key: 'user-1/.secure/manifest.json',
      Size: 256,
      ETag: 'e6',
      LastModified: new Date('2025-01-06'),
    },
    {
      Key: 'user-1/encrypted-dir/secret.docx',
      Size: 3072,
      ETag: 'e7',
      LastModified: new Date('2025-01-07'),
    },
    {
      Key: 'user-1/Photo_Backup.JPG',
      Size: 5120,
      ETag: 'e8',
      LastModified: new Date('2025-01-08'),
    },
    {
      Key: 'user-1/my-photos/vacation.png',
      Size: 6144,
      ETag: 'e9',
      LastModified: new Date('2025-01-09'),
    },
  ];

  /**
   * Helper to set up S3 mock to return objects in a single page
   */
  const mockS3SinglePage = (objects: any[]) => {
    mockS3Send.mockResolvedValue({
      Contents: objects,
      IsTruncated: false,
      NextContinuationToken: undefined,
    });
  };

  /**
   * Helper to set up S3 mock to return objects across multiple pages
   */
  const mockS3MultiplePages = (pages: any[][]) => {
    let callIndex = 0;
    mockS3Send.mockImplementation(() => {
      const currentPage = callIndex;
      callIndex++;
      const isLast = currentPage >= pages.length - 1;
      return Promise.resolve({
        Contents: pages[currentPage] ?? [],
        IsTruncated: !isLast,
        NextContinuationToken: isLast ? undefined : `token-${currentPage + 1}`,
      });
    });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudListService,
        { provide: CloudS3Service, useValue: mockCloudS3Service },
        { provide: CloudMetadataService, useValue: mockCloudMetadataService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<CloudListService>(CloudListService);
    mockS3Send = mockCloudS3Service.Send;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('SearchObjects', () => {
    describe('Basic search', () => {
      it('should return files matching the query', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'photo', IsMetadataProcessing: false },
          testUser,
        );

        // Should match files: photo.jpg, Photo_Backup.JPG (case-insensitive)
        expect(result.Objects).toHaveLength(2);
        expect(result.TotalCount).toBe(2);
        const names = result.Objects.map((o) => o.Name);
        expect(names).toContain('photo.jpg');
        expect(names).toContain('Photo_Backup.JPG');
        // Should match directory: my-photos
        expect(result.Directories.length).toBeGreaterThanOrEqual(1);
        const dirNames = result.Directories.map((d) => d.Name);
        expect(dirNames).toContain('my-photos');
      });

      it('should perform case-insensitive matching', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'PHOTO', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Objects).toHaveLength(2);
        const names = result.Objects.map((o) => o.Name);
        expect(names).toContain('photo.jpg');
        expect(names).toContain('Photo_Backup.JPG');
      });

      it('should return empty results when no files match', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'nonexistent', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Objects).toHaveLength(0);
        expect(result.TotalCount).toBe(0);
        expect(result.Directories).toHaveLength(0);
        expect(result.TotalDirectoryCount).toBe(0);
      });

      it('should match partial filenames', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'doc', IsMetadataProcessing: false },
          testUser,
        );

        // Should match: document.pdf, secret.docx
        expect(result.TotalCount).toBe(2);
      });
    });

    describe('Filtering', () => {
      it('should skip .emptyFolderPlaceholder files', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'empty', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Objects).toHaveLength(0);
        expect(result.TotalCount).toBe(0);
      });

      it('should skip .secure/ paths', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'manifest', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Objects).toHaveLength(0);
        expect(result.TotalCount).toBe(0);
      });

      it('should filter by extension', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'p', Extension: 'pdf', IsMetadataProcessing: false },
          testUser,
        );

        // Matching name "p" AND extension "pdf": document.pdf, report.pdf
        const names = result.Objects.map((o) => o.Name);
        for (const name of names) {
          expect(name.endsWith('.pdf')).toBe(true);
        }
      });

      it('should filter by extension case-insensitively', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'photo', Extension: 'jpg', IsMetadataProcessing: false },
          testUser,
        );

        // photo.jpg (ext=jpg) and Photo_Backup.JPG (ext=JPG -> matches jpg)
        expect(result.TotalCount).toBe(2);
      });

      it('should skip objects with no Key', async () => {
        mockS3SinglePage([
          { Key: undefined, Size: 100 },
          {
            Key: 'user-1/valid.txt',
            Size: 200,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'valid', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.TotalCount).toBe(1);
        expect(result.Objects[0].Name).toBe('valid.txt');
      });
    });

    describe('Pagination', () => {
      it('should apply Skip and Take correctly', async () => {
        const objects = [];
        for (let i = 0; i < 10; i++) {
          objects.push({
            Key: `user-1/file-${String(i).padStart(2, '0')}.txt`,
            Size: 100 * (i + 1),
            ETag: `e${i}`,
            LastModified: new Date(),
          });
        }
        mockS3SinglePage(objects);

        const result = await service.SearchObjects(
          {
            Query: 'file',
            IsMetadataProcessing: false,
            Skip: 2,
            Take: 3,
          },
          testUser,
        );

        expect(result.Objects).toHaveLength(3);
        expect(result.TotalCount).toBe(10);
        expect(result.Objects[0].Name).toBe('file-02.txt');
        expect(result.Objects[1].Name).toBe('file-03.txt');
        expect(result.Objects[2].Name).toBe('file-04.txt');
      });

      it('should count total matches even beyond the Take window', async () => {
        const objects = [];
        for (let i = 0; i < 20; i++) {
          objects.push({
            Key: `user-1/item-${i}.txt`,
            Size: 100,
            ETag: `e${i}`,
            LastModified: new Date(),
          });
        }
        mockS3SinglePage(objects);

        const result = await service.SearchObjects(
          {
            Query: 'item',
            IsMetadataProcessing: false,
            Skip: 0,
            Take: 5,
          },
          testUser,
        );

        expect(result.Objects).toHaveLength(5);
        expect(result.TotalCount).toBe(20);
      });

      it('should handle Skip beyond total results', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          {
            Query: 'photo',
            IsMetadataProcessing: false,
            Skip: 100,
            Take: 10,
          },
          testUser,
        );

        expect(result.Objects).toHaveLength(0);
        expect(result.TotalCount).toBe(2); // still counts total matches
      });

      it('should default Take to 50 when not provided', async () => {
        const objects = [];
        for (let i = 0; i < 60; i++) {
          objects.push({
            Key: `user-1/f-${i}.txt`,
            Size: 100,
            ETag: `e${i}`,
            LastModified: new Date(),
          });
        }
        mockS3SinglePage(objects);

        const result = await service.SearchObjects(
          { Query: 'f-', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Objects).toHaveLength(50);
        expect(result.TotalCount).toBe(60);
      });
    });

    describe('Path scoping', () => {
      it('should search within a specific directory when Path is provided', async () => {
        mockS3SinglePage(createTestObjects());

        // The prefix will be user-1/folder/ so only objects under that path
        // will be returned by S3. We need to mock based on the prefix.
        mockS3Send.mockImplementation((cmd: any) => {
          const prefix = cmd.input?.Prefix;
          const allObjects = createTestObjects();
          const filtered = allObjects.filter(
            (o) => o.Key && o.Key.startsWith(prefix),
          );
          return Promise.resolve({
            Contents: filtered,
            IsTruncated: false,
          });
        });

        const result = await service.SearchObjects(
          { Query: 'report', Path: 'folder', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.TotalCount).toBe(1);
        expect(result.Objects[0].Name).toBe('report.pdf');
      });

      it('should search entire user space when Path is not provided', async () => {
        mockS3Send.mockImplementation((cmd: any) => {
          const prefix = cmd.input?.Prefix;
          expect(prefix).toBe('user-1/');
          return Promise.resolve({
            Contents: createTestObjects(),
            IsTruncated: false,
          });
        });

        const result = await service.SearchObjects(
          { Query: 'photo', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.TotalCount).toBe(2);
      });
    });

    describe('Encrypted folder handling', () => {
      const encryptedFolders = new Set(['encrypted-dir']);

      it('should exclude encrypted folder contents when no session token', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'secret', IsMetadataProcessing: false },
          testUser,
          encryptedFolders,
          undefined, // no session token
          undefined, // no validator
        );

        expect(result.TotalCount).toBe(0);
        expect(result.Objects).toHaveLength(0);
      });

      it('should include encrypted folder contents with valid session token', async () => {
        mockS3SinglePage(createTestObjects());

        const mockValidateSession = jest
          .fn()
          .mockResolvedValue({ valid: true });

        const result = await service.SearchObjects(
          { Query: 'secret', IsMetadataProcessing: false },
          testUser,
          encryptedFolders,
          'valid-session-token',
          mockValidateSession,
        );

        expect(result.TotalCount).toBe(1);
        expect(result.Objects[0].Name).toBe('secret.docx');
        expect(mockValidateSession).toHaveBeenCalledWith(
          'user-1',
          'encrypted-dir',
          'valid-session-token',
        );
      });

      it('should exclude encrypted folder contents with invalid session token', async () => {
        mockS3SinglePage(createTestObjects());

        const mockValidateSession = jest.fn().mockResolvedValue(null);

        const result = await service.SearchObjects(
          { Query: 'secret', IsMetadataProcessing: false },
          testUser,
          encryptedFolders,
          'invalid-token',
          mockValidateSession,
        );

        expect(result.TotalCount).toBe(0);
        expect(result.Objects).toHaveLength(0);
      });

      it('should cache session validation per encrypted folder', async () => {
        const objects = [
          {
            Key: 'user-1/encrypted-dir/file1.txt',
            Size: 100,
            ETag: 'e1',
            LastModified: new Date(),
          },
          {
            Key: 'user-1/encrypted-dir/file2.txt',
            Size: 200,
            ETag: 'e2',
            LastModified: new Date(),
          },
          {
            Key: 'user-1/encrypted-dir/file3.txt',
            Size: 300,
            ETag: 'e3',
            LastModified: new Date(),
          },
        ];
        mockS3SinglePage(objects);

        const mockValidateSession = jest
          .fn()
          .mockResolvedValue({ valid: true });

        await service.SearchObjects(
          { Query: 'file', IsMetadataProcessing: false },
          testUser,
          encryptedFolders,
          'valid-token',
          mockValidateSession,
        );

        // Should only call validateSession once for the same encrypted folder
        expect(mockValidateSession).toHaveBeenCalledTimes(1);
      });

      it('should not exclude non-encrypted files when encrypted folders exist', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'photo', IsMetadataProcessing: false },
          testUser,
          encryptedFolders,
          undefined,
          undefined,
        );

        // photo.jpg and Photo_Backup.JPG are not in encrypted folders
        expect(result.TotalCount).toBe(2);
      });
    });

    describe('S3 pagination', () => {
      it('should handle multiple S3 pages with ContinuationToken', async () => {
        const page1 = [
          {
            Key: 'user-1/alpha.txt',
            Size: 100,
            ETag: 'e1',
            LastModified: new Date(),
          },
          {
            Key: 'user-1/bravo.txt',
            Size: 200,
            ETag: 'e2',
            LastModified: new Date(),
          },
        ];
        const page2 = [
          {
            Key: 'user-1/charlie.txt',
            Size: 300,
            ETag: 'e3',
            LastModified: new Date(),
          },
          {
            Key: 'user-1/delta.txt',
            Size: 400,
            ETag: 'e4',
            LastModified: new Date(),
          },
        ];

        mockS3MultiplePages([page1, page2]);

        const result = await service.SearchObjects(
          { Query: '.txt', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.TotalCount).toBe(4);
        expect(result.Objects).toHaveLength(4);
        expect(mockS3Send).toHaveBeenCalledTimes(2);
      });

      it('should stop scanning when reaching MaxSearchScanObjects limit', async () => {
        // Create pages that would exceed the scan limit
        // The service has MaxSearchScanObjects = 10000 by default
        // We simulate this by checking that the loop respects IsTruncated
        const page1 = [
          {
            Key: 'user-1/file.txt',
            Size: 100,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ];

        let callCount = 0;
        mockS3Send.mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            Contents: page1,
            IsTruncated: true,
            NextContinuationToken: `token-${callCount}`,
          });
        });

        // SearchObjects should eventually stop due to MaxSearchScanObjects
        const result = await service.SearchObjects(
          { Query: 'file', IsMetadataProcessing: false },
          testUser,
        );

        // Should have found matches across pages and stopped
        expect(result.TotalCount).toBeGreaterThan(0);
        // Should not loop forever
        expect(callCount).toBeLessThanOrEqual(10001);
      });
    });

    describe('Object model output', () => {
      it('should return properly structured CloudObjectModel', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/my-document.pdf',
            Size: 2048,
            ETag: '"abc123"',
            LastModified: new Date('2025-06-15T10:30:00Z'),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'my-document', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Objects).toHaveLength(1);
        const obj = result.Objects[0];
        expect(obj.Name).toBe('my-document.pdf');
        expect(obj.Extension).toBe('pdf');
        expect(obj.Size).toBe(2048);
        expect(obj.ETag).toBe('"abc123"');
        expect(obj.Path).toBeDefined();
        expect(obj.Path.Key).toBeDefined();
        expect(obj.Path.Url).toBeDefined();
      });

      it('should handle files without extension', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/README',
            Size: 512,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'README', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Objects).toHaveLength(1);
        expect(result.Objects[0].Name).toBe('README');
        expect(result.Objects[0].Extension).toBe('');
      });
    });

    describe('Directory search', () => {
      it('should return matching directories extracted from object paths', async () => {
        mockS3SinglePage(createTestObjects());

        const result = await service.SearchObjects(
          { Query: 'folder', IsMetadataProcessing: false },
          testUser,
        );

        // "folder" directory appears in: user-1/folder/report.pdf, user-1/folder/.emptyFolderPlaceholder
        const dirNames = result.Directories.map((d) => d.Name);
        expect(dirNames).toContain('folder');
        expect(result.TotalDirectoryCount).toBeGreaterThanOrEqual(1);
      });

      it('should perform case-insensitive directory name matching', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/MyPhotos/image.jpg',
            Size: 1024,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'myphotos', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Directories).toHaveLength(1);
        expect(result.Directories[0].Name).toBe('MyPhotos');
      });

      it('should not return duplicate directories', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/docs/file1.txt',
            Size: 100,
            ETag: 'e1',
            LastModified: new Date(),
          },
          {
            Key: 'user-1/docs/file2.txt',
            Size: 200,
            ETag: 'e2',
            LastModified: new Date(),
          },
          {
            Key: 'user-1/docs/file3.txt',
            Size: 300,
            ETag: 'e3',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'docs', IsMetadataProcessing: false },
          testUser,
        );

        // "docs" should appear only once even though multiple files are inside
        const docsEntries = result.Directories.filter(
          (d) => d.Name === 'docs',
        );
        expect(docsEntries).toHaveLength(1);
      });

      it('should detect directories from .emptyFolderPlaceholder files', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/empty-folder/.emptyFolderPlaceholder',
            Size: 0,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'empty', IsMetadataProcessing: false },
          testUser,
        );

        // Directory should be found from placeholder, not as a file
        expect(result.Objects).toHaveLength(0);
        expect(result.Directories).toHaveLength(1);
        expect(result.Directories[0].Name).toBe('empty-folder');
        expect(result.Directories[0].Prefix).toBe('empty-folder/');
      });

      it('should mark encrypted directories correctly', async () => {
        const encryptedFolders = new Set(['encrypted-dir']);
        mockS3SinglePage([
          {
            Key: 'user-1/encrypted-dir/file.txt',
            Size: 100,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const mockValidateSession = jest
          .fn()
          .mockResolvedValue({ valid: true });

        const result = await service.SearchObjects(
          { Query: 'encrypted', IsMetadataProcessing: false },
          testUser,
          encryptedFolders,
          'valid-token',
          mockValidateSession,
        );

        const encDir = result.Directories.find(
          (d) => d.Name === 'encrypted-dir',
        );
        expect(encDir).toBeDefined();
        expect(encDir.IsEncrypted).toBe(true);
      });

      it('should exclude .secure directories from results', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/.secure/manifest.json',
            Size: 256,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'secure', IsMetadataProcessing: false },
          testUser,
        );

        expect(result.Directories).toHaveLength(0);
        expect(result.Objects).toHaveLength(0);
      });

      it('should not include directories when only file name matches', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/reports/budget.xlsx',
            Size: 1024,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'budget', IsMetadataProcessing: false },
          testUser,
        );

        // "budget" matches file name but not directory name "reports"
        expect(result.Objects).toHaveLength(1);
        expect(result.Directories).toHaveLength(0);
      });

      it('should extract nested directory paths', async () => {
        mockS3SinglePage([
          {
            Key: 'user-1/projects/webapp/src/index.ts',
            Size: 512,
            ETag: 'e1',
            LastModified: new Date(),
          },
        ]);

        const result = await service.SearchObjects(
          { Query: 'webapp', IsMetadataProcessing: false },
          testUser,
        );

        // "webapp" matches the nested directory name
        expect(result.Directories).toHaveLength(1);
        expect(result.Directories[0].Name).toBe('webapp');
        expect(result.Directories[0].Prefix).toBe('projects/webapp/');
      });
    });
  });
});

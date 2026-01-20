import { Test, TestingModule } from '@nestjs/testing';
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { CloudService } from './cloud.service';
import { Readable } from 'stream';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

describe('CloudService Update', () => {
  let service: CloudService;
  let s3: { send: jest.Mock };

  beforeEach(async () => {
    s3 = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudService,
        // AwsSdkModule registers a provider with a token like 'AWS_SDK_V3_MODULE#S3Client#'
        { provide: 'AWS_SDK_V3_MODULE#S3Client#', useValue: s3 },
        { provide: getRepositoryToken(UserSubscriptionEntity), useValue: {} },
      ],
    }).compile();

    service = module.get<CloudService>(CloudService);
  });

  it('should replace metadata for a file without renaming', async () => {
    const user = { id: 'user-id' } as any;

    // metadata replacement will call HeadObjectCommand (existing) then CopyObjectCommand
    // (replace) and finally HeadObjectCommand again for Find(). We'll return a
    // merged metadata set to simulate the post-update state.
    // Sequence: Head (for merge), CopyObject (replace), Head (Find)
    let headCall = 0;
    s3.send.mockImplementation((cmd: any) => {
      if (cmd instanceof HeadObjectCommand) {
        headCall++;
        if (headCall === 1) {
          // initial head -- no existing metadata
          return Promise.resolve({
            ContentType: 'text/plain',
            ContentLength: 42,
            Metadata: {},
            ETag: 'etag-1',
            LastModified: new Date(),
          });
        }
        // subsequent head (Find) should reflect merged metadata returned by S3
        return Promise.resolve({
          ContentType: 'text/plain',
          ContentLength: 42,
          Metadata: { foo: 'bar' },
          ETag: 'etag-1',
          LastModified: new Date(),
        });
      }
      if (cmd instanceof CopyObjectCommand) {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await service.Update(
      { Key: 'file.txt', Metadata: { foo: 'bar' } },
      user,
    );

    expect(s3.send).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.Name).toBe('file.txt');
    // metadata keys are decoded & pascalized by service and provided `foo` should be present
    expect(result.Metadata).toHaveProperty('Foo');
  });

  it('should rename object and optionally replace metadata', async () => {
    const user = { id: 'user-id' } as any;

    s3.send.mockImplementation((cmd: any) => {
      if (cmd instanceof CopyObjectCommand) {
        return Promise.resolve({});
      }
      if (cmd instanceof DeleteObjectCommand) {
        return Promise.resolve({});
      }
      if (cmd instanceof HeadObjectCommand) {
        return Promise.resolve({
          ContentType: 'image/png',
          ContentLength: 1024,
          Metadata: { originalfilename: 'photo.png', k: 'v' },
          ETag: 'etag-2',
          LastModified: new Date(),
        });
      }
      return Promise.resolve({});
    });

    const result = await service.Update(
      { Key: 'folder/old.png', Name: 'new.png', Metadata: { k: 'v' } },
      user,
    );

    expect(s3.send).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.Name).toBe('new.png');
    expect(result.Path.Key).toBe('folder/new.png');
    expect(result.Metadata).toHaveProperty('Originalfilename');
    expect(result.Metadata).toHaveProperty('K');
  });

  it('should send CopyObject with merged metadata (diagnostic test)', async () => {
    const user = { id: '057194e2-9fce-4125-b1fc-1a87d20d1d27' } as any;

    let copyCmd: any = null;

    s3.send.mockImplementation((cmd: any) => {
      if (cmd instanceof HeadObjectCommand) {
        // initial head returns existing metadata with only originalfilename
        return Promise.resolve({
          ContentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ContentLength: 21173,
          Metadata: { originalfilename: 'LeaveCardImportGuncel.xlsx' },
          ETag: 'etag-1',
          LastModified: new Date(),
        });
      }

      if (cmd instanceof CopyObjectCommand) {
        copyCmd = cmd;
        // simulate CopyObject success
        return Promise.resolve({});
      }

      // subsequent Head (Find) - simulate S3 not having merged metadata (buggy provider)
      if (cmd instanceof HeadObjectCommand) {
        return Promise.resolve({
          ContentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ContentLength: 21173,
          Metadata: { originalfilename: 'LeaveCardImportGuncel.xlsx' },
          ETag: 'etag-1',
          LastModified: new Date(),
        });
      }

      return Promise.resolve({});
    });

    const payload = {
      Key: 'LeaveCardImportGuncel.xlsx',
      Name: 'LeaveCardImportGuncel.xlsx',
      Metadata: {
        Originalfilename: 'LeaveCardImportGuncel.xlsx',
        zort: 'cort',
      },
    };

    // Simulate copy succeeded but provider ignored metadata - subsequent Head won't have 'zort'.
    // The code should detect this and fall back to GetObject + PutObject which we mock
    let putCmd: any = null;

    // Adjust implementation to simulate the sequence
    s3.send.mockImplementation((cmd: any) => {
      if (cmd instanceof HeadObjectCommand) {
        return Promise.resolve({
          ContentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ContentLength: 21173,
          Metadata: { originalfilename: 'LeaveCardImportGuncel.xlsx' },
          ETag: 'etag-1',
          LastModified: new Date(),
        });
      }

      if (cmd instanceof CopyObjectCommand) {
        copyCmd = cmd;
        // Copy succeeds
        return Promise.resolve({});
      }

      if (cmd instanceof GetObjectCommand) {
        // Simulate returning a small Readable stream body
        return Promise.resolve({
          Body: Readable.from([Buffer.from('filecontent')]),
        } as any);
      }

      if (cmd instanceof PutObjectCommand) {
        putCmd = cmd;
        return Promise.resolve({});
      }

      return Promise.resolve({});
    });

    await service.Update(payload, user);

    // The code should call CopyObject with merged metadata that includes 'zort' key
    expect(copyCmd).not.toBeNull();
    expect(copyCmd.input.Metadata).toHaveProperty('zort');

    // Since we simulated provider not persisting metadata, code should fallback to PutObject
    expect(putCmd).not.toBeNull();
    expect(putCmd.input.Metadata).toHaveProperty('zort');
  });

  it('should return sliced directories using skip/take', async () => {
    const user = { id: 'user-id' } as any;

    // Prepare two pages of common prefixes, simulating paged S3 responses
    const page1 = {
      CommonPrefixes: [{ Prefix: 'user-id/a/' }, { Prefix: 'user-id/b/' }],
      IsTruncated: true,
      NextContinuationToken: 'token-1',
    } as any;

    const page2 = {
      CommonPrefixes: [{ Prefix: 'user-id/c/' }, { Prefix: 'user-id/d/' }],
      IsTruncated: false,
      NextContinuationToken: undefined,
    } as any;

    let call = 0;
    s3.send.mockImplementation((cmd: any) => {
      if (cmd instanceof ListObjectsV2Command) {
        const prefix = cmd.input?.Prefix;
        if (prefix === 'user-id/') {
          call++;
          return Promise.resolve(call === 1 ? page1 : page2);
        }
        return Promise.resolve({ Contents: [], IsTruncated: false });
      }
      return Promise.resolve({});
    });

    const result = await service.ListDirectories(
      { Path: '', Delimiter: true, search: '', skip: 1, take: 2 },
      user,
    );

    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0].Prefix).toBe('b');
    expect(result[1].Prefix).toBe('c');
  });

  it('should return sliced objects using skip/take', async () => {
    const user = { id: 'user-id' } as any;

    const page1 = {
      Contents: [
        { Key: 'user-id/a.txt', Size: 1 },
        { Key: 'user-id/b.txt', Size: 2 },
      ],
      IsTruncated: true,
      NextContinuationToken: 'token-1',
    } as any;

    const page2 = {
      Contents: [
        { Key: 'user-id/c.txt', Size: 3 },
        { Key: 'user-id/d.txt', Size: 4 },
      ],
      IsTruncated: false,
    } as any;

    let call = 0;
    s3.send.mockImplementation((cmd: any) => {
      const name = cmd.constructor.name;
      if (name === 'ListObjectsV2Command') {
        call++;
        return Promise.resolve(call === 1 ? page1 : page2);
      }
      return Promise.resolve({});
    });

    const list = await service.ListObjects(
      {
        Path: '',
        Delimiter: false,
        IsMetadataProcessing: false,
        search: '',
        skip: 1,
        take: 2,
      },
      user,
    );

    expect(list.length).toBe(2);
    expect(list[0].Name).toBe('b.txt');
    expect(list[1].Name).toBe('c.txt');
  });
});

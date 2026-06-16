import { SecureFoldersToExcludeForScan } from './cloud.utils';

describe('SecureFoldersToExcludeForScan', () => {
  const secure = new Set(['Secret', 'Secret/Inner', 'Photos', 'Work/Private']);

  it('keeps ALL secure folders excluded for a root scan (empty path)', () => {
    expect([...SecureFoldersToExcludeForScan(secure, '')].sort()).toEqual(
      ['Photos', 'Secret', 'Secret/Inner', 'Work/Private'].sort(),
    );
  });

  it('does NOT exclude the folder being explicitly scanned', () => {
    // Scanning "Secret" directly → "Secret" itself must be includable.
    const result = SecureFoldersToExcludeForScan(secure, 'Secret');
    expect(result.has('Secret')).toBe(false);
    // Other secure folders elsewhere stay excluded…
    expect(result.has('Photos')).toBe(true);
    expect(result.has('Work/Private')).toBe(true);
    // …and a separately-secured folder NESTED below the scan root stays excluded.
    expect(result.has('Secret/Inner')).toBe(true);
  });

  it('does NOT exclude an ANCESTOR of the scan root (scanning inside a secure folder)', () => {
    // Scanning "Secret/Inner/Deep" — both ancestors "Secret" and "Secret/Inner"
    // must be includable, otherwise the whole scan returns nothing.
    const result = SecureFoldersToExcludeForScan(secure, 'Secret/Inner/Deep');
    expect(result.has('Secret')).toBe(false);
    expect(result.has('Secret/Inner')).toBe(false);
    expect(result.has('Photos')).toBe(true);
  });

  it('tolerates leading/trailing slashes on the scan path', () => {
    const result = SecureFoldersToExcludeForScan(secure, '/Secret/');
    expect(result.has('Secret')).toBe(false);
  });

  it('does not treat a name-prefix as an ancestor (Secret vs SecretArchive)', () => {
    const folders = new Set(['Secret']);
    // Scanning "SecretArchive" must NOT drop "Secret" (it is not an ancestor).
    expect(SecureFoldersToExcludeForScan(folders, 'SecretArchive').has('Secret')).toBe(
      true,
    );
  });
});

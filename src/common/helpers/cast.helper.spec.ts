import { KeyCombiner } from './cast.helper';

describe('KeyCombiner', () => {
  it('removes trailing slashes and returns a single segment with trailing slash if no extension', () => {
    const input = ['057194e2-9fce-4125-b1fc-1a87d20d1d27//'];
    expect(KeyCombiner(input)).toBe('057194e2-9fce-4125-b1fc-1a87d20d1d27/');
  });

  it('joins segments with a single slash and trims edges (adds trailing slash when last segment has no extension)', () => {
    const input = ['folder/', '/file'];
    expect(KeyCombiner(input)).toBe('folder/file/');
  });

  it('handles multiple segments with extra slashes', () => {
    const input = ['/a/', '/b//', 'c'];
    expect(KeyCombiner(input)).toBe('a/b/c/');
  });

  it('ignores empty segments and lone slashes', () => {
    const input = ['', '/'];
    expect(KeyCombiner(input)).toBe('');
  });

  it('preserves internal double slashes (e.g., urls) but trims boundaries', () => {
    const input = ['http://example.com/', '/api'];
    expect(KeyCombiner(input)).toBe('http://example.com/api/');
  });

  it('keeps file extension paths intact and does not append a trailing slash', () => {
    const input = ['folder', 'file.txt'];
    expect(KeyCombiner(input)).toBe('folder/file.txt');
  });
});

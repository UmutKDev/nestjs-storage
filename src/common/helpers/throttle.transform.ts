import { Transform, TransformCallback } from 'stream';

/**
 * Very small throttling Transform stream.
 * It attempts to enforce an approximate bytes-per-second cap.
 * This implementation is intentionally simple and deterministic enough for
 * application-level throttling (not for precise network shaping).
 */
export class ThrottleTransform extends Transform {
  private readonly bytesPerSec: number;
  private bucket = 0;
  private lastRefill = Date.now();
  private readonly refillIntervalMs = 200; // refill frequently

  constructor(bytesPerSec: number) {
    super();
    this.bytesPerSec = Math.max(1, bytesPerSec || 1);
  }

  private refillTokens() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.lastRefill = now;
    // add tokens proportional to elapsed time
    this.bucket += (this.bytesPerSec * elapsed) / 1000;
    // cap at a small burst: allow up to bytesPerSec (1s) worth
    if (this.bucket > this.bytesPerSec) this.bucket = this.bytesPerSec;
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, cb: TransformCallback) {
    const pushPortion = () => {
      this.refillTokens();
      if (this.bucket <= 0) {
        // schedule later
        setTimeout(pushPortion, this.refillIntervalMs);
        return;
      }

      const allowed = Math.floor(Math.min(this.bucket, chunk.length));
      if (allowed <= 0) {
        setTimeout(pushPortion, this.refillIntervalMs);
        return;
      }

      const portion = chunk.slice(0, allowed);
      const rest = chunk.slice(allowed);

      this.bucket -= allowed;

      // push portion. If push returns false we'll still continue, Node will handle backpressure.
      this.push(portion);

      if (rest.length > 0) {
        // continue recursively when tokens exist
        if (this.bucket <= 0) {
          setTimeout(
            () => this._transform(rest, encoding, cb),
            this.refillIntervalMs,
          );
        } else {
          // immediate process remainder
          this._transform(rest, encoding, cb);
        }
        return;
      }

      cb();
    };

    pushPortion();
  }

  _flush(cb: TransformCallback) {
    cb();
  }
}

export default ThrottleTransform;

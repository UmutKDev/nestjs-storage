// context.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { asyncLocalStorage } from './context.service';

export function RequestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  asyncLocalStorage.run(new Map(), () => {
    asyncLocalStorage.getStore()?.set('request', req);
    // Global olarak da sakla
    globalThis.currentRequest = req;
    next();
  });
}

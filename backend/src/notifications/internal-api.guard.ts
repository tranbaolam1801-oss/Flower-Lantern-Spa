import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

export const MIN_INTERNAL_KEY_LENGTH = 32;
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** Machine-to-machine auth for the scheduler (n8n): `Authorization: Bearer <INTERNAL_API_KEY>`. No cookies, no CSRF. Fails closed. */
@Injectable()
export class InternalApiGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_KEY ?? '';
    if (expected.length < MIN_INTERNAL_KEY_LENGTH) {
      this.logger.error(`INTERNAL_API_KEY is missing or shorter than ${MIN_INTERNAL_KEY_LENGTH} characters: internal endpoints are disabled.`);
      throw new UnauthorizedException();
    }
    const header = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>().headers.authorization;
    const match = typeof header === 'string' ? /^Bearer (.+)$/.exec(header) : null;
    // Equal-length SHA-256 digests: timingSafeEqual never sees different lengths and leaks nothing about the key.
    const equal = timingSafeEqual(digest(match?.[1] ?? ''), digest(expected));
    if (!match || !equal) throw new UnauthorizedException();
    return true;
  }
}

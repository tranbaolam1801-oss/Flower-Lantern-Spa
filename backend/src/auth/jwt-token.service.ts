import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from './auth.dto';

@Injectable()
export class JwtTokenService {
  private get secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
    return secret;
  }

  async signAsync(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    options?: { expiresIn?: string | number },
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const signOptions: jwt.SignOptions = {
        algorithm: 'HS256', issuer: 'flower-lantern-spa', audience: 'spa-web',
        expiresIn: (options?.expiresIn as jwt.SignOptions['expiresIn']) ?? '7d',
      };
      jwt.sign(payload, this.secret, signOptions, (err, token) => {
        if (err || !token) reject(err);
        else resolve(token);
      });
    });
  }

  async verifyAsync<T extends object = JwtPayload>(token: string): Promise<T> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, this.secret, { algorithms: ['HS256'], issuer: 'flower-lantern-spa', audience: 'spa-web' }, (err, decoded) => {
        if (err || !decoded) reject(err);
        else resolve(decoded as T);
      });
    });
  }
}

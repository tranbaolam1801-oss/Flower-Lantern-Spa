import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';
export function setup(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173';
      if (req.headers['x-spa-request'] !== '1' || (req.headers.origin && req.headers.origin !== origin)) {
        res.status(403).json({ message: 'Yêu cầu không hợp lệ.' });
        return;
      }
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.enableCors({origin:process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173',credentials:true});
}

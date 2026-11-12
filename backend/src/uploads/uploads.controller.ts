import { BadRequestException, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Req, Res, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
import { CONTENT_TYPE_BY_EXTENSION, detectImageExtension, IMAGE_FILE_PATTERN, IMAGE_MIME_TYPES, IMAGE_STORAGE, ImageExtension, ImageStorage, MAX_IMAGE_BYTES } from './image-storage';

export const IMAGE_ERROR = 'Hình ảnh không hợp lệ!';

@ApiExcludeController()
@Controller()
export class UploadsController {
  constructor(@Inject(IMAGE_STORAGE) private readonly storage: ImageStorage) {}

  /** Body is the raw image (parsed by express.raw scoped to this route in setup.ts). */
  @Post('admin/services/image') @HttpCode(201) @UseGuards(AuthGuard, RolesGuard) @Roles('Quản lý') @Permissions('Q04')
  async upload(@Req() req: Request) {
    const declared = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(declared)) throw new UnsupportedMediaTypeException(IMAGE_ERROR);
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) throw new BadRequestException(IMAGE_ERROR);
    const extension = detectImageExtension(body);
    if (!extension || CONTENT_TYPE_BY_EXTENSION[extension] !== declared) throw new BadRequestException(IMAGE_ERROR);
    const fileName = await this.storage.save(body, extension);
    return { path: `/api/uploads/services/${fileName}` };
  }

  /** Public, read-only. Names are unguessable and immutable, so responses are cacheable. */
  @Get('uploads/services/:file')
  async read(@Param('file') file: string, @Res() res: Response) {
    if (!IMAGE_FILE_PATTERN.test(file)) throw new NotFoundException();
    const bytes = await this.storage.read(file);
    if (!bytes) throw new NotFoundException();
    res.setHeader('Content-Type', CONTENT_TYPE_BY_EXTENSION[file.split('.')[1] as ImageExtension]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(bytes);
  }
}

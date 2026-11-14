import { Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { JwtPayload } from '../auth/auth.dto';
import { CONTENT_TYPE_BY_EXTENSION, IMAGE_FILE_PATTERN, ImageExtension } from '../uploads/image-storage';
import { UpdateProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';

type WithUser = Request & { user?: JwtPayload };

/** Self-service profile. The account is ALWAYS the authenticated one (JWT/session); no id is ever read from the request. */
@ApiExcludeController()
@Controller()
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('me') @UseGuards(AuthGuard)
  async me(@Req() req: WithUser) { return { success: true, profile: await this.profile.get(req.user!) }; }

  @Patch('me') @UseGuards(AuthGuard)
  async update(@Req() req: WithUser, @Body() dto: UpdateProfileDto) { return { success: true, profile: await this.profile.update(req.user!, dto) }; }

  /** Raw image body (express.raw scoped to this route in setup.ts). */
  @Post('me/avatar') @HttpCode(201) @UseGuards(AuthGuard)
  async avatar(@Req() req: WithUser) {
    const declared = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    return { success: true, ...(await this.profile.setAvatar(req.user!, declared, req.body)) };
  }

  /** Names are random 128-bit values and immutable (a new upload gets a new name), so responses are cacheable. */
  @Get('uploads/avatars/:file')
  async read(@Param('file') file: string, @Res() res: Response) {
    if (!IMAGE_FILE_PATTERN.test(file)) throw new NotFoundException();
    const bytes = await this.profile.readAvatar(file);
    if (!bytes) throw new NotFoundException();
    res.setHeader('Content-Type', CONTENT_TYPE_BY_EXTENSION[file.split('.')[1] as ImageExtension]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(bytes);
  }
}

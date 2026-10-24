import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { McpHttpHandler } from './mcp-http-handler.js';

@Controller('mcp')
export class McpController {
  constructor(
    @Inject(McpHttpHandler) private readonly handler: McpHttpHandler,
  ) {}

  @All()
  async handle(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.handler.handle(request, response);
  }
}

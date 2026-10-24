import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import {
  toNodeHandler,
  type NodeMcpRequestHandler,
} from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
  type McpHandlerRequestOptions,
  type McpHttpHandler as SdkMcpHttpHandler,
} from '@modelcontextprotocol/server';
import type { Request, Response } from 'express';

import { McpServerFactory } from './mcp-server-factory.js';

@Injectable()
export class McpHttpHandler implements BeforeApplicationShutdown {
  private readonly logger = new Logger(McpHttpHandler.name);
  private readonly sdkHandler: SdkMcpHttpHandler;
  private readonly nodeHandler: NodeMcpRequestHandler;

  constructor(@Inject(McpServerFactory) serverFactory: McpServerFactory) {
    this.sdkHandler = createMcpHandler(() => serverFactory.create(), {
      onerror: (error) => this.logTransportError(error),
    });

    const securedHandler = {
      fetch: async (
        request: globalThis.Request,
        options?: McpHandlerRequestOptions,
      ) => {
        const rejection =
          hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
          originValidationResponse(request, localhostAllowedOrigins());

        return rejection ?? this.sdkHandler.fetch(request, options);
      },
    };

    this.nodeHandler = toNodeHandler(securedHandler, {
      onerror: (error) => this.logTransportError(error),
    });
  }

  async handle(request: Request, response: Response): Promise<void> {
    await this.nodeHandler(request, response, request.body);
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.sdkHandler.close();
  }

  private logTransportError(error: Error): void {
    this.logger.error('MCP transport request failed', error.stack);
  }
}

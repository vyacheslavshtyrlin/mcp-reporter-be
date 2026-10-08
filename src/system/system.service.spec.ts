import { Test, type TestingModule } from '@nestjs/testing';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

describe('SystemModule', () => {
  let controller: SystemController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [SystemService],
    }).compile();

    controller = module.get(SystemController);
  });

  it('returns the service health', () => {
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'mcp-reporter-be',
    });
  });
});

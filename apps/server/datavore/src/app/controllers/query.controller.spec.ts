import { QueryController } from './query.controller';

describe('QueryController export jsonl', () => {
  it('returns structured JSON error for export failures before headers', async () => {
    const tableService = {
      streamQueryAsJsonl: jest.fn().mockRejectedValue(new Error('boom')),
      executeQuery: jest.fn(),
      cancelQuery: jest.fn(),
    };
    const controller = new QueryController({} as any, tableService as any);

    const req = {
      on: jest.fn(),
      off: jest.fn(),
    } as any;

    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      status,
    } as any;

    await controller.exportJsonl({ query: 'select 1', queryId: 'exp-1' }, req, res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'internal_error',
        message: 'boom',
      }),
    );
  });

  it('invokes stream service and does not write error response on success', async () => {
    const tableService = {
      streamQueryAsJsonl: jest.fn().mockResolvedValue({ rowCount: 1 }),
      executeQuery: jest.fn(),
      cancelQuery: jest.fn(),
    };
    const controller = new QueryController({} as any, tableService as any);

    const req = {
      on: jest.fn(),
      off: jest.fn(),
    } as any;

    const status = jest.fn();
    const res = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      status,
    } as any;

    await controller.exportJsonl({ query: 'select 1', queryId: 'exp-2' }, req, res);

    expect(tableService.streamQueryAsJsonl).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
});

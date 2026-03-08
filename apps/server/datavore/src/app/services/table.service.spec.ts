import { QueryExportError, TableService, sanitizeJsonlFilename } from './table.service';

describe('TableService export utilities', () => {
  it('sanitizes filename and enforces jsonl extension', () => {
    expect(sanitizeJsonlFilename('../unsafe/../file name')).toMatch(/\.jsonl$/);
    expect(sanitizeJsonlFilename('../unsafe/../file name')).not.toContain('/');
    expect(sanitizeJsonlFilename('report.JSONL')).toBe('report.jsonl');
    expect(sanitizeJsonlFilename('')).toMatch(/\.jsonl$/);
  });

  it('rejects non-select exports before streaming', async () => {
    const service = new TableService({} as any, {} as any);

    await expect(
      service.streamQueryAsJsonl(
        {} as any,
        {} as any,
        {
          query: 'DELETE FROM users',
          queryId: 'exp-1',
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'bad_request',
        status: 400,
      }),
    );
  });
});

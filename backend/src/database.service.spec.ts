import { ServiceUnavailableException } from '@nestjs/common';

const initializeMock = jest.fn();

jest.mock('typeorm', () => {
  const actual = jest.requireActual('typeorm');
  return {
    ...actual,
    DataSource: jest.fn().mockImplementation(() => ({ initialize: initializeMock, isInitialized: true })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseService } = require('./database.service');

describe('DatabaseService cold-start retry (serverless database resume)', () => {
  const baseEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...baseEnv, DATABASE_URL: 'postgres://app:x@ep-demo-pooler.neon.tech/spa' };
    delete process.env.DB_CONNECT_RETRIES;
    delete process.env.DB_CONNECT_RETRY_DELAY_MS;
  });

  afterAll(() => {
    process.env = baseEnv;
  });

  it('does not retry by default (DB_CONNECT_RETRIES unset)', async () => {
    initializeMock.mockRejectedValueOnce(new Error('ETIMEOUT'));
    const service = new DatabaseService();
    await expect(service.getDataSource()).rejects.toThrow();
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it('retries the configured number of times with backoff, then succeeds', async () => {
    process.env.DB_CONNECT_RETRIES = '2';
    process.env.DB_CONNECT_RETRY_DELAY_MS = '0';
    initializeMock
      .mockRejectedValueOnce(new Error('ETIMEOUT (database resuming)'))
      .mockRejectedValueOnce(new Error('ETIMEOUT (database resuming)'))
      .mockResolvedValueOnce({ isInitialized: true });
    const service = new DatabaseService();
    const source = await service.getDataSource();
    expect(source).toEqual({ isInitialized: true });
    expect(initializeMock).toHaveBeenCalledTimes(3);
  });

  it('gives up and throws the last error once retries are exhausted', async () => {
    process.env.DB_CONNECT_RETRIES = '1';
    process.env.DB_CONNECT_RETRY_DELAY_MS = '0';
    initializeMock.mockRejectedValue(new Error('ETIMEOUT'));
    const service = new DatabaseService();
    await expect(service.getDataSource()).rejects.toThrow('ETIMEOUT');
    expect(initializeMock).toHaveBeenCalledTimes(2);
  });

  it('query() never leaks the driver error to the caller', async () => {
    process.env.DB_CONNECT_RETRIES = '0';
    initializeMock.mockRejectedValueOnce(new Error('Login failed for user'));
    const service = new DatabaseService();
    await expect(service.query('SELECT 1')).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws 503 when no DB env is configured at all', async () => {
    delete process.env.DATABASE_URL;
    const service = new DatabaseService();
    await expect(service.getDataSource()).rejects.toThrow(ServiceUnavailableException);
    expect(initializeMock).not.toHaveBeenCalled();
  });
});

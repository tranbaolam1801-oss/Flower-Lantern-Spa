import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './config';

const sqlDescribe = process.env.RUN_SQL_INTEGRATION === '1' ? describe : describe.skip;
sqlDescribe('read-only entity mapping audit against approved SQL migrations', () => {
  let source: DataSource;
  beforeAll(async () => {
    if (process.env.DB_NAME !== 'FlowerLanternSpa_Test') throw new Error('Dedicated test database required');
    const options = databaseOptions(process.env); if (!options) throw new Error('SQL configuration required');
    source = await new DataSource(options).initialize();
  },30000);
  afterAll(async () => { if (source?.isInitialized) await source.destroy(); });
  it('matches all 16 entity tables and every physical column type, length, nullability and primary key', async () => {
    const runner = source.createQueryRunner();
    try {
      const tables = await runner.getTables(source.entityMetadatas.map(m => `dbo.${m.tableName}`));
      expect(tables).toHaveLength(16);
      for (const metadata of source.entityMetadatas) {
        const table = tables.find(t => t.name.split('.').pop()===metadata.tableName)!;
        expect(table.columns).toHaveLength(metadata.columns.length);
        for (const column of metadata.columns) {
          const actual = table.columns.find(c=>c.name===column.databaseName)!;
          expect({table:metadata.tableName,column:column.databaseName,type:actual.type,nullable:actual.isNullable,primary:actual.isPrimary})
            .toEqual({table:metadata.tableName,column:column.databaseName,type:source.driver.normalizeType(column),nullable:column.isNullable,primary:column.isPrimary});
          if (column.length) expect(actual.length.toLowerCase()).toBe(column.length.toLowerCase());
        }
      }
    } finally { await runner.release(); }
  });
  it('matches every relationship and preserves historical rows using NO ACTION', async () => {
    const runner = source.createQueryRunner();
    try {
      const tables = await runner.getTables(source.entityMetadatas.map(m=>`dbo.${m.tableName}`));
      for (const metadata of source.entityMetadatas) {
        const table = tables.find(t=>t.name.split('.').pop()===metadata.tableName)!;
        expect(table.foreignKeys).toHaveLength(metadata.foreignKeys.length);
        for (const fk of metadata.foreignKeys) {
          const actual = table.foreignKeys.find(k=>k.columnNames.join()===fk.columnNames.join())!;
          expect(actual.referencedTableName.split('.').pop()).toBe(fk.referencedEntityMetadata.tableName);
          expect(actual.referencedColumnNames).toEqual(fk.referencedColumnNames);
          expect(actual.onDelete).toBe(fk.onDelete ?? 'NO ACTION');
        }
      }
    } finally { await runner.release(); }
  });
});

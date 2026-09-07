# @identizen/db

Drizzle schema, migrations and typed queries for the Identizen index (Postgres). Used by
`@identizen/index`; a host that embeds the index can run its own migrations after ours:

```ts
import { createDb, migrateDb, resolveMigrationsDir } from '@identizen/db';
const { db, close } = createDb(process.env.DATABASE_URL!);
await migrateDb(db, [resolveMigrationsDir(), './my-migrations']);
await close();
```

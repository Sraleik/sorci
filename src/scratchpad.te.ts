import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "testcontainers";
import postgres, { Sql } from "postgres";
import { createCourseCreated, createCourseRenamed } from "./test-helpers";

let pgInstance: StartedPostgreSqlContainer;
let sql: Sql;

beforeAll(async () => {
  const pgInstanceNotReady = new PostgreSqlContainer("postgres:15.3-alpine");
  pgInstance = await pgInstanceNotReady
    .withExposedPorts({ container: 5432, host: 42420 }) // Usefull for debugging
    .withReuse() // The docker won't be removed after the test
    .start();
  const host = pgInstance.getHost();
  const port = pgInstance.getPort();
  const user = pgInstance.getUsername();
  const password = pgInstance.getPassword();
  const databaseName = pgInstance.getDatabase();

  sql = postgres({
    host,
    port,
    database: databaseName,
    username: user,
    password,
    onnotice(notice) {
      // simple notice of already existing table, index, relation
      if (notice.code === "42P07") return;
      console.log(notice);
    }
  });
}, 30000);

const tableName = "events";

beforeEach(async () => {
  // await sql.begin(async (sql) => {
  //   const currentTableIdentifier = sql(tableName);
  //   const isUuidExtensionLoaded = !!(
  //     await sql`SELECT * FROM pg_extension WHERE extname = 'uuid-ossp'`
  //   ).length;
  //   if (!isUuidExtensionLoaded) {
  //     await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  //   }
  //   await sql`
  //       CREATE TABLE IF NOT EXISTS ${currentTableIdentifier} (
  //         id char(26) PRIMARY KEY,
  //         type text NOT NULL,
  //         data JSONB NOT NULL,
  //         identifier JSONB NOT NULL,
  //         timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  //       );
  //     `;
  //   await sql`
  //       CREATE INDEX IF NOT EXISTS ${sql(`${tableName}_type_index`)}
  //       ON ${currentTableIdentifier} USING btree ("type");
  //     `;
  //   await sql`
  //       CREATE INDEX IF NOT EXISTS ${sql(`${tableName}_identifier_index`)}
  //       ON ${currentTableIdentifier} USING gin ("identifier");
  //     `;
  // });
  // const courseRenamed = createCourseRenamed({
  //   courseId: "01HX9WR2FZT064TFX0SY844MJH",
  //   oldName: "Osef"
  // });
  // const res = (await sql`
  //     INSERT INTO ${sql(tableName)} ${sql([
  //       courseRenamed.toPlain()
  //     ])} RETURNING id
  //   `) as Array<{ id: string }>;
});

afterEach(async () => {
  // await sql`
  //   DROP TABLE IF EXISTS ${sql(tableName)}
  // `;
});

afterAll(async () => {
  // await sorci.dropAllTestStream({ excludeCurrentStream: true });
  // await pgInstance.stop();
});

it("should insert a new event", async () => {
  const rawRes = sql.begin(async (sqlBis) => {
    await sqlBis`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;

    const lastId = await sqlBis`
        SELECT id as last_event_identifier
        FROM events 
				WHERE type = 'course-created'
        ORDER BY id DESC 
        LIMIT 1;
  		`;

    const courseCreated = createCourseCreated();
    const res = await sqlBis`
      INSERT INTO ${sql(tableName)} ${sql([
        courseCreated.toPlain()
      ])} RETURNING id
    `;

    return lastId[0].last_event_identifier;
  });

  const rawRes2 = sql.begin(async (sqlBis) => {
    await sqlBis`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;

    const lastId = await sqlBis`
        SELECT id as last_event_identifier
        FROM events 
				WHERE type = 'course-renamed'
        ORDER BY id DESC 
        LIMIT 1;
  		`;

    const courseRenamed = createCourseRenamed({
      courseId: "01HX9WWDXXY87CFCHG24RECC38",
      oldName: "Osef"
    });
    const res = await sqlBis`
      INSERT INTO ${sql(tableName)} ${sql([
        courseRenamed.toPlain()
      ])} RETURNING id
    `;

    return res[0].id;
  });

  const [res, res2] = await Promise.all([rawRes, rawRes2]);
  console.log("🚀 ~ file: scratchpad.test.ts:105 ~ res ~ res:", res);
  console.log("🚀 ~ file: scratchpad.test.ts:105 ~ res ~ res:", res2);

  expect(true).toBe(true);
});

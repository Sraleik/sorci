import { beforeAll, afterAll, inject, vi } from "vitest";
import { SorciPostgres } from "./src/sorci.postgres";
import { type Sorci } from "./src/sorci.interface";
import { TodoListBuilder } from "./src/builder/todo-list.builder";
import { TodoListItemBuilder } from "./src/builder/todo-list-item.builer";
import { UserBuilder } from "./src/builder/user.builder";
import { CompanyBuilder } from "./src/builder/company.builder";
import * as sorciPostgres from "./src/sorci.postgres";
import "./test-matchers";

let sorci: Sorci;

beforeAll(async () => {
  // console.log("Initializing Sorci...");
  const host = inject("host");
  const port = inject("port");
  const user = inject("user");
  const password = inject("password");
  const databaseName = inject("databaseName");

  const buildAdvisoryLocksSpy = vi.spyOn(sorciPostgres, "buildAdvisoryLocks");

  sorci = new SorciPostgres({
    host,
    port,
    user,
    password,
    databaseName,
    streamName: "useless_stream_name",
    buildAdvisoryLocks: buildAdvisoryLocksSpy
  });

  await sorci.setupTestStream();

  const aUser = () => new UserBuilder({ sorci });
  const aCompany = () => new CompanyBuilder({ sorci });
  const aTodoList = () => new TodoListBuilder({ sorci, aUser });
  const aTodoListItem = () => new TodoListItemBuilder({ sorci, aTodoList });

  globalThis.sorciTestClient = sorci;
  globalThis.aUser = aUser;
  globalThis.aTodoList = aTodoList;
  globalThis.aTodoListItem = aTodoListItem;
  globalThis.aCompany = aCompany;
  globalThis.buildAdvisoryLocksSpy = buildAdvisoryLocksSpy;
}, 60_000);

afterAll(async () => {
  // console.log("Stopping Sorci...");
  await sorci.dropCurrentStream();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await sorci.close();
});

import type { UserBuilder } from "./src/builder/user.builder";
import type { TodoListBuilder } from "./src/builder/todo-list.builder";
import type { TodoListItemBuilder } from "./src/builder/todo-list-item.builer";
import type { CompanyBuilder } from "./src/builder/company.builder";
import type { Sorci } from "./src/sorci.interface";
import type { SpyInstance } from "vitest";

declare module "vitest" {
  interface ProvidedContext {
    host: string;
    port: number;
    user: string;
    password: string;
    databaseName: string;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var sorciTestClient: Sorci;
  // eslint-disable-next-line no-var
  var aUser: () => UserBuilder;
  // eslint-disable-next-line no-var
  var aTodoList: () => TodoListBuilder;
  // eslint-disable-next-line no-var
  var aTodoListItem: () => TodoListItemBuilder;
  // eslint-disable-next-line no-var
  var aCompany: () => CompanyBuilder;
  // eslint-disable-next-line no-var
  var buildAdvisoryLocksSpy: SpyInstance;
}

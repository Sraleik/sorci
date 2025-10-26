import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

let pgInstance: StartedPostgreSqlContainer;

export async function setup(project: TestProject) {
  // console.log("Initializing database...");
  pgInstance = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("test_db")
    .withUsername("test_user")
    .withPassword("test_password")
    .withReuse()
    .withAutoRemove(false)
    .start();

  project.provide("host", pgInstance.getHost());
  project.provide("port", pgInstance.getPort());
  project.provide("user", pgInstance.getUsername());
  project.provide("password", pgInstance.getPassword());
  project.provide("databaseName", pgInstance.getDatabase());

  //return the teardown function
  return async () => {
    // console.log("Stopping database...");
    await pgInstance.stop();
  };
}

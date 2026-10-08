import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import postgres from "postgres";

// No Docker on rise: fall back to the local Postgres cluster instead of a
// testcontainer, isolated in its own throwaway database.
// Password content is irrelevant (socket "peer" auth ignores it), but it must
// be truthy: SorciPostgres.isSorciConstructorPayload rejects an empty string
// and silently falls back to an unconfigured TCP connection string.
const LOCAL_FALLBACK = {
  host: "/var/run/postgresql",
  port: 5432,
  user: process.env.USER ?? "postgres",
  password: "unused-local-peer-auth"
};

export async function setup(project: TestProject) {
  try {
    const pgInstance: StartedPostgreSqlContainer =
      await new PostgreSqlContainer("postgres:18-alpine")
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

    return async () => {
      await pgInstance.stop();
    };
  } catch {
    const databaseName = `sorci_test_${process.pid}`;
    const admin = postgres({ ...LOCAL_FALLBACK, database: "postgres" });
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    await admin.end();

    project.provide("host", LOCAL_FALLBACK.host);
    project.provide("port", LOCAL_FALLBACK.port);
    project.provide("user", LOCAL_FALLBACK.user);
    project.provide("password", LOCAL_FALLBACK.password);
    project.provide("databaseName", databaseName);

    return async () => {
      const cleanup = postgres({ ...LOCAL_FALLBACK, database: "postgres" });
      await cleanup.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await cleanup.end();
    };
  }
}

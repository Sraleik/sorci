import { Selectors } from "@ubi2/core";
import { AnyBooleanPattern } from "@ubi2/toolkit";
import { Knex } from "knex";

export function addFilters(
  builder: Knex.QueryBuilder,
  filters: Selectors<string>
) {
  builder.where((whereBuilder) => {
    for (const selector of filters) {
      whereBuilder.orWhere("type" as any, "=", selector.type);
      if (selector.data) {
        buildQueryPattern(whereBuilder, [], selector.data);
      }
    }
  });
}

export function buildQueryPattern(
  builder: Knex.QueryBuilder,
  path: string[],
  pattern: AnyBooleanPattern
) {
  if (pattern && typeof pattern === "object") {
    const operator = Object.keys(pattern).shift();
    if (operator?.startsWith("$")) {
      const value = (pattern as any)[operator];
      switch (operator) {
        case "$in":
          {
            builder.whereRaw(
              `"data"${pathToArrow(path)} in (${value.map(() => "?").join()})`,
              [...path, ...value]
            );
          }
          break;
        case "$between":
          {
            builder.whereRaw(`"data"${pathToArrow(path)} between ? and ?`, [
              ...path,
              value[0],
              value[1]
            ]);
          }
          break;
        case "$contains":
          {
            builder.whereRaw(
              `"data"${pathToArrow(path)} like '%' || ? || '%'`,
              [...path, value]
            );
          }
          break;
        case "$regexp":
          {
            if ((value as RegExp).ignoreCase) {
              builder.whereRaw(`"data"${pathToArrow(path)} ~* ?`, [
                ...path,
                value.source
              ]);
            } else {
              builder.whereRaw(`"data"${pathToArrow(path)} ~ ?`, [
                ...path,
                value.source
              ]);
            }
          }
          break;
        case "$startsWith":
          {
            builder.whereRaw(`"data"${pathToArrow(path)} like ? || '%'`, [
              ...path,
              value
            ]);
          }
          break;
        case "$endsWith":
          {
            builder.whereRaw(`"data"${pathToArrow(path)} like '%' || ?`, [
              ...path,
              value
            ]);
          }
          break;
        case "$gt":
          {
            builder.whereRaw(`"data"${pathToArrow(path)} > ?`, [
              ...path,
              value
            ]);
          }
          break;
        case "$gte":
          {
            builder.whereRaw(`"data"${pathToArrow(path)} >= ?`, [
              ...path,
              value
            ]);
          }
          break;
        case "$lt":
          {
            builder.whereRaw(`"data"${pathToArrow(path)} < ?`, [
              ...path,
              value
            ]);
          }
          break;
        case "$lte":
          {
            builder.whereRaw(`"data"${pathToArrow(path)} <= ?`, [
              ...path,
              value
            ]);
          }
          break;
        case "$or":
          {
            builder.where((builder) => {
              for (const condition of value) {
                builder.orWhere((builder) => {
                  buildQueryPattern(builder, path, condition);
                });
              }
            });
          }
          break;
        case "$and":
          {
            builder.where((builder) => {
              for (const condition of value) {
                builder.andWhere((builder) => {
                  buildQueryPattern(builder, path, condition);
                });
              }
            });
          }
          break;
        case "$not":
          {
            builder.whereNot((builder) => {
              buildQueryPattern(builder, path, value);
            });
          }
          break;
      }
    } else {
      for (const field in pattern) {
        const value = (pattern as any)[field];
        switch (typeof value) {
          case "number":
          case "string":
            {
              builder.whereRaw(`"data"${pathToArrow([...path, field])} = ?`, [
                ...path,
                field,
                value
              ]);
            }
            break;
          default:
            {
              builder.where((builder) => {
                buildQueryPattern(builder, [...path, field], value);
              });
            }
            break;
        }
      }
    }
  }
}

export function pathToArrow(path: string[]) {
  return path.reduce(
    (accu, _, index) => `${accu}->${index === path.length - 1 ? ">" : ""}?`,
    ""
  );
}

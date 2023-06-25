<div align="center">
  <br/>
  <img src="./image/sorci.png" width="300" />
  <br/>
  <br/>
</div>

Library to do event sourcing while keeping the focus on events and not on aggregates.

Inspired by this talk: https://www.youtube.com/watch?v=0iP65Durhbs

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [API](#api)
- [Development](#development)
- [Testing](#testing)
- [Benchmark](#benchmark)

## Installation

### Npm

```bash
npm install sorci --save
```

### Yarn

```bash
yarn add sorci
```
## Usage

The idea was to be able to do Full Event Sourcing without the need of an event store.
So for now there is only one implementation of Sorci => SorciPostgres.
Maybe other implementation will be done later.

```typescript
import { SorciPostgres } from "sorci";

const host = "localhost";
const port = 54322;
const user = "postgres";
const password = "postgres";
const database = "postgres";
const streamName = "Your-Stream-Name";

const sorci = new SorciPostgres(
  host,
  port,
  user,
  password,
  database,
  streamName
);

// This will create everything needed to persist the events properly
await sorci.createStream();


// Small exemple of adding an Event with no impact (No concurrency issue)
await sorci.appendEvent({
  id: "0a19448ba362",
  type: "todo-item-created",
  data: {
    todoItemId: "0a19448ba362",
    text: "Create the Readme of Sorci.js",
  },
  identifier: {
    todoItemId: "0a19448ba362",
  },
});
```

## Features

The library create 2 tables:

* 1 writable
* 1 read-only

The writable table act as an append log. The read-only is a synchronize copy of the writable table.

### Why two tables ? 

It's a technical constraint. To make sure an event can be persisted the library completely lock the writable table.
Wich mean it's also unreadable during write. The read-only table allow read while event are beeing persisted.

## API

TODO

## Testing

Unit test are testing proper appending, specialy focus on concurrency issues.

```bash
yarn run test:unit
```

## Benchmark

TODO:

-  [ ] Fix the benchmark

Display perfomance on : 

* Simple Query
* Simple Insert (No concurrency guard in place) 
* Simple Append (No conccurrency issue)
* Complex Append (Make sure the event can be persisted)

```bash
yarn run vitest bench
```

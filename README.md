<div align="center">
  <br/>
  <img src="./image/sorci.png" width="300" />
  <br/>
  <br/>
  <p>
		Easy way to do full event sourcing without an event-store
  </p>
  <br/>
<div>

# Sorci.js

Libraray to do event sourcing while keeping the focus on event and not on aggregate

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [API](#api)
- [Examples](#examples)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Npm

```bash
npm install sorci --save
```

### Yarn

```bash
yarn add sorci
```

## Usage

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

// This will everything needed to persist the events properly
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

Describe the core features of the project/library.

Feature 1
Feature 2
Feature 3

## API

Detailed information about the API, preferably broken into sections for each module, class, method, etc. Include example usage for each as necessary.

Examples
More detailed examples on using this library in real world scenarios.

Development
Details about the setup for development purposes and how other developers can contribute to the project.

## Testing

Unit test are testing proper appending, specialy focus on concurrency issues.

```bash
yarn run test:unit
```

## Benchmark

TODO:

- [] Fix the benchmark

Display perfomance on : 

* Simple Query
* Simple Insert (No concurrency guard in place) 
* Simple Append (No conccurrency issue)
* Complex Append (Make sure the event can be persisted)

```bash
yarn run vitest bench
```

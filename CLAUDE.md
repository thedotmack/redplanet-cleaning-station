---
description: Rosbridge WebSocket client for MARS robot ROS2 control.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# Tripoli — MARS Robot Rosbridge Client

Rosbridge v2.0 WebSocket client for controlling MARS robots over ROS2.

## Usage

```sh
bun run src/repl.ts <robot-ip> [port]
```

## Architecture

- `src/rosbridge-client.ts` — Core WebSocket client (topics, services, actions, `executeSkill()`, `callGotoJS()`)
- `src/mars-topics.ts` — Topic/service/message constants, typed shapes, `SkillIds`, `ArmServices`
- `src/repl.ts` — Interactive REPL (`skill`, `goto_js`, `estop`, `cmd_vel`, etc.)
- `src/validate.ts` — Incremental robot validation tests (1-7)
- `index.ts` — Library entrypoint for programmatic use

## Robot Connection

- Known robot: 172.17.30.145
- Rosbridge server runs on port 9090 (default)
- Protocol: JSON-over-WebSocket with `op` field multiplexing
- SSH: `ssh jetson1@<ROBOT-IP>` (password: goodbot)
- Speed caps: 0.3 m/s linear, 1.0 rad/s angular

## Skill Execution

Use `client.executeSkill(skillType, inputs)` — NOT raw `sendActionGoal`. The fields are `skill_type` and `inputs` (JSON string), NOT `skill_id`/`parameters`.

```sh
# Validation tests (run in order, each must pass before the next):
bun run src/validate.ts 172.17.30.145 1  # Connection + discovery
bun run src/validate.ts 172.17.30.145 2  # head_emotion (safest skill)
bun run src/validate.ts 172.17.30.145 3  # GotoJS no-op (arm format check)
bun run src/validate.ts 172.17.30.145 4  # Small arm move
bun run src/validate.ts 172.17.30.145 5  # arm_move_to_xyz via skill
bun run src/validate.ts 172.17.30.145 6  # Drive + skill combined
bun run src/validate.ts 172.17.30.145 7  # Navigate via skill
```

---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

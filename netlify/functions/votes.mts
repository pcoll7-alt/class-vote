import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const PERIODS = ["pd1", "pd2", "pd4", "pd5", "pd7"] as const;
type Period = typeof PERIODS[number];

interface PeriodState {
  open: boolean;
  votes: { book: number; film: number };
}

type VoteState = Record<Period, PeriodState>;

function getVoteStore() {
  return getStore({ name: "votes", consistency: "strong" });
}

function defaultState(): VoteState {
  const s = {} as VoteState;
  for (const p of PERIODS) s[p] = { open: false, votes: { book: 0, film: 0 } };
  return s;
}

async function getState(store: ReturnType<typeof getVoteStore>): Promise<VoteState> {
  const data = await store.get("state", { type: "json" });
  if (!data) return defaultState();
  for (const p of PERIODS) {
    if (!data[p]) data[p] = { open: false, votes: { book: 0, film: 0 } };
  }
  return data as VoteState;
}

export default async (req: Request, _context: Context) => {
  const store = getVoteStore();
  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period");
  const period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : null;

  if (req.method === "GET") {
    const state = await getState(store);
    if (period) return Response.json(state[period]);
    return Response.json(state);
  }

  if (req.method === "POST") {
    if (!period) return Response.json({ error: "Invalid period" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const choice = body?.choice;
    if (choice !== "book" && choice !== "film") {
      return Response.json({ error: "Invalid choice" }, { status: 400 });
    }
    const state = await getState(store);
    if (!state[period].open) {
      return Response.json({ error: "Voting is closed" }, { status: 403 });
    }
    state[period].votes[choice as "book" | "film"]++;
    await store.setJSON("state", state);
    return Response.json({ success: true, votes: state[period].votes });
  }

  if (req.method === "PUT") {
    const adminPass = process.env["ADMIN_PASSWORD"] || "soto2026";
    const auth = req.headers.get("x-admin-password");
    if (auth !== adminPass) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!period) return Response.json({ error: "Invalid period" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const action = body?.action;
    const state = await getState(store);

    if (action === "open")       { state[period].open = true; }
    else if (action === "close") { state[period].open = false; }
    else if (action === "reset") { state[period] = { open: false, votes: { book: 0, film: 0 } }; }
    else { return Response.json({ error: "Invalid action" }, { status: 400 }); }

    await store.setJSON("state", state);
    return Response.json({ success: true, state: state[period] });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
};

export const config = {
  path: "/api/votes",
};
```

Also need **one more file** — **Add file → Create new file**:

Filename:
```
package.json

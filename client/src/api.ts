// Client RPC typé — remplace createActionClient de @hatch/space-sdk/client.
//
// Même protocole filaire qu'avant : POST ./actions avec { action, args },
// réponse { data } | { error }. Les types viennent directement de
// `server/src/actions.ts` — aucun codegen.
//
// `import type { Actions }` est type-only par design : le bundle client ne
// contient jamais le runtime serveur (bun:sqlite, APIs fichier, etc.).
// Avec `verbatimModuleSyntax: true`, oublier `type` est une erreur de compilation.

import type { z } from "zod";
import type { Actions } from "../../server/src/actions";

type ActionFn = (args: never) => Promise<unknown>;

/** Premier argument d'une action : `ApiRequest<typeof api, "getState">`. */
export type ApiRequest<C extends Record<string, ActionFn>, K extends keyof C> = Parameters<C[K]>[0];

/** Réponse d'une action : `ApiResponse<typeof api, "getState">`. */
export type ApiResponse<C extends Record<string, ActionFn>, K extends keyof C> = Awaited<ReturnType<C[K]>>;

type ActionClient<T extends Record<string, { request: z.ZodType; response: z.ZodType }>> = {
  [K in keyof T]: (args: z.infer<T[K]["request"]>) => Promise<z.infer<T[K]["response"]>>;
};

function resolveEndpoint(): string {
  const href = globalThis.location?.href;
  if (typeof href !== "string" || href.length === 0) return "./actions";
  const base = new URL(href);
  base.hash = "";
  base.search = "";
  return new URL("./actions", base).toString();
}

function createActionClient<T extends Record<string, (args: any) => Promise<any>>>(): T {
  const endpoint = resolveEndpoint();
  return new Proxy({} as T, {
    get(_target, name) {
      // Les clés Symbol et les noms du protocole Promise (then/catch/finally)
      // ne doivent JAMAIS devenir des actions fantômes : sinon `await client`
      // déclencherait un POST vers une action inexistante nommée "then".
      if (typeof name !== "string") return undefined;
      if (name === "then" || name === "catch" || name === "finally") return undefined;
      return async (args: unknown) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: name, args: args ?? {} }),
        });
        const body = (await response.json()) as { data?: unknown; error?: unknown };
        if (body && typeof body === "object" && "error" in body && body.error) {
          throw new Error(`action ${name} error: ${String(body.error)}`);
        }
        return body.data;
      };
    },
  });
}

export const api: ActionClient<typeof Actions> = createActionClient();

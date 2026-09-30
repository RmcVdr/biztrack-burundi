// Standalone runtime — remplace @hatch/space-sdk.
//
// Fournit exactement ce que `server/src/actions.ts` attendait du SDK :
//  - `defineAction({ request, response, handler })`
//  - `Ctx` avec `db` (instance Drizzle) et `invalidateQueries()`
//  - `ActionsModule` pour le contrôle `satisfies` en fin de module
//
// Aucune dépendance à l'environnement Muse : SQLite via bun:sqlite,
// validation via zod (dépendance directe du projet).

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import type { z } from "zod";

export function createDb(path: string) {
  const sqlite = new Database(path);
  // Active les clés étrangères (nécessaire pour les ON DELETE CASCADE du schéma)
  sqlite.exec("PRAGMA foreign_keys = ON;");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export type Db = ReturnType<typeof createDb>["db"];

export interface Ctx {
  readonly db: Db;
  /** Dans l'environnement Muse, ceci notifiait les clients connectés.
   *  En standalone, le client invalide lui-même ses requêtes après chaque
   *  mutation (voir App.tsx `refresh()`), donc c'est un no-op conservé
   *  pour ne pas toucher à la logique métier. */
  readonly invalidateQueries: () => void;
}

export function createCtx(db: Db): Ctx {
  return { db, invalidateQueries: () => {} };
}

export interface ActionDef<Req extends z.ZodType, Res extends z.ZodType> {
  readonly request: Req;
  readonly response: Res;
  readonly handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}

export function defineAction<Req extends z.ZodType, Res extends z.ZodType>(
  spec: ActionDef<Req, Res>,
): ActionDef<Req, Res> {
  return spec;
}

/** Registre d'actions : `any` volontaire pour que `satisfies` accepte
 *  chaque définition typée précisément sans perdre la vérification
 *  qu'il ne s'y glisse aucune exportation parasite. */
export type ActionsModule = Record<
  string,
  {
    readonly request: z.ZodType;
    readonly response: z.ZodType;
    readonly handler: (ctx: Ctx, args: any) => Promise<any>;
  }
>;

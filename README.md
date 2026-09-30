# BIZTRACK BURUNDI — version standalone (déployable hors Muse)

Application mobile-first de caisse, stock, dépenses et dettes pour commerçants
burundais. React 19 + Bun + Drizzle + SQLite. Aucune dépendance à
l'environnement Muse : le SDK `@hatch/space-sdk` a été remplacé par une
architecture standard (serveur HTTP Bun, client `fetch`).

## Démarrage local

```bash
bun install
bun run build     # client React → client/dist + bundle serveur → server/dist
bun start         # ou : bun server/src/server.ts
```

Ouvrez http://localhost:3000. La base SQLite est créée automatiquement
(`./app.db`) et le schéma est appliqué depuis `drizzle/*.sql` au premier
démarrage.

Variables d'environnement :

| Variable  | Défaut    | Rôle                                        |
|-----------|-----------|---------------------------------------------|
| `PORT`    | `3000`    | Port d'écoute (Render injecte `10000`)      |
| `DB_PATH` | `./app.db`| Chemin du fichier SQLite                    |

## Architecture

```
client/src/          React 19 (caisse, stock, finances, dettes, équipe)
  api.ts             client RPC typé : POST ./actions { action, args }
  SafeArea.tsx       bandeau encoche mobile (remplace le SDK)
  main.tsx           QueryClient @tanstack/react-query local
server/src/
  server.ts          Bun.serve : POST /actions + fichiers statiques + migrations
  runtime.ts         remplace @hatch/space-sdk (defineAction, Ctx, ActionsModule)
  actions.ts         logique métier INCHANGÉE (14 actions : comptes, boutiques,
                     produits, ventes, dépenses, dettes, équipe)
  schema.ts          schéma Drizzle/SQLite INCHANGÉ
drizzle/             migrations SQL appliquées automatiquement au démarrage
```

Le protocole `POST /actions` (`{action, args}` → `{data} | {error}`) est
identique à celui du SDK : seule la couche transport a changé, aucune
fonctionnalité métier n'a été retirée ni simplifiée.

## Déploiement Render

Render ne propose pas de runtime Bun natif : le déploiement passe par Docker
(méthode standard et prise en charge par Render).

**Option A — Blueprint (recommandé)**
1. Poussez ce dossier dans un dépôt GitHub.
2. Render Dashboard → New → Blueprint → sélectionnez le dépôt.
   `render.yaml` crée le service web Docker automatiquement.

**Option B — manuel**
1. New → Web Service → sélectionnez le dépôt → Environment: **Docker**.
2. Dockerfile Path: `./Dockerfile`. Plan: Free.
3. Variables : `PORT=10000`.

**Persistance des données** : sur l'offre gratuite, le système de fichiers est
éphémère — la base SQLite est réinitialisée à chaque déploiement. Pour des
données persistantes, ajoutez un disque Render (offre payante) et définissez
`DB_PATH=/data/app.db` (exemple commenté dans `render.yaml`).

## Vérifications effectuées

- `bun install` — 58 paquets, sans `@hatch/space-sdk`
- `bun run typecheck` — client + serveur, 0 erreur
- `bun run build` — bundle serveur (193 modules) + build client OK
- Tests API réels : création de compte, login/logout, `getState`, vente cash,
  vente à crédit (dette auto), stock insuffisant (erreur), paiement partiel de
  dette — tous conformes
- Aucune référence restante à `/opt/hatch`, `@hatch/space-sdk`, `space-sdk.tgz`

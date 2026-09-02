# Mon Bilan

Outil personnel de gestion financière pour **une seule utilisatrice**.

Deux univers séparés — **Église** et **Commerce** — qui ne doivent **jamais** être additionnés.

---

## Ce que c’est / ce que ce n’est pas

| Oui | Non |
|-----|-----|
| PWA installable sur téléphone | SaaS multi-utilisateurs |
| Vanilla JS + Supabase Postgres | React / Next / Vue |
| Saisie manuelle Église + Commerce | Connexion bancaire |
| Clé **anon / publishable** uniquement | Authentification, mots de passe, magic links |
| Hébergement **Cloudflare Pages** (gratuit) | GitHub Pages |

**Il n’y a volontairement aucun système de connexion.**  
Ouvrir l’application installée suffit.

---

## Architecture de sécurité (importante)

Cette application **sacrifie volontairement** le contrôle d’accès par utilisateur :

- Pas de `auth.uid()`
- Pas de comptes
- Les politiques RLS autorisent l’accès via la clé **publishable** (rôle `anon`)

Cela convient **uniquement** à un outil personnel mono-utilisateur.  
Quiconque possède l’URL du projet Supabase + la clé publishable peut lire/écrire les données.

**Ne jamais** committer :

- `service_role` key
- mot de passe base
- tokens personnels Supabase
- secrets Cloudflare

Fichier local (non versionné) : `.env` (voir `.env.example`).

---

## Stack

- Vanilla HTML / CSS / JavaScript (modules ES)
- Vite (build → `dist/`)
- Supabase PostgreSQL + `@supabase/supabase-js`
- PWA (`manifest.webmanifest` + service worker — cache shell uniquement)
- Navigation hash (`#/`, `#/eglise`, …) compatible Cloudflare Pages (statique)
- Déploiement prévu : **Cloudflare Pages** sur `https://<projet>.pages.dev/`

---

## Démarrage local

```bash
npm install
node scripts/generate-icons.mjs
cp .env.example .env
# Éditer .env avec VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Vérifier la connexion Supabase (lectures seules) :

```bash
npm run verify:supabase
```

Tests / build / Excel :

```bash
npm test
npm run verify:excel
npm run build
```

---

## Cloudflare Pages (déploiement)

Cible : **plan gratuit**, URL `https://<nom-du-projet>.pages.dev/`, **sans domaine personnalisé**.  
Le dépôt GitHub peut rester privé.

### Réglages exacts

| Setting | Value |
|---------|--------|
| Git provider | GitHub |
| Production branch | `main` |
| Framework preset | Vite (sinon None / custom) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (racine du dépôt) |
| Node.js | 20 (LTS) |
| Custom domain | aucun |
| Workers / Functions | **non** |

`vite.config.js` utilise `base: '/'`. Pas de sous-chemin GitHub Pages.

### Variables d’environnement (Cloudflare → Settings → Environment variables)

À renseigner pour **Production** (et Preview si vous testez les previews) :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Ce sont des valeurs **publiques frontend** (clé publishable uniquement).  
Ne jamais ajouter `service_role`, `sb_secret_…`, mot de passe base, PAT Supabase, ni token Cloudflare.

### Étapes Dashboard

1. Pousser le dépôt sur GitHub (`main`).
2. Cloudflare Dashboard → **Workers & Pages**.
3. **Create** → **Pages**.
4. **Connect to Git** → choisir le dépôt.
5. Configurer le build (tableau ci-dessus).
6. Ajouter les deux variables d’environnement.
7. **Save and Deploy**.

Attendre que la branche **Commerce (Phase 3)** soit fusionnée dans `main` avant le premier déploiement de production. Phase 4 prépare le dépôt ; elle ne déploie pas une branche Commerce incomplète.

Pas de fichier Wrangler / Functions : frontend statique → Supabase.

---

## Supabase

Migrations dans `supabase/migrations/` :

1. `202603220001_initial_schema.sql` — tables, vues, RPC soldes
2. `202603220002_seed_reference_data.sql` — caisses, fournisseurs, produit Pommes
3. `202603220003_rls_anon_access.sql` — accès anon volontaire + grants
4. `202603220004_inventory_guards.sql` — garde-fous stock

Workflow CLI typique :

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push --dry-run
npx supabase db push
```

**Ne pas** exécuter de reset distant destructif sans validation explicite.

---

## Structure des dossiers

```
src/
  components/          # UI réutilisable (dont confirmation financière)
  modules/
    home/ church/ business/ history/ more/
  services/supabase/   # accès données
  utils/               # argent, dates, calculs purs
  styles/              # tokens + layout
public/                # manifest, SW, icônes
supabase/migrations/   # SQL versionné
tests/                 # vitest — calculs financiers
```

---

## Univers financiers

- **Église** : caisses, entrées/sorties, rapprochement — argent qui n’appartient pas personnellement à l’utilisatrice.
- **Commerce** : arrivées, ventes, crédits, stock, résultat.

Aucun écran ne doit afficher « total personnel = Église + Commerce ».

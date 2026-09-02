-- =============================================================================
-- Seed: initial church funds + suppliers + sample product
-- These are database records — the frontend must load them, not hardcode names.
-- =============================================================================

INSERT INTO public.church_funds (code, name, description, opening_balance_fcfa, sort_order)
VALUES
  ('ordinary', 'Ordinaire', 'Caisse ordinaire de l’église', 0, 1),
  ('works', 'Travaux', 'Caisse des travaux', 0, 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.suppliers (code, name)
VALUES
  ('SOA', 'SOA'),
  ('DJS', 'DJS'),
  ('SO', 'SO')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.products (name, unit_type, description)
SELECT 'Pommes', 'sac', 'Produit initial — d’autres produits pourront être ajoutés'
WHERE NOT EXISTS (
  SELECT 1 FROM public.products WHERE lower(name) = 'pommes'
);

-- Inventory integrity: prevent overselling without silently mutating arrivals.

CREATE OR REPLACE FUNCTION public.enforce_sale_item_availability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  available integer;
BEGIN
  IF NEW.arrival_id IS NULL THEN
    SELECT quantity_available INTO available
    FROM public.product_inventory
    WHERE product_id = NEW.product_id;

    IF available IS NULL OR available < NEW.quantity THEN
      RAISE EXCEPTION 'Quantité insuffisante en stock pour ce produit (dispo: %)', COALESCE(available, 0)
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT quantity_remaining INTO available
    FROM public.arrival_inventory
    WHERE arrival_id = NEW.arrival_id;

    IF available IS NULL OR available < NEW.quantity THEN
      RAISE EXCEPTION 'Quantité insuffisante sur ce bordereau (dispo: %)', COALESCE(available, 0)
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.stock_arrivals a
      WHERE a.id = NEW.arrival_id AND a.product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'Le produit ne correspond pas au bordereau sélectionné'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_items_availability ON public.sale_items;
CREATE TRIGGER trg_sale_items_availability
BEFORE INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_item_availability();

CREATE OR REPLACE FUNCTION public.enforce_sale_item_availability_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  available integer;
  room integer;
BEGIN
  IF NEW.quantity = OLD.quantity
     AND NEW.product_id = OLD.product_id
     AND NEW.arrival_id IS NOT DISTINCT FROM OLD.arrival_id THEN
    RETURN NEW;
  END IF;

  IF NEW.arrival_id IS NULL THEN
    SELECT quantity_available INTO available
    FROM public.product_inventory
    WHERE product_id = NEW.product_id;
    room := COALESCE(available, 0) + CASE
      WHEN OLD.product_id = NEW.product_id AND OLD.arrival_id IS NULL THEN OLD.quantity
      ELSE 0
    END;
  ELSE
    SELECT quantity_remaining INTO available
    FROM public.arrival_inventory
    WHERE arrival_id = NEW.arrival_id;
    room := COALESCE(available, 0) + CASE
      WHEN OLD.arrival_id IS NOT DISTINCT FROM NEW.arrival_id THEN OLD.quantity
      ELSE 0
    END;
  END IF;

  IF room < NEW.quantity THEN
    RAISE EXCEPTION 'Quantité insuffisante après modification (dispo: %)', room
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_items_availability_update ON public.sale_items;
CREATE TRIGGER trg_sale_items_availability_update
BEFORE UPDATE OF quantity, product_id, arrival_id ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_item_availability_update();

-- Trigger helpers are not part of the public API surface
REVOKE ALL ON FUNCTION public.enforce_sale_item_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_sale_item_availability_update() FROM PUBLIC;


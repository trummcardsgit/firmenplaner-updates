begin;
alter table public.tp_menu_preferences add column ticket_order text[] not null default array['all','open','my']::text[];
alter table public.tp_menu_preferences add constraint tp_ticket_menu_order_valid check (cardinality(ticket_order)=3 and array_ndims(ticket_order)=1 and array_position(ticket_order,null) is null and ticket_order @> array['all','open','my']::text[] and ticket_order <@ array['all','open','my']::text[]);
notify pgrst,'reload schema';
commit;

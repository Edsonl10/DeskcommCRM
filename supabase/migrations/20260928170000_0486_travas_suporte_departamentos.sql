-- Após integrar as migrações originais, aplicar as travas também às tabelas de setores.
select public.fn_aplicar_travas_de_suporte();

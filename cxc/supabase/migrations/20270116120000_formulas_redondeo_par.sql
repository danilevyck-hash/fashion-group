alter table marca_formulas drop constraint marca_formulas_redondeo_check;
alter table marca_formulas add constraint marca_formulas_redondeo_check
  check (redondeo in ('int','half','par'));

alter table marca_rubro_formulas drop constraint marca_rubro_formulas_redondeo_check;
alter table marca_rubro_formulas add constraint marca_rubro_formulas_redondeo_check
  check (redondeo in ('int','half','par'));

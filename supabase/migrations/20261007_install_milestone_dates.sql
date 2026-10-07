-- Axia/QCells milestone dates: crew on site (internal), inspection + Permission to Operate (customer-visible)
alter table customers add column if not exists install_started_at timestamptz;
alter table customers add column if not exists inspection_date timestamptz;
alter table customers add column if not exists pto_date timestamptz;

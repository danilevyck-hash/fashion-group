ALTER TABLE reebok_order_items ADD CONSTRAINT reebok_order_items_unique_item UNIQUE (order_id, product_id);

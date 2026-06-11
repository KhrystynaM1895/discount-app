-- CreateIndex
CREATE UNIQUE INDEX "discount_application_shop_order_id_discount_rule_id_key" ON "discount_application"("shop", "order_id", "discount_rule_id");

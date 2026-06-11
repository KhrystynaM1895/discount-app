-- CreateTable
CREATE TABLE "discount_rule" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_tag" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "discount_value" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "scope_type" TEXT NOT NULL DEFAULT 'all',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_rule_scope_item" (
    "id" SERIAL NOT NULL,
    "discount_rule_id" INTEGER NOT NULL,
    "shopify_gid" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,

    CONSTRAINT "discount_rule_scope_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "shopify_id" TEXT NOT NULL,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_application" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "discount_rule_id" INTEGER,
    "customer_id" INTEGER,
    "order_id" TEXT NOT NULL,
    "discount_value" DECIMAL(65,30) NOT NULL,
    "discount_type" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discount_rule_shop_idx" ON "discount_rule"("shop");

-- CreateIndex
CREATE INDEX "discount_rule_shop_status_idx" ON "discount_rule"("shop", "status");

-- CreateIndex
CREATE INDEX "discount_rule_scope_item_discount_rule_id_idx" ON "discount_rule_scope_item"("discount_rule_id");

-- CreateIndex
CREATE INDEX "customer_shop_idx" ON "customer"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "customer_shop_shopify_id_key" ON "customer"("shop", "shopify_id");

-- CreateIndex
CREATE INDEX "discount_application_shop_applied_at_idx" ON "discount_application"("shop", "applied_at");

-- CreateIndex
CREATE INDEX "discount_application_discount_rule_id_idx" ON "discount_application"("discount_rule_id");

-- AddForeignKey
ALTER TABLE "discount_rule_scope_item" ADD CONSTRAINT "discount_rule_scope_item_discount_rule_id_fkey" FOREIGN KEY ("discount_rule_id") REFERENCES "discount_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_application" ADD CONSTRAINT "discount_application_discount_rule_id_fkey" FOREIGN KEY ("discount_rule_id") REFERENCES "discount_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_application" ADD CONSTRAINT "discount_application_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

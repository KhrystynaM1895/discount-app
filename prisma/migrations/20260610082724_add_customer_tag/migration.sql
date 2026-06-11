-- CreateTable
CREATE TABLE "customer_tag" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_tag_shop_idx" ON "customer_tag"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "customer_tag_shop_name_key" ON "customer_tag"("shop", "name");

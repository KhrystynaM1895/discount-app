-- AlterTable
ALTER TABLE "discount_rule" ALTER COLUMN "discount_value" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "discount_application" ALTER COLUMN "discount_value" SET DATA TYPE DECIMAL(10,2);

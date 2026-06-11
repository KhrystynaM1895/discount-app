-- AlterTable
ALTER TABLE "discount_rule" DROP COLUMN "customer_tag",
ADD COLUMN     "customer_tag_id" INTEGER;

-- AddForeignKey
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_customer_tag_id_fkey" FOREIGN KEY ("customer_tag_id") REFERENCES "customer_tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

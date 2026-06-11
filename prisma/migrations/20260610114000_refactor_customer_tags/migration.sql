-- AlterTable
ALTER TABLE "customer" DROP COLUMN "tags",
ADD COLUMN     "customer_tag_id" INTEGER;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_customer_tag_id_fkey" FOREIGN KEY ("customer_tag_id") REFERENCES "customer_tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

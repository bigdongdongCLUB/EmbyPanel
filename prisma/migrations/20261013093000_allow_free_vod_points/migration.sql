ALTER TABLE "VodPointEntry" DROP CONSTRAINT "VodPointEntry_cost_check";
ALTER TABLE "VodPointEntry" ADD CONSTRAINT "VodPointEntry_cost_check" CHECK ("cost" >= 0 AND "cost" <= 30);

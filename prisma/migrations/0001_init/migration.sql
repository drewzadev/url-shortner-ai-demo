-- CreateTable
CREATE TABLE "urls" (
    "id" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "click_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "urls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "urls_short_code_key" ON "urls"("short_code");

-- CreateIndex
CREATE INDEX "idx_urls_expires_at" ON "urls"("expires_at");

-- CreateIndex
CREATE INDEX "idx_urls_created_at" ON "urls"("created_at");
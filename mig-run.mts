import { prisma } from "@/lib/prisma";
import { googleFetch } from "@/lib/google/auth";
import { googleDriveStorage } from "@/lib/storage/google-drive";
import { optimizeLossless, sha256Hex } from "@/lib/storage/optimize";
import { resolveTransferTarget, isWorkspaceFile } from "@/lib/storage/migration";
import { randomUUID } from "crypto";

const BATCH_ID = process.env.MIG_BATCH!;
const CHUNK = Number(process.env.MIG_CHUNK ?? 40);
const CONCURRENCY = Number(process.env.MIG_CONCURRENCY ?? 4);

async function processItem(item: any): Promise<"ok" | "fail"> {
  const target = resolveTransferTarget({ name: item.originalFilename, mimeType: item.mimeType });
  await prisma.storageMigrationItem.update({ where: { id: item.id }, data: { status: "PROCESSING", startedAt: new Date(), attempts: { increment: 1 } } });
  try {
    let bytes: Uint8Array;
    if (isWorkspaceFile(item.mimeType)) {
      const ex = await googleFetch("SOURCE", `https://www.googleapis.com/drive/v3/files/${item.sourceFileId}/export?mimeType=${encodeURIComponent(target.mimeType)}`);
      if (!ex.ok) throw new Error(`export HTTP ${ex.status}`);
      bytes = new Uint8Array(await ex.arrayBuffer());
    } else {
      const dl = await googleFetch("SOURCE", `https://www.googleapis.com/drive/v3/files/${item.sourceFileId}?alt=media`);
      if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
      bytes = new Uint8Array(await dl.arrayBuffer());
    }
    const origChecksum = await sha256Hex(bytes);
    const opt = optimizeLossless(bytes, target.mimeType, target.fileName);

    const dir = (item.sourceKey ?? "").includes("/") ? item.sourceKey.slice(0, item.sourceKey.lastIndexOf("/")) : "";
    const safeDir = dir.replace(/[^\w.\-/]+/g, "_").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
    const key = `${safeDir ? safeDir + "/" : ""}${randomUUID()}-${target.fileName.replace(/[^\w.\-]+/g, "_")}`;
    const up = await googleDriveStorage.put({ key, body: opt.bytes, contentType: target.mimeType, fileName: target.fileName });
    const finalChecksum = await sha256Hex(opt.bytes);

    const back = await googleDriveStorage.get(key);
    const backBytes = back ? new Uint8Array(await new Response(back.body).arrayBuffer()) : new Uint8Array();
    const verified = (await sha256Hex(backBytes)) === finalChecksum && backBytes.length === opt.bytes.length;

    await prisma.storageMigrationItem.update({ where: { id: item.id }, data: {
      destinationFileId: up.providerId, destinationKey: up.key,
      originalSize: bytes.length, finalSize: opt.bytes.length,
      originalChecksum: origChecksum, finalChecksum,
      compressionStatus: opt.optimized ? "OPTIMIZED" : "UNCHANGED",
      strategy: opt.strategy.slice(0, 180),
      status: verified ? "VERIFIED" : "FAILED",
      errorMessage: verified ? null : "verification mismatch",
      processedAt: new Date(),
    }});
    return verified ? "ok" : "fail";
  } catch (e) {
    await prisma.storageMigrationItem.update({ where: { id: item.id }, data: { status: "FAILED", errorMessage: (e instanceof Error ? e.message : "unknown").slice(0,300), retryCount: { increment: 1 }, processedAt: new Date() } });
    return "fail";
  }
}

// Include FAILED items with few retries so the fix is applied retroactively
const items = await prisma.storageMigrationItem.findMany({ where: { batchId: BATCH_ID, OR: [{ status: { in: ["PENDING","PROCESSING"] } }, { status: "FAILED", retryCount: { lt: 3 } }] }, orderBy: { createdAt: "asc" }, take: CHUNK });

let ok=0, fail=0; const q=[...items];
async function w(){ for(;;){ const it=q.shift(); if(!it) return; const r=await processItem(it); r==="ok"?ok++:fail++; await new Promise(r=>setTimeout(r,90)); } }
await Promise.all(Array.from({length:CONCURRENCY},w));
const counts = await prisma.storageMigrationItem.groupBy({ by:["status"], where:{ batchId: BATCH_ID }, _count:{_all:true} });
const c:Record<string,number>={}; for(const g of counts) c[g.status]=g._count._all;
console.log(JSON.stringify({ thisRun:{ok,fail}, totals:c, remaining:(c.PENDING??0)+(c.PROCESSING??0) }));
await prisma.$disconnect();

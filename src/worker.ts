import queue from "./queue";
import amazonClient from "./amazonClient";
import store from "./store";

let running = false;

export async function processOnce() {
  const job = queue.popJob();
  if (!job) return;
  try {
    const res = await amazonClient.updateInventoryOnAmazon(
      job.sku,
      job.broadcastCount,
      job.tx
    );
    if (res.ok) {
      await store.saveTransaction(job.tx);
      await store.saveLastBroadcast(job.sku, job.broadcastCount, job.tx);
    }
  } catch (err) {
    console.error("worker: error processing job", err);
    // requeue the job at the end
    // simple retry strategy for prototype
    queue.pushJob(job);
  }
}

export function startWorker(pollMs = 500) {
  if (running) return;
  running = true;
  setInterval(() => void processOnce(), pollMs);
}

export default { processOnce, startWorker };

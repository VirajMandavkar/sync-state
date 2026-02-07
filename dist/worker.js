"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processOnce = processOnce;
exports.startWorker = startWorker;
const queue_1 = __importDefault(require("./queue"));
const amazonClient_1 = __importDefault(require("./amazonClient"));
const store_1 = __importDefault(require("./store"));
let running = false;
async function processOnce() {
    const job = queue_1.default.popJob();
    if (!job)
        return;
    try {
        const res = await amazonClient_1.default.updateInventoryOnAmazon(job.sku, job.broadcastCount, job.tx);
        if (res.ok) {
            await store_1.default.saveTransaction(job.tx);
            await store_1.default.saveLastBroadcast(job.sku, job.broadcastCount, job.tx);
        }
    }
    catch (err) {
        console.error("worker: error processing job", err);
        // requeue the job at the end
        // simple retry strategy for prototype
        queue_1.default.pushJob(job);
    }
}
function startWorker(pollMs = 500) {
    if (running)
        return;
    running = true;
    setInterval(() => void processOnce(), pollMs);
}
exports.default = { processOnce, startWorker };
//# sourceMappingURL=worker.js.map
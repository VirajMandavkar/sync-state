"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushJob = pushJob;
exports.popJob = popJob;
exports.queueSize = queueSize;
const queue = [];
function pushJob(job) {
    queue.push(job);
}
function popJob() {
    return queue.shift();
}
function queueSize() {
    return queue.length;
}
exports.default = { pushJob, popJob, queueSize };
//# sourceMappingURL=queue.js.map